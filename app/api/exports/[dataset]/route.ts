import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  getUserAgencyIds,
  canPerformAction,
  isOwnDataOnlyResolved,
} from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { canRunExport, getExportDefinition } from "@/lib/exports/catalog"
import { getExportDataset } from "@/lib/exports/datasets"
import { buildCsvBody, csvDownloadHeaders } from "@/lib/export/csv-excel-es"
import { todayInArgentina } from "@/lib/utils/date-only"
import type { UserRole } from "@/lib/permissions"

export const dynamic = "force-dynamic"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/exports/[dataset]
 *
 * Sirve las exportaciones de datos que no tenían endpoint propio (operadores,
 * equipo, cuentas financieras, plan de cuentas, leads, cotizaciones, listado de
 * facturas y deuda con operadores).
 *
 * No es una ruta genérica de volcado de tablas: `dataset` no es un nombre de
 * tabla sino la clave de una definición del servidor, que trae su propia query,
 * su propio scope por `org_id` y su propio permiso. Un id que no esté en el
 * catálogo es 404, no una consulta.
 *
 * El permiso sale de `lib/exports/catalog.ts`, el mismo archivo con el que la
 * pantalla decide qué botones mostrar: si discrepara, la pantalla ofrecería
 * descargas que terminan en 403.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset: datasetId } = await params

  const definition = getExportDefinition(datasetId)
  const dataset = getExportDataset(datasetId)
  if (!definition || !dataset) {
    return NextResponse.json({ error: "Exportación desconocida" }, { status: 404 })
  }

  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json(
      { error: "Usuario sin organización asociada" },
      { status: 400 }
    )
  }

  const supabase = await createServerClient()
  const roles = ((user as any).roles ?? [user.role]) as string[]
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as UserRole)
  const perms = await resolveUserPermissions(
    supabase as any,
    user.id,
    user.org_id,
    roles,
    agencyIds
  )

  const permitido = canRunExport(definition, {
    roles,
    can: (module, permission) => canPerformAction(user as any, module, permission, perms),
    ownDataOnly: (module) => isOwnDataOnlyResolved(user as any, module, perms),
  })
  if (!permitido) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get("dateFrom") || undefined
  const dateTo = searchParams.get("dateTo") || undefined
  const agencyId = searchParams.get("agencyId") || undefined

  if ((dateFrom && !DATE_ONLY.test(dateFrom)) || (dateTo && !DATE_ONLY.test(dateTo))) {
    return NextResponse.json(
      { error: "Formato de fecha inválido. Usá YYYY-MM-DD" },
      { status: 400 }
    )
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return NextResponse.json(
      { error: "La fecha de inicio es posterior a la de fin" },
      { status: 400 }
    )
  }
  // Una agencia que el usuario no tiene asignada no se filtra: se rechaza. Si se
  // ignorara el parámetro, el archivo saldría con TODAS las agencias y parecería
  // el que se pidió.
  if (agencyId && agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { headers, rows, truncated } = await dataset.build({
      supabase,
      orgId: user.org_id,
      agencyId,
      dateFrom,
      dateTo,
    })

    // Un archivo que se cortó tiene que decirlo en el nombre: la alternativa es
    // que alguien migre con datos incompletos creyendo que están todos.
    const parcial = truncated ? "-PARCIAL" : ""
    const filename = `${dataset.filenameBase}${parcial}-${todayInArgentina()}.csv`

    return new Response(buildCsvBody(headers, rows), {
      headers: csvDownloadHeaders(filename),
    })
  } catch (error: any) {
    console.error(`[exports/${datasetId}] error:`, error?.message ?? error)
    return NextResponse.json({ error: "Error al generar la exportación" }, { status: 500 })
  }
}
