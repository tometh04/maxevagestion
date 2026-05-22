import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PLANS, formatArs } from "@/lib/billing/plans"

type CustomPlan = {
  display_name: string
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
  features: { extras: Array<{ key: string; label: string; enabled: boolean }> }
  billing_method: "MP" | "MANUAL"
}

type Org = {
  name: string
  subscription_status: string | null
  mp_preapproval_id: string | null
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

export function CustomPlanOwnerView({
  plan,
  org,
  checkoutUrl,
}: {
  plan: CustomPlan
  org: Org
  /** init_point del preapproval MP cuando la suscripción está pendiente. Null si ya pagó o MANUAL. */
  checkoutUrl: string | null
}) {
  const enterpriseFeatures = PLANS.ENTERPRISE.features
  const effective = plan.base_price_ars * (1 - (plan.discount_percent ?? 0) / 100)
  const hasDiscount = plan.discount_percent > 0 && !!plan.discount_ends_at

  const isActive = org.subscription_status === "ACTIVE"
  // Bug fix 2026-05-18 (Tomi reportó VICO): antes isPendingMp era
  // `!isActive && billing_method === "MP" && checkoutUrl`. Pero VICO había
  // sido marcada ACTIVE manualmente (pagaron primer mes por transferencia)
  // SIN aceptar el preapproval MP → quedó en limbo: status=ACTIVE pero
  // mp_preapproval_id=NULL. La UI mostraba "Cobro automático activo" lo
  // cual era falso (no tienen suscripción MP) y NO mostraba botón para
  // que aceptaran el checkout.
  //
  // Ahora distinguimos:
  //   - isMpFullyActive: ACTIVE con preapproval real → mostrar "Cobro automático activo"
  //   - needsMpActivation: billing_method=MP sin preapproval → mostrar botón checkout
  //     (independiente de si subscription_status es ACTIVE o no)
  const isMpFullyActive = isActive && plan.billing_method === "MP" && !!org.mp_preapproval_id
  const needsMpActivation =
    plan.billing_method === "MP" && !org.mp_preapproval_id && !!checkoutUrl
  const isPendingMp = needsMpActivation

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">Tu plan personalizado</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              {isPendingMp && (
                <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                  Tu plan personalizado está listo
                </div>
              )}
              <CardTitle>{plan.display_name}</CardTitle>
            </div>
            <Badge variant={isActive ? "default" : "outline"}>
              {isActive ? "Activo" : plan.billing_method === "MANUAL" ? "Pago manual" : "Pendiente de pago"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            {hasDiscount ? (
              <>
                <div>
                  <span className="text-muted-foreground">Precio actual</span>{" "}
                  <strong>{formatArs(effective)} / mes</strong>{" "}
                  <span className="text-xs text-muted-foreground">
                    (hasta {fmt(plan.discount_ends_at)})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">A partir de ahí</span>{" "}
                  <strong>{formatArs(plan.base_price_ars)} / mes</strong>
                </div>
                <div className="text-xs text-success dark:text-success">
                  Descuento promocional: {plan.discount_percent}% off
                </div>
              </>
            ) : (
              <div>
                <span className="text-muted-foreground">Precio</span>{" "}
                <strong>{formatArs(plan.base_price_ars)} / mes</strong>
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="font-semibold">Todo lo del plan Enterprise:</div>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {enterpriseFeatures.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>

            {plan.features.extras.filter((e) => e.enabled).length > 0 && (
              <>
                <div className="font-semibold mt-3">
                  + Features adicionales acordadas para tu agencia:
                </div>
                <ul className="space-y-0.5 text-xs">
                  {plan.features.extras
                    .filter((e) => e.enabled)
                    .map((e) => (
                      <li key={e.key}>✓ {e.label}</li>
                    ))}
                </ul>
              </>
            )}
          </div>

          {needsMpActivation && checkoutUrl && (
            <div className="space-y-3 border-t pt-3">
              {isActive ? (
                // Caso clientes que ya pagaron 1er mes offline: explicar fecha límite +
                // qué pasa cuando aceptan ahora vs después.
                <div className="rounded-md border border-accent-coral/40 bg-accent-coral/10 px-3 py-3 text-accent-coral space-y-1.5">
                  <div className="text-sm font-semibold">
                    ⚠️ Activá el cobro automático antes del próximo vencimiento
                  </div>
                  <div className="text-xs">
                    Tu plan ya está activo (pagaste el primer período). Para que los
                    próximos meses se cobren solos sin que tengas que transferirnos
                    cada mes, completá el checkout de MercadoPago.
                    {org.current_period_ends_at && (
                      <>
                        {" "}Tenés tiempo hasta el{" "}
                        <strong>{fmt(org.current_period_ends_at)}</strong> — ese es el
                        día en que MercadoPago intentará el primer cobro automático
                        (≠ pago de hoy).
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-3 text-foreground space-y-1.5">
                  <div className="text-sm font-semibold text-primary">
                    Tu plan personalizado está listo
                  </div>
                  <div className="text-xs">
                    Para activar tu suscripción, completá el checkout de MercadoPago.
                    Al aceptarlo, MP te cobra automáticamente cada mes.
                  </div>
                </div>
              )}
              <a
                href={checkoutUrl}
                className="block text-center text-sm font-semibold px-4 py-3 rounded bg-primary text-white hover:bg-primary transition"
              >
                {isActive
                  ? "Activar cobro automático con MercadoPago →"
                  : "Suscribirme y pagar con MercadoPago →"}
              </a>
              <div className="text-[11px] text-muted-foreground text-center">
                Vas a ser redirigido a MercadoPago para autorizar la suscripción.
              </div>
            </div>
          )}

          {isMpFullyActive && (
            <div className="text-xs text-success border-t pt-3 space-y-0.5">
              <div className="font-semibold">✓ Cobro automático activo vía MercadoPago</div>
              {org.current_period_ends_at && (
                <div className="text-muted-foreground">
                  Próximo cobro: <strong>{fmt(org.current_period_ends_at)}</strong>
                </div>
              )}
              {plan.discount_ends_at && new Date(plan.discount_ends_at).getTime() > Date.now() && (
                <div className="text-muted-foreground">
                  Descuento promocional vigente hasta: <strong>{fmt(plan.discount_ends_at)}</strong>
                </div>
              )}
            </div>
          )}

          {plan.billing_method === "MANUAL" && (
            <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
              <div>Método de pago: Factura A / Transferencia.</div>
              {org.current_period_ends_at && (
                <div>
                  {isActive ? "Próximo vencimiento" : "Vencimiento"}:{" "}
                  {fmt(org.current_period_ends_at)}.
                </div>
              )}
              <div>Consultas de facturación: ventas@vibook.ai</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
