"use client"

/**
 * Ajustar una deuda al operador por su liquidación definitiva (VIB-174).
 *
 * El reparto se calcula con `planOperatorCostAdjustment`, la MISMA función pura
 * que usa el servidor. No es una estimación optimista para la vista: es el
 * cálculo real, corriendo con los datos que devuelve el GET. Lo que se ve acá
 * antes de confirmar es lo que se escribe.
 *
 * Por qué un diálogo y no edición en línea: cambiar el monto de una deuda mueve
 * plata, corrige comisiones ya liquidadas y emite un asiento. Necesita motivo,
 * fecha de imputación y una lectura del reparto antes de confirmar. Es la misma
 * forma que ya tienen el pago masivo y la carga manual de deuda en esta pantalla.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DecimalInput } from "@/components/ui/decimal-input"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Loader2, TrendingDown, TrendingUp, AlertTriangle, Scale } from "lucide-react"
import { toast } from "sonner"
import { planOperatorCostAdjustment } from "@/lib/accounting/operator-cost-adjustment"
import { formatDateOnlyLocal, todayInArgentina, parseDateOnlyLocal } from "@/lib/utils/date-only"

interface AdjustmentContextResponse {
  debt: {
    id: string
    operationId: string | null
    operatorName: string | null
    amount: number
    paidAmount: number
    currency: "ARS" | "USD"
    status: string
  }
  operation: {
    id: string | null
    date: string | null
    status: string | null
    fileCode: string | null
    destination: string | null
  }
  commissions: Array<{
    sellerId: string
    percentage: number | null
    sellerName?: string | null
    kind?: string | null
  }>
  referral: { percentage: number | null; basis: "MARGIN" | "SALE" } | null
  splitWithSeller: boolean
  ivaBaseEnabled: boolean
  adjustments: Array<{
    id: string
    estimated_amount: number
    actual_amount: number
    delta_amount: number
    currency: string
    accrual_date: string
    reason: string
    reversed_at: string | null
  }>
}

interface OperatorCostAdjustmentDialogProps {
  operatorPaymentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function money(value: number, currency: string) {
  const sign = value < 0 ? "-" : ""
  return `${sign}${currency} ${Math.abs(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function OperatorCostAdjustmentDialog({
  operatorPaymentId,
  open,
  onOpenChange,
  onSuccess,
}: OperatorCostAdjustmentDialogProps) {
  const [context, setContext] = useState<AdjustmentContextResponse | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [actualAmount, setActualAmount] = useState<string>("")
  const [reason, setReason] = useState("")
  const [accrualDate, setAccrualDate] = useState<Date | undefined>(
    parseDateOnlyLocal(todayInArgentina()) ?? new Date(),
  )

  const loadContext = useCallback(async () => {
    if (!operatorPaymentId) return
    setLoadingContext(true)
    setContextError(null)
    try {
      const response = await fetch(
        `/api/accounting/operator-payments/${operatorPaymentId}/adjust`,
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "No se pudo cargar la deuda")
      setContext(payload)
      setActualAmount(String(payload.debt.amount ?? ""))
    } catch (error: any) {
      setContextError(error?.message || "No se pudo cargar la deuda")
    } finally {
      setLoadingContext(false)
    }
  }, [operatorPaymentId])

  useEffect(() => {
    if (open && operatorPaymentId) {
      setReason("")
      setAccrualDate(parseDateOnlyLocal(todayInArgentina()) ?? new Date())
      loadContext()
    } else if (!open) {
      setContext(null)
      setContextError(null)
      setActualAmount("")
    }
  }, [open, operatorPaymentId, loadContext])

  const parsedActual = Number(String(actualAmount).replace(",", "."))

  const plan = useMemo(() => {
    if (!context || !Number.isFinite(parsedActual)) return null
    return planOperatorCostAdjustment({
      currentDebtAmount: context.debt.amount,
      paidAmount: context.debt.paidAmount,
      actualAmount: parsedActual,
      operationDate: context.operation.date,
      // La base neta de IVA cambia el monto del reparto. El GET solo informa si
      // está prendida; el cálculo exacto lo hace el servidor con la alícuota y
      // el corte reales, así que acá se avisa en vez de mostrar un número que
      // podría no coincidir.
      baseConfig: null,
      splitWithSeller: context.splitWithSeller,
      commissions: context.commissions,
      referral: context.referral,
    })
  }, [context, parsedActual])

  const pending = context ? context.debt.amount - context.debt.paidAmount : 0
  const belowPaid = plan?.warnings.some((w) => w.code === "below_paid_amount") ?? false
  const canSubmit =
    !!context && !!plan?.hasAdjustment && !belowPaid && reason.trim().length > 0 && !saving

  const handleSubmit = async () => {
    if (!context || !operatorPaymentId || !plan) return
    setSaving(true)
    try {
      const response = await fetch(
        `/api/accounting/operator-payments/${operatorPaymentId}/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actual_amount: parsedActual,
            reason: reason.trim(),
            accrual_date: accrualDate ? formatDateOnlyLocal(accrualDate) : undefined,
            expected_amount: context.debt.amount,
            expected_paid_amount: context.debt.paidAmount,
          }),
        },
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "No se pudo registrar el ajuste")

      const result = Number(payload.result_amount ?? 0)
      toast.success(
        result >= 0
          ? `Ganancia de ${money(result, context.debt.currency)} registrada`
          : `Pérdida de ${money(Math.abs(result), context.debt.currency)} registrada`,
      )
      if (payload.warning) toast.warning(payload.warning)

      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      toast.error(error?.message || "No se pudo registrar el ajuste")
    } finally {
      setSaving(false)
    }
  }

  const currency = context?.debt.currency ?? "ARS"
  const isGain = (plan?.result ?? 0) > 0
  const liveAdjustments = (context?.adjustments ?? []).filter((a) => !a.reversed_at)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar por liquidación</DialogTitle>
          <DialogDescription>
            {context?.debt.operatorName
              ? `Corregí la deuda con ${context.debt.operatorName} al costo que liquidó de verdad. La operación conserva su costo estimado; la diferencia se imputa al mes que elijas.`
              : "Corregí la deuda al costo que liquidó de verdad. La operación conserva su costo estimado; la diferencia se imputa al mes que elijas."}
          </DialogDescription>
        </DialogHeader>

        {loadingContext ? (
          <div className="space-y-3 py-4" aria-live="polite" aria-busy="true">
            <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
            <span className="sr-only">Cargando la deuda</span>
          </div>
        ) : contextError ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">{contextError}</p>
            <Button variant="outline" size="sm" onClick={loadContext}>
              Reintentar
            </Button>
          </div>
        ) : context ? (
          <div className="space-y-5 py-1">
            {/* Lo que hay hoy. Contexto antes que acción. */}
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/40 bg-border/40 text-sm">
              <div className="bg-background px-4 py-3">
                <dt className="text-xs text-muted-foreground">Deuda registrada</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {money(context.debt.amount, currency)}
                </dd>
              </div>
              <div className="bg-background px-4 py-3">
                <dt className="text-xs text-muted-foreground">Ya pagado</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {money(context.debt.paidAmount, currency)}
                </dd>
              </div>
              <div className="bg-background px-4 py-3">
                <dt className="text-xs text-muted-foreground">Pendiente</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{money(pending, currency)}</dd>
              </div>
            </dl>

            {liveAdjustments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Esta deuda ya tiene {liveAdjustments.length}{" "}
                {liveAdjustments.length === 1 ? "ajuste" : "ajustes"}. El último la dejó en{" "}
                {money(Number(liveAdjustments[0].actual_amount), currency)}.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adjustment-actual">Costo real liquidado</Label>
                <DecimalInput
                  id="adjustment-actual"
                  value={actualAmount}
                  onChange={setActualAmount}
                  placeholder="0.00"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Lo que figura en la liquidación del operador, en {currency}.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-date">Mes al que se imputa</Label>
                <DateInputWithCalendar
                  value={accrualDate}
                  onChange={setAccrualDate}
                  placeholder="dd/mm/aaaa"
                />
                <p className="text-xs text-muted-foreground">
                  Normalmente hoy: el mes en que llegó la liquidación.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjustment-reason">
                Motivo <span className="text-muted-foreground">(obligatorio)</span>
              </Label>
              <Textarea
                id="adjustment-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej: liquidación final de Eurovips, el traslado salió más caro"
                rows={2}
              />
            </div>

            {/* El reparto, antes de confirmar. */}
            {plan?.hasAdjustment && !belowPaid && (
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  {isGain ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {isGain ? "Ganancia" : "Pérdida"} de{" "}
                    <span className="tabular-nums">
                      {money(Math.abs(plan.result), currency)}
                    </span>
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5 text-sm">
                  <li className="flex items-baseline justify-between gap-4">
                    <span className="text-muted-foreground">Agencia</span>
                    <span className="tabular-nums font-medium">
                      {money(plan.agencyShare, currency)}
                    </span>
                  </li>
                  {plan.sellerShares.map((share) => (
                    <li
                      key={share.sellerId}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <span className="text-muted-foreground">
                        {share.sellerName || "Vendedor"}{" "}
                        <span className="text-xs">({share.percentage}%)</span>
                      </span>
                      <span className="tabular-nums font-medium">
                        {money(share.amount, currency)}
                      </span>
                    </li>
                  ))}
                  {plan.referrerShare !== 0 && (
                    <li className="flex items-baseline justify-between gap-4">
                      <span className="text-muted-foreground">Referidor</span>
                      <span className="tabular-nums font-medium">
                        {money(plan.referrerShare, currency)}
                      </span>
                    </li>
                  )}
                </ul>

                <p className="mt-3 text-xs text-muted-foreground">
                  {isGain
                    ? "Las partes en positivo se suman a lo que se le debe a cada uno."
                    : "Las partes en negativo se descuentan de la próxima liquidación de comisiones."}
                </p>

                {context.ivaBaseEnabled && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    La agencia comisiona sobre la ganancia neta de IVA: los montos definitivos
                    salen con esa base y pueden ser algo menores.
                  </p>
                )}

                {plan.warnings
                  .filter((w) => w.code !== "below_paid_amount")
                  .map((warning) => (
                    <p
                      key={warning.code}
                      className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <Scale className="mt-0.5 h-3 w-3 shrink-0" />
                      {warning.message}
                    </p>
                  ))}
              </div>
            )}

            {belowPaid && (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                El costo real es menor que lo que ya se le pagó al operador. Revertí ese pago
                antes de ajustar.
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
