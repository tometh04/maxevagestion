"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, AlertTriangle, Building2, HelpCircle, ArrowRightLeft } from "lucide-react"
import { TransferAccountDialog } from "./transfer-account-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

const accountTypeLabels: Record<string, string> = {
  SAVINGS_ARS: "Caja de ahorro ARS",
  SAVINGS_USD: "Caja de ahorro USD",
  CHECKING_ARS: "Cuenta corriente ARS",
  CHECKING_USD: "Cuenta corriente USD",
  CASH_ARS: "Caja efectivo ARS",
  CASH_USD: "Caja efectivo USD",
  CREDIT_CARD: "Tarjeta de crédito",
  ASSETS: "Activos",
}

const accountTypes = [
  { value: "SAVINGS_ARS", label: "Caja de ahorro ARS" },
  { value: "SAVINGS_USD", label: "Caja de ahorro USD" },
  { value: "CHECKING_ARS", label: "Cuenta corriente ARS" },
  { value: "CHECKING_USD", label: "Cuenta corriente USD" },
  { value: "CASH_ARS", label: "Caja efectivo ARS" },
  { value: "CASH_USD", label: "Caja efectivo USD" },
  { value: "CREDIT_CARD", label: "Tarjeta de crédito" },
  { value: "ASSETS", label: "Activos" },
]

const assetTypes = [
  { value: "VOUCHER", label: "Vouchers en stock" },
  { value: "QUOTA", label: "Cupos comprados" },
  { value: "HOTEL", label: "Hoteles en stock" },
  { value: "OTHER", label: "Otros activos" },
]

interface FinancialAccountsPageClientProps {
  agencies: Array<{ id: string; name: string }>
}

export function FinancialAccountsPageClient({ agencies: initialAgencies }: FinancialAccountsPageClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [agencies, setAgencies] = useState<any[]>(initialAgencies)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("ALL")
  const [openDialog, setOpenDialog] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<{
    id: string
    name: string
    balance: number
    currency: string
    displayName: string
  } | null>(null)
  const [transferToId, setTransferToId] = useState("")
  const [deleteStep, setDeleteStep] = useState<"confirm" | "transfer">("confirm")
  const [isDeleting, setIsDeleting] = useState(false)
  const [formData, setFormData] = useState<any>({
    name: "",
    type: "",
    currency: "ARS",
    agency_id: "",
    initial_balance: 0,
    account_number: "",
    bank_name: "",
    // Tarjeta de crédito
    card_number: "",
    card_holder: "",
    card_expiry_date: "",
    // Activos
    asset_type: "",
    asset_description: "",
    asset_quantity: 0,
    notes: "",
  })

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchData(bustCache = false) {
    setLoading(true)
    try {
      const url = bustCache
        ? `/api/accounting/financial-accounts?_=${Date.now()}`
        : "/api/accounting/financial-accounts"
      const accountsRes = await fetch(url)

      if (!accountsRes.ok) throw new Error("Error al obtener cuentas")

      const accountsData = await accountsRes.json()

      setAccounts(accountsData.accounts || [])
      // Las agencias ya vienen como props, no necesitamos cargarlas de nuevo
      setAgencies(initialAgencies)
    } catch (error: any) {
      toast.error(error.message || "Error al cargar datos")
    } finally {
      setLoading(false)
    }
  }

  const handleClearAll = async () => {
    try {
      const res = await fetch("/api/accounting/financial-accounts/clear", {
        method: "DELETE",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al eliminar cuentas")
      }

      toast.success("Todas las cuentas han sido eliminadas")
      setDeleteConfirmOpen(false)
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar cuentas")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.type || !formData.agency_id) {
      toast.error("Tipo de cuenta y agencia son requeridos")
      return
    }

    // Determinar moneda automáticamente según tipo
    let currency = formData.currency
    if (formData.type.includes("_USD")) {
      currency = "USD"
    } else if (formData.type.includes("_ARS")) {
      currency = "ARS"
    } else if (formData.type === "CREDIT_CARD") {
      // Para tarjetas, la moneda puede ser ARS o USD
      currency = formData.currency || "ARS"
    } else if (formData.type === "ASSETS") {
      // Para activos, la moneda puede ser ARS o USD
      currency = formData.currency || "ARS"
    }

    // Preparar datos según tipo
    const accountData: any = {
      name: formData.name,
      type: formData.type,
      currency,
      agency_id: formData.agency_id,
      initial_balance: Number(formData.initial_balance) || 0,
      notes: formData.notes || null,
      is_active: true,
    }

    // Datos para cuentas bancarias
    if (formData.type.includes("CHECKING") || formData.type.includes("SAVINGS")) {
      accountData.account_number = formData.account_number || null
      accountData.bank_name = formData.bank_name || null
    }

    // Datos para tarjetas de crédito
    if (formData.type === "CREDIT_CARD") {
      if (!formData.card_holder || !formData.card_number) {
        toast.error("Titular y número de tarjeta son requeridos para tarjetas de crédito")
        return
      }
      accountData.card_holder = formData.card_holder
      accountData.card_number = formData.card_number.slice(-4) // Solo últimos 4 dígitos
      accountData.bank_name = formData.bank_name || null
      accountData.card_expiry_date = formData.card_expiry_date || null
    }

    // Datos para activos
    if (formData.type === "ASSETS") {
      if (!formData.asset_type) {
        toast.error("Tipo de activo es requerido")
        return
      }
      accountData.asset_type = formData.asset_type
      accountData.asset_description = formData.asset_description || null
      accountData.asset_quantity = Number(formData.asset_quantity) || 0
    }

    try {
      const res = await fetch("/api/accounting/financial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al crear cuenta")
      }

      toast.success("Cuenta creada exitosamente")
      setOpenDialog(false)
      resetForm()
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Error al crear cuenta")
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      type: "",
      currency: "ARS",
      agency_id: "",
      initial_balance: 0,
      account_number: "",
      bank_name: "",
      card_number: "",
      card_holder: "",
      card_expiry_date: "",
      asset_type: "",
      asset_description: "",
      asset_quantity: 0,
      notes: "",
    })
  }

  const getDisplayName = (account: any) => {
    if (account.type === "CREDIT_CARD" && account.card_holder && account.card_number) {
      return `${account.card_holder} •••• ${account.card_number}`
    }
    return account.name
  }

  const openDeleteAccount = (account: any) => {
    const balance = account.current_balance ?? 0
    setAccountToDelete({
      id: account.id,
      name: account.name,
      balance,
      currency: account.currency,
      displayName: getDisplayName(account),
    })
    setTransferToId("")
    setDeleteStep("confirm")
    setDeleteAccountOpen(true)
  }

  const closeDeleteAccount = () => {
    setDeleteAccountOpen(false)
    setAccountToDelete(null)
    setTransferToId("")
    setDeleteStep("confirm")
  }

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return
    const hasBalance = Math.abs(accountToDelete.balance) > 1e-6
    if (hasBalance && !transferToId) {
      toast.error("Selecciona una cuenta destino para transferir el saldo")
      return
    }
    setIsDeleting(true)
    try {
      const opts: RequestInit = {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      }
      if (hasBalance && transferToId) {
        opts.body = JSON.stringify({ transfer_to_account_id: transferToId })
      }
      const res = await fetch(`/api/accounting/financial-accounts/${accountToDelete.id}`, opts)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al eliminar")
      toast.success(data.message || "Cuenta eliminada")
      closeDeleteAccount()
      await fetchData(true)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar la cuenta")
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Agrupar por agencia
  const accountsByAgency = accounts.reduce((acc, account) => {
    // Asegurar que agency_id esté disponible (puede venir directamente o desde agencies)
    const agencyId = account.agency_id || (account.agencies as any)?.id || "sin-agencia"
    
    // Filtrar por agencia seleccionada
    if (selectedAgencyId !== "ALL" && agencyId !== selectedAgencyId) {
      return acc
    }
    
    if (!acc[agencyId]) {
      acc[agencyId] = {
        agency: agencies.find((a) => a.id === agencyId) || (account.agencies as any),
        accounts: [],
      }
    }
    acc[agencyId].accounts.push(account)
    return acc
  }, {} as Record<string, any>)

  return (
    <div className="space-y-6">
      {/* Header con botones */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Cuentas Financieras</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <p className="text-xs mb-2"><strong>Cuentas Financieras:</strong> Gestión de todas las cuentas bancarias, cajas de efectivo, tarjetas de crédito y activos. Cada cuenta tiene un balance inicial y movimientos contables.</p>
                  <p className="text-xs mb-2"><strong>Balance Actual:</strong> Se calcula como balance inicial + suma de movimientos (INCOME suma, EXPENSE resta). Los movimientos se crean automáticamente al registrar transacciones.</p>
                  <p className="text-xs">Las cuentas se organizan por tipo (bancos, efectivo, activos) y moneda (USD/ARS). Puedes crear nuevas cuentas, editar existentes y ver su historial completo de movimientos.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground">Gestiona todas las cuentas y cajas de las agencias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTransferDialogOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transferir
          </Button>
          {accounts.length > 0 && (
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpiar Todas
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                    ¿Eliminar todas las cuentas?
                  </DialogTitle>
                  <DialogDescription>
                    Esta acción eliminará todas las cuentas financieras del sistema. Esta acción no se puede deshacer.
                    Asegúrate de haber respaldado la información necesaria.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={handleClearAll}>
                    Sí, eliminar todas
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={deleteAccountOpen} onOpenChange={(open) => !open && closeDeleteAccount()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Eliminar cuenta
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3">
                    {accountToDelete && (
                      <>
                        {Math.abs(accountToDelete.balance) <= 1e-6 ? (
                          <p>
                            ¿Eliminar la cuenta <strong>{accountToDelete.displayName}</strong>? Esta acción no se puede deshacer.
                          </p>
                        ) : deleteStep === "confirm" ? (
                          <p>
                            La cuenta <strong>{accountToDelete.displayName}</strong> tiene{" "}
                            <strong className={accountToDelete.balance >= 0 ? "text-amber-600" : "text-red-600"}>
                              {formatCurrency(accountToDelete.balance, accountToDelete.currency)}
                            </strong>{" "}
                            de saldo. ¿Quieres transferirlo a otra cuenta?
                          </p>
                        ) : (
                          <>
                            <p>
                              Transferir{" "}
                              <strong className={accountToDelete.balance >= 0 ? "text-amber-600" : "text-red-600"}>
                                {formatCurrency(Math.abs(accountToDelete.balance), accountToDelete.currency)}
                              </strong>{" "}
                              a:
                            </p>
                            <Select value={transferToId} onValueChange={setTransferToId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona una cuenta" />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts
                                  .filter(
                                    (a: any) =>
                                      a.id !== accountToDelete.id &&
                                      a.currency === accountToDelete.currency &&
                                      a.is_active !== false
                                  )
                                  .map((a: any) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {getDisplayName(a)} ({a.currency})
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {accounts.filter(
                              (a: any) =>
                                a.id !== accountToDelete.id &&
                                a.currency === accountToDelete.currency &&
                                a.is_active !== false
                            ).length === 0 && (
                              <p className="text-sm text-amber-600">
                                No hay otras cuentas en {accountToDelete.currency} para transferir.
                              </p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                {accountToDelete && (
                  <>
                    {Math.abs(accountToDelete.balance) <= 1e-6 ? (
                      <>
                        <Button variant="outline" onClick={closeDeleteAccount}>
                          Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting}>
                          {isDeleting ? "Eliminando…" : "Sí, eliminar"}
                        </Button>
                      </>
                    ) : deleteStep === "confirm" ? (
                      <>
                        <Button variant="outline" onClick={closeDeleteAccount}>
                          No, cancelar
                        </Button>
                        <Button onClick={() => setDeleteStep("transfer")}>
                          Sí, transferir
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setDeleteStep("confirm")}>
                          Atrás
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteAccount}
                          disabled={isDeleting || !transferToId}
                        >
                          {isDeleting ? "Eliminando…" : "Eliminar y transferir"}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Cuenta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva Cuenta Financiera</DialogTitle>
                <DialogDescription>
                  Completa los datos según el tipo de cuenta que deseas crear
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Tipo de cuenta */}
                <div>
                  <Label>Tipo de Cuenta *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Agencia */}
                <div>
                  <Label>Agencia *</Label>
                  <Select
                    value={formData.agency_id}
                    onValueChange={(value) => setFormData({ ...formData, agency_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una agencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {agencies.map((agency) => (
                        <SelectItem key={agency.id} value={agency.id}>
                          {agency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Nombre */}
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={
                      formData.type === "CREDIT_CARD"
                        ? "Ej: Tarjeta Principal"
                        : formData.type === "ASSETS"
                        ? "Ej: Vouchers Brasil 2025"
                        : "Ej: Caja Principal"
                    }
                    required
                  />
                </div>

                {/* Campos específicos para cuentas bancarias */}
                {(formData.type.includes("CHECKING") || formData.type.includes("SAVINGS")) && (
                  <>
                    <div>
                      <Label>Banco</Label>
                      <Input
                        value={formData.bank_name}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        placeholder="Ej: Banco Galicia"
                      />
                    </div>
                    <div>
                      <Label>Número de Cuenta</Label>
                      <Input
                        value={formData.account_number}
                        onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                        placeholder="Número de cuenta bancaria"
                      />
                    </div>
                  </>
                )}

                {/* Campos específicos para tarjetas de crédito */}
                {formData.type === "CREDIT_CARD" && (
                  <>
                    <div>
                      <Label>Moneda *</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => setFormData({ ...formData, currency: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ARS">ARS</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Titular *</Label>
                      <Input
                        value={formData.card_holder}
                        onChange={(e) => setFormData({ ...formData, card_holder: e.target.value })}
                        placeholder="Nombre del titular"
                        required
                      />
                    </div>
                    <div>
                      <Label>Número de Tarjeta *</Label>
                      <Input
                        value={formData.card_number}
                        onChange={(e) => setFormData({ ...formData, card_number: e.target.value.replace(/\D/g, "") })}
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Solo se guardarán los últimos 4 dígitos por seguridad
                      </p>
                    </div>
                    <div>
                      <Label>Banco</Label>
                      <Input
                        value={formData.bank_name}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        placeholder="Ej: Visa, Mastercard, Banco Galicia"
                      />
                    </div>
                    <div>
                      <Label>Fecha de Vencimiento</Label>
                      <Input
                        type="month"
                        value={formData.card_expiry_date}
                        onChange={(e) => setFormData({ ...formData, card_expiry_date: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {/* Campos específicos para activos */}
                {formData.type === "ASSETS" && (
                  <>
                    <div>
                      <Label>Moneda *</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => setFormData({ ...formData, currency: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ARS">ARS</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tipo de Activo *</Label>
                      <Select
                        value={formData.asset_type}
                        onValueChange={(value) => setFormData({ ...formData, asset_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {assetTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Descripción</Label>
                      <Textarea
                        value={formData.asset_description}
                        onChange={(e) => setFormData({ ...formData, asset_description: e.target.value })}
                        placeholder="Ej: Vouchers para Brasil enero 2025"
                      />
                    </div>
                    <div>
                      <Label>Cantidad</Label>
                      <Input
                        type="number"
                        value={formData.asset_quantity}
                        onChange={(e) => setFormData({ ...formData, asset_quantity: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                      />
                    </div>
                  </>
                )}

                {/* Saldo inicial */}
                {formData.type !== "ASSETS" && (
                  <div>
                    <Label>Saldo Inicial</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.initial_balance}
                      onChange={(e) => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                    />
                  </div>
                )}

                {/* Notas */}
                <div>
                  <Label>Notas</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales (opcional)"
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Crear Cuenta</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtro de agencia */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="agency-filter" className="text-sm font-medium whitespace-nowrap">
              Filtrar por agencia:
            </Label>
            <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
              <SelectTrigger id="agency-filter" className="w-[250px]">
                <SelectValue placeholder="Selecciona una agencia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las agencias</SelectItem>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAgencyId !== "ALL" && (
              <p className="text-sm text-muted-foreground">
                Mostrando cuentas de {agencies.find((a) => a.id === selectedAgencyId)?.name || "la agencia seleccionada"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla de cuentas por agencia */}
      {Object.keys(accountsByAgency).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay cuentas financieras</h3>
            <p className="text-muted-foreground mb-4">
              Comienza creando tu primera cuenta financiera
            </p>
            <Button onClick={() => setOpenDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primera Cuenta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(accountsByAgency).map(([agencyId, data]: [string, any]) => (
            <Card key={agencyId}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {data.agency?.name || "Sin agencia"}
                </CardTitle>
                <CardDescription>
                  {data.accounts.length} cuenta{data.accounts.length !== 1 ? "s" : ""}
                </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Saldo Inicial</TableHead>
                <TableHead className="text-right">Balance Actual</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((account: any) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{getDisplayName(account)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {accountTypeLabels[account.type] || account.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{account.currency}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(account.initial_balance ?? 0, account.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`font-bold ${
                        (account.current_balance ?? 0) >= 0 ? "text-amber-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(account.current_balance ?? 0, account.currency)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => openDeleteAccount(account)}
                      title="Eliminar cuenta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
          ))}
        </div>
      )}

      {/* Dialog de transferencia */}
      <TransferAccountDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onSuccess={() => {
          fetchData(true)
          router.refresh()
        }}
      />
    </div>
  )
}
