"use client"

import { useState, useEffect } from "react"
import * as React from "react"
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
import { CalendarIcon, Plus, Trash2, AlertCircle, Loader2 } from "lucide-react"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog"

// Configuración de operaciones
interface OperationSettings {
  require_destination: boolean
  require_departure_date: boolean
  require_operator: boolean
  require_customer: boolean
  default_status: string
  custom_statuses: Array<{ value: string; label: string; color: string }>
}

const operatorSchema = z.object({
  operator_id: z.string().min(1, "El operador es requerido"),
  cost: z.coerce.number().min(0, "El costo debe ser mayor o igual a 0"),
  cost_currency: z.enum(["ARS", "USD"]).default("USD").optional(),
  product_type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED"]).optional(),
  notes: z.string().optional(),
})

// Esquema base - las validaciones dinámicas se hacen en el backend
const operationSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  seller_id: z.string().min(1, "El vendedor es requerido"),
  seller_secondary_id: z.string().optional().nullable(),
  operator_id: z.string().optional().nullable(),
  operators: z.array(operatorSchema).optional(),
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED"]),
  customer_id: z.string().optional().nullable(),
  origin: z.string().optional(),
  destination: z.string().optional(), // Validación dinámica en backend
  departure_date: z.date().optional(), // Validación dinámica en backend
  return_date: z.date().optional().nullable(),
  adults: z.coerce.number().min(1, "Debe haber al menos 1 adulto"),
  children: z.coerce.number().min(0).default(0).optional(),
  infants: z.coerce.number().min(0).default(0).optional(),
  status: z.string(), // Puede incluir estados personalizados
  sale_amount_total: z.coerce.number().min(0, "El monto debe ser mayor a 0"),
  operator_cost: z.coerce.number().min(0, "El costo debe ser mayor a 0").optional(),
  currency: z.enum(["ARS", "USD"]).default("USD").optional(),
  sale_currency: z.enum(["ARS", "USD"]).default("USD").optional(),
  operator_cost_currency: z.enum(["ARS", "USD"]).default("USD").optional(),
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
]

interface NewOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
}

export function NewOperationDialog({
  open,
  onOpenChange,
  onSuccess,
  agencies,
  sellers,
  operators,
  defaultAgencyId,
  defaultSellerId,
}: NewOperationDialogProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [useMultipleOperators, setUseMultipleOperators] = useState(false)
  const [operatorList, setOperatorList] = useState<Array<{operator_id: string, cost: number, cost_currency: "ARS" | "USD", product_type?: "FLIGHT" | "HOTEL" | "PACKAGE" | "CRUISE" | "TRANSFER" | "MIXED", notes?: string}>>([])
  const [settings, setSettings] = useState<OperationSettings | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [pendingClose, setPendingClose] = useState(false)
  
  // Estado para crear nuevo operador
  const [showNewOperatorDialog, setShowNewOperatorDialog] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState("")
  const [newOperatorEmail, setNewOperatorEmail] = useState("")
  const [creatingOperator, setCreatingOperator] = useState(false)
  const [localOperators, setLocalOperators] = useState(operators)
  
  // Estado para clientes
  const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)

  // Sincronizar operadores cuando cambian
  useEffect(() => {
    setLocalOperators(operators)
  }, [operators])

  // Cargar configuración de operaciones
  useEffect(() => {
    if (open) {
      loadSettings()
      loadCustomers()
    }
  }, [open])

  // Cargar lista de clientes
  const loadCustomers = async () => {
    setLoadingCustomers(true)
    try {
      const response = await fetch('/api/customers?limit=200')
      if (response.ok) {
        const data = await response.json()
        setCustomers((data.customers || []).map((c: any) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
        })))
      }
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoadingCustomers(false)
    }
  }

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/operations/settings')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      }
    } catch (error) {
      console.error('Error loading operation settings:', error)
    }
  }

  // Estados disponibles (estándar + personalizados)
  const availableStatuses = React.useMemo(() => {
    const standard = [
      { value: "RESERVED", label: "Reservado" },
      { value: "CONFIRMED", label: "Confirmado" },
      { value: "CANCELLED", label: "Cancelado" },
      { value: "TRAVELLING", label: "En viaje" },
      { value: "TRAVELLED", label: "Viajado" },
    ]
    if (settings?.custom_statuses && settings.custom_statuses.length > 0) {
      return [...standard, ...settings.custom_statuses.map(s => ({ value: s.value, label: s.label }))]
    }
    return standard
  }, [settings])

  const form = useForm<OperationFormValues>({
    resolver: zodResolver(operationSchema),
    defaultValues: {
      agency_id: defaultAgencyId || "",
      seller_id: defaultSellerId || "",
      operator_id: null,
      seller_secondary_id: null,
      type: "PACKAGE",
      customer_id: null,
      origin: "",
      destination: "",
      departure_date: undefined,
      return_date: undefined,
      adults: 2,
      children: 0,
      infants: 0,
      status: settings?.default_status || "RESERVED",
      sale_amount_total: 0,
      operator_cost: 0,
      currency: "USD",
      sale_currency: "USD",
      operator_cost_currency: "USD",
      reservation_code_air: null,
      reservation_code_hotel: null,
      operators: [],
    },
  })

  // Actualizar estado por defecto cuando se carga la configuración
  useEffect(() => {
    if (settings?.default_status) {
      form.setValue('status', settings.default_status)
    }
  }, [settings, form])

  // Calcular costo total de operadores
  const totalOperatorCost = operatorList.reduce((sum, op) => sum + (op.cost || 0), 0)
  const saleAmount = form.watch("sale_amount_total")
  const calculatedMargin = saleAmount - totalOperatorCost
  const calculatedMarginPercent = saleAmount > 0 ? (calculatedMargin / saleAmount) * 100 : 0

  // Actualizar operator_cost cuando cambia la lista de operadores
  React.useEffect(() => {
    if (useMultipleOperators && operatorList.length > 0) {
      form.setValue("operator_cost", totalOperatorCost)
      // Asegurar que cost_currency tenga un valor por defecto
      const operatorsWithDefaults = operatorList.map(op => ({
        ...op,
        cost_currency: (op.cost_currency || "USD") as "ARS" | "USD"
      }))
      form.setValue("operators", operatorsWithDefaults)
    } else if (!useMultipleOperators) {
      form.setValue("operators", undefined)
    }
  }, [operatorList, useMultipleOperators, totalOperatorCost, form])

  const addOperator = () => {
    setOperatorList([...operatorList, { operator_id: "", cost: 0, cost_currency: "USD", product_type: undefined }])
  }

  const removeOperator = (index: number) => {
    setOperatorList(operatorList.filter((_, i) => i !== index))
  }

  const updateOperator = (index: number, field: string, value: any) => {
    const updated = [...operatorList]
    updated[index] = { ...updated[index], [field]: value }
    setOperatorList(updated)
  }

  // Función para crear nuevo operador
  const handleCreateOperator = async () => {
    if (!newOperatorName.trim()) {
      toast({
        title: "Error",
        description: "El nombre del operador es requerido",
        variant: "destructive",
      })
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
      
      toast({
        title: "Operador creado",
        description: `${newOperator.name} ha sido creado exitosamente`,
      })

      // Limpiar y cerrar
      setNewOperatorName("")
      setNewOperatorEmail("")
      setShowNewOperatorDialog(false)
    } catch (error) {
      console.error("Error creating operator:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al crear operador",
        variant: "destructive",
      })
    } finally {
      setCreatingOperator(false)
    }
  }

  const onSubmit = async (values: OperationFormValues) => {
    setIsLoading(true)
    setApiError(null)
    try {
      // Si se usan múltiples operadores, enviar el array; si no, usar formato antiguo
      const requestBody: any = {
        ...values,
        operator_id: useMultipleOperators ? null : (values.operator_id || null),
        operators: useMultipleOperators && operatorList.length > 0 ? operatorList : undefined,
        seller_secondary_id: values.seller_secondary_id || null,
        origin: values.origin || null,
        customer_id: values.customer_id || null,
        return_date: values.return_date ? values.return_date.toISOString().split("T")[0] : null,
        checkin_date: null,
        checkout_date: null,
        departure_date: values.departure_date ? values.departure_date.toISOString().split("T")[0] : null,
        sale_currency: values.sale_currency || values.currency || "USD",
        operator_cost_currency: values.operator_cost_currency || values.currency || "USD",
        // Si hay múltiples operadores, el costo total ya está calculado en operator_cost
        operator_cost: useMultipleOperators ? totalOperatorCost : (values.operator_cost || 0),
      }

      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error || "Error al crear operación"
        setApiError(errorMessage)
        toast({
          title: "Error de validación",
          description: errorMessage,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Operación creada",
        description: "La operación se ha creado correctamente",
      })
      onSuccess()
      onOpenChange(false)
      form.reset()
      setOperatorList([])
      setUseMultipleOperators(false)
      setApiError(null)
    } catch (error) {
      console.error("Error creating operation:", error)
      const errorMessage = error instanceof Error ? error.message : "Error al crear operación"
      setApiError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && open) {
      // Si se intenta cerrar, mostrar confirmación
      setShowCloseConfirm(true)
      setPendingClose(true)
    } else {
      onOpenChange(newOpen)
    }
  }

  const handleConfirmClose = () => {
    setShowCloseConfirm(false)
        setApiError(null)
    form.reset()
    setOperatorList([])
    setUseMultipleOperators(false)
    onOpenChange(false)
    setPendingClose(false)
  }

  const handleCancelClose = () => {
    setShowCloseConfirm(false)
    setPendingClose(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent 
          className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
        <DialogHeader>
          <DialogTitle>Nueva Operación</DialogTitle>
          <DialogDescription>Crear una nueva operación manualmente</DialogDescription>
        </DialogHeader>

        {/* Mostrar error del API */}
        {apiError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{apiError}</AlertDescription>
          </Alert>
        )}

        {/* Indicadores de campos requeridos según configuración */}
        {settings && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
            <span className="font-medium">Campos requeridos:</span>{" "}
            {settings.require_destination && <span className="mr-2">• Destino</span>}
            {settings.require_departure_date && <span className="mr-2">• Fecha de salida</span>}
            {settings.require_operator && <span className="mr-2">• Operador</span>}
            {settings.require_customer && <span className="mr-2">• Cliente</span>}
          </div>
        )}

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
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente {settings?.require_customer && <span className="text-red-500">*</span>}</FormLabel>
                    <div className="flex gap-2">
                    <Select
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                      value={field.value || "none"}
                        disabled={loadingCustomers}
                    >
                      <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={loadingCustomers ? "Cargando..." : "Sin cliente"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                          <SelectItem value="none">Sin cliente</SelectItem>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.first_name} {customer.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowNewCustomerDialog(true)}
                        title="Crear nuevo cliente"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seller_secondary_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor Secundario</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin vendedor secundario" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin vendedor secundario</SelectItem>
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
            </div>

            {/* Toggle entre operador único y múltiples operadores */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="useMultipleOperators"
                checked={useMultipleOperators}
                onChange={(e) => {
                  setUseMultipleOperators(e.target.checked)
                  if (!e.target.checked) {
                    setOperatorList([])
                    form.setValue("operators", undefined)
                  }
                }}
                className="rounded"
              />
              <label htmlFor="useMultipleOperators" className="text-sm font-medium cursor-pointer">
                Usar múltiples operadores
              </label>
            </div>

            {useMultipleOperators ? (
              <div className="space-y-4 border rounded-lg p-5 mb-4 bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold">Operadores Múltiples</h4>
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
                      
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="md:col-span-2">
                          <label className="text-xs font-medium mb-1.5 block">Operador *</label>
                          <div className="flex gap-2">
                        <Select
                          value={op.operator_id}
                          onValueChange={(value) => updateOperator(index, "operator_id", value)}
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
                          <label className="text-xs font-medium mb-1.5 block">Tipo de Producto *</label>
                          <Select
                            value={op.product_type || ""}
                            onValueChange={(value) => updateOperator(index, "product_type", value as "FLIGHT" | "HOTEL" | "PACKAGE" | "CRUISE" | "TRANSFER" | "MIXED")}
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

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">Costo</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={op.cost || 0}
                        onChange={(e) => updateOperator(index, "cost", Number(e.target.value))}
                        placeholder="0.00"
                              className="h-9"
                      />
                    </div>
                    <div>
                            <label className="text-xs font-medium mb-1.5 block">Moneda</label>
                      <Select
                              value={op.cost_currency || "USD"}
                        onValueChange={(value) => updateOperator(index, "cost_currency", value as "ARS" | "USD")}
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
                  </div>
                ))}
                </div>

                {operatorList.length > 0 && (
                  <div className="pt-4 mt-4 border-t bg-background/50 rounded-md p-3">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="font-medium text-muted-foreground">Costo Total de Operadores:</span>
                      <span className="font-bold">{form.watch("currency") || "USD"} {totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">Margen Calculado:</span>
                      <span className={`font-bold ${calculatedMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {form.watch("sale_currency") || form.watch("currency") || "USD"} {calculatedMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ({calculatedMarginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}

                {operatorList.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      No hay operadores agregados
                  </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Haz clic en &quot;Agregar Operador&quot; para comenzar
                    </p>
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
                      <FormLabel>Operador {settings?.require_operator && <span className="text-red-500">*</span>}</FormLabel>
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
            )}

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
                    <FormControl>
                      <Input placeholder="Ciudad de destino" {...field} />
                    </FormControl>
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
                    <FormLabel>Fecha de Salida *</FormLabel>
                        <FormControl>
                      <DateInputWithCalendar
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="dd/MM/yyyy"
                        minDate={new Date()}
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
                    <FormLabel>Fecha de Regreso</FormLabel>
                        <FormControl>
                        <DateInputWithCalendar
                          value={field.value || undefined}
                          onChange={field.onChange}
                          placeholder="dd/MM/yyyy"
                          minDate={departureDate || new Date()}
                        />
                        </FormControl>
                    <FormMessage />
                  </FormItem>
                  )
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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
                        <SelectItem value="RESERVED">Reservado</SelectItem>
                        <SelectItem value="CONFIRMED">Confirmado</SelectItem>
                        <SelectItem value="CANCELLED">Cancelado</SelectItem>
                        <SelectItem value="TRAVELLING">En viaje</SelectItem>
                        <SelectItem value="TRAVELLED">Viajado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda (Compatibilidad)</FormLabel>
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
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-4">Monedas Separadas</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sale_currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda de Venta</FormLabel>
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
                  name="operator_cost_currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda de Costo de Operador</FormLabel>
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
              </div>
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

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="sale_amount_total"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto de Venta Total *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!useMultipleOperators && (
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
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {useMultipleOperators && (
                <div className="flex items-end">
                  <div className="w-full">
                    <label className="text-sm font-medium mb-1 block">Costo Total (Calculado)</label>
                    <Input
                      type="text"
                      value={totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Suma automática de todos los operadores
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creando..." : "Crear Operación"}
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
              <Label htmlFor="new-operator-name">Nombre del operador *</Label>
              <Input
                id="new-operator-name"
                placeholder="Ej: Despegar, Booking, etc."
                value={newOperatorName}
                onChange={(e) => setNewOperatorName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-operator-email">Email (opcional)</Label>
              <Input
                id="new-operator-email"
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

      {/* Diálogo para crear nuevo cliente */}
      <NewCustomerDialog
        open={showNewCustomerDialog}
        onOpenChange={setShowNewCustomerDialog}
        onSuccess={(customer) => {
          if (customer) {
            // Agregar el nuevo cliente a la lista y seleccionarlo
            setCustomers(prev => [...prev, {
              id: customer.id,
              first_name: customer.first_name,
              last_name: customer.last_name,
            }])
            form.setValue("customer_id", customer.id)
            setShowNewCustomerDialog(false)
          }
        }}
      />
    </Dialog>

      {/* Diálogo de confirmación para cerrar */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro que quieres cerrar?</AlertDialogTitle>
            <AlertDialogDescription>
              Perderás todos los cambios no guardados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelClose}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

