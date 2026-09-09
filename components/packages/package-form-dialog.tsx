"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2, Split } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox"
import { Skeleton } from "@/components/ui/skeleton"
import { distributeSaleByCost } from "@/lib/operations/operator-sale-breakdown"
import { STANDARD_PRODUCT_TYPES, productTypeLabel } from "@/lib/operations/product-types"
import type { PackageWithAvailability } from "@/lib/packages/queries"

type Currency = "ARS" | "USD"

interface ItemRow {
  operator_id: string
  operator_name: string
  product_type: string
  cost: string
  cost_currency: Currency
  sale_amount: string
  notes: string
}

const emptyItem = (currency: Currency = "USD"): ItemRow => ({
  operator_id: "",
  operator_name: "",
  product_type: "",
  cost: "",
  cost_currency: currency,
  sale_amount: "",
  notes: "",
})

interface PackageFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies: Array<{ id: string; name: string }>
  /** Sin id, es un alta. */
  packageId?: string | null
}

export function PackageFormDialog({
  open,
  onOpenChange,
  onSuccess,
  agencies,
  packageId,
}: PackageFormDialogProps) {
  const isEdit = Boolean(packageId)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [destination, setDestination] = useState("")
  const [departureDate, setDepartureDate] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [totalQuota, setTotalQuota] = useState("")
  const [saleAmountTotal, setSaleAmountTotal] = useState("")
  const [saleCurrency, setSaleCurrency] = useState<Currency>("USD")
  const [agencyId, setAgencyId] = useState<string>("ALL")
  const [status, setStatus] = useState<"ACTIVE" | "CLOSED">("ACTIVE")
  const [notes, setNotes] = useState("")

  const [items, setItems] = useState<ItemRow[]>([emptyItem()])
  const [operators, setOperators] = useState<Array<{ id: string; name: string }>>([])
  const [productTypes, setProductTypes] = useState<Array<{ value: string; label: string }>>([])

  /**
   * Gate contra el "collection replace hazard".
   *
   * Solo se mandan `items` al servidor si se pudo LEER lo que ya había. En un
   * alta arranca en true (no hay nada que perder); en una edición pasa a true
   * recién cuando el GET respondió. Sin esto, un fallo de red al abrir el
   * diálogo terminaría guardando una lista vacía y borrando las patas reales.
   */
  const [itemsLoaded, setItemsLoaded] = useState(!isEdit)

  const resetForm = useCallback(() => {
    setName("")
    setDestination("")
    setDepartureDate("")
    setReturnDate("")
    setTotalQuota("")
    setSaleAmountTotal("")
    setSaleCurrency("USD")
    setAgencyId("ALL")
    setStatus("ACTIVE")
    setNotes("")
    setItems([emptyItem()])
    setError(null)
    setItemsLoaded(!isEdit)
  }, [isEdit])

  // Catálogos: operadores y tipos de producto (estándar + los propios de la org).
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      try {
        const [opsRes, settingsRes] = await Promise.all([
          fetch("/api/operators?selector=true"),
          fetch("/api/operations/settings"),
        ])
        if (cancelled) return

        const opsData = await opsRes.json().catch(() => ({}))
        setOperators((opsData.operators || []).map((o: any) => ({ id: o.id, name: o.name })))

        const settings = await settingsRes.json().catch(() => ({}))
        const custom = (settings.custom_product_types || []) as Array<{ value: string; label: string }>
        setProductTypes([
          ...STANDARD_PRODUCT_TYPES.map((value) => ({ value, label: productTypeLabel(value) })),
          ...custom,
        ])
      } catch {
        // Los catálogos no bloquean: sin ellos el usuario igual puede cargar el
        // paquete, solo pierde el autocompletado del tipo de producto.
        if (!cancelled) setProductTypes(
          STANDARD_PRODUCT_TYPES.map((value) => ({ value, label: productTypeLabel(value) }))
        )
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open])

  // Edición: traer el paquete y sus patas antes de habilitar el guardado de ítems.
  useEffect(() => {
    if (!open) return
    if (!packageId) {
      resetForm()
      return
    }

    let cancelled = false
    setLoading(true)
    setItemsLoaded(false)
    setError(null)

    fetch(`/api/packages/${packageId}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "No se pudo cargar el paquete")
        return data.package as PackageWithAvailability
      })
      .then((pkg) => {
        if (cancelled) return
        setName(pkg.name)
        setDestination(pkg.destination || "")
        setDepartureDate(pkg.departure_date || "")
        setReturnDate(pkg.return_date || "")
        setTotalQuota(String(pkg.availability.total_quota))
        setSaleAmountTotal(pkg.sale_amount_total === null ? "" : String(pkg.sale_amount_total))
        setSaleCurrency((pkg.sale_currency as Currency) || "USD")
        setAgencyId(pkg.agency_id || "ALL")
        setStatus(pkg.status === "CLOSED" ? "CLOSED" : "ACTIVE")
        setNotes(pkg.notes || "")
        setItems(
          pkg.items.length > 0
            ? pkg.items.map((item) => ({
                operator_id: item.operator_id,
                operator_name: item.operator_name || "",
                product_type: item.product_type || "",
                cost: String(item.cost),
                cost_currency: (item.cost_currency as Currency) || "USD",
                sale_amount: item.sale_amount ? String(item.sale_amount) : "",
                notes: item.notes || "",
              }))
            : [emptyItem((pkg.sale_currency as Currency) || "USD")]
        )
        // Recién acá: se pudo leer lo guardado.
        setItemsLoaded(true)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, packageId, resetForm])

  const buscarOperador = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      const q = query.trim().toLowerCase()
      return operators
        .filter((op) => !q || op.name.toLowerCase().includes(q))
        .slice(0, 50)
        .map((op) => ({ value: op.id, label: op.name }))
    },
    [operators]
  )

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length > 0 ? next : [emptyItem(saleCurrency)]
    })
  }

  const totalCost = useMemo(
    () =>
      items.reduce((acc, item) => acc + (Number(item.cost) || 0), 0),
    [items]
  )

  const filledItems = useMemo(() => items.filter((item) => item.operator_id), [items])

  // Mismo reparto que usa el alta de operación: la venta del paquete se divide
  // entre las patas en proporción al costo de cada una.
  const repartirVenta = () => {
    const total = Number(saleAmountTotal) || 0
    if (total <= 0 || filledItems.length === 0) return
    const shares = distributeSaleByCost({
      legs: items.map((item) => ({ cost: item.cost, cost_currency: item.cost_currency })),
      saleAmountTotal: total,
      saleCurrency,
    })
    setItems((prev) => prev.map((item, i) => ({ ...item, sale_amount: String(shares[i] ?? 0) })))
  }

  const handleSubmit = async () => {
    setError(null)

    if (!name.trim()) return setError("El nombre del paquete es requerido")
    if (totalQuota === "" || Number(totalQuota) < 0) return setError("Cargá un cupo válido")
    if (departureDate && returnDate && returnDate < departureDate) {
      return setError("La fecha de regreso no puede ser anterior a la de salida")
    }
    if (filledItems.some((item) => !item.operator_id)) {
      return setError("Elegí un operador en cada pata del paquete")
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      destination: destination.trim() || null,
      departure_date: departureDate || null,
      return_date: returnDate || null,
      total_quota: Number(totalQuota),
      sale_amount_total: saleAmountTotal === "" ? null : Number(saleAmountTotal),
      sale_currency: saleCurrency,
      agency_id: agencyId === "ALL" ? null : agencyId,
      notes: notes.trim() || null,
    }

    if (isEdit) payload.status = status

    // La lista de patas viaja SOLO si se pudo leer la existente, y siempre con
    // la confirmación explícita de reemplazo. Es la contraparte cliente del
    // guard del servidor.
    if (itemsLoaded) {
      payload.items = filledItems.map((item) => ({
        operator_id: item.operator_id,
        product_type: item.product_type || null,
        cost: Number(item.cost) || 0,
        cost_currency: item.cost_currency,
        sale_amount: Number(item.sale_amount) || 0,
        notes: item.notes.trim() || null,
      }))
      payload.items_replace = true
    }

    setSaving(true)
    try {
      const res = await fetch(isEdit ? `/api/packages/${packageId}` : "/api/packages", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "No se pudo guardar el paquete")
        return
      }

      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        toast.warning(data.warnings[0])
      } else {
        toast.success(isEdit ? "Paquete actualizado" : "Paquete creado")
      }

      onSuccess()
      onOpenChange(false)
    } catch {
      setError("No se pudo conectar con el servidor")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Columna flex con el cuerpo scrolleando y el footer fijo. Con todo en
          un solo contenedor scrolleable, al llegar al final los botones
          quedaban pegados a la última fila de patas. */}
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar paquete" : "Nuevo paquete"}</DialogTitle>
          <DialogDescription>
            Agrupá los operadores del paquete y definí cuántas plazas hay para vender.
          </DialogDescription>
        </DialogHeader>

        {/* `data-scroll-container` lo busca SearchableCombobox para subir el
            trigger antes de abrir la lista. */}
        <div
          data-scroll-container
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1"
        >
        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pkg-name">Nombre</Label>
                <Input
                  id="pkg-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cancún — salida 12 de julio"
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pkg-destination">Destino</Label>
                <Input
                  id="pkg-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Cancún"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pkg-quota">Cupo (plazas)</Label>
                <Input
                  id="pkg-quota"
                  type="number"
                  min={0}
                  step={1}
                  value={totalQuota}
                  onChange={(e) => setTotalQuota(e.target.value)}
                  placeholder="20"
                />
                <p className="text-xs text-muted-foreground">
                  Cada pasajero de una venta ocupa una plaza.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pkg-departure">Salida</Label>
                <Input
                  id="pkg-departure"
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pkg-return">Regreso</Label>
                <Input
                  id="pkg-return"
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pkg-sale">Precio de venta</Label>
                <div className="flex gap-2">
                  <Input
                    id="pkg-sale"
                    type="number"
                    min={0}
                    step="0.01"
                    value={saleAmountTotal}
                    onChange={(e) => setSaleAmountTotal(e.target.value)}
                    placeholder="0.00"
                  />
                  <Select
                    value={saleCurrency}
                    onValueChange={(v) => setSaleCurrency(v as Currency)}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ARS">ARS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pkg-agency">Oficina</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="pkg-agency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas las oficinas</SelectItem>
                    {agencies.map((agency) => (
                      <SelectItem key={agency.id} value={agency.id}>
                        {agency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="pkg-status">Estado</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as "ACTIVE" | "CLOSED")}>
                    <SelectTrigger id="pkg-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Abierto</SelectItem>
                      <SelectItem value="CLOSED">Cerrado</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Cerrado deja de aparecer al cargar una operación; el historial se conserva.
                  </p>
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pkg-notes">Notas</Label>
                <Textarea
                  id="pkg-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Condiciones, penalidades, lo que haga falta recordar al vender."
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <div>
                  <h3 className="text-sm font-medium">Patas del paquete</h3>
                  <p className="text-xs text-muted-foreground">
                    Al vender, estas patas se cargan en la operación y quedan editables.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={repartirVenta}
                    disabled={!Number(saleAmountTotal) || filledItems.length === 0}
                  >
                    <Split className="mr-2 h-4 w-4" />
                    Repartir ∝ costo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItems((prev) => [...prev, emptyItem(saleCurrency)])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar pata
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-12"
                  >
                    {/* Fila 1: quién y qué. Fila 2: la plata. Antes entraba
                        todo en una sola fila y el costo quedaba en un campo
                        donde no se leía el número. */}
                    <div className="space-y-1.5 sm:col-span-6">
                      <Label className="text-xs">Operador</Label>
                      <SearchableCombobox
                        value={item.operator_id}
                        initialLabel={item.operator_name}
                        onChange={(value) => {
                          const op = operators.find((o) => o.id === value)
                          updateItem(index, {
                            operator_id: value,
                            operator_name: op?.name || "",
                          })
                        }}
                        searchFn={buscarOperador}
                        placeholder="Elegir operador"
                        emptyMessage="Sin operadores"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-5">
                      <Label className="text-xs">Producto</Label>
                      <Select
                        value={item.product_type || "NONE"}
                        onValueChange={(v) =>
                          updateItem(index, { product_type: v === "NONE" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin especificar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Sin especificar</SelectItem>
                          {productTypes.map((pt) => (
                            <SelectItem key={pt.value} value={pt.value}>
                              {pt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end justify-end sm:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        aria-label={`Quitar la pata ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>

                    <div className="space-y-1.5 sm:col-span-3">
                      <Label className="text-xs">Costo</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.cost}
                        onChange={(e) => updateItem(index, { cost: e.target.value })}
                        placeholder="0.00"
                        className="tabular-nums"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Moneda</Label>
                      <Select
                        value={item.cost_currency}
                        onValueChange={(v) => updateItem(index, { cost_currency: v as Currency })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="ARS">ARS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-3">
                      <Label className="text-xs">Venta</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.sale_amount}
                        onChange={(e) => updateItem(index, { sale_amount: e.target.value })}
                        placeholder="0.00"
                        className="tabular-nums"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-4">
                      <Label className="text-xs">Notas</Label>
                      <Input
                        value={item.notes}
                        onChange={(e) => updateItem(index, { notes: e.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {filledItems.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {filledItems.length} pata(s) · costo total{" "}
                  <span className="tabular-nums font-medium text-foreground">
                    {totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </p>
              )}

              {isEdit && !itemsLoaded && !loading && (
                <p className="text-xs text-destructive">
                  No se pudieron leer las patas guardadas, así que no se van a modificar al guardar.
                </p>
              )}
            </section>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}
          </div>
        )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear paquete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
