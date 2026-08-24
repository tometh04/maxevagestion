import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveGrowthStudioAccess } from "@/lib/growth-studio/access"
import type { GrowthStudioApplicationContext } from "@/lib/growth-studio/application-context"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import {
  GrowthStudioCampaignNotFoundError,
  GrowthStudioCampaignPersistenceError,
} from "@/lib/growth-studio/campaign-service"
import {
  GrowthStudioSourceNotFoundError,
  GrowthStudioSourcePersistenceError,
} from "@/lib/growth-studio/source-service"
import {
  GrowthStudioGenerationError,
  GrowthStudioGenerationInProgressError,
  GrowthStudioQuotaExceededError,
} from "@/lib/growth-studio/generation-service"
import {
  GrowthStudioAiConfigurationError,
  GrowthStudioAiProviderError,
  GrowthStudioAiTimeoutError,
} from "@/lib/growth-studio/ai-provider"
import {
  GrowthStudioAssetNotFoundError,
  GrowthStudioAssetPersistenceError,
  GrowthStudioAssetValidationError,
} from "@/lib/growth-studio/asset-errors"

type ApiContextResult =
  | { context: GrowthStudioApplicationContext; response?: never }
  | { context?: never; response: NextResponse }

export async function getGrowthStudioApiContext(): Promise<ApiContextResult> {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return {
      response: NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      ),
    }
  }

  const supabase = await createServerClient()
  const access = await resolveGrowthStudioAccess(supabase, user)
  if (!access.allowed) {
    return {
      response: NextResponse.json(
        { error: access.message, code: access.code },
        { status: access.status }
      ),
    }
  }

  const [quotationSourceScope, operationSourceScope] = await Promise.all([
    resolveAgencyPermissionScope(supabase, user, "leads", "read"),
    resolveAgencyPermissionScope(supabase, user, "operations", "read"),
  ])

  return {
    context: {
      supabase,
      userId: user.id,
      orgId: user.org_id,
      access,
      quotationSourceScope,
      operationSourceScope,
    },
  }
}

export function growthStudioApiError(error: unknown): NextResponse {
  if (
    error instanceof GrowthStudioCampaignNotFoundError ||
    error instanceof GrowthStudioSourceNotFoundError ||
    error instanceof GrowthStudioAssetNotFoundError
  ) {
    return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 })
  }
  if (error instanceof GrowthStudioQuotaExceededError) {
    return NextResponse.json(
      { error: error.message, code: "quota_exceeded" },
      { status: 429 }
    )
  }
  if (error instanceof GrowthStudioGenerationInProgressError) {
    return NextResponse.json(
      { error: error.message, code: "generation_in_progress" },
      { status: 409 }
    )
  }
  if (error instanceof GrowthStudioAiTimeoutError) {
    return NextResponse.json(
      { error: error.message, code: "generation_timeout" },
      { status: 504 }
    )
  }
  if (error instanceof GrowthStudioAiConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  if (error instanceof GrowthStudioAssetValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (
    error instanceof GrowthStudioCampaignPersistenceError ||
    error instanceof GrowthStudioSourcePersistenceError ||
    error instanceof GrowthStudioGenerationError ||
    error instanceof GrowthStudioAiProviderError ||
    error instanceof GrowthStudioAssetPersistenceError
  ) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Revisá los datos enviados", details: error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  console.error("[growth-studio-api] Error inesperado", error)
  return NextResponse.json({ error: "Error interno" }, { status: 500 })
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "El cuerpo debe ser JSON válido",
      },
    ])
  }
}
