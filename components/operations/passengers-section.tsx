"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Search, 
  Loader2,
  User,
  Mail,
  Phone
} from "lucide-react"
import { toast } from "sonner"
import { EmptyState } from "@/components/ui/empty-state"
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog"

interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
}

interface OperationCustomer {
  id: string
  operation_id: string
  customer_id: string
  role: "MAIN" | "COMPANION"
  customers: Customer
}

interface PassengersSectionProps {
  operationId: string
  initialCustomers?: OperationCustomer[]
  onUpdate?: () => void
}

export function PassengersSection({ 
  operationId, 
  initialCustomers = [],
  onUpdate 
}: PassengersSectionProps) {
  const [customers, setCustomers] = useState<OperationCustomer[]>(initialCustomers)
  const [loading, setLoading] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedRole, setSelectedRole] = useState<"MAIN" | "COMPANION">("COMPANION")
  const [adding, setAdding] = useState(false)
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)

  // Buscar clientes
  const searchCustomers = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/customers?search=${encodeURIComponent(query)}&limit=10`)
      const data = await response.json()
      
      // Filtrar los que ya están en la operación
      const existingIds = customers.map(c => c.customer_id)
      const filtered = (data.customers || []).filter(
        (c: Customer) => !existingIds.includes(c.id)
      )
      setSearchResults(filtered)
    } catch (error) {
      console.error("Error searching customers:", error)
    } finally {
      setSearching(false)
    }
  }, [customers])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCustomers(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchCustomers])

  // Agregar pasajero
  const handleAddPassenger = async () => {
    if (!selectedCustomer) return

    setAdding(true)
    try {
      const response = await fetch(`/api/operations/${operationId}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          role: selectedRole,
        }),
      })

      if (!response.ok) {
        throw new Error("Error al agregar pasajero")
      }

      const data = await response.json()
      
      // Agregar al estado local
      setCustomers(prev => [...prev, {
        ...data.operationCustomer,
        customers: selectedCustomer
      }])

      toast.success(`${selectedCustomer.first_name} agregado como pasajero`)
      setAddDialogOpen(false)
      setSelectedCustomer(null)
      setSearchQuery("")
      setSearchResults([])
      onUpdate?.()
    } catch (error) {
      console.error("Error adding passenger:", error)
      toast.error("Error al agregar pasajero")
    } finally {
      setAdding(false)
    }
  }

  // Quitar pasajero
  const handleRemovePassenger = async (operationCustomerId: string, customerName: string) => {
    if (!confirm(`¿Seguro que deseas quitar a ${customerName} de esta operación?`)) {
      return
    }

    try {
      const response = await fetch(`/api/operations/${operationId}/customers/${operationCustomerId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al quitar pasajero")
      }

      setCustomers(prev => prev.filter(c => c.id !== operationCustomerId))
      toast.success(`${customerName} quitado de la operación`)
      onUpdate?.()
    } catch (error) {
      console.error("Error removing passenger:", error)
      toast.error("Error al quitar pasajero")
    }
  }

  const mainPassenger = customers.find(c => c.role === "MAIN")
  const companions = customers.filter(c => c.role === "COMPANION")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Pasajeros
          </CardTitle>
          <CardDescription>
            {customers.length} pasajero{customers.length !== 1 ? "s" : ""} en esta operación
          </CardDescription>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin pasajeros"
            description="Agrega pasajeros a esta operación para llevar un registro completo."
            action={{
              label: "Agregar Pasajero",
              onClick: () => setAddDialogOpen(true)
            }}
            size="sm"
          />
        ) : (
          <div className="space-y-3">
            {/* Pasajero principal */}
            {mainPassenger && (
              <div className="p-3 rounded-lg border-2 border-primary/20 bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary text-primary-foreground">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {mainPassenger.customers.first_name} {mainPassenger.customers.last_name}
                        </span>
                        <Badge>Principal</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {mainPassenger.customers.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {mainPassenger.customers.email}
                          </span>
                        )}
                        {mainPassenger.customers.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {mainPassenger.customers.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemovePassenger(
                      mainPassenger.id, 
                      `${mainPassenger.customers.first_name} ${mainPassenger.customers.last_name}`
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Acompañantes */}
            {companions.map((companion) => (
              <div key={companion.id} className="p-3 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {companion.customers.first_name} {companion.customers.last_name}
                        </span>
                        <Badge variant="secondary">Acompañante</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {companion.customers.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {companion.customers.email}
                          </span>
                        )}
                        {companion.customers.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {companion.customers.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemovePassenger(
                      companion.id, 
                      `${companion.customers.first_name} ${companion.customers.last_name}`
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Dialog para agregar pasajero */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Pasajero</DialogTitle>
            <DialogDescription>
              Busca un cliente existente para agregarlo como pasajero.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Búsqueda */}
            <div className="space-y-2">
              <Label>Buscar cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, email o teléfono..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Botón crear cliente nuevo */}
            <div className="flex items-center justify-between">
              <Label>Buscar cliente existente</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowNewCustomerDialog(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Crear Cliente Nuevo (OCR)
              </Button>
            </div>

            {/* Resultados */}
            {searching ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCustomer?.id === customer.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className="font-medium">
                      {customer.first_name} {customer.last_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {customer.email || customer.phone}
                    </div>
                  </div>
                ))}
              </div>
            ) : searchQuery.length >= 2 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No se encontraron clientes
              </p>
            ) : null}

            {/* Rol */}
            {selectedCustomer && (
              <div className="space-y-2">
                <Label>Rol del pasajero</Label>
                <Select value={selectedRole} onValueChange={(v: "MAIN" | "COMPANION") => setSelectedRole(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAIN" disabled={!!mainPassenger}>
                      Principal {mainPassenger && "(ya existe)"}
                    </SelectItem>
                    <SelectItem value="COMPANION">Acompañante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddPassenger} 
              disabled={!selectedCustomer || adding}
            >
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Agregando...
                </>
              ) : (
                "Agregar Pasajero"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para crear cliente nuevo con OCR */}
      <NewCustomerDialog
        open={showNewCustomerDialog}
        onOpenChange={setShowNewCustomerDialog}
        onSuccess={(newCustomer) => {
          if (newCustomer) {
            // Agregar el nuevo cliente automáticamente como acompañante
            const addNewCustomer = async () => {
              try {
                const response = await fetch(`/api/operations/${operationId}/customers`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    customer_id: newCustomer.id,
                    role: selectedRole,
                  }),
                })

                if (!response.ok) {
                  throw new Error("Error al agregar cliente")
                }

                const data = await response.json()
                
                // Agregar al estado local
                setCustomers(prev => [...prev, {
                  ...data.operationCustomer,
                  customers: {
                    id: newCustomer.id,
                    first_name: newCustomer.first_name,
                    last_name: newCustomer.last_name,
                    email: newCustomer.email || "",
                    phone: newCustomer.phone || "",
                  }
                }])

                toast.success(`${newCustomer.first_name} ${newCustomer.last_name} creado y agregado como pasajero`)
                setAddDialogOpen(false)
                setSelectedCustomer(null)
                setSearchQuery("")
                setSearchResults([])
                onUpdate?.()
              } catch (error) {
                console.error("Error adding new customer:", error)
                toast.error("Cliente creado pero error al agregarlo a la operación")
              }
            }

            addNewCustomer()
            setShowNewCustomerDialog(false)
          }
        }}
      />
    </Card>
  )
}

