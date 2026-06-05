"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Plus, Wallet, ArrowDownCircle, Trash2, Loader2, Calendar } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface Partner {
  id: string
  partner_name: string
  user_id: string | null
  is_active: boolean
  notes: string | null
  profit_percentage: number | null
  created_at: string
  users?: { id: string; name: string; email: string } | null
  total_withdrawn_ars: number
  total_withdrawn_usd: number
  withdrawals_count: number
}

interface Withdrawal {
  id: string
  partner_id: string
  amount: number
  currency: string
  withdrawal_date: string
  description: string | null
  created_at: string
  partner?: { id: string; partner_name: string }
  account?: { id: string; name: string; currency: string } | null
  created_by_user?: { id: string; name: string } | null
}

interface PartnerAccountsClientProps {
  userRole: string
  agencies: Array<{ id: string; name: string }>
}

export function PartnerAccountsClient({ userRole, agencies }: PartnerAccountsClientProps) {
  const [agencyFilter, setAgencyFilter] = useState<string>("ALL")
  const [partners, setPartners] = useState<Partner[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("partners")
  
  // Dialog states
  const [newPartnerOpen, setNewPartnerOpen] = useState(false)
  const [newWithdrawalOpen, setNewWithdrawalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Form states
  const [partnerName, setPartnerName] = useState("")
  const [partnerNotes, setPartnerNotes] = useState("")
  const [partnerProfitPercentage, setPartnerProfitPercentage] = useState("")
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [withdrawalAmount, setWithdrawalAmount] = useState("")
  const [withdrawalCurrency, setWithdrawalCurrency] = useState("USD")
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split("T")[0])
  const [withdrawalDescription, setWithdrawalDescription] = useState("")
  const [withdrawalAccountId, setWithdrawalAccountId] = useState("")
  const [withdrawalExchangeRate, setWithdrawalExchangeRate] = useState("")
  const [movementType, setMovementType] = useState<"WITHDRAWAL" | "DEPOSIT">("WITHDRAWAL")
  const [financialAccounts, setFinancialAccounts] = useState<Array<{ id: string; name: string; currency: string; type: string; current_balance?: number }>>([])

  const fetchPartners = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (agencyFilter !== "ALL") {
        params.append("agencyId", agencyFilter)
      }
      const res = await fetch(`/api/partner-accounts?${params.toString()}`)
      const data = await res.json()
      if (data.partners) {
        setPartners(data.partners)
      }
    } catch (error) {
      console.error("Error fetching partners:", error)
      toast.error("Error al cargar socios")
    }
  }, [agencyFilter])

  const fetchWithdrawals = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (agencyFilter !== "ALL") {
        params.append("agencyId", agencyFilter)
      }
      const res = await fetch(`/api/partner-accounts/withdrawals?${params.toString()}`)
      const data = await res.json()
      if (data.withdrawals) {
        setWithdrawals(data.withdrawals)
      }
    } catch (error) {
      console.error("Error fetching withdrawals:", error)
    }
  }, [agencyFilter])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchPartners(), fetchWithdrawals()])
      setLoading(false)
    }
    loadData()
  }, [fetchPartners, fetchWithdrawals])

  // Cargar cuentas financieras cuando se abre el diálogo de retiro
  useEffect(() => {
    if (newWithdrawalOpen) {
      const loadFinancialAccounts = async () => {
        try {
          const res = await fetch("/api/accounting/financial-accounts")
          const data = await res.json()
          if (data.accounts) {
            setFinancialAccounts(data.accounts.filter((acc: any) => acc.is_active !== false))
          }
        } catch (error) {
          console.error("Error loading financial accounts:", error)
        }
      }
      loadFinancialAccounts()
    }
  }, [newWithdrawalOpen])

  // Verificar si necesita tipo de cambio
  const selectedAccount = financialAccounts.find(acc => acc.id === withdrawalAccountId)
  const accountCurrency = selectedAccount?.currency || "USD"
  const needsExchangeRate = withdrawalAccountId && withdrawalCurrency !== accountCurrency

  const handleCreatePartner = async () => {
    if (!partnerName.trim()) {
      toast.error("El nombre es requerido")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/partner-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_name: partnerName.trim(),
          notes: partnerNotes.trim() || null,
          profit_percentage: partnerProfitPercentage ? parseFloat(partnerProfitPercentage) : 0,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMessage = data.error || `Error ${res.status}: ${res.statusText}`
        console.error("Error creating partner:", errorMessage)
        throw new Error(errorMessage)
      }

      toast.success("Socio creado correctamente")
      setNewPartnerOpen(false)
      setPartnerName("")
      setPartnerNotes("")
      setPartnerProfitPercentage("")
      fetchPartners()
    } catch (error: any) {
      console.error("Error in handleCreatePartner:", error)
      toast.error(error.message || "Error al crear socio. Verifica que tengas los permisos necesarios.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateWithdrawal = async () => {
    if (!selectedPartnerId) {
      toast.error("Selecciona un socio")
      return
    }
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast.error("El monto debe ser mayor a 0")
      return
    }
    if (!withdrawalAccountId) {
      toast.error("Debes seleccionar una cuenta financiera. Este campo es obligatorio para registrar el retiro contablemente.")
      return
    }

    // Validar tipo de cambio si es necesario
    if (needsExchangeRate && (!withdrawalExchangeRate || parseFloat(withdrawalExchangeRate) <= 0)) {
      toast.error("Debe ingresar el tipo de cambio para convertir monedas")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/partner-accounts/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id: selectedPartnerId,
          amount: parseFloat(withdrawalAmount),
          currency: withdrawalCurrency,
          withdrawal_date: withdrawalDate,
          account_id: withdrawalAccountId,
          description: withdrawalDescription.trim() || null,
          exchange_rate: needsExchangeRate ? parseFloat(withdrawalExchangeRate) : null,
          movement_type: movementType,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMessage = data.error || `Error ${res.status}: ${res.statusText}`
        console.error("Error creating withdrawal:", errorMessage)
        throw new Error(errorMessage)
      }

      const successMsg = movementType === "DEPOSIT" ? "Aporte registrado correctamente" : "Retiro registrado correctamente"
      toast.success(data.message || successMsg)
      setNewWithdrawalOpen(false)
      resetWithdrawalForm()
      fetchPartners()
      fetchWithdrawals()
    } catch (error: any) {
      console.error("Error in handleCreateWithdrawal:", error)
      const errorMsg = movementType === "DEPOSIT" ? "Error al registrar aporte." : "Error al registrar retiro."
      toast.error(error.message || `${errorMsg} Verifica que la cuenta financiera esté configurada correctamente.`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWithdrawal = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este retiro? Esta acción revertirá los movimientos contables.")) {
      return
    }

    try {
      const res = await fetch(`/api/partner-accounts/withdrawals/${id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      toast.success("Retiro eliminado")
      fetchPartners()
      fetchWithdrawals()
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar retiro")
    }
  }

  const resetWithdrawalForm = () => {
    setSelectedPartnerId("")
    setWithdrawalAmount("")
    setWithdrawalCurrency("USD")
    setWithdrawalDate(new Date().toISOString().split("T")[0])
    setWithdrawalDescription("")
    setWithdrawalAccountId("")
    setWithdrawalExchangeRate("")
    setMovementType("WITHDRAWAL")
  }

  // Sorting for withdrawals table
  const { sortedData: sortedWithdrawals, sortConfig, requestSort } = useSortableData(withdrawals, {
    key: "withdrawal_date",
    direction: "desc",
  })

  // Calcular totales
  const totalWithdrawnARS = partners.reduce((sum, p) => sum + p.total_withdrawn_ars, 0)
  const totalWithdrawnUSD = partners.reduce((sum, p) => sum + p.total_withdrawn_usd, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Cuentas de Socios</h2>
          <p className="text-muted-foreground">Gestiona los retiros personales de los socios</p>
        </div>
        <div className="flex gap-2">
          {userRole === "SUPER_ADMIN" && (
            <Dialog open={newPartnerOpen} onOpenChange={setNewPartnerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-full">
                  <Users className="h-4 w-4 mr-2" />
                  Nuevo Socio
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Socio</DialogTitle>
                  <DialogDescription>
                    Crea un nuevo socio para registrar retiros y movimientos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nombre del Socio</Label>
                    <Input
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="Ej: Maxi"
                    />
                  </div>
                  <div>
                    <Label>Porcentaje de Ganancias (%)</Label>
                    <DecimalInput
                      value={partnerProfitPercentage}
                      onChange={(v) => setPartnerProfitPercentage(v)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Porcentaje que recibe este socio de las ganancias mensuales (0-100)
                    </p>
                  </div>
                  <div>
                    <Label>Notas (opcional)</Label>
                    <Textarea
                      value={partnerNotes}
                      onChange={(e) => setPartnerNotes(e.target.value)}
                      placeholder="Información adicional..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewPartnerOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreatePartner} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Crear Socio
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          
          <Dialog open={newWithdrawalOpen} onOpenChange={setNewWithdrawalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 rounded-full" disabled={partners.length === 0}>
                <ArrowDownCircle className="h-4 w-4 mr-2" />
                Registrar Movimiento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{movementType === "DEPOSIT" ? "Registrar Aporte de Socio" : "Registrar Retiro de Socio"}</DialogTitle>
                <DialogDescription>
                  {movementType === "DEPOSIT"
                    ? "Registra un aporte de fondos realizado por el socio seleccionado"
                    : "Registra un retiro de fondos realizado por el socio seleccionado"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Tipo de Movimiento</Label>
                  <Select value={movementType} onValueChange={(v) => setMovementType(v as "WITHDRAWAL" | "DEPOSIT")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WITHDRAWAL">Retiro (el socio retira fondos)</SelectItem>
                      <SelectItem value="DEPOSIT">Aporte (el socio ingresa fondos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Socio</Label>
                  <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar socio" />
                    </SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.partner_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Monto</Label>
                    <DecimalInput
                      value={withdrawalAmount}
                      onChange={(v) => setWithdrawalAmount(v)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Moneda</Label>
                    <Select value={withdrawalCurrency} onValueChange={setWithdrawalCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ARS">ARS</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>{movementType === "DEPOSIT" ? "Fecha del Aporte" : "Fecha del Retiro"}</Label>
                  <Input
                    type="date"
                    value={withdrawalDate}
                    onChange={(e) => setWithdrawalDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>
                    {movementType === "DEPOSIT"
                      ? "¿En qué cuenta ingresó el dinero? *"
                      : "¿De qué cuenta sale el dinero? *"}
                  </Label>
                  <Select value={withdrawalAccountId} onValueChange={(value) => {
                    setWithdrawalAccountId(value)
                    // Resetear tipo de cambio si cambia la cuenta
                    setWithdrawalExchangeRate("")
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {financialAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                          {account.current_balance !== undefined && (
                            <span className="text-xs text-muted-foreground ml-2">
                              - Balance: {new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: account.currency === "USD" ? "USD" : "ARS",
                              }).format(account.current_balance)}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {movementType === "DEPOSIT"
                      ? "Seleccioná la caja o banco donde el socio depositó los fondos (ej: Banco Galicia USD, Caja USD)."
                      : "Seleccioná la cuenta desde donde se transfieren los fondos al socio."}
                  </p>
                </div>
                {needsExchangeRate && (
                  <div>
                    <Label>Tipo de Cambio *</Label>
                    <DecimalInput
                      value={withdrawalExchangeRate}
                      onChange={(v) => setWithdrawalExchangeRate(v)}
                      placeholder="Ej: 1200"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Requerido para convertir {withdrawalCurrency} a {accountCurrency}
                    </p>
                    {withdrawalExchangeRate && parseFloat(withdrawalExchangeRate) > 0 && (
                      <div className="bg-muted p-3 rounded-lg mt-2">
                        <div className="text-sm text-muted-foreground">
                          Monto equivalente en {accountCurrency}:
                        </div>
                        <div className="text-lg font-bold">
                          {accountCurrency === "USD"
                            ? new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: "USD",
                              }).format(parseFloat(withdrawalAmount || "0") / parseFloat(withdrawalExchangeRate))
                            : new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: "ARS",
                              }).format(parseFloat(withdrawalAmount || "0") * parseFloat(withdrawalExchangeRate))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label>Descripción (opcional)</Label>
                  <Textarea
                    value={withdrawalDescription}
                    onChange={(e) => setWithdrawalDescription(e.target.value)}
                    placeholder={movementType === "DEPOSIT" ? "Motivo del aporte..." : "Motivo del retiro..."}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setNewWithdrawalOpen(false)
                  resetWithdrawalForm()
                }}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateWithdrawal} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {movementType === "DEPOSIT" ? "Registrar Aporte" : "Registrar Retiro"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Retirado (ARS)</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight mt-1">
            $ {Math.round(totalWithdrawnARS).toLocaleString("es-AR")}
          </div>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Retirado (USD)</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight mt-1">
            US$ {Math.round(totalWithdrawnUSD).toLocaleString("es-AR")}
          </div>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Socios Activos</p>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight mt-1">{partners.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs">Agencia:</Label>
        <Select value={agencyFilter} onValueChange={setAgencyFilter}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {agencies.map((agency) => (
              <SelectItem key={agency.id} value={agency.id}>
                {agency.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="partners">Socios</TabsTrigger>
          <TabsTrigger value="withdrawals">Historial de Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-4">
          {partners.length === 0 ? (
            <div className="rounded-xl border border-border/40 flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                No hay socios registrados.
                {userRole === "SUPER_ADMIN" && " Crea el primer socio para comenzar."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {partners.map((partner) => (
                <div key={partner.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      {partner.partner_name}
                    </h4>
                    {partner.users && (
                      <p className="text-xs text-muted-foreground mt-0.5">{partner.users.email}</p>
                    )}
                  </div>
                  <div className="space-y-3">
                    {partner.profit_percentage !== null && partner.profit_percentage > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">% Ganancias:</span>
                        <Badge variant="outline" className="font-semibold">
                          {partner.profit_percentage.toFixed(2)}%
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Retiros ARS:</span>
                      <span className="font-semibold">
                        $ {Math.round(partner.total_withdrawn_ars).toLocaleString("es-AR")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Retiros USD:</span>
                      <span className="font-semibold">
                        US$ {Math.round(partner.total_withdrawn_usd).toLocaleString("es-AR")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total retiros:</span>
                      <Badge variant="secondary">{partner.withdrawals_count}</Badge>
                    </div>
                    {partner.notes && (
                      <p className="text-xs text-muted-foreground border-t pt-2">
                        {partner.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="withdrawals">
          <div className="rounded-xl border border-border/40">
            <div className="p-5 pb-3">
              <h3 className="text-base font-semibold">Historial de Movimientos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Todos los retiros y aportes registrados ordenados por fecha
              </p>
            </div>
            <div className="px-5 pb-5">
              {withdrawals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay movimientos registrados
                </p>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="withdrawal_date" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Fecha</SortableTableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Tipo</TableHead>
                      <SortableTableHead sortKey="partner.partner_name" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Socio</SortableTableHead>
                      <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Monto</SortableTableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Descripción</TableHead>
                      <SortableTableHead sortKey="created_by_user.name" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Registrado por</SortableTableHead>
                      {userRole === "SUPER_ADMIN" && <TableHead className="sticky top-0 bg-background z-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWithdrawals.map((w) => {
                      const isDeposit = (w as any).movement_type === "DEPOSIT"
                      return (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(w.withdrawal_date + "T12:00:00"), "dd/MM/yyyy", { locale: es })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isDeposit ? "default" : "destructive"} className={isDeposit ? "bg-success/10 text-success hover:bg-success/10" : ""}>
                            {isDeposit ? "Aporte" : "Retiro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {w.partner?.partner_name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={w.currency === "USD" ? "default" : "secondary"}>
                            {w.currency} {Math.round(w.amount).toLocaleString("es-AR")}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {w.description || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {w.created_by_user?.name || "-"}
                        </TableCell>
                        {userRole === "SUPER_ADMIN" && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteWithdrawal(w.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

