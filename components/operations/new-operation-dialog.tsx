"use client"

import { previewSharedSplit } from "@/lib/commissions/split-preview"
import type { SellerOption } from "@/lib/sellers/seller-option"
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
import { Textarea } from "@/components/ui/textarea"
import { DecimalInput } from "@/components/ui/decimal-input"
import { serviceKind, PASSENGER_DETAIL_FIELDS, sanitizePassengerDetail } from "@/lib/operations/service-kind"
import {
  buildOperationDuplicateDraft,
  type DuplicableOperation,
} from "@/lib/operations/duplicate-operation"
import { distributeSaleByCost } from "@/lib/operations/operator-sale-breakdown"
import {
  buildPackageOperationDraft,
  mergeOperatorRowsWithPackage,
  remainingSeats,
  type ApplicablePackage,
} from "@/lib/packages/apply-package-draft"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Plus, Trash2, AlertCircle, Loader2, Building2, User, Plane, DollarSign, Ticket, MapPin, Users, Package, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { formatDateOnlyLocal, parseDateOnlyLocal, todayInArgentina } from "@/lib/utils/date-only"
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
import { trackEvent } from "@/lib/analytics/track"
import { bucketCount } from "@/lib/analytics/ga/scrub"
import { useScreenView } from "@/hooks/use-screen-view"

// Configuración de operaciones
interface OperationSettings {
  require_destination: boolean
  require_departure_date: boolean
  require_operator: boolean
  require_customer: boolean
  default_status: string
  custom_statuses: Array<{ value: string; label: string; color: string }>
  custom_product_types?: Array<{ value: string; label: string }>
  custom_operation_types?: Array<{ value: string; label: string }>
}

/** VIB-106: tope de acompañantes en el alta (el titular va aparte). El máximo
 *  real cargado en producción es 16 pasajeros por operación. */
const MAX_COMPANIONS = 24

/** VIB-115: ícono de ayuda con tooltip para clarificar campos poco obvios del
 *  alta. Se coloca junto al label del campo. */
function FieldHelp({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-muted-foreground/70 hover:text-muted-foreground cursor-help align-middle">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs leading-relaxed">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const operatorSchema = z.object({
  operator_id: z.string().min(1, "El operador es requerido"),
  cost: z.coerce.number().min(0, "El costo debe ser mayor o igual a 0"),
  cost_currency: z.enum(["ARS", "USD"]).default("USD").optional(),
  product_type: z.string().optional(),
  notes: z.string().optional(),
})

/** Una ficha de operador del formulario. Siempre se muestra al menos una: con
 *  un solo operador se cargan exactamente los mismos datos que con varios
 *  (costo, moneda, file interno, fecha de pago, detalle del pasajero), sin
 *  tener que activar ningún modo especial. */
type OperatorRow = {
  operator_id: string
  cost: string | number
  cost_currency: "ARS" | "USD"
  product_type?: string
  notes?: string
  passenger_detail?: Record<string, string>
  file_code?: string
  payment_due_date?: string
  sale_amount?: string | number
  /** VIB-183: presente ⇒ la ficha vino de un paquete cerrado. */
  source_package_item_id?: string
}

const emptyOperatorRow = (currency: "ARS" | "USD" = "USD"): OperatorRow => ({
  operator_id: "",
  cost: 0,
  cost_currency: currency,
  product_type: undefined,
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
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED", "ASSISTANCE", "ACTIVITY", "CAR"]),
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
  // VIB-115: código de reserva para servicios que no son aéreo ni hotel.
  reservation_code_other: z.string().optional().nullable(),
  airline_name: z.string().optional().nullable(),
  hotel_name: z.string().optional().nullable(),
  other_provider_name: z.string().optional().nullable(),
  // Pedido VICO 2026-05-22 (Andrés): el edit dialog tiene estos dos
  // campos pero el create no — había que crear+editar para setearlos.
  // operation_date = fecha de la venta (cuándo se cerró la op); puede
  // ser distinta a created_at si se carga retroactivamente.
  operation_date: z.date().optional().nullable(),
  // itr_localizador = "otro localizador" de itinerario (ITR del operador,
  // distinto al reservation_code de aero/hotel). Ya está en BD via
  // migration 128.
  itr_localizador: z.string().optional().nullable(),
  // Fecha máxima para que el cliente complete el pago (la usa el PDF de detalle).
  customer_payment_deadline: z.date().optional().nullable(),
  // Info adicional libre para el pasajero (la usa el PDF de detalle).
  passenger_notes: z.string().optional().nullable(),
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
  { value: "ACTIVITY", label: "Actividad" },
  { value: "CAR", label: "Alquiler de Auto" },
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
  // Prefill enriquecido (VIB-68 seguimiento): datos del lead que hoy se
  // aprovechan para precargar la operación. La seña (deposit_*) NO va acá:
  // se transfiere server-side vía transferLeadToOperation.
  quoted_price?: number | string | null
  estimated_departure_date?: string | null
  region?: string | null
  deposit_currency?: string | null
}

interface NewOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (operationId?: string) => void // Ahora puede recibir el ID de la operación creada
  agencies: Array<{ id: string; name: string }>
  sellers: SellerOption[]
  /** Candidatos a vendedor secundario. Se separan de `sellers` porque el
   *  secundario no depende del permiso "cargar a nombre de otro" (VIB-105).
   *  Cae a `sellers` si no se pasa. */
  secondarySellers?: SellerOption[]
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
  lead?: LeadData // Prop opcional para convertir lead a operación
  /** VIB-109: operación de la que se precarga el alta al duplicar. No se clona
   *  nada en el servidor — el POST normal crea la operación con todos sus side
   *  effects contables. */
  duplicateFrom?: DuplicableOperation | null
  userRole?: string
  /** Si el usuario puede elegir a otro vendedor PRINCIPAL. Cuando es false, el
   *  selector queda bloqueado a sí mismo (default true). */
  canPickOtherSeller?: boolean
  /** Si el usuario puede elegir vendedor SECUNDARIO (default true). */
  canPickSecondarySeller?: boolean
  /** VIB-183: muestra el selector de paquete cerrado. Solo el alta normal lo
   *  activa; duplicar y convertir un lead quedan como estaban. */
  allowPackages?: boolean
}

export function NewOperationDialog({
  open,
  onOpenChange,
  onSuccess,
  agencies,
  sellers,
  secondarySellers,
  operators,
  defaultAgencyId,
  defaultSellerId,
  lead,
  duplicateFrom,
  userRole,
  canPickOtherSeller = true,
  canPickSecondarySeller = true,
  allowPackages = false,
}: NewOperationDialogProps) {
  useScreenView("new-operation", open)
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [operatorList, setOperatorList] = useState<OperatorRow[]>([emptyOperatorRow()])
  // VIB-183: paquete cerrado del que sale esta venta. Elegirlo solo precarga el
  // formulario; el cupo lo toma el POST, que es el único que crea la operación.
  const [packages, setPackages] = useState<ApplicablePackage[]>([])
  const [selectedPackageId, setSelectedPackageId] = useState<string>("NONE")
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null)
  // El total de venta pasa a "manual" en cuanto el usuario lo escribe a mano, y
  // vuelve a seguir a las fichas cuando toca un precio de venta de ficha.
  const [saleTotalManual, setSaleTotalManual] = useState(false)
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
  // VIB-106: acompañantes cargados en el alta (ids de customers, "" = fila vacía).
  const [companionList, setCompanionList] = useState<string[]>([])
  // A qué campo escribe el cliente que se cree con el botón "+": el titular o
  // una fila de acompañante. Sin esto, crear un cliente desde una fila de
  // acompañante pisaría el titular.
  const [newCustomerTarget, setNewCustomerTarget] = useState<"main" | number>("main")

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

  // Candidatos a vendedor secundario. Por defecto los mismos que el principal,
  // pero la página manda una lista propia: un SELLER sin el permiso de "cargar
  // a nombre de otro" sólo se ve a sí mismo como principal y aun así puede
  // elegir secundario entre sus compañeros de agencia (VIB-105).
  const secondarySellerOptions = secondarySellers ?? sellers

  // Para resolver el % de comisión de cada vendedor hace falta mirar en las dos
  // listas: el principal puede estar sólo en una y el secundario en la otra.
  const sellersForCommissionLookup = React.useMemo(() => {
    const byId = new Map<string, SellerOption>()
    for (const s of [...sellers, ...secondarySellerOptions]) byId.set(s.id, s)
    return Array.from(byId.values())
  }, [sellers, secondarySellerOptions])

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

  // Tipos de operación disponibles (estándar + personalizados por agencia)
  const availableOperationTypes = React.useMemo(() => {
    if (settings?.custom_operation_types && settings.custom_operation_types.length > 0) {
      return [...operationTypeOptions, ...settings.custom_operation_types]
    }
    return operationTypeOptions
  }, [settings])

  // Tipos de producto disponibles (estándar + personalizados por agencia)
  const availableProductTypes = React.useMemo(() => {
    const standard = operationTypeOptions
    if (settings?.custom_product_types && settings.custom_product_types.length > 0) {
      return [...standard, ...settings.custom_product_types]
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

  // Prefill enriquecido desde el lead (VIB-68 seguimiento). Best-effort: el
  // usuario confirma/completa en el form antes de guardar.
  const leadSaleAmount = React.useMemo(() => {
    const n = Number(lead?.quoted_price)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [lead?.quoted_price])

  const leadCurrency = React.useMemo<"ARS" | "USD">(() => {
    return lead?.deposit_currency === "ARS" ? "ARS" : "USD"
  }, [lead?.deposit_currency])

  // Solo precargamos la fecha de salida si la estimada existe y NO es pasada
  // (una fecha pasada dispararía el 400 de validación de fechas en el submit).
  const leadDepartureDate = React.useMemo<Date | undefined>(() => {
    const d = parseDateOnlyLocal(lead?.estimated_departure_date)
    if (!d) return undefined
    const asStr = formatDateOnlyLocal(d)
    return asStr && asStr >= todayInArgentina() ? d : undefined
  }, [lead?.estimated_departure_date])

  const leadNotes = lead?.notes ?? ""

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
      origin: "Buenos Aires",
      destination: cleanedDestination,
      departure_date: leadDepartureDate,
      return_date: undefined,
      adults: 2,
      children: 0,
      infants: 0,
      status: settings?.default_status || "RESERVED",
      sale_amount_total: leadSaleAmount,
      operator_cost: 0,
      currency: leadCurrency,
      sale_currency: leadCurrency,
      operator_cost_currency: leadCurrency,
      reservation_code_air: null,
      reservation_code_hotel: null,
      reservation_code_other: null,
      airline_name: null,
      hotel_name: null,
      other_provider_name: null,
      operation_date: null,
      itr_localizador: null,
      customer_payment_deadline: null,
      passenger_notes: leadNotes,
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
        origin: "Buenos Aires",
        destination: cleanedDestination,
        departure_date: leadDepartureDate,
        return_date: undefined,
        adults: 2,
        children: 0,
        infants: 0,
        status: settings?.default_status || "RESERVED",
        sale_amount_total: leadSaleAmount,
        operator_cost: 0,
        currency: leadCurrency,
        sale_currency: leadCurrency,
        operator_cost_currency: leadCurrency,
        reservation_code_air: null,
        reservation_code_hotel: null,
        reservation_code_other: null,
        other_provider_name: null,
        operation_date: null,
        itr_localizador: null,
        customer_payment_deadline: null,
        passenger_notes: leadNotes,
        operators: [],
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, cleanedDestination, leadDepartureDate, leadSaleAmount, leadCurrency, leadNotes, defaultAgencyId, defaultSellerId, settings?.default_status])

  // VIB-109: precarga al duplicar. Mismo mecanismo que el prefill desde lead:
  // se resetea el form y, aparte, la lista de operadores (que es estado propio).
  // Los pasajeros quedan vacíos a propósito: es lo que cambia entre las ventas
  // de un mismo grupo.
  useEffect(() => {
    if (!open || !duplicateFrom) return
    const draft = buildOperationDuplicateDraft(duplicateFrom, {
      status: settings?.default_status || "RESERVED",
    })
    form.reset({
      ...(draft.formValues as any),
      customer_id: null,
      operator_id: null,
      operators: [],
    })
    setCompanionList([])
    setOperatorList(draft.operatorRows.length > 0 ? draft.operatorRows : [emptyOperatorRow(leadCurrency)])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duplicateFrom, settings?.default_status])

  // Actualizar estado por defecto cuando se carga la configuración
  useEffect(() => {
    if (settings?.default_status) {
      form.setValue('status', settings.default_status)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.default_status])

  // Siempre hay una ficha de operador en pantalla. Una operación sin operador
  // se carga dejando esa ficha en "Sin operador", no borrándola.
  useEffect(() => {
    if (!open) return
    setOperatorList((prev) => (prev.length > 0 ? prev : [emptyOperatorRow(leadCurrency)]))
  }, [open, leadCurrency])

  // Fichas efectivamente cargadas: las que tienen operador elegido. Una ficha
  // en "Sin operador" existe en la UI pero no se envía ni suma costo.
  const filledOperators = React.useMemo(
    () => operatorList.filter((op) => Boolean(op.operator_id)),
    [operatorList]
  )

  // ─── VIB-183: paquetes cerrados ────────────────────────────────────────────
  // Catálogo lazy, solo cuando el diálogo se abre en el alta normal. El endpoint
  // ya devuelve únicamente los que se pueden vender (ACTIVE y con plazas libres).
  useEffect(() => {
    if (!open || !allowPackages) return
    let cancelled = false
    fetch("/api/packages?selector=true")
      .then((res) => (res.ok ? res.json() : { packages: [] }))
      .then((data) => {
        if (!cancelled) setPackages(data.packages || [])
      })
      .catch(() => {
        // Sin catálogo el alta sigue funcionando igual: no hay nada que elegir.
        if (!cancelled) setPackages([])
      })
    return () => {
      cancelled = true
    }
  }, [open, allowPackages])

  const selectedPackage = React.useMemo(
    () => packages.find((p) => p.id === selectedPackageId) || null,
    [packages, selectedPackageId]
  )

  /**
   * Aplica o quita un paquete sobre las fichas de operador. Las patas del
   * paquete van adelante (la primera define el operador principal) y los
   * operadores que el vendedor sumó a mano se conservan.
   */
  const applyPackage = React.useCallback(
    (packageId: string) => {
      const pkg = packageId === "NONE" ? null : packages.find((p) => p.id === packageId) || null
      const draft = pkg
        ? buildPackageOperationDraft(pkg)
        : { formValues: {}, operatorRows: [], hasOperators: false }

      setOperatorList((prev) => {
        const { rows } = mergeOperatorRowsWithPackage<OperatorRow>(prev, draft.operatorRows)
        return rows.length > 0 ? (rows as OperatorRow[]) : [emptyOperatorRow(leadCurrency)]
      })

      // El paquete completa lo que está vacío y no pisa lo que el vendedor ya
      // escribió. La excepción es el precio: es lo central de un paquete
      // cerrado, así que ese sí se aplica siempre.
      const values = draft.formValues
      if (values.destination && !form.getValues("destination")) {
        form.setValue("destination", values.destination)
      }
      // Las fechas del paquete son columnas DATE ("YYYY-MM-DD") y el formulario
      // trabaja con Date. parseDateOnlyLocal evita el corrimiento de un día que
      // produciría `new Date(string)` en UTC-3.
      const salida = parseDateOnlyLocal(values.departure_date)
      if (salida && !form.getValues("departure_date")) {
        form.setValue("departure_date", salida)
      }
      const regreso = parseDateOnlyLocal(values.return_date)
      if (regreso && !form.getValues("return_date")) {
        form.setValue("return_date", regreso)
      }
      if (values.sale_amount_total !== undefined) {
        form.setValue("sale_amount_total", values.sale_amount_total)
        if (values.sale_currency) form.setValue("sale_currency", values.sale_currency)
        setSaleTotalManual(false)
      }

      setSelectedPackageId(packageId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packages, leadCurrency]
  )

  /**
   * Cambiar de paquete descarta las fichas del anterior, que el vendedor pudo
   * haber editado. Nunca en silencio: se pide confirmación con el conteo.
   */
  const handlePackageChange = (packageId: string) => {
    if (packageId === selectedPackageId) return
    const { removedCount } = mergeOperatorRowsWithPackage(operatorList, [])
    if (removedCount > 0) {
      setPendingPackageId(packageId)
      return
    }
    applyPackage(packageId)
  }

  /**
   * Pasajeros cargados, para avisar si no entran en el cupo que queda.
   *
   * Sin useMemo a propósito: `form.watch` se suscribe al campo durante el
   * render, y memoizarlo con `[form]` congelaría el número (el aviso nunca se
   * actualizaría al cambiar los pasajeros).
   */
  const paxWatch =
    (Number(form.watch("adults")) || 0) +
    (Number(form.watch("children")) || 0) +
    (Number(form.watch("infants")) || 0)
  const paxCargados = paxWatch > 0 ? paxWatch : 1

  const cupoInsuficiente = Boolean(
    selectedPackage && paxCargados > remainingSeats(selectedPackage)
  )

  // Calcular costo total de operadores
  const totalOperatorCost = filledOperators.reduce((sum, op) => sum + (Number(op.cost) || 0), 0)

  // Venta cargada ficha por ficha. Alimenta el total de venta mientras el
  // usuario no lo haya escrito a mano (un descuento o un fee de agencia hacen
  // que el total no sea la simple suma de los servicios).
  const totalSaleFromRows = filledOperators.reduce((sum, op) => sum + (Number(op.sale_amount) || 0), 0)
  // Sólo se sincroniza con TODAS las fichas cargadas: con una en cero, la suma
  // no representa la venta y pisar el total la borraría.
  const allRowsHaveSale =
    filledOperators.length > 0 && filledOperators.every((op) => (Number(op.sale_amount) || 0) > 0)

  React.useEffect(() => {
    if (saleTotalManual || !allRowsHaveSale) return
    if (Number(form.getValues("sale_amount_total")) === totalSaleFromRows) return
    form.setValue("sale_amount_total", totalSaleFromRows, { shouldValidate: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleTotalManual, allRowsHaveSale, totalSaleFromRows])

  const saleAmount = form.watch("sale_amount_total")
  const calculatedMargin = saleAmount - totalOperatorCost
  const calculatedMarginPercent = saleAmount > 0 ? (calculatedMargin / saleAmount) * 100 : 0

  // El costo de operador de la operación es siempre la suma de las fichas
  // cargadas, haya una o varias.
  React.useEffect(() => {
    form.setValue("operator_cost", totalOperatorCost)
    // Asegurar que cost_currency tenga un valor por defecto (usar moneda de la operación)
    const formCurrency = form.getValues("sale_currency") || form.getValues("currency") || "USD"
    const operatorsWithDefaults = filledOperators.map(op => ({
      ...op,
      cost: Number(op.cost) || 0,
      cost_currency: (op.cost_currency || formCurrency) as "ARS" | "USD"
    }))
    form.setValue("operators", operatorsWithDefaults.length > 0 ? operatorsWithDefaults : undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filledOperators, totalOperatorCost])

  // Con una sola ficha no se pide "Tipo de producto" aparte: el tipo de la
  // operación ya lo dice. Se copia igual a la ficha para que lo que se guarda
  // en operation_operators sea idéntico al caso de varios operadores.
  const operationType = form.watch("type")
  React.useEffect(() => {
    if (operatorList.length !== 1) return
    if (operatorList[0].product_type === operationType) return
    setOperatorList((prev) => (prev.length === 1 ? [{ ...prev[0], product_type: operationType }] : prev))
  }, [operationType, operatorList])

  const addOperator = () => {
    const currentCurrency = (form.getValues("sale_currency") || form.getValues("currency") || "USD") as "ARS" | "USD"
    setOperatorList([...operatorList, emptyOperatorRow(currentCurrency)])
  }

  const removeOperator = (index: number) => {
    const currentCurrency = (form.getValues("sale_currency") || form.getValues("currency") || "USD") as "ARS" | "USD"
    setOperatorList((prev) => {
      const next = prev.filter((_, i) => i !== index)
      // Nunca quedarse sin ficha: "sin operador" se elige en el select, no
      // borrando la única ficha.
      return next.length > 0 ? next : [emptyOperatorRow(currentCurrency)]
    })
  }

  const updateOperator = (index: number, field: string, value: any) => {
    const updated = [...operatorList]
    updated[index] = { ...updated[index], [field]: value }
    setOperatorList(updated)
  }

  // VIB-106: acompañantes. Mismo patrón que la lista de operadores — una fila
  // por acompañante, con el id del cliente ("" mientras no se eligió).
  const addCompanion = () => setCompanionList((prev) => [...prev, ""])
  const removeCompanion = (index: number) =>
    setCompanionList((prev) => prev.filter((_, i) => i !== index))
  const updateCompanion = (index: number, customerId: string) =>
    setCompanionList((prev) => prev.map((id, i) => (i === index ? customerId : id)))

  // VIB-115 tenía acá handleToggleMultipleOperators, que migraba el operador y
  // el costo al alternar entre "un operador" y "múltiples operadores". Ya no
  // hace falta: no hay dos modos, la ficha completa se muestra siempre y sumar
  // operadores no descarta nada.
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
        // El operador principal lo resuelve el backend con la primera ficha de
        // `operators`. Sin fichas cargadas, la operación queda sin operador.
        operator_id: null,
        // `source_package_item_id` es una marca de la UI para saber qué ficha
        // vino del paquete: se descarta acá y no viaja al servidor.
        operators: filledOperators.length > 0 ? filledOperators.map(({ source_package_item_id: _origen, ...op }) => ({ ...op, cost: Number(op.cost) || 0, sale_amount: Number(op.sale_amount) || 0, passenger_detail: sanitizePassengerDetail(op.passenger_detail), file_code: (op.file_code || "").trim() || null, payment_due_date: op.payment_due_date || null })) : undefined,
        // VIB-183: el paquete va como campo de la operación. El servidor toma
        // el cupo con él; sin paquete no llama a nada.
        travel_package_id: selectedPackageId === "NONE" ? null : selectedPackageId,
        seller_secondary_id: values.seller_secondary_id || null,
        commission_split: values.seller_secondary_id ? (values.commission_split ?? 50) : null,
        // Reparto de la comisión (VIB-63). Solo se mandan los porcentajes si el
        // usuario los editó a mano: en ese caso la operación queda MANUAL y el
        // servidor los respeta. Si no los tocó, no se mandan y el servidor
        // calcula el reparto — que es lo que hay que hacer, porque antes esta
        // misma línea mandaba ceros cuando el porcentaje no llegaba a la
        // pantalla y dejaba la venta sin comisionar para los dos.
        ...(values.seller_secondary_id ? (() => {
          const repartoEditado =
            values.commission_pct_primary != null || values.commission_pct_secondary != null
          if (!repartoEditado) return {}

          const auto = previewSharedSplit(sellersForCommissionLookup, values.seller_id, values.seller_secondary_id)
          return {
            commission_pct_primary: Number(
              values.commission_pct_primary ?? auto.primary
            ),
            commission_pct_secondary: Number(
              values.commission_pct_secondary ?? auto.secondary
            ),
          }
        })() : { commission_pct_primary: null, commission_pct_secondary: null }),
        origin: values.origin || null,
        customer_id: values.customer_id || null,
        // VIB-106: acompañantes cargados en el alta. El titular sigue yendo en
        // `customer_id`; el server arma las filas de operation_customers.
        companions: companionList.filter(Boolean),
        return_date: values.return_date ? formatDateOnlyLocal(values.return_date) : null,
        checkin_date: null,
        checkout_date: null,
        departure_date: values.departure_date ? formatDateOnlyLocal(values.departure_date) : null,
        // operation_date = fecha de venta (cuándo se cerró la op). Puede
        // ser distinta a created_at si se carga retroactivamente. Si el
        // user no la setea, queda null y el backend usa created_at como
        // fallback (comportamiento legacy preservado).
        operation_date: values.operation_date ? formatDateOnlyLocal(values.operation_date) : null,
        itr_localizador: values.itr_localizador || null,
        // Fecha máxima de pago del cliente (usada por el PDF de detalle).
        customer_payment_deadline: values.customer_payment_deadline ? formatDateOnlyLocal(values.customer_payment_deadline) : null,
        // Info adicional para el pasajero (usada por el PDF de detalle).
        passenger_notes: values.passenger_notes?.trim() || null,
        sale_currency: values.sale_currency || values.currency || "USD",
        operator_cost_currency: values.operator_cost_currency || values.currency || "USD",
        // El costo total sale siempre de la suma de las fichas de operador.
        operator_cost: totalOperatorCost,
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

      // La operación se creó pero algo secundario falló (ej. no se pudieron
      // asociar los pasajeros). No se silencia: el usuario tiene que saberlo.
      const warnings = (data.warnings as string[] | undefined) ?? []
      for (const warning of warnings) {
        toast({ title: "Atención", description: warning, variant: "destructive" })
      }

      // Telemetría: forma de la operación, nunca su plata ni sus personas.
      // `operator_cost`, `sale_amount` y los nombres de pasajeros no salen de acá.
      const trackedSaleCurrency = values.sale_currency || values.currency || "USD"
      trackEvent("operation_created", {
        passengers_bucket: bucketCount(companionList.length + 1),
        services_bucket: bucketCount(filledOperators.length || 1),
        multi_operator: filledOperators.length > 1,
        sale_currency: trackedSaleCurrency,
        from_lead: Boolean(lead),
        had_warnings: warnings.length > 0,
      })
      if (lead) {
        trackEvent("lead_converted", {
          sale_currency: trackedSaleCurrency,
          had_quote: lead.quoted_price != null && lead.quoted_price !== "",
        })
      }

      // Pasar el ID de la operación al callback
      onSuccess(operationId)
      onOpenChange(false)
      form.reset()
      setOperatorList([])
      setCompanionList([])
      setSelectedPackageId("NONE")
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
    setCompanionList([])
    setSelectedPackageId("NONE")
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
          <DialogTitle>
            {lead
              ? "Convertir Lead a Operación"
              : duplicateFrom
                ? "Duplicar Operación"
                : "Nueva Operación"}
          </DialogTitle>
          <DialogDescription>
            {lead
              ? "Completa los datos para convertir este lead en una operación. Todos los campos están disponibles, incluyendo OCR para crear cliente."
              : duplicateFrom
                ? "Se copiaron destino, fechas, montos y operadores. Cargá los pasajeros de esta venta; los cobros y pagos no se copian."
                : "Crear una nueva operación manualmente"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-6 space-y-7">

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
                      <Select onValueChange={field.onChange} value={field.value} disabled={!canPickOtherSeller}>
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

            {/* Section: Pasajeros */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-teal/10">
                  <User className="h-3.5 w-3.5 text-accent-teal" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Pasajeros</h4>
              </div>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pasajero principal {settings?.require_customer && <span className="text-destructive">*</span>}</FormLabel>
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
                          onClick={() => {
                            setNewCustomerTarget("main")
                            setShowNewCustomerDialog(true)
                          }}
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
                      {/* VIB-105: el secundario NO se gatea con
                          `canPickOtherSeller`. Ese permiso decide de quién es la
                          operación; el secundario sólo comparte la comisión, y
                          eso lo hace cualquier vendedor de la agencia. */}
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                        value={field.value || "none"}
                        disabled={!canPickSecondarySeller}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin vendedor secundario" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin vendedor secundario</SelectItem>
                          {/* Excluir al vendedor principal: no puede ser su propio
                              secundario (dispararía el split 50/50 y le cobraría
                              la mitad de la comisión). */}
                          {secondarySellerOptions
                            .filter((seller) => seller.id !== form.watch("seller_id"))
                            .map((seller) => (
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

              {/* VIB-106: acompañantes. Antes había que crear la operación,
                  buscarla, entrar y cargarlos de a uno desde la pestaña Clientes.
                  Se reusa el mismo buscador que el titular (ya scopeado por org). */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Acompañantes {companionList.length > 0 && `(${companionList.filter(Boolean).length})`}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={addCompanion}
                    disabled={!form.watch("customer_id") || companionList.length >= MAX_COMPANIONS}
                    title={
                      !form.watch("customer_id")
                        ? "Elegí primero el pasajero principal"
                        : companionList.length >= MAX_COMPANIONS
                          ? `Máximo ${MAX_COMPANIONS} acompañantes`
                          : undefined
                    }
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar acompañante
                  </Button>
                </div>

                {companionList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Opcional. Podés cargarlos ahora o después desde la pestaña Clientes de la operación.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {companionList.map((companionId, index) => {
                      // No ofrecer clientes ya elegidos (el server los deduplica igual).
                      const taken = new Set(
                        [form.watch("customer_id"), ...companionList.filter((_, i) => i !== index)].filter(Boolean) as string[]
                      )
                      const selected = customers.find((c) => c.id === companionId)
                      return (
                        <div key={index} className="flex gap-2">
                          <div className="flex-1">
                            <SearchableCombobox
                              value={companionId || ""}
                              onChange={(value) => updateCompanion(index, value || "")}
                              placeholder="Buscar acompañante..."
                              searchPlaceholder="Escribí el nombre..."
                              emptyMessage="No se encontró el cliente"
                              disabled={loadingCustomers}
                              initialLabel={selected ? `${selected.first_name} ${selected.last_name}` : ""}
                              searchFn={async (term) => {
                                const options = await searchCustomers(term)
                                return options.filter((option) => !taken.has(option.value))
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setNewCustomerTarget(index)
                              setShowNewCustomerDialog(true)
                            }}
                            title="Crear nuevo cliente"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCompanion(index)}
                            title="Quitar acompañante"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Aviso, no validación: los conteos de adultos/menores son
                    comerciales y no siempre coinciden con los pasajeros cargados. */}
                {(() => {
                  const declared =
                    (Number(form.watch("adults")) || 0) +
                    (Number(form.watch("children")) || 0) +
                    (Number(form.watch("infants")) || 0)
                  const loaded = (form.watch("customer_id") ? 1 : 0) + companionList.filter(Boolean).length
                  if (declared <= 1 || loaded === 0 || loaded >= declared) return null
                  return (
                    <p className="text-xs text-muted-foreground mt-2">
                      Cargaste {loaded} de {declared} pasajeros declarados.
                    </p>
                  )
                })()}
              </div>

              {/* Comisión compartida: dos inputs absolutos (29/04 — Tomi opción B).
                  Default principalPct/2 cada uno. ADMIN/SUPER_ADMIN/CONTABLE pueden editar.
                  Validación reactiva: suma ≤ pct del vendedor principal. */}
              {form.watch("seller_secondary_id") && form.watch("seller_secondary_id") !== "none" && (() => {
                const canEdit = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole || "")
                // El sugerido sale de la misma función que usa el servidor. Antes
                // acá se calculaba la mitad del porcentaje DEL PRINCIPAL y se le
                // mostraba también al secundario, que cobra sobre el suyo.
                const sugerido = previewSharedSplit(
                  sellersForCommissionLookup,
                  form.watch("seller_id"),
                  form.watch("seller_secondary_id")
                )
                const primaryVal = form.watch("commission_pct_primary")
                const secondaryVal = form.watch("commission_pct_secondary")
                const reparto = previewSharedSplit(
                  sellersForCommissionLookup,
                  form.watch("seller_id"),
                  form.watch("seller_secondary_id"),
                  { primary: primaryVal, secondary: secondaryVal }
                )
                const sum = reparto.total
                const exceedsCeiling = reparto.exceedsCeiling

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
                                value={field.value ?? sugerido.primary}
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
                                value={field.value ?? sugerido.secondary}
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
                    {/* El tope pasó a ser simétrico (VIB-63): cada vendedor hasta
                        su propio porcentaje y el total hasta el mayor de los dos.
                        Antes el techo era el porcentaje del principal, así que
                        cargar una venta con un secundario que comisiona más
                        devolvía 400 y había que invertir los vendedores. */}
                    <div className={`text-xs ${exceedsCeiling ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      Suma: {sum.toFixed(2)}%
                      {reparto.ceiling > 0 && (
                        <> · Tope: {reparto.ceiling.toFixed(2)}%</>
                      )}
                      {exceedsCeiling && " — el reparto no puede superar la comisión más alta de los dos"}
                      {reparto.primaryMax == null && " — falta cargar la comisión del vendedor principal"}
                      {reparto.secondaryMax == null && " — falta cargar la comisión del vendedor secundario"}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="border-t border-border/40 -mx-6" />

            {/* Section: Datos del viaje */}
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <Plane className="h-3.5 w-3.5 text-success" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos del viaje</h4>
              </div>

              {/* Sub-group: Operador & Tipo */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Operador & Tipo de Producto</span>
                  <FieldHelp text="Una ficha por proveedor: el operador al que le comprás el servicio, con su costo y su precio de venta. Si la operación tiene varios (ej: aéreo + hotel + traslado), sumá una ficha por cada uno con “Agregar Operador”; el costo total se suma solo." />
                </div>

                {/* VIB-183: elegir un paquete cerrado carga sus patas de una.
                    Solo precarga el formulario — el cupo lo toma el POST. */}
                {allowPackages && packages.length > 0 && (
                  <div className="space-y-2 md:max-w-[calc(50%-0.75rem)]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">Paquete cerrado</span>
                      <FieldHelp text="Carga de una vez todos los operadores del paquete y descuenta una plaza por pasajero. Podés editar los costos y sumar operadores extra por fuera: lo cerrado del paquete es el cupo, no los precios." />
                    </div>
                    <Select value={selectedPackageId} onValueChange={handlePackageChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sin paquete" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Sin paquete</SelectItem>
                        {packages.map((pkg) => (
                          <SelectItem key={pkg.id} value={pkg.id}>
                            {pkg.name} — quedan {remainingSeats(pkg)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPackage && (
                      <p
                        className={
                          cupoInsuficiente
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {cupoInsuficiente
                          ? `Quedan ${remainingSeats(selectedPackage)} plaza(s) y esta venta necesita ${paxCargados}.`
                          : `Quedan ${remainingSeats(selectedPackage)} plaza(s); esta venta ocupa ${paxCargados}.`}
                      </p>
                    )}
                  </div>
                )}

                {/* Tipo de la operación: uno solo, más allá de cuántos
                    operadores se carguen abajo. */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem className="md:max-w-[calc(50%-0.75rem)]">
                      <FormLabel>Tipo *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableOperationTypes.map((option) => (
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

              <div className="space-y-4 border rounded-lg p-5 mb-4 bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold">
                      {operatorList.length > 1 ? "Operadores" : "Operador"}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {operatorList.length > 1
                        ? "Cargá el costo y los datos de cada operador"
                        : "Cargá el costo y los datos del operador. Si la operación tiene más de uno, agregalos acá."}
                    </p>
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
                      {/* Con una sola ficha no hace falta numerarla ni poder
                          borrarla: para dejar la operación sin operador se
                          elige "Sin operador" en el select. */}
                      {operatorList.length > 1 && (
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
                      )}
                      
                      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                        {/* Fila 1: Operador + Tipo */}
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">
                            Operador {settings?.require_operator && <span className="text-destructive">*</span>}
                          </label>
                          <div className="flex gap-2">
                        <Select
                          value={op.operator_id || (operatorList.length === 1 ? "none" : "")}
                          onValueChange={(value) => updateOperator(index, "operator_id", value === "none" ? "" : value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seleccionar operador" />
                          </SelectTrigger>
                          <SelectContent>
                            {operatorList.length === 1 && !settings?.require_operator && (
                              <SelectItem value="none">Sin operador</SelectItem>
                            )}
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

                    {/* Con un solo operador, el tipo de la operación ya dice
                        qué se vendió; el desglose por producto recién importa
                        cuando hay varios. La ficha única lo hereda del form. */}
                    {operatorList.length >= 2 && (
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">Tipo de Producto *</label>
                        <Select
                          value={availableProductTypes.some(o => o.value === op.product_type) ? (op.product_type || "") : (op.product_type !== undefined ? "__OTRO__" : "")}
                          onValueChange={(value) => {
                            if (value === "__OTRO__") {
                              updateOperator(index, "product_type", "")
                            } else {
                              updateOperator(index, "product_type", value)
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProductTypes.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                            <SelectItem value="__OTRO__">Otro...</SelectItem>
                          </SelectContent>
                        </Select>
                        {!availableProductTypes.some(o => o.value === op.product_type) && op.product_type !== undefined ? (
                          <Input
                            className="mt-1.5 h-9 text-sm"
                            placeholder="Escribí el tipo de producto..."
                            value={op.product_type || ""}
                            onChange={(e) => updateOperator(index, "product_type", e.target.value)}
                          />
                        ) : null}
                      </div>
                    )}

                        {/* Fila 2: Costo + Moneda - más espacio */}
                        <div>
                            <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                              Costo *
                              <FieldHelp text="Lo que te cobra este operador (proveedor) a la agencia por el servicio. No es lo que le cobrás al cliente." />
                            </label>
                      <DecimalInput
                        value={op.cost || ""}
                        onChange={(v) => updateOperator(index, "cost", v)}
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

                      {/* VIB-112: precio de venta de ESTE servicio. Desglose del
                          total de venta de la operación; se usa al facturar por
                          servicio para controlar la base gravada de IVA. Con
                          todas las fichas cargadas alimenta el Monto de Venta
                          Total, que igual se puede escribir a mano. Sin operador
                          elegido la ficha no se guarda, así que tampoco se pide
                          su precio: esa venta va directo al total. */}
                      {Boolean(op.operator_id) && (() => {
                        const saleCur = (form.watch("sale_currency") || form.watch("currency") || "USD") as string
                        const saleVal = Number(op.sale_amount) || 0
                        const costVal = Number(op.cost) || 0
                        const sameCurrency = (op.cost_currency || "USD") === saleCur
                        const margin = saleVal - costVal
                        return (
                          <div className="pt-3">
                            <label className="text-xs font-medium mb-1.5 block">
                              Precio de venta <span className="text-muted-foreground font-normal">({saleCur}, opcional)</span>
                            </label>
                            <DecimalInput
                              value={op.sale_amount ?? ""}
                              onChange={(v) => {
                                // Volver a seguir a las fichas: el usuario está
                                // armando la venta desde acá.
                                setSaleTotalManual(false)
                                updateOperator(index, "sale_amount", v)
                              }}
                              onFocus={(e) => e.target.select()}
                              placeholder="0.00"
                              className="h-9 text-sm"
                            />
                            {saleVal > 0 && sameCurrency && (
                              <p className={`text-xs mt-1 ${margin >= 0 ? "text-muted-foreground" : "text-destructive"}`}>
                                Margen de este servicio: {saleCur} {margin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        )
                      })()}

                      {/* Datos internos del servicio (opcional): NO se muestran al
                          pasajero. file_code = referencia interna de la agencia;
                          payment_due_date = fecha máxima de pago al operador (alimenta
                          el vencimiento del pago a operador). */}
                      <div className="pt-3 border-t border-border/40">
                        <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          Datos internos (opcional)
                          <FieldHelp text="Uso interno de la agencia: NO se muestran al pasajero. El N° de File es tu referencia; la fecha máx. de pago alimenta el vencimiento del pago al operador." />
                        </label>
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">N° de File (interno)</label>
                            <Input
                              value={op.file_code || ""}
                              onChange={(e) => updateOperator(index, "file_code", e.target.value)}
                              placeholder="Código de referencia"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">Fecha máx. de pago</label>
                            <Input
                              type="date"
                              value={op.payment_due_date || ""}
                              onChange={(e) => updateOperator(index, "payment_due_date", e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Detalle para el pasajero (opcional), según el tipo de servicio.
                          Se exporta en el PDF "Detalle de la Operación". */}
                      <div className="pt-3 border-t border-border/40">
                        <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          Detalle para el pasajero (opcional)
                          <FieldHelp text="Datos que SÍ ve el pasajero en el PDF 'Detalle de la Operación'. Los campos cambian según el tipo de producto (hotel, aéreo, etc.)." />
                        </label>
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                          {PASSENGER_DETAIL_FIELDS[serviceKind(op.product_type)].map((f) => (
                            <div key={f.key}>
                              <label className="text-xs font-medium mb-1.5 block">{f.label}</label>
                              <Input
                                type={f.type === "date" ? "date" : "text"}
                                value={op.passenger_detail?.[f.key] || ""}
                                onChange={(e) =>
                                  updateOperator(index, "passenger_detail", {
                                    ...op.passenger_detail,
                                    [f.key]: e.target.value,
                                  })
                                }
                                className="h-9 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                  </div>
                ))}
                </div>

                {filledOperators.length > 0 && (
                  <div className="pt-4 mt-4 border-t bg-background/50 rounded-md p-3">
                    {(() => {
                      const saleCur = (form.watch("sale_currency") || form.watch("currency") || "USD") as string
                      const saleTotal = Number(form.watch("sale_amount_total")) || 0
                      const diff = Math.round((totalSaleFromRows - saleTotal) * 100) / 100
                      const tolerance = Math.max(0.01, Math.abs(saleTotal) * 0.005)
                      // Sólo es un descuadre real si hay algo cargado en las
                      // fichas: todo en cero es "todavía no lo desglosé".
                      const mismatch = totalSaleFromRows > 0 && saleTotal > 0 && Math.abs(diff) > tolerance
                      return (
                        <>
                          <div className="flex justify-between items-center text-sm mb-2">
                            <span className="font-medium text-muted-foreground">Venta (suma de las fichas):</span>
                            <span className="font-bold">{saleCur} {totalSaleFromRows.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                          {mismatch && (
                            <p className="text-xs text-accent-amber mb-2">
                              El Monto de Venta Total dice {saleCur} {saleTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}: {diff > 0 ? "sobran" : "faltan"} {saleCur} {Math.abs(diff).toLocaleString("es-AR", { minimumFractionDigits: 2 })} respecto de las fichas.
                            </p>
                          )}
                          {!allRowsHaveSale && totalSaleFromRows > 0 && (
                            <p className="text-xs text-muted-foreground mb-2">
                              Cargá el precio de venta en todas las fichas para que el total se calcule solo.
                            </p>
                          )}
                        </>
                      )
                    })()}

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

                    {/* VIB-112: atajos para repartir un total ya cargado entre
                        los servicios. Sólo con 2+ fichas y un total escrito:
                        con una sola ficha su precio ES el total y no hay nada
                        que repartir. */}
                    {operatorList.length >= 2 && (Number(form.watch("sale_amount_total")) || 0) > 0 && (() => {
                      const saleCur = (form.watch("sale_currency") || form.watch("currency") || "USD") as string
                      const saleTotal = Number(form.watch("sale_amount_total")) || 0
                      return (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repartir el total entre los servicios</span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            Si preferís partir de un total ya cerrado, repartilo acá y después ajustá ficha por ficha.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                const shares = distributeSaleByCost({
                                  legs: operatorList.map((op) => ({ cost: op.cost, cost_currency: op.cost_currency })),
                                  saleAmountTotal: saleTotal,
                                  saleCurrency: saleCur === "ARS" ? "ARS" : "USD",
                                })
                                setSaleTotalManual(true)
                                setOperatorList((prev) => prev.map((op, i) => ({ ...op, sale_amount: shares[i] ?? 0 })))
                              }}
                            >
                              Repartir ∝ costo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                const others = operatorList.slice(0, -1).reduce((s, op) => s + (Number(op.sale_amount) || 0), 0)
                                const last = Math.round((saleTotal - others) * 100) / 100
                                setSaleTotalManual(true)
                                setOperatorList((prev) => prev.map((op, i) => (i === prev.length - 1 ? { ...op, sale_amount: last } : op)))
                              }}
                            >
                              Completar la última
                            </Button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

              </div>
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

            {/* Fecha de venta (operation_date) — agregado 2026-05-22 a pedido de
                VICO Travel. Permite cargar una operación con fecha distinta a
                hoy (ej. cargar retroactivamente una venta del mes pasado).
                Si queda vacía, el backend usa la fecha de hoy como default
                (comportamiento legacy preservado). */}
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="operation_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Venta</FormLabel>
                    <FormControl>
                      <DateInputWithCalendar
                        value={field.value || undefined}
                        onChange={field.onChange}
                        placeholder="dd/MM/yyyy (hoy si vacía)"
                        maxDate={new Date()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="itr_localizador"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center gap-1.5">
                      Otro Localizador (ITR)
                      <FieldHelp text="Localizador propio del operador (distinto del código de reserva de aéreo/hotel). Sirve para identificar la reserva ante el operador." />
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Localizador del operador"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
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

              <FormField
                control={form.control}
                name="customer_payment_deadline"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha máxima de pago del cliente</FormLabel>
                    <FormControl>
                      <DateInputWithCalendar
                        value={field.value || undefined}
                        onChange={field.onChange}
                        placeholder="dd/MM/yyyy"
                      />
                    </FormControl>
                    <span className="text-[10px] text-muted-foreground">
                      Hasta cuándo tiene el pasajero para pagar. Suele vencer ~1 mes antes de la salida. Aparece en el PDF de detalle.
                    </span>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

              <FormField
                control={form.control}
                name="passenger_notes"
                render={({ field }) => (
                  <FormItem className="flex flex-col mt-4">
                    <FormLabel>Información adicional para el pasajero</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Ej: All inclusive · Traslados incluidos · Habitación vista al mar"
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <span className="text-[10px] text-muted-foreground">
                      Texto libre que aparece en el PDF de detalle que se manda al pasajero.
                    </span>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                        <FormLabel className="flex items-center gap-1.5">
                          Moneda (Compatibilidad)
                          <FieldHelp text="Campo heredado que sincroniza las tres monedas. Normalmente no hace falta tocarlo: se ajusta solo con la Moneda de Venta." />
                        </FormLabel>
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
                          <FormLabel className="flex items-center gap-1.5">
                            Moneda Venta
                            <FieldHelp text="Moneda en la que le cobrás al cliente." />
                          </FormLabel>
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
                          <FormLabel className="flex items-center gap-1.5">
                            Moneda Costo
                            <FieldHelp text="Moneda en la que le pagás al operador. Puede diferir de la de venta." />
                          </FormLabel>
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
                            onChange={(v) => {
                              setSaleTotalManual(true)
                              field.onChange(v === "" ? 0 : Number(v))
                            }}
                            onFocus={(e) => e.target.select()}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">
                          {saleTotalManual
                            ? "Escrito a mano. Se recalcula solo si volvés a tocar el precio de venta de una ficha."
                            : "Se completa solo con la suma de las fichas de operador. Podés escribirlo a mano (descuento, fee de agencia)."}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* El costo sale de las fichas de operador, arriba. Acá se
                      muestra sólo el total para no tener dos lugares donde
                      cargar el mismo número. */}
                  <div>
                    <label className="text-sm font-medium mb-1 flex items-center gap-1.5">
                      Costo de Operador (Calculado)
                      <FieldHelp text="Lo que te cobra el operador (proveedor) a la agencia por el servicio. No es lo que le cobrás al cliente (eso es el Monto de Venta)." />
                    </label>
                    <Input
                      type="text"
                      value={totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {filledOperators.length > 1
                        ? "Suma automática de todos los operadores"
                        : "Se carga en la ficha del operador, en Datos del viaje"}
                    </p>
                  </div>
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
                <FieldHelp text="Localizadores que devuelve cada proveedor. Cargá el del aéreo, el del hotel y, para transfer/asistencia/otros servicios, usá 'Otros servicios'. Son opcionales y ayudan a rastrear la reserva." />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
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

                {/* VIB-115: código de reserva para servicios que no son aéreo ni
                    hotel (transfer, asistencia, excursiones, etc.). */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Package className="h-3.5 w-3.5 text-accent-coral" />
                    <span className="text-xs font-medium text-foreground/70">Otros servicios</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="reservation_code_other"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código de Reserva</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: TRF-4567"
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
                    name="other_provider_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proveedor / Servicio</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Traslado, Asistencia..."
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
          <div className="space-y-4 py-5">
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
            if (newCustomerTarget === "main") {
              form.setValue("customer_id", customer.id, { shouldValidate: true, shouldDirty: true })
            } else {
              updateCompanion(newCustomerTarget, customer.id)
            }
            setNewCustomerTarget("main")
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

      {/* VIB-183: cambiar de paquete descarta las fichas que trajo el anterior,
          que el vendedor pudo haber editado. Nunca se hace en silencio. */}
      <AlertDialog
        open={pendingPackageId !== null}
        onOpenChange={(abierto) => !abierto && setPendingPackageId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingPackageId === "NONE" ? "¿Quitar el paquete?" : "¿Cambiar de paquete?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se van a reemplazar las fichas de operador que trajo el paquete actual, incluidos los
              costos que hayas editado. Los operadores que agregaste por fuera se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPackageId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPackageId) applyPackage(pendingPackageId)
                setPendingPackageId(null)
              }}
            >
              {pendingPackageId === "NONE" ? "Quitar" : "Cambiar"}
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

