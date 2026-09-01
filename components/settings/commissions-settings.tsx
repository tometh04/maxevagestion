"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { es } from "date-fns/locale"
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
import { Percent, Plus, Info, Settings2, Calendar, Wallet, Users } from "lucide-react"
import { toast } from "sonner"
// Fix UTC shift en fechas DATE (VICO 2026-05-22)
import { parseDateOnlyLocal, formatDateOnlyLocal } from "@/lib/utils/date-only"
import { SELLER_OPTION_ROLES } from "@/lib/sellers/seller-option"
import {
  resolveEffectivePercentage,
  type SellerPercentageSource,
} from "@/lib/commissions/seller-commission-profile"

// Umbral de cobranza (% de la venta cobrado) a partir del cual una comisión
// PENDING se puede pagar al vendedor. Configurable por agencia:
//   - 95% (default): no se paga hasta cobrar casi todo.
//   - 0%: se paga aunque la operación no esté cobrada (ej. pago al cierre de mes).
const COMMISSION_THRESHOLD_KEY = "commissions.payout_collection_threshold"

const commissionRuleSchema = z.object({
  type: z.enum(["SELLER", "AGENCY"]),
  basis: z.enum(["FIXED_PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.number().min(0),
  destination_region: z.string().optional().nullable(),
  agency_id: z.string().optional().nullable(),
  seller_id: z.string().optional().nullable(),
  valid_from: z.string().min(1, "La fecha de inicio es requerida"),
  valid_to: z.string().optional().nullable(),
})

type CommissionRuleFormValues = z.infer<typeof commissionRuleSchema>

interface CommissionRule {
  id: string
  type: "SELLER" | "AGENCY"
  basis: "FIXED_PERCENTAGE" | "FIXED_AMOUNT"
  value: number
  destination_region: string | null
  agency_id: string | null
  /**
   * VIB-124: una regla puede apuntar a un vendedor concreto. Existía en la base
   * y la usaba el motor de cálculo, pero esta pantalla la ignoraba: por eso el
   * admin veía N filas iguales salvo el número, sin saber de quién era cada una.
   */
  seller_id: string | null
  /** Nombre resuelto por la API (join a users). null si la regla es genérica. */
  seller_name: string | null
  valid_from: string
  valid_to: string | null
  created_at: string
  updated_at: string
}

/** Vendedor elegible para una regla propia. */
interface SellerOption {
  id: string
  name: string | null
  email: string | null
  default_commission_percentage: number | null
}

/** "Vendedor · 15%" para el desplegable, sin romper si falta el nombre. */
function sellerOptionLabel(seller: SellerOption): string {
  const name = seller.name || seller.email || "Sin nombre"
  const pct = seller.default_commission_percentage
  return pct == null ? name : `${name} · ${pct}% hoy`
}

/**
 * A quién se le aplica la regla, en una celda (VIB-124).
 *
 * El caso que motivó el ticket: Lozada tiene 13 reglas de vendedor y todas se
 * veían idénticas salvo el porcentaje, así que no había forma de saber cuál
 * tocar. "Todos" es literal: una regla sin vendedor ni agencia es el default de
 * la organización.
 */
function describeRuleScope(
  rule: Pick<CommissionRule, "type" | "seller_id" | "seller_name" | "agency_id">,
  agencies: Array<{ id: string; name: string }>
): string {
  if (rule.type === "SELLER" && rule.seller_id) {
    // El nombre puede faltar si el usuario fue dado de baja: mejor decirlo que
    // mostrar la celda vacía y volver al problema original.
    return rule.seller_name || "Vendedor dado de baja"
  }
  if (rule.agency_id) {
    return agencies.find((a) => a.id === rule.agency_id)?.name || "Agencia"
  }
  return "Todos"
}

/** Lo mínimo que hace falta para ofrecer arrastrar una regla a lo ya calculado. */
interface RuleToApply {
  id: string
  seller_id: string | null
  seller_name: string | null
  value: number
  valid_from: string
  valid_to: string | null
}

/** Lo que devuelve el GET de alcance: cuántas comisiones toca y cuántas no. */
interface ApplyPreview {
  percentage: number
  window: { from: string; to: string | null }
  aRecalcular: number
  bloqueadas: number
  yaEnElPorcentaje: number
}

interface ApplyDialogState {
  open: boolean
  rule: RuleToApply | null
  preview: ApplyPreview | null
  error: string | null
  loading: boolean
}

/** Cómo se le explica al usuario de dónde salió el porcentaje. */
const ORIGEN_PORCENTAJE: Record<SellerPercentageSource, string> = {
  SELLER_RULE: "Regla propia",
  USER_DEFAULT: "El que se cargó al crear el usuario",
  ORG_RULE: "La regla general de la agencia",
  NONE: "Ninguna: no se le calcula comisión",
}

export function CommissionsSettings() {
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)
  const [agencies, setAgencies] = useState<Array<{ id: string; name: string }>>([])
  const [sellers, setSellers] = useState<SellerOption[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)
  // Umbral de cobranza para habilitar el pago de comisión (% de la venta cobrado).
  const [collectionThreshold, setCollectionThreshold] = useState<string>("95")
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [applyDialog, setApplyDialog] = useState<ApplyDialogState>({
    open: false,
    rule: null,
    preview: null,
    error: null,
    loading: false,
  })
  const [applying, setApplying] = useState(false)

  const form = useForm<CommissionRuleFormValues>({
    resolver: zodResolver(commissionRuleSchema),
    defaultValues: {
      type: "SELLER",
      basis: "FIXED_PERCENTAGE",
      value: 0,
      destination_region: null,
      agency_id: null,
      seller_id: null,
      valid_from: formatDateOnlyLocal(new Date()) ?? "",
      valid_to: null,
    },
  })

  useEffect(() => {
    fetchRules()
    fetchAgencies()
    fetchSellers()
    fetchThreshold()
  }, [])

  /**
   * La regla general de la organización: la que no apunta a nadie en concreto.
   * Sólo cuenta como porcentaje si está expresada en porcentaje —- una regla de
   * monto fijo no es un "X%" que se pueda mostrar en la columna.
   */
  const reglaGeneralPct = useMemo(() => {
    const generica = rules.find(
      (r) =>
        r.type === "SELLER" &&
        !r.seller_id &&
        !r.agency_id &&
        !r.destination_region &&
        r.basis === "FIXED_PERCENTAGE"
    )
    return generica ? Number(generica.value) : null
  }, [rules])

  /**
   * Los vendedores que no tienen una regla propia, con lo que cobran hoy.
   *
   * Cualquier regla con `seller_id` cuenta, incluso una con vigencia futura: la
   * persona ya está configurada y ofrecerle "Configurar" llevaría a crear una
   * segunda regla para el mismo vendedor.
   */
  const sellersSinRegla = useMemo(() => {
    const conRegla = new Set(rules.map((r) => r.seller_id).filter(Boolean) as string[])
    return sellers
      .filter((s) => !conRegla.has(s.id))
      .map((seller) => ({
        seller,
        ...resolveEffectivePercentage({
          sellerRule: null,
          userDefault: seller.default_commission_percentage,
          orgRule: reglaGeneralPct,
        }),
      }))
      .sort((a, b) => (a.seller.name || "").localeCompare(b.seller.name || "", "es"))
  }, [sellers, rules, reglaGeneralPct])

  const fetchThreshold = async () => {
    try {
      const response = await fetch(`/api/settings/organization?key=${COMMISSION_THRESHOLD_KEY}`)
      const data = await response.json()
      const row = (data.data || []).find((x: any) => x.key === COMMISSION_THRESHOLD_KEY)
      if (row && row.value != null && String(row.value).trim() !== "") {
        setCollectionThreshold(String(row.value))
      }
    } catch (error) {
      console.error("Error fetching commission threshold:", error)
    }
  }

  const saveThreshold = async () => {
    const pct = Math.min(100, Math.max(0, Number(collectionThreshold) || 0))
    setSavingThreshold(true)
    try {
      const response = await fetch("/api/settings/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: COMMISSION_THRESHOLD_KEY, value: String(pct) }),
      })
      if (!response.ok) throw new Error("save failed")
      setCollectionThreshold(String(pct))
      toast.success("Umbral de cobranza actualizado")
    } catch (error) {
      console.error("Error saving commission threshold:", error)
      toast.error("Error al guardar el umbral")
    } finally {
      setSavingThreshold(false)
    }
  }

  const fetchRules = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/settings/commissions")
      const data = await response.json()
      setRules(data.rules || [])
    } catch (error) {
      console.error("Error fetching rules:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAgencies = async () => {
    try {
      const response = await fetch("/api/settings/agencies")
      const data = await response.json()
      setAgencies(data.agencies || [])
    } catch (error) {
      console.error("Error fetching agencies:", error)
    }
  }

  // Vendedores elegibles para una regla propia. Se incluyen ADMIN/SUPER_ADMIN
  // porque en las agencias chicas el dueño también vende y cobra comisión, y
  // POST_VENTA porque también genera comisiones: la lista sale de
  // `SELLER_OPTION_ROLES`, que es la misma que usan el resto de los selectores.
  //
  // Estaba hardcodeada sin POST_VENTA, y el efecto era que a esa gente el
  // sistema le calculaba comisión con la regla genérica de la organización pero
  // no había forma de darles la suya desde la pantalla. Reportado por Lozada:
  // una administrativa con 19 comisiones generadas al 20% de la regla general
  // cuando le corresponde 5%.
  const fetchSellers = async () => {
    try {
      const response = await fetch(`/api/users?role=${SELLER_OPTION_ROLES.join(",")}`)
      const data = await response.json()
      setSellers(data.users || [])
    } catch (error) {
      console.error("Error fetching sellers:", error)
    }
  }

  /**
   * Nueva regla ya apuntando a un vendedor, con el porcentaje que cobra hoy.
   *
   * Precargar el número importa: quien viene a subirle 5 puntos a alguien no
   * tiene por qué acordarse de cuánto cobraba, y un formulario en 0 invita a
   * guardar un 0 sin querer.
   */
  const handleOpenDialogForSeller = (sellerId: string, percentage: number | null) => {
    setEditingRule(null)
    form.reset({
      type: "SELLER",
      basis: "FIXED_PERCENTAGE",
      value: percentage ?? 0,
      destination_region: null,
      agency_id: null,
      seller_id: sellerId,
      valid_from: formatDateOnlyLocal(new Date()) ?? "",
      valid_to: null,
    })
    setDialogOpen(true)
  }

  const handleOpenDialog = (rule?: CommissionRule) => {
    if (rule) {
      setEditingRule(rule)
      form.reset({
        type: rule.type,
        basis: rule.basis,
        value: rule.value,
        destination_region: rule.destination_region || null,
        agency_id: rule.agency_id || null,
        seller_id: rule.seller_id || null,
        valid_from: rule.valid_from.split("T")[0],
        valid_to: rule.valid_to ? rule.valid_to.split("T")[0] : null,
      })
    } else {
      setEditingRule(null)
      form.reset({
        type: "SELLER",
        basis: "FIXED_PERCENTAGE",
        value: 0,
        destination_region: null,
        agency_id: null,
        seller_id: null,
        valid_from: formatDateOnlyLocal(new Date()) ?? "",
        valid_to: null,
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async (values: CommissionRuleFormValues) => {
    setIsSaving(true)
    try {
      let guardadaId: string | null = editingRule?.id ?? null

      if (editingRule) {
        // Update
        const response = await fetch(`/api/settings/commissions/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })

        if (!response.ok) {
          throw new Error("Error al actualizar")
        }
      } else {
        // Create
        const response = await fetch("/api/settings/commissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })

        if (!response.ok) {
          throw new Error("Error al crear")
        }

        const creada = await response.json()
        guardadaId = creada?.data?.id ?? creada?.rule?.id ?? creada?.id ?? null
      }

      setDialogOpen(false)
      fetchRules()

      // Guardar la regla NO recalcula lo ya calculado: cada comisión guarda el
      // porcentaje con el que nació. Ese es exactamente el reporte de Yamil
      // ("cambiamos las comisiones pero no impacta desde agosto"), así que en
      // vez de esperar a que alguien encuentre el botón, se ofrece al guardar.
      if (guardadaId && values.type === "SELLER" && values.seller_id) {
        openApplyDialog({
          id: guardadaId,
          seller_id: values.seller_id,
          value: values.value,
          valid_from: values.valid_from,
          valid_to: values.valid_to ?? null,
          seller_name: sellers.find((s) => s.id === values.seller_id)?.name ?? null,
        })
      }
    } catch (error) {
      console.error("Error saving rule:", error)
      toast.error("Error al guardar la regla")
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Cuántas comisiones ya calculadas cambiaría esta regla. Se consulta antes de
   * abrir el diálogo: hacer confirmar a ciegas un cambio de plata no alcanza.
   */
  const openApplyDialog = async (rule: RuleToApply) => {
    setApplyDialog({ open: true, rule, preview: null, error: null, loading: true })
    try {
      const response = await fetch(`/api/settings/commissions/${rule.id}/apply`)
      const data = await response.json()
      setApplyDialog({
        open: true,
        rule,
        preview: response.ok ? data : null,
        error: response.ok ? null : data.error || "No se pudo calcular el alcance",
        loading: false,
      })
    } catch (error) {
      console.error("Error consultando el alcance de la regla:", error)
      setApplyDialog({
        open: true,
        rule,
        preview: null,
        error: "No se pudo calcular el alcance",
        loading: false,
      })
    }
  }

  const closeApplyDialog = () =>
    setApplyDialog({ open: false, rule: null, preview: null, error: null, loading: false })

  const confirmApply = async () => {
    if (!applyDialog.rule) return
    setApplying(true)
    try {
      const response = await fetch(`/api/settings/commissions/${applyDialog.rule.id}/apply`, {
        method: "POST",
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || "No se pudieron recalcular las comisiones")
        return
      }
      toast.success(
        data.actualizadas > 0
          ? `${data.actualizadas} comisiones recalculadas`
          : "No había comisiones para recalcular"
      )
      closeApplyDialog()
    } catch (error) {
      console.error("Error aplicando la regla:", error)
      toast.error("No se pudieron recalcular las comisiones")
    } finally {
      setApplying(false)
    }
  }

  const handleDeleteClick = (ruleId: string) => {
    setRuleToDelete(ruleId)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!ruleToDelete) return

    try {
      const response = await fetch(`/api/settings/commissions/${ruleToDelete}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al eliminar")
      }

      fetchRules()
      setDeleteDialogOpen(false)
      setRuleToDelete(null)
    } catch (error) {
      console.error("Error deleting rule:", error)
      toast.error("Error al eliminar la regla")
      setDeleteDialogOpen(false)
      setRuleToDelete(null)
    }
  }

  const regionOptions = [
    { value: "ARGENTINA", label: "Argentina" },
    { value: "CARIBE", label: "Caribe" },
    { value: "BRASIL", label: "Brasil" },
    { value: "EUROPA", label: "Europa" },
    { value: "EEUU", label: "EEUU" },
    { value: "OTROS", label: "Otros" },
    { value: "CRUCEROS", label: "Cruceros" },
  ]

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
            <Percent className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Reglas de Comisiones</h2>
            <p className="text-sm text-muted-foreground">Gestiona las reglas de comisión para vendedores y agencias</p>
          </div>
        </div>
        <Button size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Nueva Regla
        </Button>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Info className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Información</h4>
        </div>
        <p className="text-sm text-muted-foreground">
          Las reglas de comisión se aplican automáticamente cuando una operación está CONFIRMED y todos los pagos de
          cliente están PAID. Las reglas se evalúan por fecha de validez y región de destino.
        </p>
      </div>

      {/* Umbral de cobranza para pagar comisiones */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Wallet className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Pago de comisiones</h4>
        </div>
        <p className="text-sm text-muted-foreground">
          Definí a partir de qué % cobrado de la operación una comisión pendiente se puede pagar al vendedor.
          Las comisiones siempre se ven en &quot;Por Pagar&quot;; las que no llegan al umbral quedan marcadas como
          &quot;No cobrada aún&quot; y no se pueden pagar hasta alcanzarlo.
          Poné <span className="font-medium text-foreground">0%</span> si pagás comisiones aunque la operación no esté
          cobrada (ej. al cierre de mes), o <span className="font-medium text-foreground">95–100%</span> si pagás recién
          cuando cobraste.
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cobranza mínima para pagar comisión (%)</Label>
            <DecimalInput
              value={collectionThreshold}
              onChange={(v) => setCollectionThreshold(v)}
              className="w-32"
            />
          </div>
          <Button size="sm" onClick={saveThreshold} disabled={savingThreshold}>
            {savingThreshold ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Percent className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Reglas Activas</h4>
        </div>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No hay reglas configuradas</div>
        ) : (
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/50">
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Región</TableHead>
                  <TableHead>Válido Desde</TableHead>
                  <TableHead>Válido Hasta</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant="outline">{rule.type === "SELLER" ? "Vendedor" : "Agencia"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{describeRuleScope(rule, agencies)}</TableCell>
                    <TableCell className="text-sm">
                      {rule.basis === "FIXED_PERCENTAGE" ? "Porcentaje Fijo" : "Monto Fijo"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {rule.basis === "FIXED_PERCENTAGE" ? `${rule.value}%` : `$${rule.value.toLocaleString("es-AR")}`}
                    </TableCell>
                    <TableCell className="text-sm">{rule.destination_region || "Todas"}</TableCell>
                    <TableCell className="text-sm">{format(parseDateOnlyLocal(rule.valid_from) ?? new Date(rule.valid_from), "dd/MM/yyyy", { locale: es })}</TableCell>
                    <TableCell className="text-sm">
                      {rule.valid_to ? format(parseDateOnlyLocal(rule.valid_to) ?? new Date(rule.valid_to), "dd/MM/yyyy", { locale: es }) : "Sin límite"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(rule)}>
                          Editar
                        </Button>
                        {/*
                          Cambiar el porcentaje no mueve las comisiones ya
                          calculadas: cada una guarda el suyo. Esto las arrastra,
                          acotado al período de vigencia de la regla.
                        */}
                        {rule.type === "SELLER" &&
                          rule.seller_id &&
                          rule.basis === "FIXED_PERCENTAGE" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openApplyDialog({
                                  id: rule.id,
                                  seller_id: rule.seller_id,
                                  seller_name: rule.seller_name,
                                  value: rule.value,
                                  valid_from: rule.valid_from,
                                  valid_to: rule.valid_to,
                                })
                              }
                            >
                              Aplicar
                            </Button>
                          )}
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(rule.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/*
        Los vendedores que NO tienen regla propia.

        La tabla de arriba lista reglas, no personas, así que quien nunca tuvo
        una era invisible acá — y como el porcentaje sólo se puede cargar al
        crear el usuario, no había ninguna pantalla donde cambiárselo. Reportado
        por Lozada: los 6 vendedores de Madero "no aparecen".

        El porcentaje que se muestra es el que se les está pagando hoy, resuelto
        con la misma función que usa el cálculo.
      */}
      {!loading && sellersSinRegla.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
              Vendedores sin regla propia
            </h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Cobran el porcentaje que se les cargó al crearlos o el general de la agencia.
            Para cambiárselo hay que crearles una regla.
          </p>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/50">
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cobra hoy</TableHead>
                  <TableHead>De dónde sale</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellersSinRegla.map(({ seller, percentage, source }) => (
                  <TableRow key={seller.id}>
                    <TableCell className="text-sm">
                      {seller.name || seller.email || "Sin nombre"}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {percentage == null ? (
                        <span className="text-destructive">Sin configurar</span>
                      ) : (
                        `${percentage}%`
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ORIGEN_PORCENTAJE[source]}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialogForSeller(seller.id, percentage)}
                      >
                        Configurar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar Regla" : "Nueva Regla de Comisión"}</DialogTitle>
            <DialogDescription>
              Configura una regla de comisión que se aplicará automáticamente a las operaciones
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Configuración */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                    <Settings2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Configuración</h4>
                </div>
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="SELLER">Vendedor</SelectItem>
                            <SelectItem value="AGENCY">Agencia</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("type") === "SELLER" && (
                    <FormField
                      control={form.control}
                      name="seller_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendedor</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "__ALL__" ? null : v)}
                            value={field.value || "__ALL__"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__ALL__">Todos los vendedores</SelectItem>
                              {sellers.map((seller) => (
                                <SelectItem key={seller.id} value={seller.id}>
                                  {sellerOptionLabel(seller)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="basis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base de Cálculo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="FIXED_PERCENTAGE">Porcentaje Fijo</SelectItem>
                            <SelectItem value="FIXED_AMOUNT">Monto Fijo</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/*
                  Precedencia real del cálculo (lib/commissions/seller-commission-profile.ts):
                  una regla con seller_id le gana al % cargado al dar de alta al
                  usuario. Y como ese campo hoy no se puede editar después, esta
                  pantalla es el único lugar donde se le cambia el porcentaje a un
                  vendedor. Vale decirlo para que nadie lo busque en otro lado.
                */}
                {form.watch("type") === "SELLER" && form.watch("seller_id") && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      Este es el porcentaje que va a cobrar{" "}
                      <strong>
                        {sellers.find((s) => s.id === form.watch("seller_id"))?.name ||
                          "el vendedor"}
                      </strong>
                      . Tiene prioridad sobre el que se le cargó al darlo de alta, así que las
                      comisiones nuevas se calculan con este valor.
                    </AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Valor {form.watch("basis") === "FIXED_PERCENTAGE" ? "(%)" : "(Monto)"}
                      </FormLabel>
                      <FormControl>
                        <DecimalInput
                          {...field}
                          onChange={(v) => field.onChange(Number(v) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destination_region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Región de Destino (opcional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "ALL" ? null : value)}
                        value={field.value || "ALL"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ALL">Todas las regiones</SelectItem>
                          {regionOptions.map((option) => (
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

              {/* Vigencia */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Vigencia</h4>
                </div>
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="valid_from"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Válido Desde</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value || ""}
                            onChange={(value) => field.onChange(value)}
                            placeholder="Seleccionar fecha"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="valid_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Válido Hasta (opcional)</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value || ""}
                            onChange={(value) => field.onChange(value || null)}
                            placeholder="Seleccionar fecha"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente esta regla de comisión.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/*
      Arrastrar la regla a las comisiones que ya estaban calculadas.

      Se muestran los números ANTES de tocar nada: cuántas cambian, cuántas ya
      estaban en el porcentaje nuevo y cuántas quedan afuera por tener plata
      atrás. Confirmar a ciegas un cambio de comisiones no alcanza.
    */}
    <Dialog open={applyDialog.open} onOpenChange={(open) => !open && closeApplyDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar a las comisiones ya calculadas</DialogTitle>
          <DialogDescription>
            Cambiar el porcentaje no modifica las comisiones que ya se calcularon: cada
            una guarda el porcentaje con el que nació.
          </DialogDescription>
        </DialogHeader>

        {applyDialog.loading ? (
          <p className="text-sm text-muted-foreground py-4">Calculando el alcance...</p>
        ) : applyDialog.error ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{applyDialog.error}</AlertDescription>
          </Alert>
        ) : applyDialog.preview ? (
          <div className="space-y-3 py-2">
            <p className="text-sm">
              <span className="font-medium">
                {applyDialog.rule?.seller_name || "El vendedor"}
              </span>{" "}
              pasa a <span className="font-medium">{applyDialog.preview.percentage}%</span> en
              las comisiones desde el{" "}
              <span className="font-medium">
                {format(
                  parseDateOnlyLocal(applyDialog.preview.window.from) ??
                    new Date(applyDialog.preview.window.from),
                  "dd/MM/yyyy",
                  { locale: es }
                )}
              </span>
              {applyDialog.preview.window.to
                ? ` hasta el ${format(
                    parseDateOnlyLocal(applyDialog.preview.window.to) ??
                      new Date(applyDialog.preview.window.to),
                    "dd/MM/yyyy",
                    { locale: es }
                  )}`
                : " en adelante"}
              .
            </p>

            {applyDialog.preview.aRecalcular === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay comisiones pendientes en ese período.
              </p>
            ) : (
              <ul className="text-sm space-y-1">
                <li className="tabular-nums">
                  <span className="font-medium">{applyDialog.preview.aRecalcular}</span> comisiones
                  se recalculan
                  {applyDialog.preview.yaEnElPorcentaje > 0 &&
                    ` (${applyDialog.preview.yaEnElPorcentaje} ya estaban en ${applyDialog.preview.percentage}%)`}
                </li>
                {applyDialog.preview.bloqueadas > 0 && (
                  <li className="tabular-nums text-muted-foreground">
                    <span className="font-medium">{applyDialog.preview.bloqueadas}</span> quedan
                    como están: ya se pagaron o se dieron por saldadas
                  </li>
                )}
              </ul>
            )}

            <p className="text-xs text-muted-foreground">
              Las comisiones de servicios no entran: llevan su propio porcentaje.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={closeApplyDialog} disabled={applying}>
            {applyDialog.preview?.aRecalcular ? "Dejar como está" : "Cerrar"}
          </Button>
          {!!applyDialog.preview?.aRecalcular && (
            <Button onClick={confirmApply} disabled={applying}>
              {applying ? "Recalculando..." : "Recalcular"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
