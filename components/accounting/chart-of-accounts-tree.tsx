"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderOpen,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react"
import { toast } from "sonner"

interface ChartAccount {
  id: string
  account_code: string
  account_name: string
  category: string
  subcategory: string | null
  account_type: string | null
  level: number
  parent_id: string | null
  is_movement_account: boolean
  is_active: boolean
  display_order: number
  description: string | null
  children?: ChartAccount[]
}

type ChartBalances = Record<string, { ars: number; usd: number }>

function formatBalance(amount: number, currency: "ARS" | "USD"): string {
  if (amount === 0) return ""
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Suma recursiva del saldo de una cuenta + sus hijos */
function getTreeBalance(
  account: ChartAccount,
  balances: ChartBalances
): { ars: number; usd: number } {
  const own = balances[account.id] || { ars: 0, usd: 0 }
  const childrenSum = (account.children || []).reduce(
    (acc, child) => {
      const cb = getTreeBalance(child, balances)
      return { ars: acc.ars + cb.ars, usd: acc.usd + cb.usd }
    },
    { ars: 0, usd: 0 }
  )
  return { ars: own.ars + childrenSum.ars, usd: own.usd + childrenSum.usd }
}

const CATEGORY_COLORS: Record<string, string> = {
  ACTIVO: "bg-primary/10 text-primary",
  PASIVO: "bg-destructive/10 text-destructive",
  PATRIMONIO_NETO: "bg-accent-violet/10 text-accent-violet",
  RESULTADO: "bg-success/10 text-success",
}

const CATEGORY_LABELS: Record<string, string> = {
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PATRIMONIO_NETO: "Patrimonio Neto",
  RESULTADO: "Resultado",
}

const SUBCATEGORY_OPTIONS: Record<string, string[]> = {
  ACTIVO: ["CORRIENTE", "NO_CORRIENTE"],
  PASIVO: ["CORRIENTE", "NO_CORRIENTE"],
  PATRIMONIO_NETO: ["CAPITAL", "RESERVAS", "RESULTADOS"],
  RESULTADO: ["INGRESOS", "COSTOS", "GASTOS", "EGRESOS"],
}

function AccountNode({
  account,
  depth = 0,
  expandedIds,
  toggleExpand,
  onAddSub,
  searchTerm,
  balances,
}: {
  account: ChartAccount
  depth?: number
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  onAddSub: (parent: ChartAccount) => void
  searchTerm: string
  balances: ChartBalances
}) {
  const hasChildren = account.children && account.children.length > 0
  const isExpanded = expandedIds.has(account.id)

  // Filter by search
  const matchesSearch =
    !searchTerm ||
    account.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.account_name.toLowerCase().includes(searchTerm.toLowerCase())

  const childrenMatch = account.children?.some(
    (child) =>
      child.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      child.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      child.children?.some(
        (gc) =>
          gc.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          gc.account_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
  )

  if (searchTerm && !matchesSearch && !childrenMatch) {
    return null
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group ${
          !account.is_active ? "opacity-50" : ""
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse */}
        <button
          onClick={() => hasChildren && toggleExpand(account.id)}
          className="w-5 h-5 flex items-center justify-center shrink-0"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>

        {/* Icon */}
        {account.is_movement_account ? (
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <FolderOpen className="h-4 w-4 text-accent-coral shrink-0" />
        )}

        {/* Code + Name */}
        <span className="font-mono text-xs text-muted-foreground w-[60px] shrink-0">
          {account.account_code}
        </span>
        <span className={`text-sm flex-1 ${account.is_movement_account ? "" : "font-semibold"}`}>
          {account.account_name}
        </span>

        {/* Category badge */}
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            CATEGORY_COLORS[account.category] || "bg-muted text-foreground"
          }`}
        >
          {CATEGORY_LABELS[account.category] || account.category}
        </span>

        {/* Movement account indicator */}
        {account.is_movement_account && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            Mov
          </Badge>
        )}

        {/* Balance */}
        {(() => {
          const bal = account.is_movement_account
            ? balances[account.id] || { ars: 0, usd: 0 }
            : getTreeBalance(account, balances)
          const hasBalance = bal.ars !== 0 || bal.usd !== 0
          if (!hasBalance) return null
          return (
            <span className="text-xs font-mono text-right min-w-[120px] shrink-0">
              {bal.ars !== 0 && (
                <span className={bal.ars >= 0 ? "text-success" : "text-destructive"}>
                  {formatBalance(bal.ars, "ARS")}
                </span>
              )}
              {bal.ars !== 0 && bal.usd !== 0 && <span className="text-muted-foreground mx-1">|</span>}
              {bal.usd !== 0 && (
                <span className={bal.usd >= 0 ? "text-primary" : "text-destructive"}>
                  {formatBalance(bal.usd, "USD")}
                </span>
              )}
            </span>
          )
        })()}

        {/* Add subcuenta button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            onAddSub(account)
          }}
          title="Agregar subcuenta"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {account.children!.map((child) => (
            <AccountNode
              key={child.id}
              account={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onAddSub={onAddSub}
              searchTerm={searchTerm}
              balances={balances}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ChartOfAccountsTree() {
  const [accounts, setAccounts] = useState<ChartAccount[]>([])
  const [balances, setBalances] = useState<ChartBalances>({})
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [parentAccount, setParentAccount] = useState<ChartAccount | null>(null)

  // Create form state
  const [newCode, setNewCode] = useState("")
  const [newName, setNewName] = useState("")
  const [newCategory, setNewCategory] = useState("")
  const [newSubcategory, setNewSubcategory] = useState("")
  const [newIsMovement, setNewIsMovement] = useState(true)
  const [newDescription, setNewDescription] = useState("")
  const [creating, setCreating] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/accounting/chart-of-accounts?includeInactive=true&includeBalances=true")
      if (!res.ok) throw new Error("Error fetching accounts")
      const data = await res.json()
      setAccounts(data.accounts || [])
      setBalances(data.balances || {})

      // Auto-expand level 1 accounts
      const level1Ids = new Set<string>(
        (data.accounts || []).map((a: ChartAccount) => a.id)
      )
      setExpandedIds(level1Ids)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const openCreateDialog = (parent: ChartAccount | null) => {
    setParentAccount(parent)

    if (parent) {
      // Auto-fill from parent
      setNewCategory(parent.category)
      setNewSubcategory(parent.subcategory || "")
      // Auto-suggest next code
      const childCount = parent.children?.length || 0
      const nextNum = String(childCount + 1).padStart(2, "0")
      setNewCode(`${parent.account_code}.${nextNum}`)
      setNewIsMovement(true)
    } else {
      setNewCode("")
      setNewCategory("")
      setNewSubcategory("")
      setNewIsMovement(false)
    }
    setNewName("")
    setNewDescription("")
    setShowCreateDialog(true)
  }

  const handleCreate = async () => {
    if (!newCode.trim() || !newName.trim() || !newCategory) {
      toast.error("Código, nombre y categoría son requeridos")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/accounting/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_code: newCode.trim(),
          account_name: newName.trim(),
          category: newCategory,
          subcategory: newSubcategory || null,
          level: parentAccount ? parentAccount.level + 1 : 1,
          parent_id: parentAccount?.id || null,
          is_movement_account: newIsMovement,
          description: newDescription.trim() || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error creando cuenta")
      }

      toast.success(`Cuenta ${newCode} creada correctamente`)
      setShowCreateDialog(false)
      fetchAccounts()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Plan de Cuentas</h2>
          <p className="text-sm text-muted-foreground">
            Estructura jerárquica de cuentas contables
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchAccounts}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openCreateDialog(null)}>
            <Plus className="h-4 w-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código o nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tree */}
      <div className="rounded-xl border border-border/40 p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No hay cuentas en el plan de cuentas
          </p>
        ) : (
          <div className="space-y-0.5">
            {accounts.map((account) => (
              <AccountNode
                key={account.id}
                account={account}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                onAddSub={openCreateDialog}
                searchTerm={searchTerm}
                balances={balances}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parentAccount
                ? `Nueva Subcuenta de ${parentAccount.account_code} ${parentAccount.account_name}`
                : "Nueva Cuenta"}
            </DialogTitle>
            <DialogDescription>
              {parentAccount
                ? "Se creará como subcuenta del elemento seleccionado"
                : "Creá una nueva cuenta en el plan de cuentas"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="acc-code">Código</Label>
                <Input
                  id="acc-code"
                  placeholder="Ej: 4.3.05"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Nombre</Label>
                <Input
                  id="acc-name"
                  placeholder="Ej: Sueldos y Jornales"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVO">Activo</SelectItem>
                    <SelectItem value="PASIVO">Pasivo</SelectItem>
                    <SelectItem value="PATRIMONIO_NETO">Patrimonio Neto</SelectItem>
                    <SelectItem value="RESULTADO">Resultado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subcategoría</Label>
                <Select value={newSubcategory} onValueChange={setNewSubcategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(SUBCATEGORY_OPTIONS[newCategory] || []).map((sub) => (
                      <SelectItem key={sub} value={sub}>
                        {sub}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-desc">Descripción (opcional)</Label>
              <Input
                id="acc-desc"
                placeholder="Descripción de la cuenta..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-movement"
                checked={newIsMovement}
                onChange={(e) => setNewIsMovement(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="is-movement" className="text-sm font-normal cursor-pointer">
                Cuenta de movimiento (registra transacciones)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newCode.trim() || !newName.trim() || !newCategory}
            >
              {creating ? "Creando..." : "Crear Cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
