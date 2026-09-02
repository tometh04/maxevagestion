import { NextResponse } from "next/server"

import { syncAddonsToMp } from "@/lib/addons/mp-sync"
import { checkCronAuth } from "@/lib/cron/auth"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/cron/apply-addon-charges
 *
 * Dos pasadas:
 *
 *  1. Ejecuta las bajas programadas: los complementos en SCHEDULED_CANCEL cuyo
 *     `cancel_effective_at` ya pasó se apagan. Recién ahí baja el importe — el
 *     cliente lo tuvo hasta el final del ciclo que ya había pagado.
 *
 *  2. Consolida la sincronización con MP de las orgs que quedaron pendientes.
 *     Prender tres complementos de a uno en el mismo día produciría tres updates
 *     sucesivos contra MP, y el tercero podría cruzar el umbral del 20% aunque
 *     ninguno lo cruce por separado. Acá se recalcula UNA vez el total y se
 *     empuja de una, así el porcentaje se mide una sola vez contra el importe
 *     vigente.
 *
 * Idempotente: apagar un complemento ya apagado no matchea el filtro, y
 * `syncAddonsToMp` devuelve NO_CHANGE cuando el importe ya está sincronizado.
 * No escribe `subscription_status` en ningún caso.
 */
export async function POST(request: Request) {
  const auth = checkCronAuth(request, "apply-addon-charges")
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const nowIso = new Date().toISOString()
  const summary = {
    cancelled: 0,
    synced: 0,
    deferred: 0,
    manual: 0,
    errors: [] as string[],
  }

  // ── Pasada 1: bajas programadas que ya vencieron ──────────────────────────
  const { data: dueCancels, error: dueErr } = await admin
    .from("organization_addons")
    .select("id, org_id, addon_key, cancel_effective_at")
    .eq("status", "SCHEDULED_CANCEL")
    .lte("cancel_effective_at", nowIso)

  if (dueErr) {
    summary.errors.push(`lectura de bajas programadas: ${dueErr.message}`)
  }

  const orgsToSync = new Set<string>()

  for (const row of dueCancels ?? []) {
    try {
      const { error } = await admin
        .from("organization_addons")
        .update({ status: "CANCELLED", cancelled_at: nowIso })
        .eq("id", row.id)
        // CAS: solo si sigue en SCHEDULED_CANCEL. Si otro flujo lo reactivó
        // entre la lectura y el update, no se pisa.
        .eq("status", "SCHEDULED_CANCEL")
      if (error) throw new Error(error.message)

      // Apagar un complemento NO borra datos: la fila queda CANCELLED y las
      // tablas del módulo (biblioteca, referidos, liquidaciones) quedan intactas.
      // Si lo vuelve a contratar, encuentra todo.
      await admin.from("billing_events").insert({
        org_id: row.org_id,
        event_type: "ADDON_CANCELLED",
        external_id: `${row.org_id}:addon:${row.addon_key}:CANCELLED:${row.cancel_effective_at}`,
        status: "processed",
        payload: { addon_key: row.addon_key, source: "cron", effective_at: row.cancel_effective_at },
      })

      orgsToSync.add(row.org_id)
      summary.cancelled++
    } catch (err: any) {
      summary.errors.push(`addon=${row.id}: ${err.message}`)
    }
  }

  // ── Pasada 2: orgs con la sincronización pendiente ────────────────────────
  const { data: pendingOrgs, error: pendingErr } = await admin
    .from("organizations")
    .select("id")
    .eq("addons_mp_sync_state", "PENDING")

  if (pendingErr) {
    summary.errors.push(`lectura de orgs pendientes: ${pendingErr.message}`)
  }
  for (const o of pendingOrgs ?? []) orgsToSync.add(o.id)

  for (const orgId of Array.from(orgsToSync)) {
    try {
      // allowReauth false a propósito, también acá: un cron no puede mandar a
      // un cliente a re-autorizar sin que nadie se lo avise. Si cruza el umbral
      // queda en PENDING_REAUTH y aparece en la cola de /admin/billing.
      const outcome = await syncAddonsToMp(admin, orgId, {
        allowReauth: false,
        source: "cron",
      })

      if (outcome.kind === "UPDATED_IN_PLACE") summary.synced++
      else if (outcome.kind === "DEFERRED") summary.deferred++
      else if (outcome.kind === "NO_MP") summary.manual++

      if (outcome.kind !== "NO_CHANGE") {
        await admin.from("billing_events").insert({
          org_id: orgId,
          event_type: "ADDON_PRICE_APPLIED",
          // Un solo intento por org y por corrida: si el cron reintenta en el
          // mismo minuto no duplica el evento.
          external_id: `${orgId}:addon-sync:${nowIso.slice(0, 13)}`,
          status: outcome.kind === "DEFERRED" ? "deferred" : "processed",
          amount_cents: Math.round(outcome.targetAmountArs * 100),
          currency: "ARS",
          payload: { outcome, source: "cron" },
        })
      }

      if (outcome.kind === "DEFERRED") {
        logSecurityEvent({
          eventType: "ADDON_PRICE_CHANGE_DEFERRED",
          // Deja de cobrarse un importe que corresponde: no es un INFO más.
          severity: "WARN",
          actorUserId: null,
          actorAuthId: null,
          targetOrgId: orgId,
          targetEntity: "organizations",
          targetEntityId: orgId,
          details: {
            reason: outcome.reason,
            currentAmountArs: outcome.currentAmountArs,
            targetAmountArs: outcome.targetAmountArs,
            note: "El aumento supera el 20% que MP permite ajustar sin re-autorizacion. Requiere accion del cliente.",
          },
        })
      }
    } catch (err: any) {
      summary.errors.push(`org=${orgId}: ${err.message}`)
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
