"use client"

import { useState } from "react"
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
import { CalendarIcon, Plus, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const operatorSchema = z.object({
  operator_id: z.string().min(1, "El operador es requerido"),
  cost: z.coerce.number().min(0, "El costo debe ser mayor o igual a 0"),
  cost_currency: z.enum(["ARS", "USD"]).default("ARS").optional(),
  notes: z.string().optional(),
})

const operationSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  seller_id: z.string().min(1, "El vendedor es requerido"),
  seller_secondary_id: z.string().optional().nullable(),
  operator_id: z.string().optional().nullable(), // Compatibilidad hacia atrás
  operators: z.array(operatorSchema).optional(), // Nuevo formato: múltiples operadores
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED"]),
  product_type: z.enum(["AEREO", "HOTEL", "PAQUETE", "CRUCERO", "OTRO"]).optional().nullable(),
  origin: z.string().optional(),
  destination: z.string().min(1, "El destino es requerido"),
  departure_date: z.date({
    required_error: "La fecha de salida es requerida",
  }),
  return_date: z.date().optional().nullable(),
  checkin_date: z.date().optional().nullable(),
  checkout_date: z.date().optional().nullable(),
  adults: z.coerce.number().min(1, "Debe haber al menos 1 adulto"),
  children: z.coerce.number().min(0).default(0).optional(),
  infants: z.coerce.number().min(0).default(0).optional(),
  status: z.enum(["PRE_RESERVATION", "RESERVED", "CONFIRMED", "CANCELLED", "TRAVELLED", "CLOSED"]),
  sale_amount_total: z.coerce.number().min(0, "El monto debe ser mayor a 0"),
  operator_cost: z.coerce.number().min(0, "El costo debe ser mayor a 0").optional(), // Opcional si se usa operators
  currency: z.enum(["ARS", "USD"]).default("ARS").optional(),
  sale_currency: z.enum(["ARS", "USD"]).default("ARS").optional(),
  operator_cost_currency: z.enum(["ARS", "USD"]).default("ARS").optional(),
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
  const [isLoading, setIsLoading] = useState(false)
  const [useMultipleOperators, setUseMultipleOperators] = useState(false)
  const [operatorList, setOperatorList] = useState<Array<{operator_id: string, cost: number, cost_currency: "ARS" | "USD", notes?: string}>>([])

  const form = useForm<OperationFormValues>({
    resolver: zodResolver(operationSchema),
    defaultValues: {
      agency_id: defaultAgencyId || "",
      seller_id: defaultSellerId || "",
      operator_id: null,
      seller_secondary_id: null,
      type: "PACKAGE",
      product_type: null,
      origin: "",
      destination: "",
      departure_date: undefined,
      return_date: undefined,
      checkin_date: undefined,
      checkout_date: undefined,
      adults: 2,
      children: 0,
      infants: 0,
      status: "PRE_RESERVATION",
      sale_amount_total: 0,
      operator_cost: 0,
      currency: "ARS",
      sale_currency: "ARS",
      operator_cost_currency: "ARS",
      operators: [],
    },
  })

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
        cost_currency: (op.cost_currency || "ARS") as "ARS" | "USD"
      }))
      form.setValue("operators", operatorsWithDefaults)
    } else if (!useMultipleOperators) {
      form.setValue("operators", undefined)
    }
  }, [operatorList, useMultipleOperators, totalOperatorCost, form])

  const addOperator = () => {
    setOperatorList([...operatorList, { operator_id: "", cost: 0, cost_currency: "ARS" }])
  }

  const removeOperator = (index: number) => {
    setOperatorList(operatorList.filter((_, i) => i !== index))
  }

  const updateOperator = (index: number, field: string, value: any) => {
    const updated = [...operatorList]
    updated[index] = { ...updated[index], [field]: value }
    setOperatorList(updated)
  }

  const onSubmit = async (values: OperationFormValues) => {
    setIsLoading(true)
    try {
      // Si se usan múltiples operadores, enviar el array; si no, usar formato antiguo
      const requestBody: any = {
        ...values,
        operator_id: useMultipleOperators ? null : (values.operator_id || null),
        operators: useMultipleOperators && operatorList.length > 0 ? operatorList : undefined,
        seller_secondary_id: values.seller_secondary_id || null,
        origin: values.origin || null,
        product_type: values.product_type || null,
        return_date: values.return_date ? values.return_date.toISOString().split("T")[0] : null,
        checkin_date: values.checkin_date ? values.checkin_date.toISOString().split("T")[0] : null,
        checkout_date: values.checkout_date ? values.checkout_date.toISOString().split("T")[0] : null,
        departure_date: values.departure_date.toISOString().split("T")[0],
        sale_currency: values.sale_currency || values.currency || "ARS",
        operator_cost_currency: values.operator_cost_currency || values.currency || "ARS",
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
        throw new Error(error.error || "Error al crear operación")
      }

      onSuccess()
      onOpenChange(false)
      form.reset()
      setOperatorList([])
      setUseMultipleOperators(false)
    } catch (error) {
      console.error("Error creating operation:", error)
      alert(error instanceof Error ? error.message : "Error al crear operación")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Operación</DialogTitle>
          <DialogDescription>Crear una nueva operación manualmente</DialogDescription>
        </DialogHeader>

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

              <FormField
                control={form.control}
                name="product_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Producto</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Se inferirá del tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="AEREO">Aéreo</SelectItem>
                        <SelectItem value="HOTEL">Hotel</SelectItem>
                        <SelectItem value="PAQUETE">Paquete</SelectItem>
                        <SelectItem value="CRUCERO">Crucero</SelectItem>
                        <SelectItem value="OTRO">Otro</SelectItem>
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
              <div className="space-y-4 border rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Operadores</h4>
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

                {operatorList.map((op, index) => (
                  <div key={index} className="grid gap-4 md:grid-cols-4 items-end border-b pb-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Operador</label>
                      <Select
                        value={op.operator_id}
                        onValueChange={(value) => updateOperator(index, "operator_id", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar operador" />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((operator) => (
                            <SelectItem key={operator.id} value={operator.id}>
                              {operator.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Costo</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={op.cost || 0}
                        onChange={(e) => updateOperator(index, "cost", Number(e.target.value))}
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Moneda</label>
                      <Select
                        value={op.cost_currency}
                        onValueChange={(value) => updateOperator(index, "cost_currency", value as "ARS" | "USD")}
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

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOperator(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {operatorList.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">Costo Total de Operadores:</span>
                      <span className="font-bold">{form.watch("currency") || "ARS"} {totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-1">
                      <span className="font-medium">Margen Calculado:</span>
                      <span className={`font-bold ${calculatedMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {form.watch("sale_currency") || form.watch("currency") || "ARS"} {calculatedMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ({calculatedMarginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}

                {operatorList.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Agrega al menos un operador para continuar
                  </p>
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
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin operador" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin operador</SelectItem>
                          {operators.map((operator) => (
                            <SelectItem key={operator.id} value={operator.id}>
                              {operator.name}
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="return_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Regreso</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="checkin_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Check-in (Hoteles)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="checkout_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Check-out (Hoteles)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
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
                    <FormLabel>Niños</FormLabel>
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
                    <FormLabel>Bebés</FormLabel>
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
                        <SelectItem value="PRE_RESERVATION">Pre-reserva</SelectItem>
                        <SelectItem value="RESERVED">Reservado</SelectItem>
                        <SelectItem value="CONFIRMED">Confirmado</SelectItem>
                        <SelectItem value="CANCELLED">Cancelado</SelectItem>
                        <SelectItem value="TRAVELLED">Viajado</SelectItem>
                        <SelectItem value="CLOSED">Cerrado</SelectItem>
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
    </Dialog>
  )
}

