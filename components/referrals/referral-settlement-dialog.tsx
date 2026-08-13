"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Wallet } from "lucide-react"
import { toast } from "sonner"
import { resolveSettlementCash, type SettlementCurrency } from "@/lib/referrals/settlement"

/**
 * Pago de comisiones a un referidor (VIB-86).
 *
 * Antes, "pagar" sólo marcaba un flag y la plata no salía de ninguna cuenta.
 * Este diálogo es el que convierte eso en un egreso real: obliga a elegir la
 * cuenta, resuelve el cambio de moneda y muestra —antes de confirmar— cuánto va
 * a salir de esa cuenta.
 *
 * La conversión usa la MISMA función pura que valida el servidor
 * (`resolveSettlementCash`), así que la vista previa no puede desviarse de lo
 * que termina registrando el ledger.
 */

interface AccountOption {
  id: string
  name: string
  currency: string
  is_active?: boolean
}

export interface SettlementDialogCommission {
  id: string
  amount: number
  currency: string
  fileCode?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  partnerName: string
  commissions: SettlementDialogCommission[]
  /**
   * Registrar la salida de caja de comisiones que ya figuraban como pagadas con
   * el flujo viejo. No es un segundo pago: sólo completa lo que faltó.
   */
  regularize?: boolean
  onDone: () => void
}

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0)
  } catch {
    return `${currency} ${(Number(amount) || 0).toFixed(2)}`
  }
}

/** Hoy en formato YYYY-MM-DD, sin desfase de zona horaria (AR es UTC-3). */
function hoyLocal(): string {
  const d = new Date()
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 10)
}

export function ReferralSettlementDialog({
  open,
  onOpenChange,
  partnerName,
  commissions,
  regularize = false,
  onDone,
}: Props) {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountId, setAccountId] = useState("")
  const [exchangeRate, setExchangeRate] = useState("")
  const [paidAt, setPaidAt] = useState(hoyLocal())
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const currency = (commissions[0]?.currency || "ARS").toUpperCase() as SettlementCurrency
  const total = useMemo(
    () => Math.round(commissions.reduce((acc, c) => acc + (Number(c.amount) || 0), 0) * 100) / 100,
    [commissions],
  )

  useEffect(() => {
    if (!open) {
      setAccountId("")
      setExchangeRate("")
      setNotes("")
      setPaidAt(hoyLocal())
      return
    }

    let cancelado = false
    const cargar = async () => {
      setLoadingAccounts(true)
      try {
        const res = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (cancelado) return
        setAccounts(
          ((data.accounts ?? []) as AccountOption[]).filter((a) => a.is_active !== false),
        )
      } catch {
        if (!cancelado) toast.error("No se pudieron cargar las cuentas")
      } finally {
        if (!cancelado) setLoadingAccounts(false)
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [open])

  const account = accounts.find((a) => a.id === accountId)
  const accountCurrency = (account?.currency || "").toUpperCase() as SettlementCurrency | ""

  // El TC hace falta cuando hay dólares de por medio: cross-moneda para saber
  // cuánto sale de la cuenta, y USD→USD para el equivalente en pesos del ledger.
  const necesitaTC = Boolean(accountCurrency) && (currency === "USD" || accountCurrency === "USD")

  const preview = useMemo(() => {
    if (!accountCurrency) return null
    return resolveSettlementCash({
      commissionCurrency: currency,
      accountCurrency,
      amount: total,
      exchangeRate: exchangeRate ? Number(exchangeRate) : null,
    })
  }, [accountCurrency, currency, total, exchangeRate])

  const submit = async () => {
    if (!accountId) {
      toast.error("Elegí la cuenta desde la que sale el pago")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/referral-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionIds: commissions.map((c) => c.id),
          financial_account_id: accountId,
          exchange_rate: exchangeRate || undefined,
          paid_at: paidAt,
          notes: notes.trim() || undefined,
          regularize,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo registrar el pago")

      toast.success(
        regularize
          ? "Salida de caja registrada"
          : `Liquidación registrada por ${fmt(total, currency)}`,
      )
      onOpenChange(false)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al liquidar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {regularize ? "Registrar salida de caja" : `Liquidar a ${partnerName}`}
          </DialogTitle>
          <DialogDescription>
            {regularize
              ? "Estas comisiones ya figuran como pagadas pero nunca salieron de una cuenta. Elegí de dónde salió la plata para dejar la caja consistente."
              : `${commissions.length} comisión(es) por ${fmt(total, currency)}. El pago sale de la cuenta que elijas.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Cuenta de la que sale el pago *</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={loadingAccounts}>
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingAccounts ? "Cargando cuentas…" : "Elegí una cuenta"}
                />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingAccounts && accounts.length === 0 && (
              <p className="mt-1.5 text-xs text-destructive">
                No hay cuentas activas. Creá una en Caja → Cuentas financieras.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Fecha del pago *</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            {necesitaTC && (
              <div>
                <Label className="mb-1.5 block">Tipo de cambio</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Se usa el vigente"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Vista previa: qué sale realmente de la cuenta. */}
          {account && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                <span className="text-xs font-medium uppercase tracking-wider">Sale de la cuenta</span>
              </div>
              {preview?.ok ? (
                <>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {fmt(preview.cashAmount, accountCurrency || account.currency)}
                  </p>
                  {accountCurrency !== currency && (
                    <p className="text-xs text-muted-foreground">
                      {fmt(total, currency)} convertidos a {accountCurrency}
                      {preview.exchangeRate ? ` al TC ${preview.exchangeRate}` : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {preview?.error ??
                    "Ingresá el tipo de cambio para ver cuánto sale de la cuenta."}
                  {!exchangeRate && necesitaTC && " Si lo dejás vacío se usa el vigente del sistema."}
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">Observaciones</Label>
            <Textarea
              rows={2}
              placeholder="Opcional. Aparece en el comprobante."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !accountId}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Registrando…
              </>
            ) : regularize ? (
              "Registrar en caja"
            ) : (
              `Liquidar ${fmt(total, currency)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
