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
import { Textarea } from "@/components/ui/textarea"
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
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const recurringPaymentSchema = z.object({
  provider_name: z.string().min(3, "El proveedor debe tener al menos 3 caracteres"),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  start_date: z.string().min(1, "La fecha de inicio es requerida"),
  end_date: z.string().optional().nullable(),
  description: z.string().min(1, "La descripción es requerida"),
  notes: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
})

type RecurringPaymentFormValues = z.infer<typeof recurringPaymentSchema>

const frequencyOptions = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "MONTHLY", label: "Mensual" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "YEARLY", label: "Anual" },
]

interface NewRecurringPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewRecurringPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewRecurringPaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [hasEndDate, setHasEndDate] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  const [providerSearch, setProviderSearch] = useState("")
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string; color: string }>>([])

  const form = useForm<RecurringPaymentFormValues>({
    resolver: zodResolver(recurringPaymentSchema) as any,
    defaultValues: {
      provider_name: "",
      amount: 0,
      currency: "USD",
      frequency: "MONTHLY",
      start_date: new Date().toISOString().split("T")[0],
      end_date: null,
      description: "",
      notes: null,
      invoice_number: null,
      reference: null,
      category_id: "none",
    },
  })

  // Cargar proveedores existentes
  const fetchProviders = async () => {
    try {
      setLoadingProviders(true)
      const response = await fetch("/api/recurring-payments/providers")
      if (response.ok) {
        const data = await response.json()
        setProviders(data.providers || [])
      }
    } catch (error) {
      console.error("Error fetching providers:", error)
    } finally {
      setLoadingProviders(false)
    }
  }

  // Cargar categorías
  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/accounting/recurring-payments/categories")
      if (response.ok) {
        const data = await response.json()
        setCategories(data.categories || [])
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
    }
  }

  useEffect(() => {
    if (open) {
      form.reset()
      setHasEndDate(false)
      setProviderSearch("")
      fetchProviders()
      fetchCategories()
    }
  }, [open, form])

  // Filtrar proveedores basado en búsqueda
  const filteredProviders = useMemo(() => {
    if (!providerSearch) return providers
    return providers.filter(p => 
      p.toLowerCase().includes(providerSearch.toLowerCase())
    )
  }, [providers, providerSearch])

  // Verificar si el texto de búsqueda es un nuevo proveedor
  const isNewProvider = useMemo(() => {
    if (!providerSearch || providerSearch.length < 3) return false
    return !providers.some(p => p.toLowerCase() === providerSearch.toLowerCase())
  }, [providers, providerSearch])

  const handleSelectProvider = (value: string) => {
    form.setValue("provider_name", value)
    setProviderOpen(false)
    setProviderSearch("")
  }

  const handleCreateNewProvider = async () => {
    if (providerSearch.length < 3) {
      toast.error("El nombre del proveedor debe tener al menos 3 caracteres")
      return
    }

    try {
      // Guardar el nuevo proveedor en el backend
      const response = await fetch("/api/recurring-payments/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: providerSearch }),
      })

      if (response.ok) {
        // Agregar a la lista local
        setProviders(prev => [providerSearch, ...prev])
        form.setValue("provider_name", providerSearch)
        setProviderOpen(false)
        setProviderSearch("")
        toast.success(`Proveedor "${providerSearch}" creado`)
      } else {
        const error = await response.json()
        toast.error(error.error || "Error al crear proveedor")
      }
    } catch (error) {
      console.error("Error creating provider:", error)
      toast.error("Error al crear proveedor")
    }
  }

  const onSubmit = async (values: RecurringPaymentFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/recurring-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          end_date: hasEndDate ? values.end_date : null,
          category_id: values.category_id === "none" ? null : values.category_id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear pago recurrente")
      }

      toast.success("Pago recurrente creado exitosamente")
      onSuccess()
      onOpenChange(false)
      form.reset()
    } catch (error: any) {
      console.error("Error creating recurring payment:", error)
      toast.error(error.message || "Error al crear pago recurrente")
    } finally {
      setIsLoading(false)
    }
  }

  const selectedProvider = form.watch("provider_name")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Pago Recurrente</DialogTitle>
          <DialogDescription>
            Crea un pago recurrente que se generará automáticamente según la frecuencia configurada
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Proveedor con Combobox */}
              <FormField
                control={form.control}
                name="provider_name"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Proveedor *</FormLabel>
                    <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={providerOpen}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value || "Seleccionar o crear proveedor..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <div className="flex items-center border-b px-3">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input
                              placeholder="Buscar o crear proveedor..."
                              value={providerSearch}
                              onChange={(e) => setProviderSearch(e.target.value)}
                              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                          <CommandList>
                            {/* Opción de crear nuevo siempre arriba */}
                            {isNewProvider && (
                              <>
                                <CommandGroup heading="Crear nuevo">
                                  <CommandItem
                                    onSelect={handleCreateNewProvider}
                                    className="cursor-pointer"
                                  >
                                    <Plus className="mr-2 h-4 w-4 text-green-500" />
                                    <span>Crear &quot;{providerSearch}&quot;</span>
                                  </CommandItem>
                                </CommandGroup>
                                <CommandSeparator />
                              </>
                            )}
                            
                            {loadingProviders ? (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                Cargando proveedores...
                              </div>
                            ) : filteredProviders.length === 0 && !isNewProvider ? (
                              <CommandEmpty>
                                {providerSearch.length < 3 
                                  ? "Escribe al menos 3 caracteres para crear uno nuevo"
                                  : "No se encontraron proveedores"
                                }
                              </CommandEmpty>
                            ) : (
                              <CommandGroup heading="Proveedores existentes">
                                {filteredProviders.map((provider) => (
                                  <CommandItem
                                    key={provider}
                                    value={provider}
                                    onSelect={() => handleSelectProvider(provider)}
                                    className="cursor-pointer"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedProvider === provider
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {provider}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
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
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frecuencia *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {frequencyOptions.map((option) => (
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda *</FormLabel>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Inicio *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <div className="flex items-center gap-2">
                        <span>Fecha de Fin (Opcional)</span>
                        <Switch
                          checked={hasEndDate}
                          onCheckedChange={(checked) => {
                            setHasEndDate(checked)
                            if (!checked) {
                              field.onChange(null)
                            }
                          }}
                        />
                      </div>
                    </FormLabel>
                    {hasEndDate && (
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                    )}
                    {!hasEndDate && (
                      <p className="text-sm text-muted-foreground">
                        Si no se especifica, el pago continuará indefinidamente
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Servidor Vercel, Alquiler oficina" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría (Opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoice_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Factura (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: FAC-001-2025" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referencia (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Referencia adicional" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Notas adicionales sobre este pago recurrente"
                      {...field}
                      value={field.value || ""}
                    />
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
                {isLoading ? "Creando..." : "Crear Pago Recurrente"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
