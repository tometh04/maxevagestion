import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PLANS, formatArs, type PlanId } from "@/lib/billing/plans"
import { PaymentMethodCard } from "@/components/billing/payment-method-card"
import { BillingHistoryTable } from "@/components/billing/billing-history-table"
import { CancelDialog } from "@/components/billing/cancel-dialog"
import { ReactivateDialog } from "@/components/billing/reactivate-dialog"

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  TRIALING: "En prueba gratis",
  ACTIVE: "Activo",
  PAST_DUE: "Cobro pendiente",
  CANCELLED: "Cancelado",
  SUSPENDED: "Suspendido",
  TRIAL: "En prueba (legacy)",
}

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_PAYMENT: "outline",
  TRIALING: "secondary",
  ACTIVE: "default",
  PAST_DUE: "destructive",
  CANCELLED: "outline",
  SUSPENDED: "destructive",
  TRIAL: "secondary",
}

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>
}) {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")

  const { checkout, error: errorParam } = await searchParams
  const checkoutFailed = checkout === "failed"
  const checkoutError = errorParam ? decodeURIComponent(errorParam) : null

  if (!user.org_id) {
    return (
      <div className="p-6">
        <p>No tenés una organización asociada a tu cuenta.</p>
      </div>
    )
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("*")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) {
    return <div className="p-6">Organización no encontrada.</div>
  }

  const { data: events } = await admin
    .from("billing_events")
    .select("id, created_at, event_type, amount_cents, currency, status")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(20)

  const plan = PLANS[org.plan as PlanId]
  const status = org.subscription_status as string
  const isCancelledWithAccess =
    status === "CANCELLED" &&
    org.current_period_ends_at &&
    new Date(org.current_period_ends_at).getTime() > Date.now()
  const canCancel = ["TRIALING", "ACTIVE", "PAST_DUE"].includes(status)
  const canReactivate = status === "CANCELLED"
  const hasActivePreapproval = !!org.mp_preapproval_id

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">
          Gestioná tu plan, método de pago y estado de la cuenta
        </p>
      </div>

      {checkoutFailed && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-red-900">
              El checkout con MercadoPago falló
            </p>
            {checkoutError && (
              <p className="text-xs text-red-700 mt-1 break-words">{checkoutError}</p>
            )}
            <p className="text-xs text-red-700 mt-1">
              Elegí un plan abajo para reintentar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Estado actual */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{org.name}</CardTitle>
            <Badge variant={STATUS_TONE[status] || "outline"}>
              {STATUS_LABEL[status] || status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {status === "PENDING_PAYMENT" && (
            <p className="text-orange-700">
              Todavía no elegiste un plan. Tu acceso está bloqueado hasta que completes el checkout.
            </p>
          )}
          {status === "TRIALING" && (
            <p>
              Estás en período de prueba durante 7 días hasta el{" "}
              <strong>{fmt(org.trial_ends_at)}</strong>. Primer cobro ese día.
            </p>
          )}
          {status === "ACTIVE" && (
            <p>
              Próximo cobro: <strong>{fmt(org.current_period_ends_at)}</strong>
            </p>
          )}
          {status === "PAST_DUE" && (
            <p className="text-red-700">
              No pudimos cobrar tu última cuota. Actualizá tu medio de pago antes del{" "}
              {fmt(org.current_period_ends_at)} para no perder el acceso.
            </p>
          )}
          {isCancelledWithAccess && (
            <p className="text-blue-700">
              Tu suscripción está cancelada. Mantenés acceso hasta el{" "}
              <strong>{fmt(org.current_period_ends_at)}</strong>. Podés reactivar cuando quieras.
            </p>
          )}
          {status === "CANCELLED" && !isCancelledWithAccess && (
            <p>
              Tu suscripción venció. Para volver a acceder, elegí un plan.
            </p>
          )}
          {status === "SUSPENDED" && (
            <p className="text-red-700">
              Tu cuenta está suspendida. Contactanos a hola@vibook.ai.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Método de pago */}
      <PaymentMethodCard hasActivePreapproval={hasActivePreapproval} cardSummary={null} />

      {/* Plan */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            <div className="text-2xl font-bold">
              {plan.priceArsMonthly !== null ? (
                <>
                  {formatArs(plan.priceArsMonthly)}
                  <span className="text-sm font-normal text-muted-foreground"> /mes</span>
                </>
              ) : (
                plan.priceLabel || "Consultar"
              )}
            </div>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {plan.features.map((f) => <li key={f}>• {f}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Historial */}
      <Card>
        <CardHeader><CardTitle>Historial de pagos</CardTitle></CardHeader>
        <CardContent>
          <BillingHistoryTable events={events || []} />
        </CardContent>
      </Card>

      {/* Acciones: cancelar o reactivar */}
      {(canCancel || canReactivate) && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">
              {canReactivate ? "Reactivar suscripción" : "Cancelar suscripción"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canCancel && (
              <CancelDialog
                currentPeriodEndsAt={org.current_period_ends_at}
                trialEndsAt={org.trial_ends_at}
                status={status}
              />
            )}
            {canReactivate && (
              <ReactivateDialog
                plan={org.plan}
                currentPeriodEndsAt={org.current_period_ends_at}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
