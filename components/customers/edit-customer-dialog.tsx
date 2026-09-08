"use client"

import { useState, useEffect, useMemo } from "react"
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
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2, User, FileText, Globe, Settings2 } from "lucide-react"
import { useCustomerSettings } from "@/hooks/use-customer-settings"
import { CustomFieldsForm } from "./custom-fields-form"
import { ReferralPartnerSelect, type ReferralValue } from "./referral-partner-select"
import { Checkbox } from "@/components/ui/checkbox"
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
import { format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Ventas del cliente que quedaron sin comisión de referido, tal como las
 * devuelve `/api/customers/[id]/referral-commissions`.
 */
interface PendingReferralOperation {
  operationId: string
  fileCode: string | null
  operationDate: string | null
  destination: string | null
  marginAmount: number
  currency: string
  percentage: number
  amount: number
}

interface PendingReferralPayload {
  referral: { partnerId: string | null; partnerName: string | null; percentage: number }
  operations: PendingReferralOperation[]
  truncated: boolean
}

const fmtMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(value || 0)

const fmtDate = (value: string | null) => {
  const parsed = value ? parseDateOnlyLocal(value) : null
  return parsed ? format(parsed, "dd/MM/yyyy", { locale: es }) : "Sin fecha"
}

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  instagram_handle?: string | null
  document_type?: string | null
  document_number?: string | null
  date_of_birth?: string | null
  nationality?: string | null
  referral_partner_id?: string | null
  referral_commission_percentage?: number | null
}

interface EditCustomerDialogProps {
  customer: Customer
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const documentTypes = [
  { value: "DNI", label: "DNI" },
  { value: "PASSPORT", label: "Pasaporte" },
  { value: "CUIT", label: "CUIT" },
  { value: "CUIL", label: "CUIL" },
  { value: "OTHER", label: "Otro" },
]

const nationalities = [
  { value: "Argentina", label: "Argentina" },
  { value: "Brasil", label: "Brasil" },
  { value: "Chile", label: "Chile" },
  { value: "Uruguay", label: "Uruguay" },
  { value: "Paraguay", label: "Paraguay" },
  { value: "Colombia", label: "Colombia" },
  { value: "México", label: "México" },
  { value: "España", label: "España" },
  { value: "Estados Unidos", label: "Estados Unidos" },
  { value: "Otro", label: "Otro" },
]

export function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
  onSuccess,
}: EditCustomerDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  /**
   * Segundo paso del diálogo: al marcar un referidor en un cliente que ya tiene
   * ventas cargadas, esas ventas no generaron comisión (se calcula al guardar la
   * venta). Acá se eligen cuáles completar. Null = paso normal de edición.
   */
  const [pendingReferral, setPendingReferral] = useState<PendingReferralPayload | null>(null)
  const [selectedOperations, setSelectedOperations] = useState<Set<string>>(new Set())
  const [applyingReferral, setApplyingReferral] = useState(false)
  const { settings, loading: settingsLoading } = useCustomerSettings()
  const [referral, setReferral] = useState<ReferralValue>({
    referralPartnerId: customer.referral_partner_id ?? null,
    referralCommissionPercentage:
      customer.referral_commission_percentage != null
        ? String(customer.referral_commission_percentage)
        : "",
  })

  // Sincronizar el estado de referido cuando cambia el cliente (reapertura).
  useEffect(() => {
    setReferral({
      referralPartnerId: customer.referral_partner_id ?? null,
      referralCommissionPercentage:
        customer.referral_commission_percentage != null
          ? String(customer.referral_commission_percentage)
          : "",
    })
  }, [customer])

  // Generar schema dinámicamente según configuración
  const customerSchema = useMemo(() => {
    // Schema base
    const baseFields: Record<string, z.ZodTypeAny> = {
      first_name: z.string().min(1, "Nombre es requerido"),
      last_name: z.string().min(1, "Apellido es requerido"),
      phone: z.string().optional(),
      email: z.string().email("Email inválido"),
      instagram_handle: z.string().optional(),
      document_type: z.string().optional(),
      document_number: z.string().optional(),
      date_of_birth: z.string().optional(),
      nationality: z.string().optional(),
    }

    // Aplicar validaciones de configuración
    if (settings?.validations) {
      const validations = settings.validations
      
      if (validations.email?.required) {
        baseFields.email = z.string().min(1, "Email es requerido").email("Email inválido")
      }
      
    }

    // Agregar campos personalizados al schema
    if (settings?.custom_fields) {
      settings.custom_fields.forEach((field) => {
        let fieldSchema: z.ZodTypeAny
        
        switch (field.type) {
          case 'number':
            fieldSchema = field.required 
              ? z.number({ required_error: `${field.label} es requerido` })
              : z.number().optional()
            break
          case 'email':
            fieldSchema = field.required
              ? z.string().min(1, `${field.label} es requerido`).email(`${field.label} inválido`)
              : z.string().email(`${field.label} inválido`).optional()
            break
          default:
            fieldSchema = field.required
              ? z.string().min(1, `${field.label} es requerido`)
              : z.string().optional()
        }
        
        baseFields[field.name] = fieldSchema
      })
    }

    return z.object(baseFields)
  }, [settings])

  type CustomerFormValues = z.infer<typeof customerSchema>

  // Generar valores por defecto incluyendo campos personalizados
  const defaultValues = useMemo(() => {
    const baseDefaults: any = {
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      instagram_handle: customer.instagram_handle || "",
      document_type: customer.document_type || "",
      document_number: customer.document_number || "",
      date_of_birth: customer.date_of_birth ? customer.date_of_birth.split("T")[0] : "",
      nationality: customer.nationality || "",
    }

    // Agregar valores de campos personalizados desde el customer (si existen)
    if (settings?.custom_fields) {
      settings.custom_fields.forEach((field) => {
        baseDefaults[field.name] = (customer as any)[field.name] || field.default_value || (field.type === 'number' ? undefined : '')
      })
    }

    return baseDefaults
  }, [customer, settings])

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  })

  // Reset form when customer or settings change
  useEffect(() => {
    if (customer && settings && !settingsLoading) {
      form.reset(defaultValues)
    }
  }, [customer, settings, settingsLoading, defaultValues, form])

  const onSubmit = async (values: CustomerFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          instagram_handle: values.instagram_handle || null,
          document_type: values.document_type || null,
          document_number: values.document_number || null,
          date_of_birth: values.date_of_birth || null,
          nationality: values.nationality || null,
          referral_partner_id: referral.referralPartnerId,
          referral_commission_percentage:
            referral.referralPartnerId && referral.referralCommissionPercentage.trim() !== ""
              ? referral.referralCommissionPercentage
              : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar cliente")
      }

      toast.success("Cliente actualizado correctamente")

      // Referidor recién asignado: sus ventas ya cargadas no generaron comisión,
      // porque se calcula al guardar la venta. Si hay alguna, se ofrece
      // completarla antes de cerrar en vez de dejarlo pasar en silencio.
      const partnerAdded =
        !!referral.referralPartnerId &&
        referral.referralPartnerId !== (customer.referral_partner_id ?? null)

      if (partnerAdded) {
        const pending = await fetchPendingReferral()
        if (pending && pending.operations.length > 0) {
          setPendingReferral(pending)
          // Nada tildado por default: cada tilde genera plata a favor del
          // referidor, así que la elección es explícita.
          setSelectedOperations(new Set())
          return
        }
      }

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating customer:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar cliente")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPendingReferral = async (): Promise<PendingReferralPayload | null> => {
    try {
      const res = await fetch(`/api/customers/${customer.id}/referral-commissions`)
      if (!res.ok) return null
      return (await res.json()) as PendingReferralPayload
    } catch (error) {
      // No bloquea: el cliente ya se guardó bien. Peor sería mostrar un error
      // sobre el guardado que sí funcionó.
      console.error("Error buscando ventas sin comisión de referido:", error)
      return null
    }
  }

  const closeAfterReferralStep = () => {
    setPendingReferral(null)
    setSelectedOperations(new Set())
    onSuccess()
    onOpenChange(false)
  }

  const applyReferralCommissions = async () => {
    if (selectedOperations.size === 0) return
    setApplyingReferral(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}/referral-commissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationIds: Array.from(selectedOperations) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "No se pudieron generar las comisiones")

      toast.success(
        data.created === 1
          ? "Se generó la comisión del referidor"
          : `Se generaron ${data.created} comisiones del referidor`,
        data.failed > 0
          ? { description: `${data.failed} venta(s) no se pudieron procesar.` }
          : undefined
      )
      closeAfterReferralStep()
    } catch (error) {
      console.error("Error generando comisiones de referido:", error)
      toast.error(error instanceof Error ? error.message : "No se pudieron generar las comisiones")
    } finally {
      setApplyingReferral(false)
    }
  }

  if (pendingReferral) {
    const total = pendingReferral.operations
      .filter((op) => selectedOperations.has(op.operationId))
      .reduce((sum, op) => sum + op.amount, 0)
    const totalCurrency =
      pendingReferral.operations.find((op) => selectedOperations.has(op.operationId))?.currency ??
      "ARS"
    const mixedCurrencies = new Set(
      pendingReferral.operations
        .filter((op) => selectedOperations.has(op.operationId))
        .map((op) => op.currency)
    ).size > 1

    return (
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeAfterReferralStep())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ventas anteriores del referidor</DialogTitle>
            <DialogDescription>
              {pendingReferral.referral.partnerName || "El referidor"} quedó cargado en{" "}
              {customer.first_name} {customer.last_name}, pero estas ventas ya estaban hechas y no
              generaron comisión. Elegí a cuáles corresponde aplicársela.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {pendingReferral.operations.map((op) => {
              const checked = selectedOperations.has(op.operationId)
              return (
                <label
                  key={op.operationId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      setSelectedOperations((prev) => {
                        const next = new Set(prev)
                        if (next.has(op.operationId)) next.delete(op.operationId)
                        else next.add(op.operationId)
                        return next
                      })
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {fmtDate(op.operationDate)} · {op.destination || "Sin destino"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {op.fileCode || op.operationId.slice(0, 8)} · Ganancia{" "}
                      {fmtMoney(op.marginAmount, op.currency)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                    {fmtMoney(op.amount, op.currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({op.percentage}%)
                    </span>
                  </p>
                </label>
              )
            })}

            {pendingReferral.truncated && (
              <p className="text-xs text-muted-foreground">
                Se revisaron las ventas más recientes del cliente. Si falta alguna más vieja,
                editala y guardala para que genere la comisión.
              </p>
            )}
          </div>

          <DialogFooter className="px-6 pb-5">
            <div className="mr-auto text-sm">
              {selectedOperations.size > 0 && !mixedCurrencies && (
                <>
                  <span className="text-muted-foreground">Total a generar: </span>
                  <span className="font-semibold tabular-nums">
                    {fmtMoney(total, totalCurrency)}
                  </span>
                </>
              )}
              {mixedCurrencies && (
                <span className="text-muted-foreground">
                  Seleccionaste ventas en distintas monedas: cada comisión queda en la suya.
                </span>
              )}
            </div>
            <Button variant="outline" onClick={closeAfterReferralStep} disabled={applyingReferral}>
              Ahora no
            </Button>
            <Button
              onClick={applyReferralCommissions}
              disabled={applyingReferral || selectedOperations.size === 0}
            >
              {applyingReferral ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                `Generar comisión (${selectedOperations.size})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>
            Modifica los datos del cliente {customer.first_name} {customer.last_name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Datos Personales */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos Personales</h4>
              </div>
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre *</FormLabel>
                      <FormControl>
                        <Input placeholder="Juan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido *</FormLabel>
                      <FormControl>
                        <Input placeholder="Pérez" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input placeholder="+54 11 1234-5678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="juan@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instagram_handle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram</FormLabel>
                      <FormControl>
                        <Input placeholder="@usuario" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Documento */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <FileText className="h-3.5 w-3.5 text-success" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Documento</h4>
              </div>
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="document_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Documento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {documentTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                  name="document_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Documento</FormLabel>
                      <FormControl>
                        <Input placeholder="12345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date_of_birth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Nacimiento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nacionalidad</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar nacionalidad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {nationalities.map((nat) => (
                            <SelectItem key={nat.value} value={nat.value}>
                              {nat.label}
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

            {/* Referido (VIB-62) */}
            <ReferralPartnerSelect value={referral} onChange={setReferral} />

            {/* Campos personalizados */}
            {settings?.custom_fields && settings.custom_fields.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-violet/10">
                    <Settings2 className="h-3.5 w-3.5 text-accent-violet" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Información Adicional</h4>
                </div>
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                  <CustomFieldsForm
                    control={form.control}
                    customFields={settings.custom_fields}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
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
    </Dialog>
  )
}

