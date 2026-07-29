"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { Loader2, Users2, Check, RotateCcw, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

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

/** Suma montos agrupando por moneda (no mezcla ARS/USD). */
function sumByCurrency(rows: { amount: number; currency: string }[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) || 0) + (Number(r.amount) || 0))
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }))
}

export function ReferralsView() {
  const [loading, setLoading] = useState(true)
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/referral-commissions"),
        fetch("/api/referral-partners?include_inactive=true"),
      ])
      const cData = cRes.ok ? await cRes.json() : { commissions: [] }
      const pData = pRes.ok ? await pRes.json() : { partners: [] }
      setCommissions(cData.commissions ?? [])
      setPartners(pData.partners ?? [])
    } catch {
      toast.error("No se pudieron cargar los referidos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const pending = useMemo(() => commissions.filter((c) => c.status === "PENDING"), [commissions])
  const history = useMemo(
    () => commissions.filter((c) => c.status !== "PENDING"),
    [commissions],
  )
  const paid = useMemo(() => commissions.filter((c) => c.status === "PAID"), [commissions])

  const pendingTotals = useMemo(() => sumByCurrency(pending), [pending])
  const paidTotals = useMemo(
    () => sumByCurrency(paid.map((c) => ({ amount: c.amount_paid || c.amount, currency: c.currency }))),
    [paid],
  )

  const changeStatus = async (row: CommissionRow, status: "PAID" | "PENDING") => {
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/referral-commissions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "No se pudo actualizar")
      }
      const { commission } = await res.json()
      setCommissions((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...commission } : c)))
      toast.success(status === "PAID" ? "Comisión marcada como pagada" : "Comisión vuelta a pendiente")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar")
    } finally {
      setSavingId(null)
    }
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

  // Agrupar pendientes por referidor para ver cuánto se le debe a cada uno.
  const pendingByPartner = useMemo(() => {
    const groups = new Map<string, { name: string; rows: CommissionRow[] }>()
    for (const c of pending) {
      const id = c.referral_partners?.id || "—"
      const name = c.referral_partners?.name || "Sin referidor"
      if (!groups.has(id)) groups.set(id, { name, rows: [] })
      groups.get(id)!.rows.push(c)
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name))
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

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Por pagar ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">Historial ({history.length})</TabsTrigger>
          <TabsTrigger value="partners">Referidores ({partners.length})</TabsTrigger>
        </TabsList>

        {/* POR PAGAR */}
        <TabsContent value="pending" className="mt-4 space-y-6">
          {pendingByPartner.length === 0 ? (
            <EmptyState text="No hay comisiones pendientes de pago." />
          ) : (
            pendingByPartner.map((group) => (
              <Card key={group.name}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-accent-coral" />
                      <span className="font-medium">{group.name}</span>
                      <Badge variant="secondary">{group.rows.length}</Badge>
                    </div>
                    <div className="text-sm font-semibold">
                      {sumByCurrency(group.rows).map((t) => (
                        <span key={t.currency} className="ml-2">{fmt(t.amount, t.currency)}</span>
                      ))}
                    </div>
                  </div>
                  <CommissionsTable
                    rows={group.rows}
                    savingId={savingId}
                    onPay={(r) => changeStatus(r, "PAID")}
                    onChangePct={changePercentage}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <EmptyState text="Todavía no hay comisiones pagadas o anuladas." />
          ) : (
            <Card>
              <CardContent className="pt-5">
                <CommissionsTable
                  rows={history}
                  savingId={savingId}
                  showPartner
                  onRevert={(r) => changeStatus(r, "PENDING")}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* REFERIDORES */}
        <TabsContent value="partners" className="mt-4">
          <PartnersManager partners={partners} onChanged={load} />
        </TabsContent>
      </Tabs>
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

function CommissionsTable({
  rows,
  savingId,
  showPartner,
  onPay,
  onRevert,
  onChangePct,
}: {
  rows: CommissionRow[]
  savingId: string | null
  showPartner?: boolean
  onPay?: (r: CommissionRow) => void
  onRevert?: (r: CommissionRow) => void
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
            <TableHead>Venta</TableHead>
            {showPartner && <TableHead>Referidor</TableHead>}
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Ganancia</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Comisión</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
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
              </TableCell>
              <TableCell className="text-right">
                {r.status === "PENDING" && onPay && (
                  <Button size="sm" variant="outline" disabled={savingId === r.id} onClick={() => onPay(r)}>
                    {savingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-3.5 w-3.5" /> Pagar
                      </>
                    )}
                  </Button>
                )}
                {r.status === "PAID" && onRevert && (
                  <Button size="sm" variant="ghost" disabled={savingId === r.id} onClick={() => onRevert(r)}>
                    {savingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Pendiente
                      </>
                    )}
                  </Button>
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
