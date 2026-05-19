import { createAdminClient } from "./server"

/**
 * SEG-003 — Wrapper seguro para operaciones admin dentro de un tenant.
 *
 * `createAdminClient()` bypasea RLS completamente. Si un developer olvida
 * agregar `.eq("org_id", orgId)` a una query, puede leer/escribir datos de
 * OTRO tenant silenciosamente. Este helper hace el scoping imposible de olvidar:
 *
 *   const scope = createOrgAdminScope(user.org_id)
 *   const { data } = await scope.from("operations").select("*")
 *   // → automáticamente filtra por org_id
 *
 * Cuándo usar cada cosa:
 *   - `createOrgAdminScope(orgId)` → operaciones dentro de un tenant conocido.
 *     (imports, billing de un org, aprobaciones, etc.)
 *   - `createAdminClient()` directo → cross-tenant legítimo: cron jobs, platform
 *     admin, auth flows (pre-session), webhooks (la org se resuelve por token),
 *     audit logs (fire-and-forget sin contexto de org).
 *
 * El campo `.raw` expone el admin client sin scoping para casos excepcionales
 * dentro de un scope (ej. resolver FKs en tablas sin org_id como `users`).
 */
export function createOrgAdminScope(orgId: string) {
  if (!orgId) {
    throw new Error("[SEG-003] createOrgAdminScope requires a non-empty orgId")
  }

  const admin = createAdminClient() as any

  return {
    /** El org al que está bloqueado este scope. */
    orgId,

    /** Admin client sin scoping. Usar solo cuando sea estrictamente necesario. */
    raw: admin,

    /**
     * Inicia una query en `table` pre-filtrada por org_id.
     * Encadená filtros adicionales como de costumbre.
     *
     * @example
     * const { data } = await scope.from("operations").select("id, status").eq("status", "CONFIRMED")
     */
    from(table: string) {
      return admin.from(table).eq("org_id", orgId)
    },

    /**
     * Inserta fila(s) en `table` inyectando org_id automáticamente.
     * Si `data` ya tiene `org_id`, se sobreescribe con el del scope.
     *
     * @example
     * await scope.insert("cash_movements", { amount: 1000, currency: "ARS", ... })
     */
    insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]) {
      if (Array.isArray(data)) {
        return admin.from(table).insert(data.map((row) => ({ ...row, org_id: orgId })))
      }
      return admin.from(table).insert({ ...data, org_id: orgId })
    },
  }
}

export type OrgAdminScope = ReturnType<typeof createOrgAdminScope>
