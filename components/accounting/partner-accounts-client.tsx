"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
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
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [withdrawalAmount, setWithdrawalAmount] = useState("")
  const [withdrawalCurrency, setWithdrawalCurrency] = useState("ARS")
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split("T")[0])
  const [withdrawalDescription, setWithdrawalDescription] = useState("")
  const [withdrawalAccountId, setWithdrawalAccountId] = useState("")
  const [financialAccounts, setFinancialAccounts] = useState<Array<{ id: string; name: string; currency: string; type: string }>>([])

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
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMessage = data.error || `Error ${res.status}: ${res.statusText}`
        console.error("Error creating withdrawal:", errorMessage)
        throw new Error(errorMessage)
      }

      toast.success(data.message || "Retiro registrado correctamente")
      setNewWithdrawalOpen(false)
      resetWithdrawalForm()
      fetchPartners()
      fetchWithdrawals()
    } catch (error: any) {
      console.error("Error in handleCreateWithdrawal:", error)
      toast.error(error.message || "Error al registrar retiro. Verifica que la cuenta financiera esté configurada correctamente.")
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
    setWithdrawalCurrency("ARS")
    setWithdrawalDate(new Date().toISOString().split("T")[0])
    setWithdrawalDescription("")
    setWithdrawalAccountId("")
  }

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
          <h1 className="text-3xl font-bold">Cuentas de Socios</h1>
          <p className="text-muted-foreground">Gestiona los retiros personales de los socios</p>
        </div>
        <div className="flex gap-2">
          {userRole === "SUPER_ADMIN" && (
            <Dialog open={newPartnerOpen} onOpenChange={setNewPartnerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Nuevo Socio
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Socio</DialogTitle>
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
              <Button disabled={partners.length === 0}>
                <ArrowDownCircle className="h-4 w-4 mr-2" />
                Registrar Retiro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Retiro de Socio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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
                    <Input
                      type="number"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
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
                  <Label>Fecha del Retiro</Label>
                  <Input
                    type="date"
                    value={withdrawalDate}
                    onChange={(e) => setWithdrawalDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Cuenta Financiera *</Label>
                  <Select value={withdrawalAccountId} onValueChange={setWithdrawalAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {financialAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descripción (opcional)</Label>
                  <Textarea
                    value={withdrawalDescription}
                    onChange={(e) => setWithdrawalDescription(e.target.value)}
                    placeholder="Motivo del retiro..."
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
                  Registrar Retiro
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Retirado (ARS)
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $ {Math.round(totalWithdrawnARS).toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Retirado (USD)
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              US$ {Math.round(totalWithdrawnUSD).toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Socios Activos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{partners.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-48">
              <Label>Agencia</Label>
              <Select value={agencyFilter} onValueChange={setAgencyFilter}>
                <SelectTrigger>
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
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="partners">Socios</TabsTrigger>
          <TabsTrigger value="withdrawals">Historial de Retiros</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-4">
          {partners.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No hay socios registrados.
                  {userRole === "SUPER_ADMIN" && " Crea el primer socio para comenzar."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {partners.map((partner) => (
                <Card key={partner.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {partner.partner_name}
                    </CardTitle>
                    {partner.users && (
                      <CardDescription>{partner.users.email}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Retiros</CardTitle>
              <CardDescription>
                Todos los retiros registrados ordenados por fecha
              </CardDescription>
            </CardHeader>
            <CardContent>
              {withdrawals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay retiros registrados
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Socio</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Registrado por</TableHead>
                      {userRole === "SUPER_ADMIN" && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(w.withdrawal_date + "T12:00:00"), "dd/MM/yyyy", { locale: es })}
                          </div>
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
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

