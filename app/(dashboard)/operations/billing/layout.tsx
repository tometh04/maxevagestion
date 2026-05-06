import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getOrgAfipStatus } from "@/lib/afip/check-org-status"
import { AfipSetupGate } from "@/components/integrations/afip-setup-gate"

/**
 * Onboarding GTM 2026-05-06: gate server-side aplicado a TODAS las rutas
 * dentro de /operations/billing/* — listado, nueva factura, etc.
 *
 * Antes el user nuevo entraba al listado vacío o al form sin saber que
 * primero tenía que conectar AFIP. Cuando intentaba emitir, AFIP le
 * tiraba errores crípticos.
 *
 * Ahora si la org no tiene AFIP configurado en ninguna agencia, mostramos
 * una card con explicación + CTA directo a /settings/integrations donde
 * está el setup automático (creación de cert + autorización de WSFE).
 *
 * Si tiene al menos 1 agencia con AFIP, dejamos pasar y el user opera
 * normal — el form filtra el dropdown de Punto de Venta a las agencias
 * que sí tienen integración.
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const afipStatus = await getOrgAfipStatus(supabase, user.org_id)

  return <AfipSetupGate status={afipStatus}>{children}</AfipSetupGate>
}
