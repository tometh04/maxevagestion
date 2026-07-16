import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveGrowthStudioAccess } from "@/lib/growth-studio/access"
import {
  brandProfileInputSchema,
  brandProfileQuerySchema,
} from "@/lib/growth-studio/brand-profile-schema"
import {
  getBrandProfile,
  GrowthStudioAgencyNotFoundError,
  GrowthStudioPersistenceError,
  saveBrandProfile,
} from "@/lib/growth-studio/brand-profile-service"

function errorResponse(error: unknown) {
  if (error instanceof GrowthStudioAgencyNotFoundError) {
    return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
  }
  if (error instanceof GrowthStudioPersistenceError) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.error("[growth-studio-api] Error inesperado", error)
  return NextResponse.json({ error: "Error interno" }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    const query = brandProfileQuerySchema.safeParse({
      agencyId: new URL(request.url).searchParams.get("agencyId"),
    })
    if (!query.success) {
      return NextResponse.json(
        { error: "Seleccioná una agencia válida" },
        { status: 400 }
      )
    }

    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const access = await resolveGrowthStudioAccess(supabase, user)
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.message, code: access.code },
        { status: access.status }
      )
    }

    const profile = await getBrandProfile(
      {
        supabase,
        userId: user.id,
        orgId: user.org_id,
        access,
      },
      query.data.agencyId
    )
    const agency = access.agencies.find(
      (item) => item.id === query.data.agencyId
    )

    return NextResponse.json({ data: { agency, profile } })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
    }

    const payload = brandProfileInputSchema.safeParse(body)
    if (!payload.success) {
      return NextResponse.json(
        {
          error: "Revisá los datos del perfil",
          details: payload.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const access = await resolveGrowthStudioAccess(supabase, user)
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.message, code: access.code },
        { status: access.status }
      )
    }

    const profile = await saveBrandProfile(
      {
        supabase,
        userId: user.id,
        orgId: user.org_id,
        access,
      },
      payload.data
    )

    return NextResponse.json({ data: { profile } })
  } catch (error) {
    return errorResponse(error)
  }
}
