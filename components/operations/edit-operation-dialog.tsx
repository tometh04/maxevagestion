"use client"

import { previewSharedSplit } from "@/lib/commissions/split-preview"
import type { SellerOption } from "@/lib/sellers/seller-option"
import { useState, useEffect, useMemo } from "react"
import { useForm, type DefaultValues } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { parseDateOnlyLocal, formatDateOnlyLocal } from "@/lib/utils/date-only"
import { serviceKind, PASSENGER_DETAIL_FIELDS, sanitizePassengerDetail } from "@/lib/operations/service-kind"
import { distributeSaleByCost } from "@/lib/operations/operator-sale-breakdown"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Loader2, Plus, Trash2, Building2, MapPin, Users, DollarSign, Ticket } from "lucide-react"
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
import { useScreenView } from "@/hooks/use-screen-view"

const operationSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  seller_id: z.string().min(1, "El vendedor es requerido"),
  seller_secondary_id: z.string().optional().nullable(),
  commission_split: z.coerce.number().min(0).max(100).optional().nullable(),
  // Overrides absolutos (29/04 — Tomi opción B). Cuando ambos están seteados,
  // la suma debe ser ≤ % comisión del vendedor principal (validación API).
  commission_pct_primary: z.coerce.number().min(0).max(100).optional().nullable(),
  commission_pct_secondary: z.coerce.number().min(0).max(100).optional().nullable(),
  operator_id: z.string().optional().nullable(),
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED", "ASSISTANCE", "ACTIVITY", "CAR"]),
  origin: z.string().optional(),
  destination: z.string().min(1, "El destino es requerido"),
  departure_date: z.date({
    required_error: "La fecha de salida es requerida",
  }),
  return_date: z.date().optional().nullable(),
  // 2026-05-19 (Tomi): editar fecha real de venta para files históricos
  operation_date: z.date().optional(),
  adults: z.coerce.number().min(1, "Debe haber al menos 1 adulto"),
  children: z.coerce.number().min(0),
  infants: z.coerce.number().min(0),
  status: z.enum(["RESERVED", "CONFIRMED", "CANCELLED", "TRAVELLING", "TRAVELLED"]),
  sale_amount_total: z.coerce.number().min(0, "El monto debe ser mayor a 0"),
  operator_cost: z.coerce.number().min(0, "El costo debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  reservation_code_air: z.string().optional().nullable(),
  reservation_code_hotel: z.string().optional().nullable(),
  itr_localizador: z.string().optional().nullable(),
  airline_name: z.string().optional().nullable(),
  hotel_name: z.string().optional().nullable(),
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

const standardStatusOptions = [
  { value: "RESERVED", label: "Reservado", color: "bg-accent-teal" },
  { value: "CONFIRMED", label: "Confirmado", color: "bg-success" },
  { value: "CANCELLED", label: "Cancelado", color: "bg-destructive" },
  { value: "TRAVELLING", label: "En viaje", color: "bg-accent-coral" },
  { value: "TRAVELLED", label: "Viajado", color: "bg-accent-violet" },
]

interface Operation {
  id: string
  agency_id: string
  seller_id: string
  seller_secondary_id?: string | null
  commission_split?: number | null
  commission_pct_primary?: number | null
  commission_pct_secondary?: number | null
  operator_id?: string | null
  type: string
  origin?: string | null
  destination: string
  departure_date: string
  return_date?: string | null
  operation_date?: string | null
  customer_payment_deadline?: string | null
  passenger_notes?: string | null
  adults: number
  children: number
  infants: number
  status: string
  sale_amount_total: number
  operator_cost: number
  currency: string
  sale_currency?: string | null
  operator_cost_currency?: string | null
  margin_amount?: number
  margin_percentage?: number
  reservation_code_air?: string | null
  reservation_code_hotel?: string | null
  itr_localizador?: string | null
  airline_name?: string | null
  hotel_name?: string | null
}

type LegEntry = {
  id?: string
  order_index: number
  destination: string
  departure_date: string
  reservation_code_air: string
  airline_name: string
  itr_localizador: string
  hotel_name: string
  reservation_code_hotel: string
  checkin_date: string
  checkout_date: string
}

interface EditOperationDialogProps {
  operation: Operation
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies: Array<{ id: string; name: string }>
  sellers: SellerOption[]
  operators: Array<{ id: string; name: string }>
  userRole?: string
  operationLegs?: Array<{
    id: string
    order_index: number
    destination: string
    departure_date: string | null
    reservation_code_air: string | null
    airline_name: string | null
    itr_localizador: string | null
    hotel_name: string | null
    reservation_code_hotel: string | null
    checkin_date: string | null
    checkout_date: string | null
  }>
  /** Operadores/productos ya cargados por el server (página de detalle).
   * Si vienen, el dialog inicializa las filas por producto desde acá en vez
   * de un fetch propio (que para algunos roles/casos no traía las filas y
   * dejaba el editor en modo single → el costo cargado se descartaba). */
  operationOperators?: Array<{
    id?: string
    operator_id: string
    cost?: number | string | null
    cost_currency?: string | null
    product_type?: string | null
    notes?: string | null
  }>
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
  operationLegs = [],
  operationOperators = [],
}: EditOperationDialogProps) {
  useScreenView("edit-operation", open)
  const [isLoading, setIsLoading] = useState(false)

  // Estado para crear nuevo operador
  const [showNewOperatorDialog, setShowNewOperatorDialog] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState("")
  const [newOperatorEmail, setNewOperatorEmail] = useState("")
  const [creatingOperator, setCreatingOperator] = useState(false)
  const [localOperators, setLocalOperators] = useState(operators)
  const [customStatuses, setCustomStatuses] = useState<Array<{ value: string; label: string; color?: string }>>([])
  const [customProductTypes, setCustomProductTypes] = useState<Array<{ value: string; label: string }>>([])
  const [customOperationTypes, setCustomOperationTypes] = useState<Array<{ value: string; label: string }>>([])

  // Estado para múltiples operadores
  type OperatorEntry = { operator_id: string; cost: string | number; cost_currency: "ARS" | "USD"; product_type?: string; notes?: string; id?: string; passenger_detail?: Record<string, string>; file_code?: string; payment_due_date?: string; sale_amount?: string | number }
  const [useMultipleOperators, setUseMultipleOperators] = useState(false)
  const [operatorList, setOperatorList] = useState<OperatorEntry[]>([])
  const [operatorsLoaded, setOperatorsLoaded] = useState(false)
  const [legList, setLegList] = useState<LegEntry[]>([])
  // Los tramos sólo se envían al backend si primero se cargaron los existentes.
  // El PATCH hace delete-all + insert, así que enviar [] sin haber cargado borra
  // los tramos guardados (bug reportado 2026-07-21 al editar desde el listado).
  const [legsLoaded, setLegsLoaded] = useState(false)
  const operationCurrency = (operation.sale_currency || operation.currency || "USD") as "ARS" | "USD"
  const operationCostCurrency = (operation.operator_cost_currency || operationCurrency) as "ARS" | "USD"

  // Cargar estados y tipos de producto personalizados
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/operations/settings")
        if (response.ok) {
          const data = await response.json()
          if (data.custom_statuses) {
            setCustomStatuses(data.custom_statuses)
          }
          if (data.custom_product_types) {
            setCustomProductTypes(data.custom_product_types)
          }
          if (data.custom_operation_types) {
            setCustomOperationTypes(data.custom_operation_types)
          }
        }
      } catch (error) {
        console.error("Error loading settings:", error)
      }
    }
    loadSettings()
  }, [])

  // Combinar estados estándar con personalizados
  const statusOptions = useMemo(() => {
    return [...standardStatusOptions, ...customStatuses.map(s => ({ value: s.value, label: s.label, color: s.color || "bg-muted-foreground" }))]
  }, [customStatuses])

  // Tipos de operación disponibles (estándar + personalizados por agencia)
  const availableOperationTypes = useMemo(() => {
    if (customOperationTypes.length > 0) {
      return [...operationTypeOptions, ...customOperationTypes]
    }
    return operationTypeOptions
  }, [customOperationTypes])

  // Tipos de producto disponibles (estándar + personalizados por agencia)
  const availableProductTypes = useMemo(() => {
    if (customProductTypes.length > 0) {
      return [...operationTypeOptions, ...customProductTypes]
    }
    return operationTypeOptions
  }, [customProductTypes])

  // Sincronizar operadores cuando cambian.
  // Bug fix 2026-05-21 (segunda iteración): antes la dep era [operators].
  // El parent puede pasar un nuevo array en cada render (ref distinta aunque
  // el contenido sea el mismo) → setLocalOperators corre cada render →
  // posible contribución al loop infinito. Estabilizo usando el "shape"
  // del array (cantidad + ids concatenados) como dep — es un string
  // primitivo, JS lo compara por valor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLocalOperators(operators)
  }, [operators?.length, operators?.map((o) => o.id).join(",")])

  // Inicializar tramos al abrir el dialog.
  // Bug fix 2026-05-21: `operationLegs` puede venir como nuevo array por render
  // del parent. Sólo inicializar cuando el dialog se abre (open pasa false→true),
  // no cada vez que la referencia cambia.
  // Bug fix 2026-07-21: los callers que no pasan la prop (tabla de operaciones)
  // dejaban legList vacío y el submit borraba los tramos guardados. Ahora, igual
  // que con operadores, hay fallback por fetch y no se envían tramos hasta
  // haberlos cargado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || legsLoaded) return

    const mapLegs = (rows: any[]): LegEntry[] =>
      rows.map((l: any, i: number) => ({
        id: l.id,
        order_index: i,
        destination: l.destination || "",
        departure_date: l.departure_date || "",
        reservation_code_air: l.reservation_code_air || "",
        airline_name: l.airline_name || "",
        itr_localizador: l.itr_localizador || "",
        hotel_name: l.hotel_name || "",
        reservation_code_hotel: l.reservation_code_hotel || "",
        checkin_date: l.checkin_date || "",
        checkout_date: l.checkout_date || "",
      }))

    // 1) Preferir lo que ya trajo el server (vista de detalle).
    if (operationLegs && operationLegs.length > 0) {
      setLegList(mapLegs(operationLegs))
      setLegsLoaded(true)
      return
    }

    // 2) Fallback: fetch propio (ej. tabla de operaciones, que no pasa la prop).
    const loadLegs = async () => {
      try {
        const res = await fetch(`/api/operations/${operation.id}`)
        if (res.ok) {
          const data = await res.json()
          const rows = data.operation?.operation_legs || []
          setLegList(
            mapLegs(
              [...rows].sort(
                (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
              )
            )
          )
          setLegsLoaded(true)
        } else {
          // No pudimos leer los tramos: dejamos legsLoaded en false para que el
          // submit NO mande `legs` y el backend los conserve.
          console.error("No se pudieron cargar los tramos de la operación")
        }
      } catch (err) {
        console.error("Error loading operation legs:", err)
      }
    }
    loadLegs()
  }, [open, legsLoaded, operation.id, operationLegs?.length, operationLegs?.map((l) => l.id || "").join(",")])

  // Cargar operation_operators existentes al abrir el dialog.
  useEffect(() => {
    if (!open || operatorsLoaded) return

    const mapRows = (rows: any[]): OperatorEntry[] =>
      rows.map((oo: any) => ({
        id: oo.id,
        operator_id: oo.operator_id || "",
        cost: Number(oo.cost || 0),
        cost_currency: (oo.cost_currency || operationCostCurrency) as "ARS" | "USD",
        product_type: oo.product_type || undefined,
        notes: oo.notes || undefined,
        passenger_detail: (oo.passenger_detail && typeof oo.passenger_detail === "object") ? oo.passenger_detail : undefined,
        file_code: oo.file_code || undefined,
        payment_due_date: oo.payment_due_date || undefined,
        sale_amount: oo.sale_amount != null ? Number(oo.sale_amount) : undefined, // VIB-112
      }))

    // 1) Preferir los operadores que ya trajo el server (prop). Es confiable y
    //    evita que el editor quede en modo single cuando el fetch propio no
    //    devuelve las filas (en cuyo caso el costo cargado se descartaba).
    if (operationOperators && operationOperators.length > 0) {
      setOperatorList(mapRows(operationOperators))
      setUseMultipleOperators(true)
      setOperatorsLoaded(true)
      return
    }

    // 2) Fallback: fetch propio (callers que no pasan la prop, ej. tabla de operaciones).
    const loadOperators = async () => {
      try {
        const res = await fetch(`/api/operations/${operation.id}`)
        if (res.ok) {
          const data = await res.json()
          const opOps = data.operation?.operation_operators || []
          if (opOps.length > 0) {
            setOperatorList(mapRows(opOps))
            setUseMultipleOperators(true)
          }
        }
      } catch (err) {
        console.error("Error loading operation operators:", err)
        toast.error("Error al cargar operadores")
      }
      setOperatorsLoaded(true)
    }
    loadOperators()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operation.id, operationCostCurrency, operatorsLoaded])

  // Reset operatorsLoaded when dialog closes
  useEffect(() => {
    if (!open) {
      setOperatorsLoaded(false)
      setOperatorList([])
      setUseMultipleOperators(false)
      setLegsLoaded(false)
      setLegList([])
    }
  }, [open])

  // Valores del form derivados de la operación.
  // IMPORTANTE: `defaultValues` y el `form.reset()` de abajo tienen que salir
  // SIEMPRE de acá. RHF `reset(values)` reemplaza el set completo: un campo que
  // esté en defaultValues pero falte en el reset queda `undefined`, y si el
  // submit lo manda como null, borra la columna en la base.
  // (Fix 2026-07-21: commission_pct_primary/secondary se nuleaban en cada
  // edición porque estaban sólo en defaultValues.)
  const buildFormValues = (): DefaultValues<OperationFormValues> => ({
    agency_id: operation.agency_id || "",
    seller_id: operation.seller_id || "",
    seller_secondary_id: operation.seller_secondary_id || null,
    commission_split: operation.commission_split ?? 50,
    commission_pct_primary: operation.commission_pct_primary ?? null,
    commission_pct_secondary: operation.commission_pct_secondary ?? null,
    operator_id: operation.operator_id || null,
    type: (operation.type as any) || "PACKAGE",
    origin: operation.origin || "",
    destination: operation.destination || "",
    // Bug fix 2026-05-21 (VICO/Enzo): parseDateOnlyLocal evita el shift
    // de timezone que hacía `new Date("YYYY-MM-DD")` (interpretado como
    // UTC midnight → en Argentina renderea como día anterior).
    // Ver lib/utils/date-only.ts.
    departure_date: parseDateOnlyLocal(operation.departure_date),
    return_date: parseDateOnlyLocal(operation.return_date) ?? null,
    operation_date: parseDateOnlyLocal(operation.operation_date),
    adults: operation.adults || 1,
    children: operation.children || 0,
    infants: operation.infants || 0,
    status: (operation.status as any) || "RESERVED",
    sale_amount_total: operation.sale_amount_total || 0,
    operator_cost: operation.operator_cost || 0,
    currency: operationCurrency,
    reservation_code_air: operation.reservation_code_air || null,
    reservation_code_hotel: operation.reservation_code_hotel || null,
    itr_localizador: operation.itr_localizador || null,
    airline_name: operation.airline_name || null,
    hotel_name: operation.hotel_name || null,
    customer_payment_deadline: parseDateOnlyLocal(operation.customer_payment_deadline) ?? null,
    passenger_notes: operation.passenger_notes || "",
  })

  const form = useForm<OperationFormValues>({
    resolver: zodResolver(operationSchema) as any,
    defaultValues: buildFormValues(),
  })

  // Reset form when operation changes.
  // Bug fix 2026-05-21 (reportado por Enzo Maineri / VICO):
  // Antes la dep era [operation, form, operationCurrency]. `operation` viene
  // como prop del parent (OperationsTable) y se construye en cada render
  // (split del array filtrado, etc.) → la *referencia* cambia aunque los
  // datos no. Eso disparaba este useEffect en cada render → form.reset() →
  // re-render → loop infinito → React error #185 "Maximum update depth".
  //
  // Fix: comparar por operation.id (string estable) en vez de la ref del
  // objeto. Si el id no cambió, los datos son del mismo lead — no hace falta
  // resetear el form (preserva ediciones in-flight del user).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (operation) {
      // Mismo set de campos que defaultValues (ver buildFormValues arriba).
      form.reset(buildFormValues())
    }
  }, [operation?.id, operationCurrency])

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

  // Funciones de tramos de viaje
  const addLeg = () => {
    setLegList([...legList, {
      order_index: legList.length,
      destination: "",
      departure_date: "",
      reservation_code_air: "",
      airline_name: "",
      itr_localizador: "",
      hotel_name: "",
      reservation_code_hotel: "",
      checkin_date: "",
      checkout_date: "",
    }])
  }
  const removeLeg = (index: number) => setLegList(legList.filter((_, i) => i !== index))
  const updateLegField = (index: number, field: keyof LegEntry, value: string) => {
    setLegList(legList.map((leg, i) => i === index ? { ...leg, [field]: value } : leg))
  }

  // Funciones de múltiples operadores
  const addOperator = () => {
    const currentCurrency = (form.getValues("currency") || "USD") as "ARS" | "USD"
    setOperatorList([...operatorList, { operator_id: "", cost: 0, cost_currency: currentCurrency, product_type: undefined }])
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
    return operatorList.reduce((sum, op) => sum + (Number(op.cost) || 0), 0)
  }, [operatorList])

  // Actualizar operator_cost del form cuando cambia totalOperatorCost.
  // Bug fix 2026-05-21: antes `form` estaba en deps. RHF expone un nuevo
  // objeto-ish en algunos casos → useEffect corre cada render → setValue
  // dispara render → loop. form.setValue es estable, no hace falta dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (useMultipleOperators && operatorList.length > 0) {
      form.setValue("operator_cost", totalOperatorCost)
    }
  }, [totalOperatorCost, useMultipleOperators, operatorList.length])

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
        // Overrides absolutos: solo enviar si hay secondary y los dos están seteados.
        // Si secondary se quita, mandar null para limpiar la operación.
        commission_pct_primary: values.seller_secondary_id && values.commission_pct_primary != null
          ? Number(values.commission_pct_primary)
          : null,
        commission_pct_secondary: values.seller_secondary_id && values.commission_pct_secondary != null
          ? Number(values.commission_pct_secondary)
          : null,
        origin: values.origin || null,
        return_date: values.return_date ? formatDateOnlyLocal(values.return_date) : null,
        departure_date: formatDateOnlyLocal(values.departure_date),
        // 2026-05-19: fecha real de venta editable (para corregir files históricos)
        operation_date: values.operation_date ? formatDateOnlyLocal(values.operation_date) : undefined,
        // Fecha máxima de pago del cliente (usada por el PDF de detalle).
        customer_payment_deadline: values.customer_payment_deadline
          ? formatDateOnlyLocal(values.customer_payment_deadline)
          : null,
        // Info adicional para el pasajero (usada por el PDF de detalle).
        passenger_notes: values.passenger_notes?.trim() || null,
        // Mantener sale_currency y operator_cost_currency sincronizados con currency
        sale_currency: values.currency,
        operator_cost_currency: values.currency,
      }

      if (useMultipleOperators && operatorList.length > 0) {
        payload.operators = operatorList.map(op => ({
          operator_id: op.operator_id,
          cost: Number(op.cost) || 0,
          cost_currency: op.cost_currency || values.currency || "USD",
          product_type: op.product_type || null,
          notes: op.notes || null,
          passenger_detail: sanitizePassengerDetail(op.passenger_detail),
          file_code: (op.file_code || "").trim() || null,
          payment_due_date: op.payment_due_date || null,
          sale_amount: Number(op.sale_amount) || 0, // VIB-112
        }))
        // El operador principal es el primero de la lista
        payload.operator_id = operatorList[0].operator_id || null
        payload.operator_cost = totalOperatorCost
      }

      // Enviar legs SOLO si se cargaron los existentes. El backend hace
      // delete-all + insert: mandar [] sin haber cargado borraría los tramos.
      // `legs_replace` le confirma al backend que esta lista sale de los tramos
      // reales, así que puede borrar los que falten (incluido dejarlo en cero).
      if (legsLoaded) {
        payload.legs_replace = true
        payload.legs = legList
          .filter((l) => l.destination.trim() !== "")
          .map((l, i) => ({
            order_index: i,
            destination: l.destination.trim(),
            departure_date: l.departure_date || null,
            reservation_code_air: l.reservation_code_air || null,
            airline_name: l.airline_name || null,
            itr_localizador: l.itr_localizador || null,
            hotel_name: l.hotel_name || null,
            reservation_code_hotel: l.reservation_code_hotel || null,
            checkin_date: l.checkin_date || null,
            checkout_date: l.checkout_date || null,
          }))
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
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh]">
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
                  marginInfo.isPositive ? "text-success" : "text-destructive"
                )}>
                  {form.watch("currency")} {marginInfo.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className={cn(
                  "text-sm",
                  marginInfo.isPositive ? "text-success" : "text-destructive"
                )}>
                  ({marginInfo.percentage.toFixed(1)}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
            {/* General */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground/70">General</span>
              </div>
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

              {/* Bug #15: Editar Op no exponía Vendedor Secundario, lo que obligaba
                  a borrar y re-crear la operación para convertirla en shared sale.
                  El backend YA acepta seller_secondary_id en el submit (línea ~377)
                  y los campos de commission % aparecen abajo cuando hay secundario.
                  Solo faltaba el selector. */}
              <FormField
                control={form.control}
                name="seller_secondary_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor Secundario</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                      value={field.value ?? "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin vendedor secundario" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin vendedor secundario</SelectItem>
                        {sellers
                          .filter((s) => s.id !== form.watch("seller_id"))
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

              {/* Comisión compartida - dos inputs absolutos (29/04 — Tomi opción B).
                  Solo visible con vendedor secundario. ADMIN/SUPER_ADMIN/CONTABLE pueden
                  editar; resto ve readonly. Validación reactiva: suma ≤ pct del principal.
                  Para operaciones legacy (overrides NULL) seguimos mostrando el input
                  commission_split clásico para no migrarlas automáticamente. */}
              {form.watch("seller_secondary_id") && form.watch("seller_secondary_id") !== "none" && (() => {
                const canEdit = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole || "")
                // Mismo cálculo que el servidor (VIB-63): antes el sugerido del
                // secundario era la mitad del porcentaje del principal.
                const sugerido = previewSharedSplit(
                  sellers,
                  form.watch("seller_id"),
                  form.watch("seller_secondary_id")
                )
                const primaryVal = form.watch("commission_pct_primary")
                const secondaryVal = form.watch("commission_pct_secondary")
                const reparto = previewSharedSplit(
                  sellers,
                  form.watch("seller_id"),
                  form.watch("seller_secondary_id"),
                  { primary: primaryVal, secondary: secondaryVal }
                )
                const sum = reparto.total
                const exceedsCeiling = reparto.exceedsCeiling

                return (
                  <div className="space-y-3 mt-4">
                    {/* Se quitó el aviso de "sistema legacy de split": ese camino
                        de cálculo ya no existe (VIB-63). El reparto lo calcula el
                        servidor salvo que se editen estos valores a mano. */}
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
                    {/* Tope simétrico (VIB-63): idem new-operation-dialog. */}
                    <div className={`text-xs ${exceedsCeiling ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      Suma: {sum.toFixed(2)}%
                      {reparto.ceiling > 0 && <> · Tope: {reparto.ceiling.toFixed(2)}%</>}
                      {exceedsCeiling && " — el reparto no puede superar la comisión más alta de los dos"}
                      {reparto.primaryMax == null && " — falta cargar la comisión del vendedor principal"}
                      {reparto.secondaryMax == null && " — falta cargar la comisión del vendedor secundario"}
                    </div>
                  </div>
                )
              })()}
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
                          className="text-destructive hover:text-destructive/80 h-7 w-7 p-0"
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
                            value={availableProductTypes.some(o => o.value === op.product_type) ? (op.product_type || "") : (op.product_type !== undefined ? "__OTRO__" : "")}
                            onValueChange={(value) => {
                              if (value === "__OTRO__") {
                                updateOperatorField(index, "product_type", "")
                              } else {
                                updateOperatorField(index, "product_type", value)
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
                              onChange={(e) => updateOperatorField(index, "product_type", e.target.value)}
                            />
                          ) : null}
                        </div>

                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Costo *</label>
                          <DecimalInput
                            value={op.cost || ""}
                            onChange={(v) => updateOperatorField(index, "cost", v)}
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

                      {/* VIB-112: precio de venta de ESTE servicio (desglose del
                          total; se usa al facturar por servicio). Sólo con 2+
                          servicios: con uno solo, su precio es el total. */}
                      {operatorList.length >= 2 && (() => {
                        const saleCur = (form.watch("currency") || "USD") as string
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
                              onChange={(v) => updateOperatorField(index, "sale_amount", v)}
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
                        <label className="text-xs font-medium text-muted-foreground mb-2 block">
                          Datos internos (opcional)
                        </label>
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">N° de File (interno)</label>
                            <Input
                              value={op.file_code || ""}
                              onChange={(e) => updateOperatorField(index, "file_code", e.target.value)}
                              placeholder="Código de referencia"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">Fecha máx. de pago</label>
                            <Input
                              type="date"
                              value={op.payment_due_date || ""}
                              onChange={(e) => updateOperatorField(index, "payment_due_date", e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Detalle para el pasajero (opcional), según el tipo de servicio.
                          Se exporta en el PDF "Detalle de la Operación". */}
                      <div className="pt-3 border-t border-border/40">
                        <label className="text-xs font-medium text-muted-foreground mb-2 block">
                          Detalle para el pasajero (opcional)
                        </label>
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                          {PASSENGER_DETAIL_FIELDS[serviceKind(op.product_type)].map((f) => (
                            <div key={f.key}>
                              <label className="text-xs font-medium mb-1.5 block">{f.label}</label>
                              <Input
                                type={f.type === "date" ? "date" : "text"}
                                value={op.passenger_detail?.[f.key] || ""}
                                onChange={(e) =>
                                  updateOperatorField(index, "passenger_detail", {
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

                {operatorList.length > 0 && (
                  <div className="pt-4 mt-4 border-t bg-background/50 rounded-md p-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">Costo Total de Operadores:</span>
                      <span className="font-bold">{form.watch("currency")} {totalOperatorCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* VIB-112: desglose del precio de venta por servicio. Sólo con
                        2+ servicios y venta total cargada (con uno solo su precio
                        es el total; sin total no hay nada que repartir). */}
                    {operatorList.length >= 2 && (Number(form.watch("sale_amount_total")) || 0) > 0 && (() => {
                      const saleCur = (form.watch("currency") || "USD") as string
                      const saleTotal = Number(form.watch("sale_amount_total")) || 0
                      const assigned = operatorList.reduce((s, op) => s + (Number(op.sale_amount) || 0), 0)
                      const anyLoaded = operatorList.some((op) => (Number(op.sale_amount) || 0) > 0)
                      const diff = Math.round((assigned - saleTotal) * 100) / 100
                      const tolerance = Math.max(0.01, Math.abs(saleTotal) * 0.005)
                      const mismatch = anyLoaded && Math.abs(diff) > tolerance
                      return (
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Precio de venta por servicio</span>
                            {anyLoaded && (
                              <span className="text-xs font-medium">
                                {saleCur} {assigned.toLocaleString("es-AR", { minimumFractionDigits: 2 })} / {saleTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            Opcional. Cuánto de la venta corresponde a cada servicio; se usa al facturar cada uno por separado.
                          </p>
                          {mismatch && (
                            <p className="text-xs text-accent-amber mb-2">
                              {diff > 0 ? "Asignaste" : "Falta asignar"} {saleCur} {Math.abs(diff).toLocaleString("es-AR", { minimumFractionDigits: 2 })} respecto del total de venta.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                const cur = (form.watch("currency") || "USD") as "ARS" | "USD"
                                const shares = distributeSaleByCost({
                                  legs: operatorList.map((op) => ({ cost: op.cost, cost_currency: op.cost_currency })),
                                  saleAmountTotal: saleTotal,
                                  saleCurrency: cur === "ARS" ? "ARS" : "USD",
                                })
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
            </div>
            </div>

            {/* Ruta y Fechas */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-medium text-foreground/70">Ruta y Fechas</span>
              </div>
            <div className="grid gap-4 md:grid-cols-2">
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

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="operation_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de venta</FormLabel>
                    <FormControl>
                      <DateInputWithCalendar
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="dd/MM/yyyy"
                        maxDate={new Date()}
                      />
                    </FormControl>
                    <span className="text-[10px] text-muted-foreground">
                      Día en que se concretó la venta. Editala si querés re-imputar el ingreso a otro mes.
                    </span>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            {/* Pasajeros */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground/70">Pasajeros</span>
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
            </div>

            {/* Financiero */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-accent-coral" />
                <span className="text-xs font-medium text-foreground/70">Financiero</span>
              </div>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value)
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
                name="sale_amount_total"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto de Venta *</FormLabel>
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
                        <DecimalInput
                          {...field}
                          value={field.value || ""}
                          onChange={(v) => field.onChange(v)}
                          onFocus={(e) => e.target.select()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            </div>

            {/* Codigos */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5 text-accent-violet" />
                <span className="text-xs font-medium text-foreground/70">Codigos de Reserva</span>
              </div>
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

                <FormField
                  control={form.control}
                  name="itr_localizador"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ITR Localizador</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Código de liquidación del operador"
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

            {/* Tramos del viaje (stopovers) */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-accent-violet" />
                  <span className="text-xs font-medium text-foreground/70">Tramos del viaje</span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLeg}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar tramo
                </Button>
              </div>

              {legList.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin tramos. Usá "Agregar tramo" para registrar stopovers o destinos intermedios.</p>
              ) : (
                <div className="space-y-4">
                  {legList.map((leg, index) => (
                    <div key={index} className="bg-background border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-muted-foreground">Tramo #{index + 1}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLeg(index)} className="text-destructive hover:text-destructive/80 h-7 w-7 p-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Destino *</label>
                          <Input
                            placeholder="Ej: Miami"
                            value={leg.destination}
                            onChange={(e) => updateLegField(index, "destination", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Fecha de salida</label>
                          <Input
                            type="date"
                            value={leg.departure_date}
                            onChange={(e) => updateLegField(index, "departure_date", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Código de reserva aéreo</label>
                          <Input
                            placeholder="Ej: ABC123"
                            value={leg.reservation_code_air}
                            onChange={(e) => updateLegField(index, "reservation_code_air", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Aerolínea</label>
                          <Input
                            placeholder="Ej: Latam"
                            value={leg.airline_name}
                            onChange={(e) => updateLegField(index, "airline_name", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">ITR Localizador</label>
                          <Input
                            placeholder="Código de liquidación"
                            value={leg.itr_localizador}
                            onChange={(e) => updateLegField(index, "itr_localizador", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Hotel</label>
                          <Input
                            placeholder="Ej: Sheraton Miami"
                            value={leg.hotel_name}
                            onChange={(e) => updateLegField(index, "hotel_name", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1.5 block">Código de reserva hotel</label>
                          <Input
                            placeholder="Ej: XYZ789"
                            value={leg.reservation_code_hotel}
                            onChange={(e) => updateLegField(index, "reservation_code_hotel", e.target.value)}
                          />
                        </div>
                        <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">Check-in</label>
                            <Input
                              type="date"
                              value={leg.checkin_date}
                              onChange={(e) => updateLegField(index, "checkin_date", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium mb-1.5 block">Check-out</label>
                            <Input
                              type="date"
                              value={leg.checkout_date}
                              onChange={(e) => updateLegField(index, "checkout_date", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

