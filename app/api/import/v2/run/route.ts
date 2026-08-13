import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { PIPELINES, type ImportPipeline } from "@/lib/import"
import { decodeCsvBuffer, hasReplacementCharacter } from "@/lib/import/decode-csv"
import type { ExchangeRateMode } from "@/lib/import/types"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const VALID_PIPELINES: ImportPipeline[] = [
  "operations-master",
  "customers",
  "operators",
  "payments-suelto",
  "cash-movements",
]

const VALID_FX_MODES: ExchangeRateMode[] = [
  "monthly_rates",
  "manual_fixed",
  "monthly_with_fallback",
]

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Solo ADMIN o SUPER_ADMIN pueden importar
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "No tiene permiso para importar" },
        { status: 403 }
      )
    }

    const supabase = await createServerClient()
    const formData = await request.formData()

    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo CSV" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 10 MB" },
        { status: 413 }
      )
    }

    const pipelineName = formData.get("pipeline")?.toString()
    if (!pipelineName || !VALID_PIPELINES.includes(pipelineName as ImportPipeline)) {
      return NextResponse.json({ error: "Pipeline inválido" }, { status: 400 })
    }

    const agencyId = formData.get("agency_id")?.toString()
    if (!agencyId) {
      return NextResponse.json({ error: "Falta agency_id" }, { status: 400 })
    }

    // Defensa en profundidad: verificar que la agency_id pertenece al user
    const userAgencies = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!userAgencies.includes(agencyId)) {
      return NextResponse.json(
        { error: "No tiene acceso a esta agencia" },
        { status: 403 }
      )
    }

    const dryRun = formData.get("dry_run")?.toString() === "true"
    const fxModeRaw = formData.get("exchange_rate_mode")?.toString() ?? "manual_fixed"
    const fxMode = VALID_FX_MODES.includes(fxModeRaw as ExchangeRateMode)
      ? (fxModeRaw as ExchangeRateMode)
      : "manual_fixed"
    const manualRateRaw = formData.get("manual_rate")?.toString()
    const manualRate = manualRateRaw ? Number(manualRateRaw) : undefined

    // VIB-118: `file.text()` decodifica UTF-8 SIEMPRE. Excel en español exporta
    // Windows-1252, donde la Ñ es 0xD1 (inválido en UTF-8) y terminaba como U+FFFD
    // en la base, de forma irreversible. Detectamos la codificación real.
    const { text: csvContent, encoding, usedFallback } = decodeCsvBuffer(
      await file.arrayBuffer()
    )
    if (usedFallback) {
      console.warn(
        `[import] "${file.name}" no era UTF-8; se interpretó como ${encoding}.`
      )
    }

    // Si el archivo YA venía con el carácter de reemplazo, el daño ocurrió antes
    // de llegar acá y ninguna decodificación lo recupera. Cortamos en vez de
    // meter nombres rotos a la base.
    if (hasReplacementCharacter(csvContent)) {
      return NextResponse.json(
        {
          error:
            "El archivo contiene caracteres ilegibles (�), señal de que se guardó con una codificación incorrecta. " +
            "Volvé a exportarlo desde Excel como \"CSV UTF-8 (delimitado por comas)\" y subilo de nuevo.",
        },
        { status: 400 }
      )
    }

    const pipeline = PIPELINES[pipelineName as ImportPipeline]
    const result = await pipeline(
      supabase as any,
      csvContent,
      {
        agencyId,
        exchangeRate: { mode: fxMode, manualRate },
      },
      { dryRun }
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in POST /api/import/v2/run:", error)
    return NextResponse.json(
      { error: error.message ?? "Error al importar" },
      { status: 500 }
    )
  }
}
