"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { formatArs } from "@/lib/billing/plans"
import { computePeriodExtension, daysOverdue } from "@/lib/billing/period-extension"
import { parseDateOnlyLocal, todayInArgentina } from "@/lib/utils/date-only"

const MONTH_PRESETS = [1, 2, 3, 6, 12]

type Props = {
  orgId: string
  currentPeriodEndsAt: string | null
  /** MRR resuelto (override → custom plan → precio del plan). null si no hay. */
  suggestedAmountArs: number | null
  hasMpPreapproval: boolean
  subscriptionStatus: string | null
}

/**
 * Acción de platform admin para orgs que pagan por fuera de Mercado Pago:
 * confirma el pago del período y corre el vencimiento.
 *
 * El período nuevo arranca donde terminó el anterior (no "hoy"), así registrar
 * el pago con unos días de atraso no regala esos días. Ver
 * `lib/billing/period-extension`.
 */
export function RegisterPaymentCard({
  orgId,
  currentPeriodEndsAt,
  suggestedAmountArs,
  hasMpPreapproval,
  subscriptionStatus,
}: Props) {
  const router = useRouter()
  const [months, setMonths] = React.useState(1)
  const [amount, setAmount] = React.useState(
    suggestedAmountArs != null && suggestedAmountArs > 0 ? String(suggestedAmountArs) : ""
  )
  const [paidAt, setPaidAt] = React.useState(todayInArgentina())
  const [method, setMethod] = React.useState("")
  const [receiptRef, setReceiptRef] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // `now` fijo al montar: evita que el preview cambie solo mientras el admin
  // completa el form y mantiene el render del server igual al del cliente.
  const [now] = React.useState(() => new Date())

  const preview = React.useMemo(
    () => computePeriodExtension({ currentPeriodEndsAt, months, now }),
    [currentPeriodEndsAt, months, now]
  )
  const overdueDays = daysOverdue(currentPeriodEndsAt, now)
  const statusFrozen = subscriptionStatus === "SUSPENDED" || subscriptionStatus === "CANCELLED"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Ingresá el monto cobrado (mayor a 0).")
      return
    }
    const paidAtDate = parseDateOnlyLocal(paidAt)
    if (!paidAtDate) {
      setError("Ingresá una fecha de pago válida.")
      return
    }

    const ok = window.confirm(
      `Registrar ${formatArs(amountNum)} y mover el vencimiento al ${formatDate(preview.periodEndsAt)}` +
        `${statusFrozen ? "" : " (la org queda ACTIVE)"}?`
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/manual-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_ars: amountNum,
          paid_at: paidAtDate.toISOString(),
          covers_from: preview.coversFrom,
          covers_to: preview.coversTo,
          period_ends_at: preview.periodEndsAt,
          payment_method: method.trim() || null,
          receipt_ref: receiptRef.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      if (data.period_extended === false) {
        toast.warning(
          "Pago registrado, pero el vencimiento no se movió: ya estaba más adelante que el período cargado."
        )
      } else {
        toast.success(`Pago registrado. Nuevo vencimiento: ${formatDate(data.current_period_ends_at)}`)
      }
      setMethod("")
      setReceiptRef("")
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido"
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registrar pago y extender vencimiento</CardTitle>
        <CardDescription>
          Para cobros por fuera de Mercado Pago (transferencia, factura A). Marca el período como
          pago, corre el vencimiento y deja el registro en el historial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Vencimiento actual:</span>
          <span className="font-medium text-foreground">
            {currentPeriodEndsAt ? formatDate(currentPeriodEndsAt) : "sin período registrado"}
          </span>
          {overdueDays > 0 && (
            <span className="rounded-full border border-accent-coral/30 bg-accent-coral/15 px-2 py-0.5 text-xs font-medium text-accent-coral">
              vencido hace {overdueDays} {overdueDays === 1 ? "día" : "días"}
            </span>
          )}
        </div>

        {hasMpPreapproval && (
          <div className="rounded border border-accent-coral/40 bg-accent-coral/10 p-3 text-xs text-accent-coral">
            ⚠️ Esta org tiene suscripción de Mercado Pago activa: el vencimiento lo mueve el cobro
            automático. Registrar un pago manual acá puede pisar ese ciclo. Usalo solo si sabés que
            el cobro se hizo por fuera de MP.
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Período a cubrir</Label>
            <div className="flex flex-wrap items-center gap-2">
              {MONTH_PRESETS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={months === m ? "default" : "outline"}
                  onClick={() => setMonths(m)}
                  disabled={busy}
                >
                  {m} {m === 1 ? "mes" : "meses"}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded border border-border bg-muted/40 p-3 text-sm">
            <div>
              Cubre <span className="font-medium text-foreground">{preview.coversFrom}</span> →{" "}
              <span className="font-medium text-foreground">{preview.coversTo}</span>
            </div>
            <div className="mt-1">
              Nuevo vencimiento:{" "}
              <span className="font-medium text-foreground">{formatDate(preview.periodEndsAt)}</span>
            </div>
            {preview.basedOn === "now" && (
              <div className="mt-1 text-xs text-muted-foreground">
                La org no tenía período registrado: el ciclo arranca hoy.
              </div>
            )}
            {preview.stillOverdue && (
              <div className="mt-1 text-xs text-accent-coral">
                Con {months} {months === 1 ? "mes" : "meses"} el vencimiento sigue en el pasado —
                la org debe más de un período.
              </div>
            )}
            {statusFrozen && (
              <div className="mt-1 text-xs text-accent-coral">
                La org está {subscriptionStatus}: el pago no la reactiva sola. Cambiá el estado a
                mano si corresponde.
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-amount" className="text-xs text-muted-foreground">
                Monto cobrado (ARS)
              </Label>
              <DecimalInput
                id="mp-amount"
                value={amount}
                onChange={setAmount}
                placeholder="Ej: 119000"
                disabled={busy}
              />
              {suggestedAmountArs != null && suggestedAmountArs > 0 && (
                <p className="text-xs text-muted-foreground">
                  MRR configurado: {formatArs(suggestedAmountArs)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-paid-at" className="text-xs text-muted-foreground">
                Fecha de pago
              </Label>
              <Input
                id="mp-paid-at"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-method" className="text-xs text-muted-foreground">
                Método (opcional)
              </Label>
              <Input
                id="mp-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Transferencia / Factura A"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-receipt" className="text-xs text-muted-foreground">
                Comprobante (opcional)
              </Label>
              <Input
                id="mp-receipt"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="Nro de comprobante"
                disabled={busy}
              />
            </div>
          </div>

          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Registrando..." : "Registrar pago"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
}
