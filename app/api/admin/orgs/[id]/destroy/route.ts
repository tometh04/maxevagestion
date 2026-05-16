/**
 * DELETE /api/admin/orgs/[id]/destroy
 *
 * Borra COMPLETAMENTE una organización del sistema:
 *   1. Listamos los auth_ids de todos los users de la org (para borrarlos después)
 *   2. DELETE FROM organizations WHERE id = X
 *      → cascadea (vía FK ON DELETE CASCADE de mig 134) a todas las tablas
 *        org-scoped: operations, payments, leads, customers, agencies,
 *        organization_members, organization_settings, financial_accounts,
 *        cash_movements, ledger_movements, invoices, alerts, etc.
 *      → cascadea también a public.users.org_id (esos rows se eliminan)
 *   3. Para cada auth_id recolectado en (1), borrar auth.users via admin SDK
 *      → libera el email para que puedan registrarse de nuevo si quieren.
 *
 * REQUIERE confirmación: el body debe traer `{ slug: "<slug-exacto-de-la-org>" }`.
 * Sin eso devolvemos 400 — defense-in-depth contra clicks accidentales.
 *
 * Solo platform admins pueden llamar este endpoint (gate vía isPlatformAdmin).
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Gate: solo platform admins
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))
  const confirmSlug = typeof body?.slug === "string" ? body.slug.trim() : ""

  if (!confirmSlug) {
    return NextResponse.json(
      { error: "Falta confirmación: enviar { slug } con el slug exacto de la org" },
      { status: 400 }
    )
  }

  const admin = createAdminClient() as any

  // 1. Cargar org y validar que slug coincide
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, slug, name, subscription_status")
    .eq("id", orgId)
    .maybeSingle()

  if (orgError || !org) {
    return NextResponse.json({ error: "Org no existe" }, { status: 404 })
  }

  if ((org as any).slug !== confirmSlug) {
    return NextResponse.json(
      { error: `El slug no coincide. Esperado: "${(org as any).slug}", recibido: "${confirmSlug}"` },
      { status: 400 }
    )
  }

  // 2. Recolectar auth_ids de los users de la org ANTES de borrar (sino se pierden)
  const { data: orgUsers } = await admin
    .from("users")
    .select("id, auth_id, email")
    .eq("org_id", orgId)

  const userRows = (orgUsers || []) as Array<{ id: string; auth_id: string | null; email: string }>
  const authIds = userRows.map((u) => u.auth_id).filter((x): x is string => !!x)
  const userEmails = userRows.map((u) => u.email)

  // Audit ANTES de destruir (sino el audit log se va con la cascada de la org)
  logSecurityEvent({
    eventType: "TENANT_DESTROYED",
    severity: "CRITICAL",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: {
      slug: (org as any).slug,
      name: (org as any).name,
      previous_status: (org as any).subscription_status,
      affected_users_count: userRows.length,
      affected_emails: userEmails,
      reason: body?.reason ?? null,
    },
  })

  // 3. DELETE organizations — cascada a todas las tablas org-scoped + public.users
  const { error: deleteOrgError } = await admin
    .from("organizations")
    .delete()
    .eq("id", orgId)

  if (deleteOrgError) {
    console.error("[admin/destroy] Error eliminando org:", deleteOrgError)
    return NextResponse.json(
      {
        error: `Error eliminando organization: ${deleteOrgError.message}`,
        code: deleteOrgError.code,
        details: deleteOrgError.details,
      },
      { status: 500 }
    )
  }

  // 4. Borrar auth.users uno por uno (libera los emails)
  // Si alguno falla no abortamos — la org ya está borrada. Solo logueamos.
  const failedAuthDeletes: Array<{ auth_id: string; error: string }> = []
  for (const authId of authIds) {
    try {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(authId)
      if (authDeleteError) {
        failedAuthDeletes.push({ auth_id: authId, error: authDeleteError.message })
      }
    } catch (e: any) {
      failedAuthDeletes.push({ auth_id: authId, error: e?.message || String(e) })
    }
  }

  return NextResponse.json({
    ok: true,
    org_slug: (org as any).slug,
    org_name: (org as any).name,
    users_destroyed: authIds.length,
    auth_delete_failures: failedAuthDeletes.length,
    auth_delete_failure_details: failedAuthDeletes,
  })
}
