"use client"

import { useState, useEffect } from "react"
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
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
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
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, AlertTriangle, Building2, ArrowRightLeft, Pencil, Download, Filter } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { TransferAccountDialog } from "./transfer-account-dialog"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { useDefaultCurrency } from "@/hooks/use-default-currency"

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
  PARTNER: "Cuenta de Socio",
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
  { value: "PARTNER", label: "Cuenta de Socio" },
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
  const searchParams = useSearchParams()
  const { currency: defaultCurrency } = useDefaultCurrency()
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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

  // Edit dialog state — editar nombre y/o ajustar saldo de una cuenta.
  // El saldo se ajusta vía PATCH que crea un ledger_movement de tipo
  // INCOME/EXPENSE (no se UPDATE-a un campo, sino que se preserva la
  // contabilidad de doble entrada).
  const [editAccountOpen, setEditAccountOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<any>(null)
  const [editName, setEditName] = useState("")
  const [editTargetBalance, setEditTargetBalance] = useState("")
  const [editReason, setEditReason] = useState("")
  const [editBankTaxRate, setEditBankTaxRate] = useState("")
  const [isEditing, setIsEditing] = useState(false)

  // Atlas layout: selected account + movements
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [movements, setMovements] = useState<any[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementsTotal, setMovementsTotal] = useState(0)

  const openEditAccount = (account: any) => {
    setEditingAccount(account)
    setEditName(account.name || "")
    setEditTargetBalance(String(Number((account.current_balance ?? 0).toFixed(2))))
    setEditReason("")
    setEditBankTaxRate(account.bank_tax_rate != null ? String(account.bank_tax_rate) : "")
    setEditAccountOpen(true)
  }

  const handleEditSave = async () => {
    if (!editingAccount) return
    const trimmedName = editName.trim()
    if (!trimmedName) {
      toast.error("El nombre no puede estar vacío")
      return
    }
    const targetNum = Number(editTargetBalance)
    if (!Number.isFinite(targetNum)) {
      toast.error("El saldo debe ser un número válido")
      return
    }
    const currentBal = Number(editingAccount.current_balance ?? 0)
    const balanceChanged = Math.abs(targetNum - currentBal) > 0.01
    const nameChanged = trimmedName !== (editingAccount.name || "")
    // Bank tax rate change detection
    const oldTaxRate = editingAccount.bank_tax_rate != null ? String(editingAccount.bank_tax_rate) : ""
    const taxRateChanged = editBankTaxRate !== oldTaxRate
    if (!balanceChanged && !nameChanged && !taxRateChanged) {
      toast.info("Sin cambios")
      setEditAccountOpen(false)
      return
    }

    setIsEditing(true)
    try {
      const payload: Record<string, unknown> = {}
      if (nameChanged) payload.name = trimmedName
      if (balanceChanged) {
        payload.target_balance = targetNum
        payload.adjustment_reason = editReason.trim() || undefined
      }
      if (taxRateChanged) {
        payload.bank_tax_rate = editBankTaxRate === "" ? null : Number(editBankTaxRate)
      }
      const res = await fetch(`/api/accounting/financial-accounts/${editingAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error al guardar cambios")
      }

      const parts: string[] = []
      if (data.updated_name) parts.push(`nombre actualizado`)
      if (data.adjustment) {
        const sign = (data.adjustment.delta ?? 0) >= 0 ? "+" : ""
        parts.push(`saldo ajustado (${sign}${data.adjustment.delta})`)
      }
      toast.success(parts.length > 0 ? `Cuenta editada: ${parts.join(" + ")}` : "Cuenta actualizada")
      setEditAccountOpen(false)
      setEditingAccount(null)
      await fetchData(true)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar cambios")
    } finally {
      setIsEditing(false)
    }
  }

  const [formData, setFormData] = useState<any>({
    name: "",
    type: "",
    currency: defaultCurrency,
    agency_id: "",
    initial_balance: 0,
    account_number: "",
    bank_name: "",
    bank_tax_rate: "",
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

  // Sync default currency once it loads from org settings
  useEffect(() => {
    setFormData((prev: any) => prev.type ? prev : { ...prev, currency: defaultCurrency })
  }, [defaultCurrency])

  // Auto-abrir dialog de creación si vienen con ?new=1 (deep-link desde
  // empty states de Caja, dialog de pagos, etc). Permite "crear xxx" inline
  // sin que el user tenga que perder contexto buscando el botón.
  useEffect(() => {
    const action = searchParams?.get("new")
    if (action === "1") {
      // Pre-cargar currency si vino en query (ej: ?new=1&currency=USD)
      const ccy = searchParams?.get("currency")
      if (ccy === "USD" || ccy === "ARS") {
        setFormData((prev: any) => ({ ...prev, currency: ccy }))
      }
      setOpenDialog(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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

  async function fetchMovements(accountId: string) {
    setMovementsLoading(true)
    try {
      const res = await fetch(`/api/accounting/ledger?accountId=${accountId}&limit=200`)
      if (!res.ok) throw new Error("Error loading movements")
      const data = await res.json()
      setMovements(data.movements || [])
      setMovementsTotal(data.pagination?.total || 0)
    } catch {
      setMovements([])
      setMovementsTotal(0)
    } finally {
      setMovementsLoading(false)
    }
  }

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id)
    }
  }, [accounts, selectedAccountId])

  useEffect(() => {
    if (selectedAccountId) {
      fetchMovements(selectedAccountId)
    }
  }, [selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null

  const movementsSummary = movements.reduce(
    (acc, m) => {
      const amt = Math.abs(m.amount_original || 0)
      if (m.type === "INCOME" || m.type === "FX_GAIN") acc.income += amt
      else acc.expense += amt
      return acc
    },
    { income: 0, expense: 0 }
  )

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
    } else if (formData.type === "PARTNER") {
      // Para socios, la moneda puede ser ARS o USD
      currency = formData.currency || "USD"
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
    if (!["CASH_ARS", "CASH_USD", "ASSETS", "PARTNER"].includes(formData.type)) {
      accountData.account_number = formData.account_number || null
      accountData.bank_name = formData.bank_name || null
      // Ley 25413: tasa de impuesto a débitos/créditos bancarios (típico 0.6%)
      const taxRate = Number(formData.bank_tax_rate)
      accountData.bank_tax_rate = taxRate > 0 ? taxRate : null
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

    setIsSaving(true)
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
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      type: "",
      currency: defaultCurrency,
      agency_id: "",
      initial_balance: 0,
      account_number: "",
      bank_name: "",
      bank_tax_rate: "",
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

  const { sortedData: sortedAccounts, sortConfig: accountsSortConfig, requestSort: requestAccountsSort } = useSortableData(accounts, {
    key: "name",
    direction: "asc",
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Agrupar por agencia
  const accountsByAgency = sortedAccounts.reduce((acc, account) => {
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ===== Account selector strip ===== */}
      {accounts.length > 0 && (
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--vb-border)", overflowX: "auto", flexShrink: 0 }}>
          {accounts.map((account) => (
            <div
              key={account.id}
              onClick={() => setSelectedAccountId(account.id)}
              style={{
                minWidth: 160,
                flex: "0 0 auto",
                padding: "12px 16px",
                borderRight: "1px solid var(--vb-border)",
                borderBottom: selectedAccountId === account.id ? "2px solid var(--vb-accent)" : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
                background: selectedAccountId === account.id ? "var(--vb-elev)" : "transparent",
                transition: "background 0.15s",
              }}
            >
              <div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{getDisplayName(account)}</div>
              <div className="mono tnum" style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                {formatCurrency(account.current_balance ?? 0, account.currency)}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--vb-muted)", marginTop: 1 }}>{account.currency} · {accountTypeLabels[account.type]?.replace(/Caja de ahorro |Cuenta corriente |Caja efectivo /, "") || account.type}</div>
            </div>
          ))}
          <div
            onClick={() => setOpenDialog(true)}
            style={{
              minWidth: 80,
              flex: "0 0 auto",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--vb-muted)",
              transition: "color 0.15s",
            }}
          >
            <Plus style={{ width: 16, height: 16 }} />
          </div>
        </div>
      )}

      {/* ===== Toolbar ===== */}
      {selectedAccount && (
        <div style={{ padding: "8px 14px", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid var(--vb-border)", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{getDisplayName(selectedAccount)} · {movementsTotal} movimientos</div>
          <span style={{ flex: 1 }} />
          <button className="vb-btn sm" onClick={() => setTransferDialogOpen(true)}>
            <ArrowRightLeft style={{ width: 12, height: 12 }} /> Transferir
          </button>
          <button className="vb-btn sm" onClick={() => openEditAccount(selectedAccount)}>
            <Pencil style={{ width: 12, height: 12 }} /> Editar
          </button>
          <button className="vb-btn sm" style={{ color: "var(--destructive)" }} onClick={() => openDeleteAccount(selectedAccount)}>
            <Trash2 style={{ width: 12, height: 12 }} /> Eliminar
          </button>
          <button className="vb-btn sm primary" onClick={() => setOpenDialog(true)}>
            <Plus style={{ width: 12, height: 12 }} /> Nueva Cuenta
          </button>
        </div>
      )}

      {/* ===== Main content ===== */}
      {accounts.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <Building2 style={{ width: 48, height: 48, margin: "0 auto 16px", color: "var(--vb-muted)" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No hay cuentas financieras</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Comienza creando tu primera cuenta financiera</p>
            <button className="vb-btn sm primary" onClick={() => setOpenDialog(true)}>
              <Plus style={{ width: 14, height: 14 }} /> Crear Primera Cuenta
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", flex: 1, minHeight: 0 }}>
          {/* Movements table */}
          <div style={{ overflow: "auto" }}>
            {movementsLoading ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <Skeleton className="h-8 w-48 mx-auto mb-3" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : movements.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--vb-muted)", fontSize: 13 }}>
                No hay movimientos en esta cuenta
              </div>
            ) : (
              <table className="vb-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Vinculado a</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: "right" }}>Ingreso</th>
                    <th style={{ textAlign: "right" }}>Egreso</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m: any) => {
                    const isIncome = m.type === "INCOME" || m.type === "FX_GAIN"
                    const amt = Math.abs(m.amount_original || 0)
                    const opCode = m.operations?.file_code || (m.operation_id ? m.operation_id.slice(0, 8) : null)
                    return (
                      <tr key={m.id}>
                        <td className="mono" style={{ fontSize: 12, color: "var(--vb-muted)" }}>
                          {m.movement_date ? format(new Date(m.movement_date), "dd MMM", { locale: es }) : "—"}
                        </td>
                        <td style={{ fontSize: 12.5, fontWeight: 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.concept || "—"}
                        </td>
                        <td className="mono" style={{ fontSize: 11.5, color: opCode ? "var(--vb-accent)" : "var(--vb-muted)" }}>
                          {opCode || "—"}
                        </td>
                        <td>
                          <span className="vb-chip" style={{ fontSize: 10.5 }}>
                            {m.type === "INCOME" ? "Ingreso" : m.type === "EXPENSE" ? "Egreso" : m.type === "FX_GAIN" ? "Ganancia FX" : m.type}
                          </span>
                        </td>
                        <td className="mono tnum" style={{ textAlign: "right", fontSize: 12.5, color: isIncome ? "var(--vb-success)" : "var(--vb-muted)" }}>
                          {isIncome ? formatCurrency(amt, selectedAccount?.currency) : "—"}
                        </td>
                        <td className="mono tnum" style={{ textAlign: "right", fontSize: 12.5, color: !isIncome ? "var(--vb-danger)" : "var(--vb-muted)" }}>
                          {!isIncome ? formatCurrency(amt, selectedAccount?.currency) : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Summary panel */}
          <div style={{ borderLeft: "1px solid var(--vb-border)", padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
            {selectedAccount && (
              <>
                <div>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Resumen</div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span className="muted" style={{ fontSize: 12 }}>Saldo inicial</span>
                    <span className="mono tnum" style={{ fontSize: 12.5 }}>{formatCurrency(selectedAccount.initial_balance ?? 0, selectedAccount.currency)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span className="muted" style={{ fontSize: 12 }}>Ingresos</span>
                    <span className="mono tnum" style={{ fontSize: 12.5, color: "var(--vb-success)" }}>+{formatCurrency(movementsSummary.income, selectedAccount.currency)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span className="muted" style={{ fontSize: 12 }}>Egresos</span>
                    <span className="mono tnum" style={{ fontSize: 12.5, color: "var(--vb-danger)" }}>−{formatCurrency(movementsSummary.expense, selectedAccount.currency)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--vb-border)", marginTop: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Saldo actual</span>
                    <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(selectedAccount.current_balance ?? 0, selectedAccount.currency)}</span>
                  </div>
                </div>

                <div>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Detalle</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted" style={{ fontSize: 12 }}>Tipo</span>
                      <span style={{ fontSize: 12 }}>{accountTypeLabels[selectedAccount.type] || selectedAccount.type}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted" style={{ fontSize: 12 }}>Moneda</span>
                      <span style={{ fontSize: 12 }}>{selectedAccount.currency}</span>
                    </div>
                    {selectedAccount.bank_name && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted" style={{ fontSize: 12 }}>Banco</span>
                        <span style={{ fontSize: 12 }}>{selectedAccount.bank_name}</span>
                      </div>
                    )}
                    {selectedAccount.account_number && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="muted" style={{ fontSize: 12 }}>Nro. cuenta</span>
                        <span className="mono" style={{ fontSize: 12 }}>{selectedAccount.account_number}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Dialogs ===== */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              ¿Eliminar todas las cuentas?
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará todas las cuentas financieras del sistema. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleClearAll}>Sí, eliminar todas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      <p>¿Eliminar la cuenta <strong>{accountToDelete.displayName}</strong>? Esta acción no se puede deshacer.</p>
                    ) : deleteStep === "confirm" ? (
                      <p>
                        La cuenta <strong>{accountToDelete.displayName}</strong> tiene{" "}
                        <strong className={accountToDelete.balance >= 0 ? "text-accent-coral" : "text-destructive"}>
                          {formatCurrency(accountToDelete.balance, accountToDelete.currency)}
                        </strong> de saldo. ¿Quieres transferirlo a otra cuenta?
                      </p>
                    ) : (
                      <>
                        <p>Transferir <strong className={accountToDelete.balance >= 0 ? "text-accent-coral" : "text-destructive"}>{formatCurrency(Math.abs(accountToDelete.balance), accountToDelete.currency)}</strong> a:</p>
                        <Select value={transferToId} onValueChange={setTransferToId}>
                          <SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
                          <SelectContent>
                            {accounts.filter((a: any) => a.id !== accountToDelete.id && a.currency === accountToDelete.currency && a.is_active !== false).map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>{getDisplayName(a)} ({a.currency})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {accounts.filter((a: any) => a.id !== accountToDelete.id && a.currency === accountToDelete.currency && a.is_active !== false).length === 0 && (
                          <p className="text-sm text-accent-coral">No hay otras cuentas en {accountToDelete.currency} para transferir.</p>
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
                    <Button variant="outline" onClick={closeDeleteAccount}>Cancelar</Button>
                    <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting}>{isDeleting ? "Eliminando…" : "Sí, eliminar"}</Button>
                  </>
                ) : deleteStep === "confirm" ? (
                  <>
                    <Button variant="outline" onClick={closeDeleteAccount}>No, cancelar</Button>
                    <Button onClick={() => setDeleteStep("transfer")}>Sí, transferir</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setDeleteStep("confirm")}>Atrás</Button>
                    <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting || !transferToId}>{isDeleting ? "Eliminando…" : "Eliminar y transferir"}</Button>
                  </>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogContent className="max-w-2xl">
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
                        : formData.type === "PARTNER"
                        ? "Ej: Cuenta Socio Juan"
                        : "Ej: Caja Principal"
                    }
                    required
                  />
                </div>

                {/* Campos específicos para cuentas bancarias */}
                {!["CASH_ARS", "CASH_USD", "ASSETS", "PARTNER", ""].includes(formData.type) && (
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
                    <div>
                      <Label>Imp. Ley 25413 — tasa (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.bank_tax_rate || ""}
                        onChange={(e) => setFormData({ ...formData, bank_tax_rate: e.target.value })}
                        placeholder="0.6 (dejar vacío si no aplica)"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Si se completa, al registrar un ingreso en esta cuenta se ofrecerá deducir automáticamente el impuesto a déb/créd bancarios.
                      </p>
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

                {/* Campos específicos para cuenta de socio */}
                {formData.type === "PARTNER" && (
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Los retiros del socio se registran como transferencias a esta cuenta
                    </p>
                  </div>
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
                    <DecimalInput
                      value={formData.initial_balance}
                      onChange={(v) => setFormData({ ...formData, initial_balance: parseFloat(v) || 0 })}
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
                  <Button type="button" variant="outline" onClick={() => setOpenDialog(false)} disabled={isSaving}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Creando..." : "Crear Cuenta"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

      {/* Dialog de edición de cuenta — nombre + ajuste de saldo */}
      <Dialog open={editAccountOpen} onOpenChange={(open) => { if (!isEditing) setEditAccountOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cuenta financiera</DialogTitle>
            <DialogDescription>
              Cambiá el nombre o ajustá el saldo. Si cambiás el saldo, se crea un movimiento de ajuste en el libro mayor (queda en el historial).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ej: Banco Galicia USD"
                disabled={isEditing}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground">Saldo actual</Label>
                <div className="h-10 px-3 py-2 rounded-[var(--vb-r-sm)] border border-[var(--vb-border)] bg-[var(--vb-hover)] text-sm tabular-nums">
                  {editingAccount
                    ? formatCurrency(Number(editingAccount.current_balance ?? 0), editingAccount.currency)
                    : "—"}
                </div>
              </div>
              <div>
                <Label htmlFor="edit-target">Nuevo saldo</Label>
                <DecimalInput
                  id="edit-target"
                  value={editTargetBalance}
                  onChange={(v) => setEditTargetBalance(v)}
                  placeholder="0.00"
                  disabled={isEditing}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-reason">Motivo del ajuste (opcional, recomendado)</Label>
              <Textarea
                id="edit-reason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Ej: corrección de saldo inicial, conciliación con extracto bancario..."
                rows={2}
                disabled={isEditing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Si modificás el saldo, se generará un movimiento en el libro mayor con este motivo. Si no ponés motivo se registra como &quot;Ajuste manual sin motivo declarado&quot;.
              </p>
            </div>
            {/* Bank tax rate — for any account that goes through a bank (not cash/assets/partner) */}
            {editingAccount && !["CASH_ARS", "CASH_USD", "ASSETS", "PARTNER"].includes(editingAccount.type || "") && (
              <div>
                <Label htmlFor="edit-bank-tax">Imp. Ley 25413 — tasa (%)</Label>
                <Input
                  id="edit-bank-tax"
                  type="number"
                  step="0.01"
                  value={editBankTaxRate}
                  onChange={(e) => setEditBankTaxRate(e.target.value)}
                  placeholder="0.6 (dejar vacío si no aplica)"
                  disabled={isEditing}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Si se completa, al registrar un ingreso en esta cuenta se ofrecerá deducir automáticamente el impuesto a déb/créd bancarios.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAccountOpen(false)} disabled={isEditing}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={isEditing}>
              {isEditing ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
