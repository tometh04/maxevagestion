"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon, UserPlus, Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"

const operationTypeOptions = [
  { value: "FLIGHT", label: "Vuelo" },
  { value: "HOTEL", label: "Hotel" },
  { value: "PACKAGE", label: "Paquete" },
  { value: "CRUISE", label: "Crucero" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "MIXED", label: "Mixto" },
]

// Destinos populares organizados por región
const popularDestinations = [
  // Argentina
  { value: "Buenos Aires", label: "Buenos Aires", region: "Argentina" },
  { value: "Bariloche", label: "Bariloche", region: "Argentina" },
  { value: "Mendoza", label: "Mendoza", region: "Argentina" },
  { value: "Ushuaia", label: "Ushuaia", region: "Argentina" },
  { value: "Iguazú", label: "Cataratas del Iguazú", region: "Argentina" },
  { value: "Salta", label: "Salta", region: "Argentina" },
  { value: "Córdoba", label: "Córdoba", region: "Argentina" },
  { value: "El Calafate", label: "El Calafate", region: "Argentina" },
  // Caribe
  { value: "Cancún", label: "Cancún", region: "Caribe" },
  { value: "Punta Cana", label: "Punta Cana", region: "Caribe" },
  { value: "Aruba", label: "Aruba", region: "Caribe" },
  { value: "Curaçao", label: "Curaçao", region: "Caribe" },
  { value: "San Andrés", label: "San Andrés", region: "Caribe" },
  { value: "Cartagena", label: "Cartagena", region: "Caribe" },
  { value: "La Habana", label: "La Habana", region: "Caribe" },
  // Brasil
  { value: "Río de Janeiro", label: "Río de Janeiro", region: "Brasil" },
  { value: "Florianópolis", label: "Florianópolis", region: "Brasil" },
  { value: "Salvador de Bahía", label: "Salvador de Bahía", region: "Brasil" },
  { value: "São Paulo", label: "São Paulo", region: "Brasil" },
  { value: "Buzios", label: "Buzios", region: "Brasil" },
  { value: "Maceió", label: "Maceió", region: "Brasil" },
  // Europa
  { value: "Madrid", label: "Madrid", region: "Europa" },
  { value: "Barcelona", label: "Barcelona", region: "Europa" },
  { value: "París", label: "París", region: "Europa" },
  { value: "Roma", label: "Roma", region: "Europa" },
  { value: "Londres", label: "Londres", region: "Europa" },
  { value: "Ámsterdam", label: "Ámsterdam", region: "Europa" },
  { value: "Lisboa", label: "Lisboa", region: "Europa" },
  // EEUU
  { value: "Miami", label: "Miami", region: "EEUU" },
  { value: "Orlando", label: "Orlando", region: "EEUU" },
  { value: "Nueva York", label: "Nueva York", region: "EEUU" },
  { value: "Los Ángeles", label: "Los Ángeles", region: "EEUU" },
  { value: "Las Vegas", label: "Las Vegas", region: "EEUU" },
  // Cruceros
  { value: "Crucero Caribe", label: "Crucero Caribe", region: "Cruceros" },
  { value: "Crucero Mediterráneo", label: "Crucero Mediterráneo", region: "Cruceros" },
  { value: "Crucero Alaska", label: "Crucero Alaska", region: "Cruceros" },
]

// Orígenes comunes
const popularOrigins = [
  { value: "Rosario", label: "Rosario" },
  { value: "Buenos Aires", label: "Buenos Aires" },
  { value: "Córdoba", label: "Córdoba" },
  { value: "Mendoza", label: "Mendoza" },
  { value: "Santa Fe", label: "Santa Fe" },
]

const convertLeadSchema = z.object({
  agency_id: z.string().min(1, "Agencia es requerida"),
  seller_id: z.string().min(1, "Vendedor es requerido"),
  operator_id: z.string().optional(),
  type: z.enum(["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED"]),
  origin: z.string().optional(),
  destination: z.string().min(1, "Destino es requerido"),
  operation_date: z.date({
    required_error: "Fecha de operación es requerida",
  }),
  departure_date: z.date({
    required_error: "Fecha de salida es requerida",
  }),
  return_date: z.date().optional(),
  adults: z.coerce.number().min(1, "Debe haber al menos 1 adulto"),
  children: z.coerce.number().min(0).default(0).optional(),
  infants: z.coerce.number().min(0).default(0).optional(),
  sale_amount_total: z.coerce.number().min(0, "El monto debe ser mayor a 0"),
  operator_cost: z.coerce.number().min(0, "El costo debe ser mayor o igual a 0"),
  commission_percentage: z.coerce.number().min(0).max(100).default(10).optional(),
  currency: z.enum(["ARS", "USD"]).default("ARS").optional(),
  notes: z.string().optional(),
})

type ConvertLeadFormValues = z.infer<typeof convertLeadSchema>

interface ConvertLeadDialogProps {
  lead: {
    id: string
    contact_name: string
    contact_email?: string | null
    contact_phone?: string | null
    destination: string
    status?: string
    agency_id?: string
    assigned_seller_id: string | null
    notes?: string | null
  }
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const leadStatusLabels: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  NEGOTIATION: "Negociación",
  WON: "Ganado",
  LOST: "Perdido",
  BUDGET_SENT: "Presupuesto Enviado",
}

// Estados de leads que NO son destinos
const leadStatusKeywords = [
  "presupuesto", "enviado", "nuevo", "contactado", "calificado",
  "negociacion", "negociación", "ganado", "perdido", "pendiente",
  "seguimiento", "cerrado", "cancelado", "won", "lost", "new",
  "contacted", "qualified", "negotiation", "closed"
]

// Función para limpiar destino de Trello (si no es un destino válido)
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
  
  // Verificar si coincide con algún destino conocido
  const knownDestination = popularDestinations.find(
    d => d.value.toLowerCase() === destLower ||
         d.label.toLowerCase() === destLower
  )
  
  if (knownDestination) {
    return knownDestination.value
  }
  
  // Si contiene números o caracteres raros, limpiar
  if (/\d/.test(destination) || /[^a-záéíóúüñ\s]/i.test(destination)) {
    return ""
  }
  
  return destination
}

export function ConvertLeadDialog({
  lead,
  agencies,
  sellers,
  operators,
  open,
  onOpenChange,
  onSuccess,
}: ConvertLeadDialogProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [originOpen, setOriginOpen] = useState(false)
  const [destinationOpen, setDestinationOpen] = useState(false)
  const [originSearch, setOriginSearch] = useState("")
  const [destinationSearch, setDestinationSearch] = useState("")
  
  // Estado para crear nuevo operador
  const [showNewOperatorDialog, setShowNewOperatorDialog] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState("")
  const [newOperatorEmail, setNewOperatorEmail] = useState("")
  const [creatingOperator, setCreatingOperator] = useState(false)
  const [localOperators, setLocalOperators] = useState(operators)

  // Sincronizar operadores cuando cambian
  useEffect(() => {
    setLocalOperators(operators)
  }, [operators])

  // Limpiar el destino del lead
  const cleanedDestination = useMemo(() => cleanDestination(lead.destination || ""), [lead.destination])

  const form = useForm<ConvertLeadFormValues>({
    resolver: zodResolver(convertLeadSchema),
    defaultValues: {
      agency_id: lead.agency_id || agencies[0]?.id || "",
      seller_id: lead.assigned_seller_id || "",
      operator_id: "",
      type: "PACKAGE" as const,
      origin: "Rosario", // Por defecto Rosario
      destination: cleanedDestination,
      operation_date: new Date(), // Fecha de hoy por defecto
      departure_date: undefined,
      return_date: undefined,
      adults: 2,
      children: 0,
      infants: 0,
      sale_amount_total: 0,
      operator_cost: 0,
      commission_percentage: 10, // 10% por defecto
      currency: "USD", // USD por defecto para viajes
      notes: "",
    },
  })

  // Filtrar destinos según búsqueda
  const filteredDestinations = useMemo(() => {
    if (!destinationSearch) return popularDestinations
    const search = destinationSearch.toLowerCase()
    return popularDestinations.filter(
      d => d.value.toLowerCase().includes(search) || 
           d.label.toLowerCase().includes(search) ||
           d.region.toLowerCase().includes(search)
    )
  }, [destinationSearch])

  // Filtrar orígenes según búsqueda
  const filteredOrigins = useMemo(() => {
    if (!originSearch) return popularOrigins
    const search = originSearch.toLowerCase()
    return popularOrigins.filter(
      o => o.value.toLowerCase().includes(search) || o.label.toLowerCase().includes(search)
    )
  }, [originSearch])

  // Agrupar destinos por región
  const groupedDestinations = useMemo(() => {
    const groups: Record<string, typeof popularDestinations> = {}
    for (const dest of filteredDestinations) {
      if (!groups[dest.region]) {
        groups[dest.region] = []
      }
      groups[dest.region].push(dest)
    }
    return groups
  }, [filteredDestinations])

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

  const onSubmit = async (values: ConvertLeadFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          ...values,
          operator_id: values.operator_id && values.operator_id !== "NONE" ? values.operator_id : null,
          operation_date: values.operation_date.toISOString().split("T")[0],
          departure_date: values.departure_date.toISOString().split("T")[0],
          return_date: values.return_date?.toISOString().split("T")[0],
          commission_percentage: values.commission_percentage || 10,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear operación")
      }

      onSuccess()
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error("Error converting lead:", error)
      alert(error instanceof Error ? error.message : "Error al crear operación")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convertir Lead a Operación</DialogTitle>
          <DialogDescription>
            Crear una nueva operación desde el lead de {lead.contact_name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Info del cliente que se creará - Colores naranjas */}
            <Alert className="bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800">
              <UserPlus className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <AlertDescription className="text-orange-800 dark:text-orange-200">
                <span className="font-medium">Cliente automático:</span> Se creará o asociará automáticamente un cliente con los datos del lead:
                <ul className="mt-1 text-sm list-disc list-inside">
                  <li><strong>Nombre:</strong> {lead.contact_name}</li>
                  {lead.contact_email && <li><strong>Email:</strong> {lead.contact_email}</li>}
                  {lead.contact_phone && <li><strong>Teléfono:</strong> {lead.contact_phone}</li>}
                  {lead.status && <li><strong>Estado Lead:</strong> {leadStatusLabels[lead.status] || lead.status}</li>}
                </ul>
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="agency_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agencia</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <FormLabel>Vendedor</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
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

              <FormField
                control={form.control}
                name="operator_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Operador (Proveedor)</FormLabel>
                    <div className="flex gap-2">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seleccionar operador (opcional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="NONE">Sin operador</SelectItem>
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
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar moneda" />
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

              {/* Fecha de operación (hoy por defecto) */}
              <FormField
                control={form.control}
                name="operation_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Operación</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Origen con combobox */}
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Origen</FormLabel>
                    <Popover open={originOpen} onOpenChange={setOriginOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={originOpen}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value || "Seleccionar origen"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar o escribir origen..." 
                            value={originSearch}
                            onValueChange={(value) => {
                              setOriginSearch(value)
                              field.onChange(value)
                            }}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <Button
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => {
                                  field.onChange(originSearch)
                                  setOriginOpen(false)
                                }}
                              >
                                Usar &quot;{originSearch}&quot;
                              </Button>
                            </CommandEmpty>
                            <CommandGroup heading="Ciudades frecuentes">
                              {filteredOrigins.map((origin) => (
                                <CommandItem
                                  key={origin.value}
                                  value={origin.value}
                                  onSelect={() => {
                                    field.onChange(origin.value)
                                    setOriginOpen(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === origin.value ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {origin.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Destino con combobox agrupado */}
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Destino</FormLabel>
                    <Popover open={destinationOpen} onOpenChange={setDestinationOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={destinationOpen}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value || "Seleccionar destino"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar destino..." 
                            value={destinationSearch}
                            onValueChange={(value) => {
                              setDestinationSearch(value)
                              field.onChange(value)
                            }}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <Button
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => {
                                  field.onChange(destinationSearch)
                                  setDestinationOpen(false)
                                }}
                              >
                                Usar &quot;{destinationSearch}&quot;
                              </Button>
                            </CommandEmpty>
                            {Object.entries(groupedDestinations).map(([region, destinations]) => (
                              <CommandGroup key={region} heading={region}>
                                {destinations.map((dest) => (
                                  <CommandItem
                                    key={dest.value}
                                    value={dest.value}
                                    onSelect={() => {
                                      field.onChange(dest.value)
                                      setDestinationOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === dest.value ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {dest.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="departure_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Salida (Viaje)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
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
                name="return_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Regreso (Opcional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
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
                name="adults"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adultos</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
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
                      <Input type="number" min="0" {...field} />
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
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sale_amount_total"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio al Cliente (Venta Total)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="Ej: 2500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="operator_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo del Operador/Proveedor</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="Ej: 2000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="commission_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisión Vendedor (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.5" min="0" max="100" placeholder="10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Resumen financiero calculado */}
            {form.watch("sale_amount_total") > 0 && (
              <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
                <div className="font-medium text-muted-foreground mb-2">Resumen Financiero:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>Precio Cliente:</div>
                  <div className="font-medium text-right">
                    {form.watch("currency")} {form.watch("sale_amount_total")?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                  <div>Costo Operador:</div>
                  <div className="font-medium text-right">
                    {form.watch("currency")} {form.watch("operator_cost")?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                  <div>Margen Bruto:</div>
                  <div className={cn(
                    "font-medium text-right",
                    (form.watch("sale_amount_total") - form.watch("operator_cost")) >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {form.watch("currency")} {(form.watch("sale_amount_total") - form.watch("operator_cost")).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    {" "}({form.watch("sale_amount_total") > 0 
                      ? (((form.watch("sale_amount_total") - form.watch("operator_cost")) / form.watch("sale_amount_total")) * 100).toFixed(1)
                      : 0}%)
                  </div>
                  <div>Comisión Vendedor:</div>
                  <div className="font-medium text-right text-amber-600">
                    {form.watch("currency")} {((form.watch("sale_amount_total") - form.watch("operator_cost")) * (form.watch("commission_percentage") || 0) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    {" "}({form.watch("commission_percentage") || 0}%)
                  </div>
                  <div className="border-t pt-1">Ganancia Neta:</div>
                  <div className={cn(
                    "font-semibold text-right border-t pt-1",
                    ((form.watch("sale_amount_total") - form.watch("operator_cost")) * (1 - (form.watch("commission_percentage") || 0) / 100)) >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {form.watch("currency")} {((form.watch("sale_amount_total") - form.watch("operator_cost")) * (1 - (form.watch("commission_percentage") || 0) / 100)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Observaciones adicionales..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
              <Label htmlFor="operator-name">Nombre del operador *</Label>
              <Input
                id="operator-name"
                placeholder="Ej: Despegar, Booking, etc."
                value={newOperatorName}
                onChange={(e) => setNewOperatorName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-email">Email (opcional)</Label>
              <Input
                id="operator-email"
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
