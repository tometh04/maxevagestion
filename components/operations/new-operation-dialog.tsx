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
import { DecimalInput } from "@/components/ui/decimal-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Plus, Trash2, AlertCircle, Loader2, Building2, User, Plane, DollarSign, Ticket, MapPin, Users, Package } from "lucide-react"
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
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox"

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
  product_type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED", "ASSISTANCE"]).optional(),
  notes: z.string().optional(),
})

// Esquema base - las validaciones dinámicas se hacen en el backend
const operationSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  seller_id: z.string().min(1, "El vendedor es requerido"),
  seller_secondary_id: z.string().optional().nullable(),
  commission_split: z.coerce.number().min(0).max(100).optional().nullable(),
  // Overrides absolutos (29/04 — Tomi opción B). Suma ≤ pct comisión del principal.
  commission_pct_primary: z.coerce.number().min(0).max(100).optional().nullable(),
  commission_pct_secondary: z.coerce.number().min(0).max(100).optional().nullable(),
  operator_id: z.string().optional().nullable(),
  operators: z.array(operatorSchema).optional(),
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED", "ASSISTANCE"]),
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
  airline_name: z.string().optional().nullable(),
  hotel_name: z.string().optional().nullable(),
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

// Estados de leads que NO son destinos
const leadStatusKeywords = [
  "presupuesto", "enviado", "nuevo", "contactado", "calificado",
  "negociacion", "negociación", "ganado", "perdido", "pendiente",
  "seguimiento", "cerrado", "cancelado", "won", "lost", "new",
  "contacted", "qualified", "negotiation", "closed"
]

// Función para limpiar destino de lead (si no es un destino válido)
function cleanDestination(destination: string): string {
  if (!destination) return ""
  
  const destLower = destination.toLowerCase().trim()
  
  // Verificar si es un estado de lead
  for (const status of leadStatusKeywords) {
    if (destLower.includes(status)) {
      return ""
    }
  }
  
  // Si parece un usuario de Instagram, email o algo raro, ignorar
  const invalidPatterns = [
    /^@/, // Instagram handle
    /@.*\.com$/, // Email
    /^[a-z0-9_]+$/, // Solo letras minúsculas y guiones bajos (username)
    /^\d+$/, // Solo números
  ]
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(destLower)) {
      return ""
    }
  }
  
  // Si es muy corto o muy largo, probablemente no es un destino
  if (destination.length < 3 || destination.length > 50) {
    return ""
  }
  
  // Si contiene números o caracteres raros, limpiar
  if (/\d/.test(destination) || /[^a-záéíóúüñ\s]/i.test(destination)) {
    return ""
  }
  
  return destination
}

interface LeadData {
  id: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  destination?: string | null
  agency_id?: string | null
  assigned_seller_id?: string | null
  notes?: string | null
}

interface NewOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (operationId?: string) => void // Ahora puede recibir el ID de la operación creada
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string; default_commission_percentage?: number | null }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
  lead?: LeadData // Prop opcional para convertir lead a operación
  userRole?: string
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
  lead,
  userRole,
}: NewOperationDialogProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [useMultipleOperators, setUseMultipleOperators] = useState(false)
  const [operatorList, setOperatorList] = useState<Array<{operator_id: string, cost: number, cost_currency: "ARS" | "USD", product_type?: "FLIGHT" | "HOTEL" | "PACKAGE" | "CRUISE" | "TRANSFER" | "MIXED", notes?: string}>>([])
  const [settings, setSettings] = useState<OperationSettings | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [pendingClose, setPendingClose] = useState(false)
  
  // Estado para alerta de moneda incorrecta
  const [showCurrencyWarning, setShowCurrencyWarning] = useState(false)
  const [currencyWarningMessage, setCurrencyWarningMessage] = useState("")
  const [pendingSubmitValues, setPendingSubmitValues] = useState<OperationFormValues | null>(null)

  // Estado para crear nuevo operador
  const [showNewOperatorDialog, setShowNewOperatorDialog] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState("")
  const [newOperatorEmail, setNewOperatorEmail] = useState("")
  const [creatingOperator, setCreatingOperator] = useState(false)
  const [localOperators, setLocalOperators] = useState(operators)
  
  // Estado para clientes
  const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
  const customersRef = React.useRef(customers)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)

  useEffect(() => {
    customersRef.current = customers
  }, [customers])

  const upsertCustomers = React.useCallback((incoming: Array<{ id: string; first_name: string; last_name: string }>) => {
    setCustomers((prev) => {
      let changed = false
      const byId = new Map(prev.map((customer) => [customer.id, customer]))

      for (const customer of incoming) {
        const existing = byId.get(customer.id)
        if (
          !existing ||
          existing.first_name !== customer.first_name ||
          existing.last_name !== customer.last_name
        ) {
          changed = true
          byId.set(customer.id, customer)
        }
      }

      return changed ? Array.from(byId.values()) : prev
    })
  }, [])

  const toCustomerOptions = React.useCallback((items: Array<{ id: string; first_name: string; last_name: string }>) => {
    return items.slice(0, 50).map((customer) => ({
      value: customer.id,
      label: `${customer.first_name} ${customer.last_name}`.trim(),
    }))
  }, [])

  // Sincronizar operadores cuando cambian
  useEffect(() => {
    setLocalOperators(operators)
  }, [operators])

  // Cargar lista de clientes
  const loadCustomers = React.useCallback(async () => {
    setLoadingCustomers(true)
    try {
      const response = await fetch('/api/customers?limit=200&context=selector')
      if (response.ok) {
        const data = await response.json()
        upsertCustomers((data.customers || []).map((c: any) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
        })))
      }
    } catch (error) {
      console.error('Error loading customers:', error)
      toast({
        title: "Error",
        description: "Error al cargar clientes",
        variant: "destructive",
      })
    } finally {
      setLoadingCustomers(false)
    }
  }, [toast, upsertCustomers])

  const searchCustomers = React.useCallback(async (query: string): Promise<ComboboxOption[]> => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      return toCustomerOptions(customersRef.current)
    }

    const params = new URLSearchParams({
      limit: "50",
      context: "selector",
      search: trimmedQuery,
    })

    try {
      const response = await fetch(`/api/customers?${params.toString()}`)
      if (!response.ok) return []

      const data = await response.json()
      const remoteCustomers = (data.customers || []).map((customer: any) => ({
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
      }))

      upsertCustomers(remoteCustomers)
      return toCustomerOptions(remoteCustomers)
    } catch (error) {
      console.error("Error searching customers:", error)
      return []
    }
  }, [toCustomerOptions, upsertCustomers])

  const loadSettings = React.useCallback(async () => {
    try {
      const response = await fetch('/api/operations/settings')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      }
    } catch (error) {
      console.error('Error loading operation settings:', error)
      toast({
        title: "Error",
        description: "Error al cargar configuración de operaciones",
        variant: "destructive",
      })
    }
  }, [toast])

  // Cargar configuración de operaciones
  useEffect(() => {
    if (open) {
      loadSettings()
      loadCustomers()
    }
  }, [open, loadSettings, loadCustomers])

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

  // Limpiar destino del lead si existe
  const cleanedDestination = React.useMemo(() => {
    if (lead?.destination) {
      return cleanDestination(lead.destination)
    }
    return ""
  }, [lead?.destination])

  const form = useForm<OperationFormValues>({
    resolver: zodResolver(operationSchema),
    defaultValues: {
      agency_id: lead?.agency_id || defaultAgencyId || agencies[0]?.id || "",
      seller_id: lead?.assigned_seller_id || defaultSellerId || "",
      operator_id: null,
      seller_secondary_id: null,
      commission_split: 50,
      commission_pct_primary: null,
      commission_pct_secondary: null,
      type: "PACKAGE",
      customer_id: null,
      origin: "Rosario", // Por defecto Rosario
      destination: cleanedDestination,
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
      airline_name: null,
      hotel_name: null,
      operators: [],
    },
  })

  // Actualizar formulario cuando el lead cambia o el dialog se abre
  useEffect(() => {
    if (open && lead) {
      form.reset({
        agency_id: lead.agency_id || defaultAgencyId || agencies[0]?.id || "",
        seller_id: lead.assigned_seller_id || defaultSellerId || "",
        operator_id: null,
        seller_secondary_id: null,
        commission_split: 50,
        type: "PACKAGE",
        customer_id: null,
        origin: "Rosario",
        destination: cleanedDestination,
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
      })
    }
  }, [open, lead, cleanedDestination, defaultAgencyId, defaultSellerId, agencies, settings?.default_status, form])

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
      // Asegurar que cost_currency tenga un valor por defecto (usar moneda de la operación)
      const formCurrency = form.getValues("sale_currency") || form.getValues("currency") || "USD"
      const operatorsWithDefaults = operatorList.map(op => ({
        ...op,
        cost_currency: (op.cost_currency || formCurrency) as "ARS" | "USD"
      }))
      form.setValue("operators", operatorsWithDefaults)
    } else if (!useMultipleOperators) {
      form.setValue("operators", undefined)
    }
  }, [operatorList, useMultipleOperators, totalOperatorCost, form])

  const addOperator = () => {
    const currentCurrency = (form.getValues("sale_currency") || form.getValues("currency") || "USD") as "ARS" | "USD"
    setOperatorList([...operatorList, { operator_id: "", cost: 0, cost_currency: currentCurrency, product_type: undefined }])
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
      form.setValue("operator_id", newOperator.id, { shouldValidate: true, shouldDirty: true })
      
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

  // Verificar si el monto y la moneda son coherentes
  const checkCurrencyMismatch = (values: OperationFormValues): string | null => {
    const saleCurrency = values.sale_currency || values.currency || "USD"
    const saleAmount = values.sale_amount_total || 0

    if (saleCurrency === "ARS" && saleAmount > 0 && saleAmount < 100000) {
      return `El monto de venta es ${saleCurrency} $${saleAmount.toLocaleString("es-AR")}. ¿No será que esta operación debería estar en USD?`
    }
    if (saleCurrency === "USD" && saleAmount > 100000) {
      return `El monto de venta es ${saleCurrency} $${saleAmount.toLocaleString("es-AR")}. ¿No será que esta operación debería estar en ARS?`
    }
    return null
  }

  const onSubmit = async (values: OperationFormValues) => {
    // Verificar mismatch de moneda antes de enviar
    const currencyWarning = checkCurrencyMismatch(values)
    if (currencyWarning && !pendingSubmitValues) {
      setCurrencyWarningMessage(currencyWarning)
      setPendingSubmitValues(values)
      setShowCurrencyWarning(true)
      return
    }
    // Limpiar estado de pending si viene de confirmación
    setPendingSubmitValues(null)

    setIsLoading(true)
    setApiError(null)
    try {
      // Si se usan múltiples operadores, enviar el array; si no, usar formato antiguo
      const requestBody: any = {
        ...values,
        // Incluir lead_id si hay un lead
        ...(lead ? { lead_id: lead.id } : {}),
        operator_id: useMultipleOperators ? null : (values.operator_id || null),
        operators: useMultipleOperators && operatorList.length > 0 ? operatorList : undefined,
        seller_secondary_id: values.seller_secondary_id || null,
        commission_split: values.seller_secondary_id ? (values.commission_split ?? 50) : null,
        // Overrides absolutos (29/04 — Tomi opción B): si hay secondary, persistir
        // los valores absolutos. Si el usuario no tocó los inputs, fallback al
        // halfDefault calculado del pct del principal (= split 50/50). Esto asegura
        // que TODAS las operaciones nuevas usen el path nuevo, no el legacy.
        ...(values.seller_secondary_id ? (() => {
          const principalSellerForSubmit = sellers.find((s) => s.id === values.seller_id)
          const principalPctForSubmit = Number(principalSellerForSubmit?.default_commission_percentage ?? 0)
          const halfDefaultForSubmit = Math.round((principalPctForSubmit / 2) * 100) / 100
          return {
            commission_pct_primary: Number(values.commission_pct_primary ?? halfDefaultForSubmit),
            commission_pct_secondary: Number(values.commission_pct_secondary ?? halfDefaultForSubmit),
          }
        })() : { commission_pct_primary: null, commission_pct_secondary: null }),
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

      const data = await response.json()
      const operationId = data.operation?.id

      toast({
        title: lead ? "Lead convertido a operación" : "Operación creada",
        description: lead ? "El lead se ha convertido a operación correctamente" : "La operación se ha creado correctamente",
      })
      
      // Pasar el ID de la operación al callback
      onSuccess(operationId)
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
          className="max-w-[95vw] sm:max-w-4xl max-h-[95vh] flex flex-col overflow-hidden"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
        <DialogHeader>
          <DialogTitle>{lead ? "Convertir Lead a Operación" : "Nueva Operación"}</DialogTitle>
          <DialogDescription>
            {lead
              ? "Completa los datos para convertir este lead en una operación. Todos los campos están disponibles, incluyendo OCR para crear cliente."
              : "Crear una nueva operación manualmente"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 space-y-7">

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

            {/* Section: General */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">General</h4>
              </div>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
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
            </div>

            <div className="border-t border-border/40 -mx-6" />

            {/* Section: Cliente */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-teal/10">
                  <User className="h-3.5 w-3.5 text-accent-teal" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Cliente</h4>
              </div>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente {settings?.require_customer && <span className="text-destructive">*</span>}</FormLabel>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <SearchableCombobox
                            value={field.value || ""}
                            onChange={(value) => field.onChange(value || null)}
                            placeholder="Buscar cliente..."
                            searchPlaceholder="Escribí el nombre..."
                            emptyMessage="No se encontró el cliente"
                            disabled={loadingCustomers}
                            initialLabel={
                              field.value
                                ? customers.find(c => c.id === field.value)
                                  ? `${customers.find(c => c.id === field.value)!.first_name} ${customers.find(c => c.id === field.value)!.last_name}`
                                  : ""
                                : ""
                            }
                            searchFn={searchCustomers}
                          />
                        </div>
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

              {/* Comisión compartida: dos inputs absolutos (29/04 — Tomi opción B).
                  Default principalPct/2 cada uno. ADMIN/SUPER_ADMIN/CONTABLE pueden editar.
                  Validación reactiva: suma ≤ pct del vendedor principal. */}
              {form.watch("seller_secondary_id") && form.watch("seller_secondary_id") !== "none" && (() => {
                const canEdit = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole || "")
                const principalSeller = sellers.find((seller) => seller.id === form.watch("seller_id"))
                const principalPct = Number(principalSeller?.default_commission_percentage ?? 0)
                const halfDefault = Math.round((principalPct / 2) * 100) / 100
                const primaryVal = form.watch("commission_pct_primary")
                const secondaryVal = form.watch("commission_pct_secondary")
                const primaryNum = primaryVal != null ? Number(primaryVal) : halfDefault
                const secondaryNum = secondaryVal != null ? Number(secondaryVal) : halfDefault
                const sum = primaryNum + secondaryNum
                const exceedsPrincipal = principalPct > 0 && sum > principalPct + 0.01

                return (
                  <div className="space-y-3 mt-4">
                    <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="commission_pct_primary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Comisión vendedor principal (%)</FormLabel>
                            <FormControl>
                              <DecimalInput
                                value={field.value ?? halfDefault}
                                onChange={(v) => field.onChange(Number(v))}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                                onFocus={(e) => e.target.select()}
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="commission_pct_secondary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Comisión vendedor secundario (%)</FormLabel>
                            <FormControl>
                              <DecimalInput
                                value={field.value ?? halfDefault}
                                onChange={(v) => field.onChange(Number(v))}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                                onFocus={(e) => e.target.select()}
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {/* Bug #12: el label decía "Comisión vendedor principal: X%" pero
                        X era el default_commission_percentage del seller (el CAP del
                        split), no el input live del primario. Cuando el seller no tenía
                        default cargado, mostraba "0.00%" y confundía. Renombrado a
                        "Cap del vendedor principal" y ocultado cuando = 0. */}
                    <div className={`text-xs ${exceedsPrincipal ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      Suma: {sum.toFixed(2)}%
                      {principalPct > 0 && (
                        <> · Cap del vendedor principal: {principalPct.toFixed(2)}%</>
                      )}
                      {exceedsPrincipal && " — la suma no puede superar el cap del principal"}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="border-t border-border/40 -mx-6" />

            {/* Section: Datos del viaje */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <Plane className="h-3.5 w-3.5 text-success" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos del viaje</h4>
              </div>

              {/* Sub-group: Operador & Tipo */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Operador & Tipo de Producto</span>
                  </div>
                  <label htmlFor="useMultipleOperators" className="flex items-center gap-2 cursor-pointer">
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
                      className="rounded h-3.5 w-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Múltiples operadores</span>
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
                          className="text-destructive hover:text-destructive/80 h-7 w-7 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                        {/* Fila 1: Operador + Tipo */}
                        <div>
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

                        {/* Fila 2: Costo + Moneda - más espacio */}
                        <div>
                            <label className="text-xs font-medium mb-1.5 block">Costo *</label>
                      <DecimalInput
                        value={op.cost || ""}
                        onChange={(v) => updateOperator(index, "cost", v === "" ? 0 : Number(v))}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                              className="h-9 text-base font-medium"
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
                      <span className={`font-bold ${calculatedMargin >= 0 ? "text-success" : "text-destructive"}`}>
                        {form.watch("sale_currency") || form.watch("currency") || "USD"} {calculatedMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ({calculatedMarginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}

                {operatorList.length === 0 && (
                  <div className="flex flex-col items-center text-center py-8 border-2 border-dashed rounded-lg gap-3">
                    <p className="text-sm text-muted-foreground">
                      No hay operadores agregados
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={addOperator}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar Operador
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="operator_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operador {settings?.require_operator && <span className="text-destructive">*</span>}</FormLabel>
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
              </div>{/* End Operador & Tipo card */}

              {/* Sub-group: Ruta */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-success" />
                  <span className="text-xs font-medium text-muted-foreground">Ruta del Viaje</span>
                </div>
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origen</FormLabel>
                    <SearchableCombobox
                      value={field.value || ""}
                      onChange={(value) => field.onChange(value || "")}
                      placeholder="Ciudad de origen..."
                      searchPlaceholder="Buscar aeropuerto o ciudad..."
                      emptyMessage="No se encontraron resultados"
                      initialLabel={field.value || ""}
                      searchFn={async (query) => {
                        if (!query || query.length < 2) return []
                        const options: ComboboxOption[] = [
                          { value: query, label: query, subtitle: "Usar como origen" },
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
                          // silencioso
                        }
                        return options
                      }}
                    />
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

            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
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
                    <FormLabel>{form.watch("type") === "ASSISTANCE" ? "Fin de Cobertura" : "Fecha de Regreso"}</FormLabel>
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
              </div>{/* End Ruta card */}

              {/* Sub-group: Pasajeros */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Pasajeros</span>
                </div>
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-3">
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
              </div>{/* End Pasajeros card */}

            </div>

            <div className="border-t border-border/40 -mx-6" />

            {/* Section: Financiero */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-coral/10">
                  <DollarSign className="h-3.5 w-3.5 text-accent-coral" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Financiero</h4>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Sub-card: Estado & Monedas */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-accent-coral"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span className="text-xs font-medium text-foreground/70">Estado & Monedas</span>
                  </div>
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
                        <Select onValueChange={(value: string) => {
                          field.onChange(value)
                          // Sincronizar todas las monedas
                          form.setValue("sale_currency", value as "ARS" | "USD")
                          form.setValue("operator_cost_currency", value as "ARS" | "USD")
                          if (operatorList.length > 0) {
                            setOperatorList(operatorList.map(op => ({ ...op, cost_currency: value as "ARS" | "USD" })))
                          }
                        }} value={field.value}>
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
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="sale_currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Moneda Venta</FormLabel>
                          <Select onValueChange={(value: string) => {
                            field.onChange(value)
                            // Sincronizar moneda de costo de operador con moneda de venta
                            form.setValue("operator_cost_currency", value as "ARS" | "USD")
                            form.setValue("currency", value as "ARS" | "USD")
                            // Sincronizar moneda de todos los operadores en la lista
                            if (operatorList.length > 0) {
                              setOperatorList(operatorList.map(op => ({ ...op, cost_currency: value as "ARS" | "USD" })))
                            }
                          }} value={field.value}>
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
                          <FormLabel>Moneda Costo</FormLabel>
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

                {/* Sub-card: Montos */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="h-3.5 w-3.5 text-success" />
                    <span className="text-xs font-medium text-foreground/70">Montos</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="sale_amount_total"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto de Venta Total *</FormLabel>
                        <FormControl>
                          <DecimalInput
                            {...field}
                            value={field.value || ""}
                            onChange={(v) => field.onChange(v === "" ? 0 : Number(v))}
                            onFocus={(e) => e.target.select()}
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
                            <DecimalInput
                              {...field}
                              value={field.value || ""}
                              onChange={(v) => field.onChange(v === "" ? 0 : Number(v))}
                              onFocus={(e) => e.target.select()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {useMultipleOperators && (
                    <div>
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
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 -mx-6" />

            {/* Section: Códigos de Reserva */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-violet/10">
                  <Ticket className="h-3.5 w-3.5 text-accent-violet" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Códigos de reserva</h4>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Plane className="h-3.5 w-3.5 text-accent-teal" />
                    <span className="text-xs font-medium text-foreground/70">Aéreo</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="reservation_code_air"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código de Reserva</FormLabel>
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
                    name="airline_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aerolínea</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: American Airlines"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Building2 className="h-3.5 w-3.5 text-accent-violet" />
                    <span className="text-xs font-medium text-foreground/70">Hotel</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="reservation_code_hotel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código de Reserva</FormLabel>
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
                  <FormField
                    control={form.control}
                    name="hotel_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hotel</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Sheraton Miami"
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
            </div>

        </div>{/* End scrollable content wrapper */}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (lead ? "Convirtiendo..." : "Creando...") : (lead ? "Convertir Lead" : "Crear Operación")}
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
          <div className="space-y-4 px-6 py-5">
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
            form.setValue("customer_id", customer.id, { shouldValidate: true, shouldDirty: true })
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

      {/* Diálogo de alerta de moneda incorrecta */}
      <AlertDialog open={showCurrencyWarning} onOpenChange={setShowCurrencyWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-accent-coral" />
              Verificación de Moneda
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {currencyWarningMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowCurrencyWarning(false)
              setPendingSubmitValues(null)
            }}>
              Corregir moneda
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowCurrencyWarning(false)
              if (pendingSubmitValues) {
                onSubmit(pendingSubmitValues)
              }
            }}>
              Es correcto, continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

