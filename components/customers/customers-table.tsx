"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { MoreHorizontal, Trash2 } from "lucide-react"
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
import { QuickWhatsAppButton } from "@/components/whatsapp/quick-whatsapp-button"
import { extractCustomerName, normalizePhone } from "@/lib/customers/utils"
import { toast } from "sonner"

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  document_type: string | null
  document_number: string | null
  date_of_birth: string | null
  trips: number
  totalSpentByCurrency: Record<string, number>
  agency_id?: string
}

interface CustomersTableProps {
  initialFilters: { search: string }
}

export function CustomersTable({ initialFilters }: CustomersTableProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(initialFilters)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.append("search", filters.search)

      const url = `/api/customers?${params.toString()}`
      console.log("[CustomersTable] Fetching:", url)
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        console.log("[CustomersTable] Response:", { 
          customersCount: data.customers?.length || 0,
          total: data.pagination?.total || 0 
        })
        setCustomers(data.customers || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error("[CustomersTable] Error:", response.status, errorData)
        toast.error("Error al cargar clientes")
        setCustomers([])
      }
    } catch (error) {
      console.error("[CustomersTable] Exception:", error)
      toast.error("Error al cargar clientes")
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const handleDelete = useCallback(async () => {
    if (!customerToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/customers/${customerToDelete.id}`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // El endpoint devuelve mensajes claros (ej: "tiene N operaciones asociadas")
        toast.error(data.error || "Error al eliminar cliente")
        return
      }
      toast.success("Cliente eliminado")
      setCustomerToDelete(null)
      await fetchCustomers()
    } catch (error) {
      console.error("[CustomersTable] Delete error:", error)
      toast.error("Error al eliminar cliente")
    } finally {
      setIsDeleting(false)
    }
  }, [customerToDelete, fetchCustomers])

  const columns: ColumnDef<Customer>[] = useMemo(
    () => [
      {
        accessorKey: "first_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nombre" />
        ),
        cell: ({ row }) => {
          // Extraer nombre inteligentemente del campo first_name
          const fullName = `${row.original.first_name || ""} ${row.original.last_name || ""}`.trim()
          const extractedName = extractCustomerName(fullName || row.original.first_name || "")
          return (
            <div className="font-medium">
              {extractedName || fullName || "-"}
          </div>
          )
        },
      },
      {
        accessorKey: "phone",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Teléfono" />
        ),
        cell: ({ row }) => {
          const normalizedPhone = normalizePhone(row.original.phone)
          const fullName = `${row.original.first_name || ""} ${row.original.last_name || ""}`.trim()
          const customerName = extractCustomerName(fullName || row.original.first_name || "")
          
          if (!normalizedPhone) {
            return <div className="text-muted-foreground">-</div>
          }
          
          return (
          <div className="flex items-center gap-2">
              <span>{normalizedPhone}</span>
              <QuickWhatsAppButton
                phone={normalizedPhone}
                customerName={customerName || fullName}
                customerId={row.original.id}
                agencyId={row.original.agency_id || ""}
                variant="icon"
                size="icon"
              />
          </div>
          )
        },
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Email" />
        ),
        cell: ({ row }) => <div className="lowercase">{row.original.email}</div>,
      },
      {
        id: "document",
        header: "Documento",
        cell: ({ row }) => (
          <div>
            {row.original.document_type && row.original.document_number
              ? `${row.original.document_type} ${row.original.document_number}`
              : "-"}
          </div>
        ),
      },
      {
        accessorKey: "date_of_birth",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Fecha Nac." />
        ),
        cell: ({ row }) => {
          const dob = row.original.date_of_birth
          if (!dob) return <div className="text-muted-foreground">-</div>
          try {
            const d = new Date(dob)
            return <div>{`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`}</div>
          } catch {
            return <div className="text-muted-foreground">-</div>
          }
        },
      },
      {
        accessorKey: "trips",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Viajes" />
        ),
        cell: ({ row }) => <div>{row.original.trips || 0}</div>,
      },
      {
        id: "totalSpent",
        enableSorting: false,
        header: "Total Gastado",
        cell: ({ row }) => {
          const entries = Object.entries(row.original.totalSpentByCurrency || {})
            .filter(([, v]) => v > 0)
          if (entries.length === 0) return <div>-</div>
          return (
            <div className="space-y-0.5">
              {entries.map(([cur, amt]) => (
                <div key={cur}>
                  {cur} {amt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
              ))}
            </div>
          )
        },
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const customer = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href={`/customers/${customer.id}`}>Ver detalles</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={(e) => {
                    e.preventDefault()
                    setCustomerToDelete(customer)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

  if (loading) {
    return (
      <div className="rounded-md border">
        <div className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const customerName = customerToDelete
    ? `${customerToDelete.first_name || ""} ${customerToDelete.last_name || ""}`.trim() || "este cliente"
    : ""

  return (
    <>
      <DataTable
        columns={columns}
        data={customers}
        // No usar searchKey aquí porque ya hay un filtro de búsqueda arriba
      />
      <AlertDialog
        open={!!customerToDelete}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setCustomerToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {customerName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el cliente tiene operaciones
              asociadas, el sistema va a impedir el borrado y vas a ver un
              mensaje explicativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

