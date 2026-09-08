"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { MoreHorizontal, Plus, PackageX } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { EmptyState } from "@/components/ui/empty-state"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
import type { PackageWithAvailability } from "@/lib/packages/queries"
import { PackageFormDialog } from "./package-form-dialog"
import { QuotaMeter } from "./quota-meter"

interface PackagesPageClientProps {
  initialPackages: PackageWithAvailability[]
  agencies: Array<{ id: string; name: string }>
  canWrite: boolean
  canDelete: boolean
}

function formatDateOnly(value: string | null): string {
  if (!value) return "—"
  // parseDateOnlyLocal evita el corrimiento de un día que produce `new Date()`
  // sobre una columna DATE en UTC-3; devuelve undefined si el valor no parsea.
  const parsed = parseDateOnlyLocal(value)
  if (!parsed) return value
  return format(parsed, "dd MMM yy", { locale: es })
}

export function PackagesPageClient({
  initialPackages,
  agencies,
  canWrite,
  canDelete,
}: PackagesPageClientProps) {
  const [packages, setPackages] = useState(initialPackages)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "CLOSED">("ACTIVE")
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PackageWithAvailability | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/packages")
      const data = await res.json()
      if (res.ok) setPackages(data.packages || [])
    } catch {
      toast.error("No se pudo actualizar la lista de paquetes")
    } finally {
      setLoading(false)
    }
  }, [])

  const visibles = useMemo(
    () => (statusFilter === "ALL" ? packages : packages.filter((p) => p.status === statusFilter)),
    [packages, statusFilter]
  )

  const confirmarBorrado = async () => {
    if (!deleting) return
    try {
      const res = await fetch(`/api/packages/${deleting.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "No se pudo borrar el paquete")
        return
      }
      toast.success("Paquete eliminado")
      refetch()
    } catch {
      toast.error("No se pudo conectar con el servidor")
    } finally {
      setDeleting(null)
    }
  }

  const cambiarEstado = async (pkg: PackageWithAvailability) => {
    const nuevo = pkg.status === "ACTIVE" ? "CLOSED" : "ACTIVE"
    try {
      const res = await fetch(`/api/packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nuevo }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "No se pudo cambiar el estado")
        return
      }
      toast.success(nuevo === "CLOSED" ? "Paquete cerrado" : "Paquete reabierto")
      refetch()
    } catch {
      toast.error("No se pudo conectar con el servidor")
    }
  }

  const columns: ColumnDef<PackageWithAvailability>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Paquete" />,
        cell: ({ row }) => {
          const pkg = row.original
          return (
            <div className="min-w-[12rem]">
              <Link href={`/packages/${pkg.id}`} className="font-medium hover:underline">
                {pkg.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {pkg.destination || "Sin destino"}
                {pkg.agency_name ? ` · ${pkg.agency_name}` : ""}
                {pkg.items.length > 0 ? ` · ${pkg.items.length} pata(s)` : ""}
              </div>
            </div>
          )
        },
      },
      {
        id: "fechas",
        header: "Fechas",
        cell: ({ row }) => {
          const pkg = row.original
          if (!pkg.departure_date && !pkg.return_date) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <span className="whitespace-nowrap text-sm tabular-nums">
              {formatDateOnly(pkg.departure_date)}
              <span className="text-muted-foreground"> → </span>
              {formatDateOnly(pkg.return_date)}
            </span>
          )
        },
      },
      {
        id: "ocupacion",
        header: "Plazas vendidas",
        cell: ({ row }) => (
          <QuotaMeter
            consumed={row.original.availability.consumed}
            totalQuota={row.original.availability.total_quota}
          />
        ),
      },
      {
        id: "precio",
        header: "Precio",
        cell: ({ row }) => {
          const pkg = row.original
          if (pkg.sale_amount_total === null) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <span className="whitespace-nowrap tabular-nums">
              {pkg.sale_currency}{" "}
              {pkg.sale_amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          )
        },
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) =>
          row.original.status === "ACTIVE" ? (
            <Badge variant="outline">Abierto</Badge>
          ) : (
            <Badge variant="secondary">Cerrado</Badge>
          ),
      },
      {
        id: "acciones",
        cell: ({ row }) => {
          const pkg = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Acciones del paquete {pkg.name}</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href={`/packages/${pkg.id}`}>Ver detalle</Link>
                </DropdownMenuItem>
                {canWrite && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingId(pkg.id)
                        setFormOpen(true)
                      }}
                    >
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => cambiarEstado(pkg)}>
                      {pkg.status === "ACTIVE" ? "Cerrar paquete" : "Reabrir paquete"}
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleting(pkg)}
                    >
                      Eliminar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, canDelete]
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Abiertos</SelectItem>
            <SelectItem value="CLOSED">Cerrados</SelectItem>
            <SelectItem value="ALL">Todos</SelectItem>
          </SelectContent>
        </Select>

        {canWrite && (
          <Button
            onClick={() => {
              setEditingId(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo paquete
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-md border p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title={
            statusFilter === "CLOSED" ? "No hay paquetes cerrados" : "Todavía no armaste paquetes"
          }
          description={
            statusFilter === "CLOSED"
              ? "Los paquetes que cierres van a quedar acá, con su historial de ventas."
              : "Un paquete agrupa a varios operadores (hotel, aéreo, asistencia) y define cuántas plazas hay para vender. Al cargar una operación se elige el paquete y el cupo se descuenta solo."
          }
          action={
            canWrite && statusFilter !== "CLOSED"
              ? {
                  label: "Nuevo paquete",
                  onClick: () => {
                    setEditingId(null)
                    setFormOpen(true)
                  },
                }
              : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={visibles}
          searchKey="name"
          searchPlaceholder="Buscar paquete..."
        />
      )}

      <PackageFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={refetch}
        agencies={agencies}
        packageId={editingId}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el paquete y sus patas. Si ya se vendió alguna plaza no se va a poder
              eliminar: en ese caso, cerralo para conservar el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarBorrado}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
