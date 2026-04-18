import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type OrgRow = {
  id: string
  name: string
  slug: string
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE"
  subscription_status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
  trial_ends_at: string | null
  grace_period_ends_at: string | null
  max_users: number
  max_agencies: number
  max_operations_per_month: number
  billing_email: string | null
  created_at: string
}

const STATUS_LABEL: Record<OrgRow["subscription_status"], string> = {
  TRIAL: "Prueba gratuita",
  ACTIVE: "Activo",
  PAST_DUE: "Pago pendiente",
  CANCELLED: "Cancelado",
  SUSPENDED: "Suspendido",
}

const STATUS_TONE: Record<OrgRow["subscription_status"], "default" | "secondary" | "destructive" | "outline"> = {
  TRIAL: "secondary",
  ACTIVE: "default",
  PAST_DUE: "destructive",
  CANCELLED: "outline",
  SUSPENDED: "destructive",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function SubscriptionPage() {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")

  if (!user.org_id) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
          <p className="text-sm text-muted-foreground">Gestioná tu plan y facturación</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tenés una organización asociada a tu cuenta.
          </CardContent>
        </Card>
      </div>
    )
  }

  const supabase = await createServerClient()
  const { data } = await (supabase.from("organizations") as any)
    .select("*")
    .eq("id", user.org_id)
    .maybeSingle()

  const org = data as OrgRow | null

  if (!org) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No se encontró información de la organización.
          </CardContent>
        </Card>
      </div>
    )
  }

  const trialDaysLeft =
    org.subscription_status === "TRIAL" && org.trial_ends_at
      ? Math.max(0, daysBetween(new Date(), new Date(org.trial_ends_at)))
      : null

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">Gestioná tu plan y facturación</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{org.name}</CardTitle>
            <Badge variant={STATUS_TONE[org.subscription_status]}>
              {STATUS_LABEL[org.subscription_status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Plan</div>
              <div className="text-lg font-medium">{org.plan}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Email de facturación</div>
              <div className="text-lg font-medium">{org.billing_email || "—"}</div>
            </div>

            {org.subscription_status === "TRIAL" && (
              <>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide">Días restantes</div>
                  <div className="text-lg font-medium">
                    {trialDaysLeft === 0 ? (
                      <span className="text-red-600">Expirado</span>
                    ) : (
                      <>{trialDaysLeft} {trialDaysLeft === 1 ? "día" : "días"}</>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide">Vence el</div>
                  <div className="text-lg font-medium">{formatDate(org.trial_ends_at)}</div>
                </div>
              </>
            )}

            {org.subscription_status === "PAST_DUE" && org.grace_period_ends_at && (
              <div className="sm:col-span-2">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">Período de gracia hasta</div>
                <div className="text-lg font-medium">{formatDate(org.grace_period_ends_at)}</div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button disabled>Elegir plan (próximamente)</Button>
            <p className="text-xs text-muted-foreground mt-2">
              Los pagos se habilitarán cuando integremos MercadoPago.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Límites de tu plan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <dt className="text-xs uppercase text-muted-foreground tracking-wide">Usuarios</dt>
              <dd className="text-lg font-medium">{org.max_users >= 999 ? "Ilimitados" : org.max_users}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground tracking-wide">Agencias</dt>
              <dd className="text-lg font-medium">{org.max_agencies >= 999 ? "Ilimitadas" : org.max_agencies}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground tracking-wide">Operaciones/mes</dt>
              <dd className="text-lg font-medium">
                {org.max_operations_per_month >= 999999 ? "Ilimitadas" : org.max_operations_per_month}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
