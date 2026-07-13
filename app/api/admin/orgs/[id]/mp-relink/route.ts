import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { relinkPreapproval } from "@/lib/billing/relink-preapproval"
import { logSecurityEvent } from "@/lib/security/audit"

/**
 * POST /api/admin/orgs/[id]/mp-relink
 * Body (opcional): { preapproval_id?: string, payer_email?: string }
 *
 * Recuperación manual para orgs que pagaron en MP pero nunca se linkearon
 * (mp_preapproval_id NULL → quedaron PENDING_PAYMENT). Busca el preapproval en
 * MP (por id explícito, o por payer_email/billing_email), aplica la state
 * machine y actualiza la org. Solo platform admin.
 *
 * mp-snapshot solo sirve si la org ya tiene mp_preapproval_id; este endpoint
 * cubre el caso en que NO lo tiene, que es justo el que produce el reclamo
 * "pagué pero no figura".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))
  const preapprovalId = (body?.preapproval_id as string | undefined)?.trim() || null
  const payerEmail = (body?.payer_email as string | undefined)?.trim() || null

  const admin = createAdminClient() as any

  let result
  try {
    result = await relinkPreapproval({
      admin,
      orgId,
      preapprovalId,
      payerEmail,
      auditEventType: "MANUAL_ADMIN_ADJUSTMENT",
      source: `admin-relink:by=${user.id}`,
    })
  } catch (err: any) {
    console.error("[mp-relink] failed", orgId, err?.message || err)
    return NextResponse.json(
      { error: `No pudimos consultar MercadoPago: ${err?.message || err}` },
      { status: 502 }
    )
  }

  // Audit: acción manual sobre estado de suscripción (WARN para incidentes).
  logSecurityEvent({
    eventType: "admin_mp_relink",
    severity: "WARN",
    targetOrgId: orgId,
    targetEntity: "organization",
    targetEntityId: orgId,
    requestPath: "/api/admin/orgs/[id]/mp-relink",
    details: {
      by_user: user.id,
      linked: result.linked,
      reason: result.reason ?? null,
      from_status: result.from_status ?? null,
      to_status: result.to_status ?? null,
      preapproval_id: result.preapproval?.id ?? preapprovalId ?? null,
    },
  })

  if (!result.linked) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        candidates: result.candidates ?? 0,
        message: relinkReasonMessage(result.reason),
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    ok: true,
    from_status: result.from_status,
    to_status: result.to_status,
    preapproval_id: result.preapproval?.id,
    mp_status: result.preapproval?.status,
  })
}

function relinkReasonMessage(reason?: string): string {
  switch (reason) {
    case "no_payer_email":
      return "La org no tiene billing_email y no se pasó payer_email."
    case "no_preapproval_in_mp":
      return "No se encontró ninguna suscripción en MP para ese email."
    case "no_usable_candidate":
      return "Se encontraron suscripciones pero ninguna es de esta org."
    case "ambiguous_candidates":
      return "Hay más de una suscripción autorizada para ese email. Pasá el preapproval_id específico."
    case "external_reference_mismatch":
      return "El preapproval pertenece a otra org."
    case "org_not_found":
      return "La org no existe."
    case "org_update_failed":
      return "Se encontró la suscripción pero falló el update. Reintentá."
    default:
      return "No se pudo linkear."
  }
}
