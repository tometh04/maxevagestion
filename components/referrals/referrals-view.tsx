"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  Users2,
  RotateCcw,
  Pencil,
  Plus,
  FileText,
  AlertTriangle,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import {
  ReferralSettlementDialog,
  type SettlementDialogCommission,
} from "@/components/referrals/referral-settlement-dialog"

interface CommissionRow {
  id: string
  amount: number
  amount_paid: number
  percentage: number
  base_amount: number
  currency: string
  status: "PENDING" | "PAID" | "CANCELLED"
  /** MANUAL = un admin ajustó el % de esta venta y el recálculo no lo pisa. */
  percentage_mode?: "AUTO" | "MANUAL"
  /** Liquidación en la que se pagó. NULL + PAID = pagada sin salida de caja. */
  settlement_id?: string | null
  date_calculated: string
  date_paid: string | null
  referral_partners?: { id: string; name: string } | null
  operations?: {
    id: string
    file_code: string | null
    destination: string | null
    departure_date: string | null
    sale_currency: string | null
  } | null
  customers?: { id: string; first_name: string; last_name: string } | null
}

interface SettlementRow {
  id: string
  currency: string
  amount: number
  commissions_count: number
  /** Nombre copiado al liquidar: la cuenta puede haberse borrado después. */
  account_name: string
  account_currency: string
  cash_amount: number
  exchange_rate: number | null
  paid_at: string
  status: "PAID" | "REVERTED"
  is_regularization: boolean
  notes: string | null
  reversal_reason: string | null
  referral_partners?: { id: string; name: string } | null
  financial_accounts?: { id: string; name: string; currency: string } | null
}

interface Partner {
  id: string
  name: string
  default_commission_percentage: number
  active: boolean
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

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—"
  const [y, m, d] = String(iso).slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : "—"
}

/** Suma montos agrupando por moneda (no mezcla ARS/USD). */
function sumByCurrency(rows: { amount: number; currency: string }[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) || 0) + (Number(r.amount) || 0))
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }))
}

export function ReferralsView({ canSettle = false }: { canSettle?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [settling, setSettling] = useState<{
    partnerName: string
    rows: SettlementDialogCommission[]
    regularize: boolean
  } | null>(null)
  const [reverting, setReverting] = useState<SettlementRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, pRes, sRes] = await Promise.all([
        fetch("/api/referral-commissions"),
        fetch("/api/referral-partners?include_inactive=true"),
        fetch("/api/referral-settlements"),
      ])
      const cData = cRes.ok ? await cRes.json() : { commissions: [] }
      const pData = pRes.ok ? await pRes.json() : { partners: [] }
      const sData = sRes.ok ? await sRes.json() : { settlements: [] }
      setCommissions(cData.commissions ?? [])
      setPartners(pData.partners ?? [])
      setSettlements(sData.settlements ?? [])
      setSelected(new Set())
    } catch {
      toast.error("No se pudieron cargar los referidos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const pending = useMemo(() => commissions.filter((c) => c.status === "PENDING"), [commissions])
  const history = useMemo(() => commissions.filter((c) => c.status !== "PENDING"), [commissions])
  const paid = useMemo(() => commissions.filter((c) => c.status === "PAID"), [commissions])

  /**
   * Comisiones marcadas como pagadas antes de que el pago moviera plata: el
   * referidor cobró, pero el egreso nunca salió de una cuenta. Se señalan para
   * poder regularizarlas en vez de dejar la caja inflada para siempre.
   */
  const pagadasSinCaja = useMemo(
    () => paid.filter((c) => !c.settlement_id),
    [paid],
  )

  const pendingTotals = useMemo(() => sumByCurrency(pending), [pending])
  const paidTotals = useMemo(
    () => sumByCurrency(paid.map((c) => ({ amount: c.amount_paid || c.amount, currency: c.currency }))),
    [paid],
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * Ajuste puntual del % de una venta (VIB-86). El referidor se marca en el
   * cliente y todas sus ventas generan comisión sola; esto permite pactar algo
   * distinto en una venta concreta. Queda MANUAL, así que el próximo recálculo
   * de la operación no lo pisa.
   */
  const changePercentage = async (row: CommissionRow, percentage: string) => {
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/referral-commissions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percentage }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "No se pudo actualizar el porcentaje")
      }
      const { commission } = await res.json()
      setCommissions((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...commission } : c)))
      toast.success("Comisión del referidor ajustada para esta venta")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar")
    } finally {
      setSavingId(null)
    }
  }

  /**
   * Agrupa lo pendiente por referidor Y MONEDA: una liquidación es un solo pago
   * desde una sola cuenta, así que ARS y USD nunca van juntos.
   */
  const pendingByGroup = useMemo(() => {
    const groups = new Map<string, { name: string; currency: string; rows: CommissionRow[] }>()
    for (const c of pending) {
      const partnerId = c.referral_partners?.id || "—"
      const key = `${partnerId}::${c.currency}`
      if (!groups.has(key)) {
        groups.set(key, {
          name: c.referral_partners?.name || "Sin referidor",
          currency: c.currency,
          rows: [],
        })
      }
      groups.get(key)!.rows.push(c)
    }
    return Array.from(groups.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency),
    )
  }, [pending])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Por pagar</p>
            <div className="mt-1 space-y-0.5">
              {pendingTotals.length === 0 ? (
                <p className="text-2xl font-semibold">—</p>
              ) : (
                pendingTotals.map((t) => (
                  <p key={t.currency} className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                    {fmt(t.amount, t.currency)}
                  </p>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pending.length} comisiones pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pagado</p>
            <div className="mt-1 space-y-0.5">
              {paidTotals.length === 0 ? (
                <p className="text-2xl font-semibold">—</p>
              ) : (
                paidTotals.map((t) => (
                  <p key={t.currency} className="text-2xl font-semibold text-success">
                    {fmt(t.amount, t.currency)}
                  </p>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{paid.length} comisiones pagadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Referidores</p>
            <p className="text-2xl font-semibold mt-1">{partners.filter((p) => p.active).length}</p>
            <p className="text-xs text-muted-foreground mt-1">activos</p>
          </CardContent>
        </Card>
      </div>

      {/* Aviso de comisiones pagadas sin registrar el egreso. */}
      {pagadasSinCaja.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {pagadasSinCaja.length} comisión(es) figuran pagadas pero no salieron de ninguna cuenta
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Se marcaron como pagadas cuando el sistema sólo registraba el estado. La plata salió
                  de la agencia, así que el saldo de caja está mostrando de más. Podés registrarlas
                  ahora indicando de qué cuenta salió.
                </p>
                {canSettle && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Array.from(
                      pagadasSinCaja.reduce((map, c) => {
                        const key = `${c.referral_partners?.id ?? "—"}::${c.currency}`
                        if (!map.has(key)) {
                          map.set(key, {
                            name: c.referral_partners?.name || "Sin referidor",
                            currency: c.currency,
                            rows: [] as CommissionRow[],
                          })
                        }
                        map.get(key)!.rows.push(c)
                        return map
                      }, new Map<string, { name: string; currency: string; rows: CommissionRow[] }>()),
                    ).map(([key, g]) => (
                      <Button
                        key={key}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSettling({
                            partnerName: g.name,
                            regularize: true,
                            rows: g.rows.map((r) => ({
                              id: r.id,
                              amount: r.amount,
                              currency: r.currency,
                              fileCode: r.operations?.file_code ?? null,
                            })),
                          })
                        }
                      >
                        <Wallet className="mr-1.5 h-3.5 w-3.5" />
                        {g.name} · {fmt(
                          g.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0),
                          g.currency,
                        )}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Por pagar ({pending.length})</TabsTrigger>
          <TabsTrigger value="settlements">Liquidaciones ({settlements.length})</TabsTrigger>
          <TabsTrigger value="history">Historial ({history.length})</TabsTrigger>
          <TabsTrigger value="partners">Referidores ({partners.length})</TabsTrigger>
        </TabsList>

        {/* POR PAGAR */}
        <TabsContent value="pending" className="mt-4 space-y-6">
          {pendingByGroup.length === 0 ? (
            <EmptyState text="No hay comisiones pendientes de pago." />
          ) : (
            pendingByGroup.map((group) => {
              const seleccionadas = group.rows.filter((r) => selected.has(r.id))
              const totalSeleccionado = seleccionadas.reduce(
                (a, r) => a + (Number(r.amount) || 0),
                0,
              )
              const todasSeleccionadas =
                group.rows.length > 0 && seleccionadas.length === group.rows.length

              return (
                <Card key={`${group.name}-${group.currency}`}>
                  <CardContent className="pt-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Users2 className="h-4 w-4 text-accent-coral" />
                        <span className="font-medium">{group.name}</span>
                        <Badge variant="outline">{group.currency}</Badge>
                        <Badge variant="secondary">{group.rows.length}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">
                          {fmt(
                            group.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0),
                            group.currency,
                          )}
                        </span>
                        {canSettle && (
                          <Button
                            size="sm"
                            disabled={seleccionadas.length === 0}
                            onClick={() =>
                              setSettling({
                                partnerName: group.name,
                                regularize: false,
                                rows: seleccionadas.map((r) => ({
                                  id: r.id,
                                  amount: r.amount,
                                  currency: r.currency,
                                  fileCode: r.operations?.file_code ?? null,
                                })),
                              })
                            }
                          >
                            <Wallet className="mr-1.5 h-3.5 w-3.5" />
                            {seleccionadas.length === 0
                              ? "Liquidar"
                              : `Liquidar ${fmt(totalSeleccionado, group.currency)}`}
                          </Button>
                        )}
                      </div>
                    </div>
                    <CommissionsTable
                      rows={group.rows}
                      savingId={savingId}
                      selectable={canSettle}
                      selected={selected}
                      allSelected={todasSeleccionadas}
                      onToggle={toggle}
                      onToggleAll={() =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (todasSeleccionadas) group.rows.forEach((r) => next.delete(r.id))
                          else group.rows.forEach((r) => next.add(r.id))
                          return next
                        })
                      }
                      onChangePct={changePercentage}
                    />
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

        {/* LIQUIDACIONES */}
        <TabsContent value="settlements" className="mt-4">
          {settlements.length === 0 ? (
            <EmptyState text="Todavía no registraste ninguna liquidación a un referidor." />
          ) : (
            <Card>
              <CardContent className="pt-5 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Referidor</TableHead>
                      <TableHead className="text-right">Comisiones</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Salió de</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlements.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(s.paid_at)}</TableCell>
                        <TableCell>{s.referral_partners?.name || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.commissions_count}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmt(s.amount, s.currency)}
                        </TableCell>
                        <TableCell>
                          <span>{s.financial_accounts?.name || s.account_name || "—"}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {fmt(s.cash_amount, s.account_currency)}
                            {s.account_currency !== s.currency && s.exchange_rate
                              ? ` · TC ${s.exchange_rate}`
                              : ""}
                          </span>
                        </TableCell>
                        <TableCell>
                          {s.status === "REVERTED" ? (
                            <Badge variant="outline">Revertida</Badge>
                          ) : s.is_regularization ? (
                            <Badge className="border-0 bg-sky-500/10 text-sky-600 dark:text-sky-400">
                              Regularización
                            </Badge>
                          ) : (
                            <Badge className="border-0 bg-success/10 text-success">Pagada</Badge>
                          )}
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Button size="sm" variant="ghost" asChild>
                            <a href={`/api/referral-settlements/${s.id}/pdf`} target="_blank" rel="noreferrer">
                              <FileText className="mr-1 h-3.5 w-3.5" /> PDF
                            </a>
                          </Button>
                          {canSettle && s.status === "PAID" && (
                            <Button size="sm" variant="ghost" onClick={() => setReverting(s)}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revertir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <EmptyState text="Todavía no hay comisiones pagadas o anuladas." />
          ) : (
            <Card>
              <CardContent className="pt-5">
                <CommissionsTable rows={history} savingId={savingId} showPartner showSettlement />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* REFERIDORES */}
        <TabsContent value="partners" className="mt-4">
          <PartnersManager partners={partners} onChanged={load} />
        </TabsContent>
      </Tabs>

      {settling && (
        <ReferralSettlementDialog
          open
          onOpenChange={(open) => !open && setSettling(null)}
          partnerName={settling.partnerName}
          commissions={settling.rows}
          regularize={settling.regularize}
          onDone={load}
        />
      )}

      {reverting && (
        <RevertSettlementDialog
          settlement={reverting}
          onClose={() => setReverting(null)}
          onDone={load}
        />
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <Users2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

/**
 * Revertir una liquidación. Pide motivo porque el contra-asiento queda en el
 * libro mayor y alguien va a tener que entender por qué se hizo.
 */
function RevertSettlementDialog({
  settlement,
  onClose,
  onDone,
}: {
  settlement: SettlementRow
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!reason.trim()) {
      toast.error("Indicá el motivo de la reversión")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/referral-settlements/${settlement.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo revertir")
      toast.success("Liquidación revertida y plata devuelta a la cuenta")
      onClose()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al revertir")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revertir liquidación</DialogTitle>
          <DialogDescription>
            Se devuelven {fmt(settlement.cash_amount, settlement.account_currency)} a{" "}
            {settlement.financial_accounts?.name || settlement.account_name || "la cuenta"} con un
            contra-movimiento, y las{" "}
            {settlement.commissions_count} comisión(es) vuelven a{" "}
            {settlement.is_regularization ? "figurar como pagadas sin caja" : "quedar pendientes"}.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="mb-1.5 block">Motivo *</Label>
          <Input
            autoFocus
            placeholder="Ej: se cargó en la cuenta equivocada"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving || !reason.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revertir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CommissionsTable({
  rows,
  savingId,
  showPartner,
  showSettlement,
  selectable,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onChangePct,
}: {
  rows: CommissionRow[]
  savingId: string | null
  showPartner?: boolean
  /** Muestra si la comisión pagada tiene su salida de caja registrada. */
  showSettlement?: boolean
  selectable?: boolean
  selected?: Set<string>
  allSelected?: boolean
  onToggle?: (id: string) => void
  onToggleAll?: () => void
  /** Ajuste puntual del % de una venta. Solo para quien administra referidos. */
  onChangePct?: (r: CommissionRow, pct: string) => void
}) {
  const [editingPctId, setEditingPctId] = useState<string | null>(null)
  const [pctDraft, setPctDraft] = useState("")

  const commitPct = (r: CommissionRow) => {
    const value = pctDraft.trim()
    setEditingPctId(null)
    if (value === "" || Number(value) === Number(r.percentage)) return
    onChangePct?.(r, value)
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onToggleAll?.()}
                  aria-label="Seleccionar todas"
                />
              </TableHead>
            )}
            <TableHead>Venta</TableHead>
            {showPartner && <TableHead>Referidor</TableHead>}
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Ganancia</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Comisión</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-state={selected?.has(r.id) ? "selected" : undefined}>
              {selectable && (
                <TableCell>
                  <Checkbox
                    checked={selected?.has(r.id) ?? false}
                    onCheckedChange={() => onToggle?.(r.id)}
                    aria-label={`Seleccionar ${r.operations?.file_code || "comisión"}`}
                  />
                </TableCell>
              )}
              <TableCell>
                <span className="font-medium">{r.operations?.file_code || "—"}</span>
                {r.operations?.destination && (
                  <span className="block text-xs text-muted-foreground">{r.operations.destination}</span>
                )}
              </TableCell>
              {showPartner && <TableCell>{r.referral_partners?.name || "—"}</TableCell>}
              <TableCell>
                {r.customers ? `${r.customers.first_name} ${r.customers.last_name}` : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmt(r.base_amount, r.currency)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {onChangePct && r.status === "PENDING" ? (
                  editingPctId === r.id ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      autoFocus
                      className="h-8 w-20 ml-auto text-right"
                      value={pctDraft}
                      onChange={(e) => setPctDraft(e.target.value)}
                      onBlur={() => commitPct(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitPct(r)
                        if (e.key === "Escape") setEditingPctId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="hover:underline underline-offset-2"
                      title="Ajustar el porcentaje de esta venta"
                      disabled={savingId === r.id}
                      onClick={() => {
                        setEditingPctId(r.id)
                        setPctDraft(String(r.percentage ?? 0))
                      }}
                    >
                      {r.percentage}%
                      {r.percentage_mode === "MANUAL" && (
                        <span className="ml-1 text-[10px] text-accent-coral align-top">ajustado</span>
                      )}
                    </button>
                  )
                ) : (
                  `${r.percentage}%`
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">{fmt(r.amount, r.currency)}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
                {showSettlement && r.status === "PAID" && !r.settlement_id && (
                  <span className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-400">
                    sin salida de caja
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function StatusBadge({ status }: { status: CommissionRow["status"] }) {
  if (status === "PAID") return <Badge className="bg-success/10 text-success border-0">Pagado</Badge>
  if (status === "CANCELLED") return <Badge variant="outline">Anulado</Badge>
  return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">Pendiente</Badge>
}

function PartnersManager({ partners, onChanged }: { partners: Partner[]; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editPct, setEditPct] = useState("")
  const [saving, setSaving] = useState(false)
  // VIB-86: el alta vive acá. Antes no existía —el estado vacío decía que los
  // referidores "se crean al marcar un cliente como referido"—, o sea que la
  // única forma de darlos de alta era desde el alta de un cliente, justamente
  // donde el vendedor no tiene que estar creándolos.
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPct, setNewPct] = useState("")
  const [savingNew, setSavingNew] = useState(false)

  const create = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error("Ingresá el nombre del referidor")
      return
    }
    setSavingNew(true)
    try {
      const res = await fetch("/api/referral-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, default_commission_percentage: newPct.trim() || 0 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "No se pudo crear el referidor")
      }
      toast.success("Referidor creado")
      setNewName("")
      setNewPct("")
      setCreating(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear el referidor")
    } finally {
      setSavingNew(false)
    }
  }

  const formularioAlta = creating ? (
    <Card className="mb-4">
      <CardContent className="pt-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Nombre *</label>
            <Input
              placeholder="Agencia XYZ"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">% por defecto</label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              placeholder="Ej: 10"
              value={newPct}
              onChange={(e) => setNewPct(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={create} disabled={savingNew}>
            {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Crear referidor"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={savingNew}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  ) : (
    <div className="mb-4">
      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Nuevo referidor
      </Button>
    </div>
  )

  const startEdit = (p: Partner) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditPct(String(p.default_commission_percentage ?? 0))
  }

  const save = async (p: Partner) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/referral-partners/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, default_commission_percentage: editPct }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "No se pudo guardar")
      }
      toast.success("Referidor actualizado")
      setEditingId(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: Partner) => {
    try {
      const res = await fetch(`/api/referral-partners/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      })
      if (!res.ok) throw new Error()
      toast.success(p.active ? "Referidor desactivado" : "Referidor activado")
      onChanged()
    } catch {
      toast.error("No se pudo cambiar el estado")
    }
  }

  if (partners.length === 0) {
    return (
      <>
        {formularioAlta}
        <EmptyState text="Todavía no cargaste referidores. Creá el primero para poder asignarlo a un cliente." />
      </>
    )
  }

  return (
    <>
    {formularioAlta}
    <Card>
      <CardContent className="pt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referidor</TableHead>
              <TableHead className="text-right">% por defecto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {editingId === p.id ? (
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                  ) : (
                    <span className="font-medium">{p.name}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === p.id ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={editPct}
                      onChange={(e) => setEditPct(e.target.value)}
                      className="h-8 w-24 ml-auto text-right"
                    />
                  ) : (
                    `${p.default_commission_percentage}%`
                  )}
                </TableCell>
                <TableCell>
                  {p.active ? (
                    <Badge className="bg-success/10 text-success border-0">Activo</Badge>
                  ) : (
                    <Badge variant="outline">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {editingId === p.id ? (
                    <>
                      <Button size="sm" disabled={saving} onClick={() => save(p)}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                        {p.active ? "Desactivar" : "Activar"}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </>
  )
}
