"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PermissionsCell } from "./permissions-cell"
import { toast } from "sonner"
import { RotateCcw, Save, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ResolvedModulePerms, ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
import type { UserRole } from "@/lib/permissions"

const CONFIGURABLE_ROLES: UserRole[] = ["ADMIN", "CONTABLE", "SELLER", "VIEWER", "POST_VENTA"]

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  CONTABLE: "Contable",
  SELLER: "Vendedor",
  VIEWER: "Solo lectura",
  POST_VENTA: "Post Venta",
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Inicio",
  leads: "CRM Ventas",
  operations: "Operaciones",
  customers: "Clientes",
  operators: "Operadores",
  cash: "Caja",
  accounting: "Contabilidad",
  alerts: "Alertas",
  reports: "Reportes",
  commissions: "Comisiones",
  settings: "Configuración",
  documents: "Documentos",
  tasks: "Tareas",
}

const ALL_MODULES = Object.keys(MODULE_LABELS)

type FullMatrix = Record<string, ResolvedPermissionsMatrix>

interface PermissionsMatrixProps {
  agencies: Array<{ id: string; name: string }>
  initialAgencyId: string | null
  initialMatrix: FullMatrix
  initialCustomized: Record<string, string[]>
  readOnly?: boolean
}

export function PermissionsMatrix({
  agencies,
  initialAgencyId,
  initialMatrix,
  initialCustomized,
  readOnly,
}: PermissionsMatrixProps) {
  const [agencyId, setAgencyId] = useState(initialAgencyId ?? agencies[0]?.id ?? "")
  const [matrix, setMatrix] = useState<FullMatrix>(initialMatrix)
  const [customized, setCustomized] = useState<Record<string, string[]>>(initialCustomized)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [roleBeingReset, setRoleBeingReset] = useState<string | null>(null)

  const loadMatrix = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/permissions?agencyId=${id}`)
      if (!res.ok) throw new Error()
      const { matrix: m, customized: c } = await res.json()
      setMatrix(m)
      setCustomized(c)
    } catch {
      toast.error("Error al cargar los permisos")
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleAgencyChange(id: string) {
    setAgencyId(id)
    await loadMatrix(id)
  }

  function handleCellChange(role: string, module: string, updated: ResolvedModulePerms) {
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [module]: updated },
    }))
  }

  async function handleSaveRole(role: string) {
    if (!agencyId) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          role,
          permissions: matrix[role],
        }),
      })
      if (!res.ok) throw new Error()
      // Recalcular customized para el rol
      await loadMatrix(agencyId)
      toast.success(`Permisos de ${ROLE_LABELS[role]} guardados`)
    } catch {
      toast.error("Error al guardar los permisos")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAll() {
    if (!agencyId) return
    setSaving(true)
    try {
      await Promise.all(
        CONFIGURABLE_ROLES.map((role) =>
          fetch("/api/settings/permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agencyId, role, permissions: matrix[role] }),
          })
        )
      )
      await loadMatrix(agencyId)
      toast.success("Todos los permisos guardados")
    } catch {
      toast.error("Error al guardar los permisos")
    } finally {
      setSaving(false)
    }
  }

  async function handleResetRole(role: string) {
    if (!agencyId) return
    setRoleBeingReset(role)
    try {
      const res = await fetch(
        `/api/settings/permissions/reset?agencyId=${agencyId}&role=${role}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error()
      await loadMatrix(agencyId)
      toast.success(`Permisos de ${ROLE_LABELS[role]} reseteados a defaults`)
    } catch {
      toast.error("Error al resetear los permisos")
    } finally {
      setRoleBeingReset(null)
    }
  }

  async function handleResetAll() {
    if (!agencyId) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/settings/permissions/reset?agencyId=${agencyId}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error()
      await loadMatrix(agencyId)
      toast.success("Todos los permisos reseteados a defaults")
    } catch {
      toast.error("Error al resetear los permisos")
    } finally {
      setSaving(false)
    }
  }

  const totalCustomized = Object.values(customized).flat().length

  return (
    <div className="space-y-4">
      {/* Header: selector de agencia + acciones globales */}
      <div className="flex flex-wrap items-center gap-3">
        {agencies.length > 1 && (
          <Select value={agencyId} onValueChange={handleAgencyChange} disabled={loading}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Seleccionar agencia" />
            </SelectTrigger>
            <SelectContent>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {agencies.length === 1 && (
          <span className="text-sm font-medium text-muted-foreground">
            Agencia: {agencies[0].name}
          </span>
        )}

        {totalCustomized > 0 && (
          <Badge variant="secondary" className="text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400">
            {totalCustomized} {totalCustomized === 1 ? "permiso personalizado" : "permisos personalizados"}
          </Badge>
        )}

        {!readOnly && (
          <div className="flex gap-2 ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={saving || loading || totalCustomized === 0}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Resetear todo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetear todos los permisos</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto eliminará todas las personalizaciones de esta agencia y volverá a los
                    permisos predeterminados del sistema para todos los roles.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetAll}>Resetear todo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button size="sm" onClick={handleSaveAll} disabled={saving || loading}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Guardando…" : "Guardar todo"}
            </Button>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span><span className="font-mono font-bold">L</span> = Leer</span>
        <span><span className="font-mono font-bold">E</span> = Editar/Escribir</span>
        <span><span className="font-mono font-bold">B</span> = Borrar</span>
        <span><span className="font-mono font-bold">X</span> = Exportar</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-800 border border-amber-400"></span>
          Personalizado
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground w-36 min-w-[9rem]">
                Módulo
              </th>
              {CONFIGURABLE_ROLES.map((role) => (
                <th key={role} className="py-2 px-1 text-center min-w-[100px]">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="font-semibold text-foreground">{ROLE_LABELS[role]}</span>
                    {customized[role]?.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700"
                      >
                        {customized[role].length} custom
                      </Badge>
                    )}
                    {!readOnly && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => handleSaveRole(role)}
                          disabled={saving || loading}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Guardar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2 text-muted-foreground"
                              disabled={saving || loading || !customized[role]?.length}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Resetear permisos de {ROLE_LABELS[role]}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Esto eliminará las personalizaciones del rol{" "}
                                <strong>{ROLE_LABELS[role]}</strong> en esta agencia y volverá a
                                los permisos predeterminados del sistema.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleResetRole(role)}
                                disabled={roleBeingReset === role}
                              >
                                {roleBeingReset === role ? "Reseteando…" : "Resetear"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((module, idx) => (
              <tr
                key={module}
                className={cn(
                  "border-b last:border-0 hover:bg-muted/20 transition-colors",
                  idx % 2 === 0 && "bg-muted/10"
                )}
              >
                <td className="py-2 px-4 font-medium whitespace-nowrap">
                  {MODULE_LABELS[module] ?? module}
                </td>
                {loading
                  ? CONFIGURABLE_ROLES.map((role) => (
                      <td key={role} className="py-2 px-1 text-center">
                        <Skeleton className="h-10 w-20 mx-auto rounded-md" />
                      </td>
                    ))
                  : CONFIGURABLE_ROLES.map((role) => (
                      <td key={role} className="py-2 px-1 text-center">
                        <div className="flex justify-center">
                          <PermissionsCell
                            perms={matrix[role]?.[module] ?? {
                              read: false, write: false, delete: false, export: false, ownDataOnly: false,
                            }}
                            onChange={(updated) => handleCellChange(role, module, updated)}
                            isModified={customized[role]?.includes(module) ?? false}
                            readOnly={readOnly}
                          />
                        </div>
                      </td>
                    ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {agencies.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay agencias configuradas. Creá al menos una agencia en la pestaña Agencias.
        </p>
      )}
    </div>
  )
}
