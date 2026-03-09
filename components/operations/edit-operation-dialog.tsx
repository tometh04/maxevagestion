"use client"

import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const operationSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  seller_id: z.string().min(1, "El vendedor es requerido"),
  seller_secondary_id: z.string().optional().nullable(),
  commission_split: z.coerce.number().min(0).max(100).optional().nullable(),
  operator_id: z.string().optional().nullable(),
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED", "ASSISTANCE"]),
  origin: z.string().optional(),
  destination: z.string().min(1, "El destino es requerido"),
  departure_date: z.date({
    required_error: "La fecha de salida es requerida",
  }),
  return_date: z.date().optional().nullable(),
  adults: z.coerce.number().min(1, "Debe haber al menos 1 adulto"),
  children: z.coerce.number().min(0),
  infants: z.coerce.number().min(0),
  status: z.enum(["RESERVED", "CONFIRMED", "CANCELLED", "TRAVELLING", "TRAVELLED"]),
  sale_amount_total: z.coerce.number().min(0, "El monto debe ser mayor a 0"),
  operator_cost: z.coerce.number().min(0, "El costo debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  reservation_code_air: z.string().optional().nullable(),
  reservation_code_hotel: z.string().optional().nullable(),
})

type OperationFormValues = z.infer<typeof operationSchema>

const operationTypeOptions = [
  { value: "FLIGHT", label: "Vuelo" },
  { value: "HOTEL", label: "Hotel" },
  { value: "PACKAGE", label: "Paquete" },
  { value: "CRUISE", label: "Crucero" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "MIXED", label: "Mixto" },
  { value: "ASSISTANCE", label: "Asistencia al Viajero" },
]

const standardStatusOptions = [
  { value: "RESERVED", label: "Reservado", color: "bg-blue-500" },
  { value: "CONFIRMED", label: "Confirmado", color: "bg-green-500" },
  { value: "CANCELLED", label: "Cancelado", color: "bg-red-500" },
  { value: "TRAVELLING", label: "En viaje", color: "bg-orange-500" },
  { value: "TRAVELLED", label: "Viajado", color: "bg-purple-500" },
]

interface Operation {
  id: string
  agency_id: string
  seller_id: string
  seller_secondary_id?: string | null
  commission_split?: number | null
  operator_id?: string | null
  type: string
  origin?: string | null
  destination: string
  departure_date: string
  return_date?: string | null
  adults: number
  children: number
  infants: number
  status: string
  sale_amount_total: number
  operator_cost: number
  currency: string
  margin_amount?: number
  margin_percentage?: number
  reservation_code_air?: string | null
  reservation_code_hotel?: string | null
}

interface EditOperationDialogProps {
  operation: Operation
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  userRole?: string
}

export function EditOperationDialog({
  operation,
  open,
  onOpenChange,
  onSuccess,
  agencies,
  sellers,
  operators,
  userRole,
}: EditOperationDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Estado para crear nuevo operador
  const [showNewOperatorDialog, setShowNewOperatorDialog] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState("")
  const [newOperatorEmail, setNewOperatorEmail] = useState("")
  const [creatingOperator, setCreatingOperator] = useState(false)
  const [localOperators, setLocalOperators] = useState(operators)
  const [customStatuses, setCustomStatuses] = useState<Array<{ value: string; label: string; color?: string }>>([])

  // Estado para múltiples operadores
  type OperatorEntry = { operator_id: string; cost: number; cost_currency: "ARS" | "USD"; product_type?: string; notes?: string; id?: string }
  const [useMultipleOperators, setUseMultipleOperators] = useState(false)
  const [operatorList, setOperatorList] = useState<OperatorEntry[]>([])
  const [operatorsLoaded, setOperatorsLoaded] = useState(false)

  // Cargar estados personalizados
  useEffect(() => {
    const loadCustomStatuses = async () => {
      try {
        const response = await fetch("/api/operations/settings")
        if (response.ok) {
          const data = await response.json()
          if (data.settings?.custom_statuses) {
            setCustomStatuses(data.settings.custom_statuses)
          }
        }
      } catch (error) {
        console.error("Error loading custom statuses:", error)
      }
    }
    loadCustomStatuses()
  }, [])

  // Combinar estados estándar con personalizados
  const statusOptions = useMemo(() => {
    return [...standardStatusOptions, ...customStatuses.map(s => ({ value: s.value, label: s.label, color: s.color || "bg-gray-500" }))]
  }, [customStatuses])

  // Sincronizar operadores cuando cambian
  useEffect(() => {
    setLocalOperators(operators)
  }, [operators])

  // Cargar operation_operators existentes al abrir el dialog
  useEffect(() => {
    if (!open || operatorsLoaded) return
    const loadOperators = async () => {
      try {
        const res = await fetch(`/api/operations/${operation.id}`)
        if (res.ok) {
          const data = await res.json()
          const opOps = data.operation?.operation_operators || []
          if (opOps.length > 0) {
            const mapped: OperatorEntry[] = opOps.map((oo: any) => ({
              id: oo.id,
              operator_id: oo.operator_id || "",
              cost: Number(oo.cost || 0),
              cost_currency: (oo.cost_currency || "USD") as "ARS" | "USD",
              product_type: oo.product_type || undefined,
              notes: oo.notes || undefined,
            }))
            setOperatorList(mapped)
            setUseMultipleOperators(true)
          }
        }
      } catch (err) {
        console.error("Error loading operation operators:", err)
      }
      setOperatorsLoaded(true)
    }
    loadOperators()
  }, [open, operation.id, operatorsLoaded])

  // Reset operatorsLoaded when dialog closes
  useEffect(() => {
    if (!open) {
      setOperatorsLoaded(false)
      setOperatorList([])
      setUseMultipleOperators(false)
    }
  }, [open])

  const form = useForm<OperationFormValues>({
    resolver: zodResolver(operationSchema) as any,
    defaultValues: {
      agency_id: operation.agency_id || "",
      seller_id: operation.seller_id || "",
      seller_secondary_id: operation.seller_secondary_id || null,
      commission_split: operation.commission_split ?? 50,
      operator_id: operation.operator_id || null,
      type: (operation.type as any) || "PACKAGE",
      origin: operation.origin || "",
      destination: operation.destination || "",
      departure_date: operation.departure_date ? new Date(operation.departure_date) : undefined,
      return_date: operation.return_date ? new Date(operation.return_date) : null,
      adults: operation.adults || 1,
      children: operation.children || 0,
      infants: operation.infants || 0,
      status: (operation.status as any) || "RESERVED",
      sale_amount_total: operation.sale_amount_total || 0,
      operator_cost: operation.operator_cost || 0,
      currency: (operation.currency as any) || "USD",
      reservation_code_air: operation.reservation_code_air || null,
      reservation_code_hotel: operation.reservation_code_hotel || null,
    },
  })

  // Reset form when operation changes
  useEffect(() => {
    if (operation) {
      form.reset({
        agency_id: operation.agency_id || "",
        seller_id: operation.seller_id || "",
        seller_secondary_id: operation.seller_secondary_id || null,
        commission_split: operation.commission_split ?? 50,
        operator_id: operation.operator_id || null,
        type: (operation.type as any) || "PACKAGE",
        origin: operation.origin || "",
        destination: operation.destination || "",
        departure_date: operation.departure_date ? new Date(operation.departure_date) : undefined,
        return_date: operation.return_date ? new Date(operation.return_date) : null,
        adults: operation.adults || 1,
        children: operation.children || 0,
        infants: operation.infants || 0,
        status: (operation.status as any) || "RESERVED",
        sale_amount_total: operation.sale_amount_total || 0,
        operator_cost: operation.operator_cost || 0,
        currency: (operation.currency as any) || "USD",
        reservation_code_air: operation.reservation_code_air || null,
        reservation_code_hotel: operation.reservation_code_hotel || null,
      })
    }
  }, [operation, form])

  // Watch values for margin calculation
  const saleAmount = form.watch("sale_amount_total")
  const operatorCost = form.watch("operator_cost")
  const currentStatus = form.watch("status")

  // Calculate margin in real-time
  const marginInfo = useMemo(() => {
    const margin = (saleAmount || 0) - (operatorCost || 0)
    const percentage = saleAmount > 0 ? (margin / saleAmount) * 100 : 0
    return {
      amount: margin,
      percentage: percentage,
      isPositive: margin >= 0,
    }
  }, [saleAmount, operatorCost])

  // Funciones de múltiples operadores
  const addOperator = () => {
    setOperatorList([...operatorList, { operator_id: "", cost: 0, cost_currency: "USD", product_type: undefined }])
  }

  const removeOperator = (index: number) => {
    setOperatorList(operatorList.filter((_, i) => i !== index))
  }

  const updateOperatorField = (index: number, field: string, value: any) => {
    const updated = [...operatorList]
    updated[index] = { ...updated[index], [field]: value }
    setOperatorList(updated)
  }

  const totalOperatorCost = useMemo(() => {
    return operatorList.reduce((sum, op) => sum + (op.cost || 0), 0)
  }, [operatorList])

  // Actualizar operator_cost del form cuando cambia totalOperatorCost
  useEffect(() => {
    if (useMultipleOperators && operatorList.length > 0) {
      form.setValue("operator_cost", totalOperatorCost)
    }
  }, [totalOperatorCost, useMultipleOperators, operatorList.length, form])

  // Función para crear nuevo operador
  const handleCreateOperator = async () => {
    if (!newOperatorName.trim()) {
      toast.error("El nombre del operador es requerido")
      return
    }

    setCreatingOperator(true)
    try {
      const response = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOperatorName.trim(),
          contact_email: newOperatorEmail.trim() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear operador")
      }

      const data = await response.json()
      const newOperator = data.operator || data

      // Agregar a la lista local y seleccionarlo
      setLocalOperators(prev => [...prev, newOperator])
      form.setValue("operator_id", newOperator.id)
      
      toast.success(`Operador ${newOperator.name} creado exitosamente`)

      // Limpiar y cerrar
      setNewOperatorName("")
      setNewOperatorEmail("")
      setShowNewOperatorDialog(false)
    } catch (error) {
      console.error("Error creating operator:", error)
      toast.error(error instanceof Error ? error.message : "Error al crear operador")
    } finally {
      setCreatingOperator(false)
    }
  }

  const onSubmit = async (values: OperationFormValues) => {
    setIsLoading(true)
    try {
      // Preparar payload con operadores si estamos en modo multi
      const payload: any = {
        ...values,
        operator_id: values.operator_id || null,
        seller_secondary_id: values.seller_secondary_id || null,
        commission_split: values.commission_split ?? 50,
        origin: values.origin || null,
        return_date: values.return_date ? values.return_date.toISOString().split("T")[0] : null,
        departure_date: values.departure_date.toISOString().split("T")[0],
      }

      if (useMultipleOperators && operatorList.length > 0) {
        payload.operators = operatorList.map(op => ({
          operator_id: op.operator_id,
          cost: op.cost,
          cost_currency: op.cost_currency || "USD",
          product_type: op.product_type || null,
          notes: op.notes || null,
        }))
        // El operador principal es el primero de la lista
        payload.operator_id = operatorList[0].operator_id || null
        payload.operator_cost = totalOperatorCost
      }

      const response = await fetch(`/api/operations/${operation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar operación")
      }

      toast.success("Operación actualizada correctamente")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating operation:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar operación")
    } finally {
      setIsLoading(false)
    }
  }

  const currentStatusOption = statusOptions.find(s => s.value === currentStatus)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Operación</DialogTitle>
          <DialogDescription>
            Modificar los datos de la operación #{operation.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        {/* Margin Preview Card */}
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Estado Actual</p>
                  <Badge className={cn("mt-1", currentStatusOption?.color)}>
                    {currentStatusOption?.label}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Margen Calculado</p>
                <p className={cn(
                  "text-2xl font-bold",
                  marginInfo.isPositive ? "text-green-600" : "text-red-600"
                )}>
                  {form.watch("currency")} {marginInfo.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className={cn(
                  "text-sm",
                  marginInfo.isPositive ? "text-green-600" : "text-red-600"
                )}>
                  ({marginInfo.percentage.toFixed(1)}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="agency_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agencia *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar agencia" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {agencies.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            {agency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seller_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor Principal *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar vendedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sellers.map((seller) => (
                          <SelectItem key={seller.id} value={seller.id}>
                            {seller.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Split de comisión - solo visible con vendedor secundario y para roles permitidos */}
              {form.watch("seller_secondary_id") && form.watch("seller_secondary_id") !== "none" && (
                ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole || "") ? (
                  <FormField
                    control={form.control}
                    name="commission_split"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Split comisión (% vendedor principal)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={field.value ?? 50}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Principal: {field.value ?? 50}% · Secundario: {100 - (field.value ?? 50)}%
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Split comisión: {form.watch("commission_split") ?? 50}% / {100 - (form.watch("commission_split") ?? 50)}%
                  </div>
                )
              )}
            </div>

            {/* Toggle múltiples operadores */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="editUseMultipleOperators"
                checked={useMultipleOperators}
                onChange={(e) => {
                  setUseMultipleOperators(e.target.checked)
                  if (!e.target.checked) {
                    setOperatorList([])
                  }
                }}
                className="rounded"
              />
              <label htmlFor="editUseMultipleOperators" className="text-sm font-medium cursor-pointer">
                Usar múltiples operadores
              </label>
            </div>

            {useMultipleOperators ? (
              <div className="space-y-4 border rounded-lg p-5 mb-4 bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold">Operadores</h4>
                    <p className="text-xs text-muted-foreground mt-1">Agrega operadores y especifica el tipo de producto para cada uno</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOperator}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Operador
                  </Button>
                </div>

                <div className="space-y-3">
                  {operatorList.map((op, index) => (
                    <div key={index} className="bg-background border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-muted-foreground">Operador #{index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOperator(index)}
                          className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Operador *</label>
                          <div className="flex gap-2">
                            <Select
                              value={op.operator_id}
                              onValueChange={(value) => updateOperatorField(index, "operator_id", value)}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Seleccionar operador" />
                              </SelectTrigger>
                              <SelectContent>
                                {localOperators.map((operator) => (
                                  <SelectItem key={operator.id} value={operator.id}>
                                    {operator.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="shrink-0"
                              onClick={() => setShowNewOperatorDialog(true)}
                              title="Crear nuevo operador"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Tipo de Producto</label>
                          <Select
                            value={op.product_type || ""}
                            onValueChange={(value) => updateOperatorField(index, "product_type", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {operationTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Costo *</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={op.cost || ""}
                            onChange={(e) => updateOperatorField(index, "cost", e.target.value === "" ? 0 : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            placeholder="0.00"
                            className="h-9 text-base font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Moneda</label>
                          <Select
                            value={op.cost_currency || "USD"}
                            onValueChange={(value) => updateOperatorField(index, "cost_currency", value as "ARS" | "USD")}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ARS">ARS</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {operatorList.length > 0 && (
                  <div className="pt-4 mt-4 border-t bg-background/50 rounded-md p-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">Costo Total de Operadores:</span>
                      <span className="font-bold">{form.watch("currency")} {totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                {operatorList.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground">No hay operadores agregados</p>
                    <p className="text-xs text-muted-foreground mt-1">Haz clic en &quot;Agregar Operador&quot; para comenzar</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="operator_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operador</FormLabel>
                      <div className="flex gap-2">
                        <Select
                          onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Sin operador" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Sin operador</SelectItem>
                            {localOperators.map((operator) => (
                              <SelectItem key={operator.id} value={operator.id}>
                                {operator.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowNewOperatorDialog(true)}
                          title="Crear nuevo operador"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {operationTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origen</FormLabel>
                    <FormControl>
                      <Input placeholder="Ciudad de origen" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destino *</FormLabel>
                    <SearchableCombobox
                      value={field.value || ""}
                      onChange={(value) => field.onChange(value || "")}
                      placeholder="Ciudad de destino..."
                      searchPlaceholder="Buscar aeropuerto o ciudad..."
                      emptyMessage="No se encontraron resultados"
                      initialLabel={field.value || ""}
                      searchFn={async (query) => {
                        if (!query || query.length < 2) return []
                        // Siempre incluir lo que el usuario escribió como primera opción (fallback libre)
                        const options: ComboboxOption[] = [
                          { value: query, label: query, subtitle: "Usar como destino" },
                        ]
                        try {
                          const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`)
                          if (res.ok) {
                            const data: Array<{ code: string; name: string; city: string; country: string }> = await res.json()
                            for (const airport of data) {
                              options.push({
                                value: airport.city,
                                label: `${airport.code} — ${airport.city}`,
                                subtitle: `${airport.name}, ${airport.country}`,
                              })
                            }
                          }
                        } catch {
                          // silencioso — igual tenemos la opción de texto libre
                        }
                        return options
                      }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="departure_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{form.watch("type") === "ASSISTANCE" ? "Inicio de Cobertura *" : "Fecha de Salida *"}</FormLabel>
                        <FormControl>
                      <DateInputWithCalendar
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="dd/MM/yyyy"
                      />
                        </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="return_date"
                render={({ field }) => {
                  const departureDate = form.watch("departure_date")
                  return (
                  <FormItem className="flex flex-col">
                    <FormLabel>{form.watch("type") === "ASSISTANCE" ? "Fin de Cobertura" : "Fecha de Regreso"}</FormLabel>
                        <FormControl>
                        <DateInputWithCalendar
                          value={field.value || undefined}
                          onChange={field.onChange}
                          placeholder="dd/MM/yyyy"
                          minDate={departureDate}
                        />
                      </FormControl>
                    <FormMessage />
                  </FormItem>
                  )
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                control={form.control}
                name="adults"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adultos</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="children"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Children</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="infants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Infantes</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ARS">ARS</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sale_amount_total"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto de Venta *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                        onFocus={(e) => e.target.select()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {useMultipleOperators ? (
                <div>
                  <label className="text-sm font-medium">Costo Total (Calculado)</label>
                  <Input
                    type="text"
                    value={totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    disabled
                    className="bg-muted mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Suma automática de todos los operadores
                  </p>
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="operator_cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo de Operador *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Códigos de Reserva */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Códigos de Reserva</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="reservation_code_air"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código de Reserva Aéreo</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: ABC123"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reservation_code_hotel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código de Reserva Hotel</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: XYZ789"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {/* Diálogo para crear nuevo operador */}
      <Dialog open={showNewOperatorDialog} onOpenChange={setShowNewOperatorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Operador</DialogTitle>
            <DialogDescription>
              Crea un nuevo operador/proveedor para asignarlo a esta operación
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-operator-name">Nombre del operador *</Label>
              <Input
                id="edit-operator-name"
                placeholder="Ej: Despegar, Booking, etc."
                value={newOperatorName}
                onChange={(e) => setNewOperatorName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-operator-email">Email (opcional)</Label>
              <Input
                id="edit-operator-email"
                type="email"
                placeholder="contacto@operador.com"
                value={newOperatorEmail}
                onChange={(e) => setNewOperatorEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowNewOperatorDialog(false)
                setNewOperatorName("")
                setNewOperatorEmail("")
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateOperator}
              disabled={creatingOperator || !newOperatorName.trim()}
            >
              {creatingOperator ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear Operador"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

