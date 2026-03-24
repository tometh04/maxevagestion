"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Pencil, ChevronUp, ChevronDown, FileDown, Hotel, Plane, Bus, Car, FileText, Upload, X, ImageIcon } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface ItineraryItem {
  id: string
  operation_id: string
  sort_order: number
  item_type: "HOTEL" | "FLIGHT" | "TRANSFER" | "CAR" | "NOTE"
  hotel_name?: string | null
  hotel_stars?: number | null
  hotel_address?: string | null
  hotel_phone?: string | null
  room_type?: string | null
  meal_plan?: string | null
  checkin_date?: string | null
  checkout_date?: string | null
  nights?: number | null
  rooms?: number | null
  airline?: string | null
  flight_route?: string | null
  flight_date?: string | null
  transfer_description?: string | null
  car_company?: string | null
  car_details?: string | null
  car_pickup_date?: string | null
  car_return_date?: string | null
  car_pickup_location?: string | null
  car_return_location?: string | null
  destination_city?: string | null
  date_from?: string | null
  date_to?: string | null
  notes?: string | null
  image_url?: string | null
}

interface Operation {
  id: string
  destination?: string
  departure_date?: string
  return_date?: string
  sale_amount_total?: number
  sale_currency?: string
  currency?: string
  adults?: number
  children?: number
  file_code?: string
  reservation_code_air?: string
  reservation_code_hotel?: string
  operation_customers?: Array<{
    role: string
    customers: {
      id: string
      first_name?: string
      last_name?: string
      full_name?: string
    }
  }>
}

interface ItinerarySectionProps {
  operationId: string
  operation?: Operation
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ""
  try {
    return format(new Date(d + "T12:00:00"), "dd MMM yyyy", { locale: es })
  } catch { return d }
}

function fmtDateShort(d: string | null | undefined): string {
  if (!d) return ""
  try {
    return format(new Date(d + "T12:00:00"), "dd/MM", { locale: es })
  } catch { return d }
}

export function ItinerarySection({ operationId, operation }: ItinerarySectionProps) {
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<ItineraryItem | null>(null)
  const [selectedType, setSelectedType] = useState<string>("HOTEL")
  const [saving, setSaving] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({})

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/operations/${operationId}/itinerary`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
      }
    } catch (err) {
      console.error("Error fetching itinerary:", err)
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const passengers = (operation?.operation_customers || [])
    .map(oc => oc.customers?.full_name || `${oc.customers?.first_name || ""} ${oc.customers?.last_name || ""}`.trim())
    .filter(Boolean)

  const currency = operation?.sale_currency || operation?.currency || "USD"
  const totalAmount = operation?.sale_amount_total || 0
  const passengerCount = (operation?.adults || 0) + (operation?.children || 0) || passengers.length || 1
  const pricePerPerson = Math.round(totalAmount / passengerCount)

  const openNewDialog = (type: string) => {
    setEditingItem(null)
    setSelectedType(type)
    // Pre-fill with operation data
    const prefill: Record<string, any> = { item_type: type }
    if (type === "HOTEL") {
      prefill.destination_city = operation?.destination || ""
      prefill.checkin_date = operation?.departure_date || ""
      prefill.checkout_date = operation?.return_date || ""
      prefill.date_from = operation?.departure_date || ""
      prefill.date_to = operation?.return_date || ""
    }
    if (type === "FLIGHT") {
      prefill.flight_date = operation?.departure_date || ""
    }
    setFormData(prefill)
    setDialogOpen(true)
  }

  const openEditDialog = (item: ItineraryItem) => {
    setEditingItem(item)
    setSelectedType(item.item_type)
    setFormData({ ...item })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editingItem
        ? `/api/operations/${operationId}/itinerary/${editingItem.id}`
        : `/api/operations/${operationId}/itinerary`
      const method = editingItem ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, item_type: selectedType }),
      })
      if (res.ok) {
        toast.success(editingItem ? "Actualizado" : "Agregado")
        setDialogOpen(false)
        fetchItems()
      } else {
        toast.error("Error al guardar")
      }
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    try {
      await fetch(`/api/operations/${operationId}/itinerary/${deleteItem.id}`, { method: "DELETE" })
      toast.success("Eliminado")
      fetchItems()
    } catch {
      toast.error("Error al eliminar")
    } finally {
      setDeleteItem(null)
    }
  }

  const handleMove = async (item: ItineraryItem, direction: "up" | "down") => {
    const idx = items.findIndex(i => i.id === item.id)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    const other = items[swapIdx]
    await Promise.all([
      fetch(`/api/operations/${operationId}/itinerary/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: other.sort_order }),
      }),
      fetch(`/api/operations/${operationId}/itinerary/${other.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: item.sort_order }),
      }),
    ])
    fetchItems()
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error("Máximo 10MB"); return }
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/operations/${operationId}/itinerary/upload-image`, { method: "POST", body: fd })
      if (res.ok) {
        const data = await res.json()
        setFormData(prev => ({ ...prev, image_url: data.url }))
        toast.success("Imagen subida")
      } else { toast.error("Error al subir") }
    } catch { toast.error("Error al subir") }
    finally { setUploadingImage(false); e.target.value = "" }
  }

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true)
    try {
      const res = await fetch(`/api/operations/${operationId}/itinerary/pdf`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `Detalle_Compra_${operation?.file_code || "PDF"}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        const err = await res.json()
        toast.error(err.error || "Error al generar PDF")
      }
    } catch { toast.error("Error al generar PDF") }
    finally { setGeneratingPdf(false) }
  }

  const updateField = (field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value }))

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  // ═══════════════════════════════════════════════════
  // VISUAL PDF-LIKE PREVIEW
  // ═══════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length === 0 ? "Agregá bloques para armar el detalle de compra del cliente" : `${items.length} bloque(s) en el itinerario`}
        </p>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button onClick={handleGeneratePdf} disabled={generatingPdf} className="bg-amber-600 hover:bg-amber-700">
              {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
              Descargar PDF
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" /> Agregar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => openNewDialog("FLIGHT")}><Plane className="h-4 w-4 mr-2" /> Vuelo</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewDialog("HOTEL")}><Hotel className="h-4 w-4 mr-2" /> Hotel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewDialog("TRANSFER")}><Bus className="h-4 w-4 mr-2" /> Traslado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewDialog("CAR")}><Car className="h-4 w-4 mr-2" /> Auto</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewDialog("NOTE")}><FileText className="h-4 w-4 mr-2" /> Nota</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* PDF Preview */}
      <div className="bg-white rounded-xl shadow-lg border max-w-[700px] mx-auto overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800 tracking-wide">
              DETALLE DE COMPRA {(operation?.destination || "").toUpperCase()}
            </h2>
            {operation?.departure_date && (
              <p className="text-sm text-gray-500 mt-0.5">
                Salida {fmtDate(operation.departure_date).toUpperCase()}
                {operation.return_date && ` — Regreso ${fmtDate(operation.return_date).toUpperCase()}`}
              </p>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lozada-logo.png" alt="Lozada Viajes" className="h-10 object-contain" />
        </div>

        {/* Items */}
        <div className="px-8 py-4 space-y-1">
          {items.length === 0 && (
            <div className="py-16 text-center text-gray-300">
              <FileText className="h-16 w-16 mx-auto mb-4" />
              <p className="text-lg font-medium">El itinerario está vacío</p>
              <p className="text-sm mt-1">Usá el botón &quot;Agregar&quot; para sumar vuelos, hoteles, traslados...</p>
            </div>
          )}

          {items.map((item, idx) => (
            <div key={item.id} className="group relative">
              {/* Hover controls */}
              <div className="absolute -right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-0.5 bg-white rounded-lg shadow-md border p-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => handleMove(item, "up")}><ChevronUp className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === items.length - 1} onClick={() => handleMove(item, "down")}><ChevronDown className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="h-3 w-3" /></Button>
              </div>

              {/* FLIGHT block */}
              {item.item_type === "FLIGHT" && (
                <div className="py-2 group-hover:bg-sky-50/50 rounded-lg px-2 -mx-2 transition-colors">
                  <p className="text-sm font-medium text-gray-700">
                    ✈️ {(item.flight_route || "VUELO").toUpperCase()}
                    {item.airline && <span className="text-amber-700"> CON {item.airline.toUpperCase()}</span>}
                    {item.flight_date && <span className="text-gray-500"> ({fmtDateShort(item.flight_date)})</span>}
                  </p>
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" className="mt-2 max-h-32 rounded border" />
                  )}
                </div>
              )}

              {/* TRANSFER block */}
              {item.item_type === "TRANSFER" && (
                <div className="py-1.5 group-hover:bg-green-50/50 rounded-lg px-2 -mx-2 transition-colors">
                  <p className="text-sm text-gray-600">→ {item.transfer_description || "Traslado"}</p>
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" className="mt-2 max-h-24 rounded border" />
                  )}
                </div>
              )}

              {/* HOTEL block */}
              {item.item_type === "HOTEL" && (
                <div className="py-3 group-hover:bg-blue-50/30 rounded-lg px-2 -mx-2 transition-colors">
                  {/* City header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-700 font-bold text-sm">📍 {(item.destination_city || "").toUpperCase()}</span>
                    {item.date_from && item.date_to && (
                      <span className="text-amber-600 text-xs font-semibold">
                        ({fmtDateShort(item.date_from)} AL {fmtDateShort(item.date_to)})
                      </span>
                    )}
                  </div>

                  {/* Hotel card */}
                  <div className="flex gap-3 ml-2">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="w-28 h-20 object-cover rounded-lg border flex-shrink-0" />
                    ) : (
                      <div className="w-28 h-20 bg-gray-100 rounded-lg border flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-6 w-6 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {item.hotel_stars && <span className="text-amber-500 text-xs">{"★".repeat(item.hotel_stars)}</span>}
                        <h4 className="font-bold text-sm text-gray-800">{item.hotel_name || "Hotel"}</h4>
                      </div>
                      {item.hotel_address && <p className="text-xs text-gray-500 truncate">{item.hotel_address}</p>}
                      {item.hotel_phone && <p className="text-xs text-amber-600">Tel: {item.hotel_phone}</p>}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="ml-2 mt-2 text-xs text-gray-600 space-y-0.5">
                    {item.checkin_date && <p><span className="text-gray-400 w-16 inline-block">Entrada:</span> {fmtDate(item.checkin_date)}</p>}
                    {item.checkout_date && <p><span className="text-gray-400 w-16 inline-block">Salida:</span> {fmtDate(item.checkout_date)}</p>}
                    {(item.rooms || item.nights) && (
                      <p><span className="text-gray-400 w-16 inline-block">Reserva:</span> {item.rooms || 1} Hab. / {item.nights || "-"} Noches</p>
                    )}
                    {item.room_type && <p className="font-semibold mt-1">{item.room_type}{item.meal_plan && ` — ${item.meal_plan}`}</p>}
                  </div>

                  {/* Passengers */}
                  {passengers.length > 0 && (
                    <div className="ml-2 mt-2 text-xs">
                      <p className="font-semibold text-gray-700">Huéspedes:</p>
                      {passengers.map((p, i) => <p key={i} className="text-gray-600">{p}</p>)}
                    </div>
                  )}
                </div>
              )}

              {/* CAR block */}
              {item.item_type === "CAR" && (
                <div className="py-3 group-hover:bg-purple-50/30 rounded-lg px-2 -mx-2 transition-colors">
                  <p className="text-amber-700 font-bold text-sm mb-1">🚗 Auto</p>
                  <div className="flex gap-3 ml-2">
                    {item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="w-28 h-20 object-cover rounded-lg border flex-shrink-0" />
                    )}
                    <div className="text-xs text-gray-600 space-y-0.5">
                      {item.car_company && <p className="font-semibold text-gray-800">{item.car_company}</p>}
                      {item.car_details && <p>{item.car_details}</p>}
                      {item.car_pickup_date && <p>Retiro: {fmtDate(item.car_pickup_date)} {item.car_pickup_location && `— ${item.car_pickup_location}`}</p>}
                      {item.car_return_date && <p>Devolución: {fmtDate(item.car_return_date)} {item.car_return_location && `— ${item.car_return_location}`}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* NOTE block */}
              {item.item_type === "NOTE" && (
                <div className="py-2 group-hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer: Price + Passengers */}
        {items.length > 0 && (
          <div className="px-8 py-4 border-t">
            <p className="text-center font-bold text-amber-700 text-lg">
              TOTAL POR PASAJERO {currency} {pricePerPerson.toLocaleString("es-AR")}
            </p>
          </div>
        )}

        {/* Brand footer */}
        {items.length > 0 && (
          <div className="bg-amber-600 text-white px-8 py-3 text-xs flex justify-between">
            <span>Nro de Legajo: 18181</span>
            <span>📍 Corrientes 631 - Piso 1 Oficina F</span>
            <span>🌐 lozadaviajes.rosario</span>
          </div>
        )}
      </div>

      {/* ═══ DIALOGS ═══ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar" : "Agregar"}{" "}
              {selectedType === "HOTEL" ? "Hotel" : selectedType === "FLIGHT" ? "Vuelo" : selectedType === "TRANSFER" ? "Traslado" : selectedType === "CAR" ? "Auto" : "Nota"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(selectedType === "HOTEL") && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Ciudad *</Label>
                    <Input value={formData.destination_city || ""} onChange={e => updateField("destination_city", e.target.value)} placeholder="Ej: Roma" />
                  </div>
                  <div>
                    <Label className="text-xs">Fechas</Label>
                    <div className="flex gap-1">
                      <Input type="date" value={formData.date_from || ""} onChange={e => updateField("date_from", e.target.value)} className="text-xs" />
                      <Input type="date" value={formData.date_to || ""} onChange={e => updateField("date_to", e.target.value)} className="text-xs" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Hotel *</Label>
                    <Input value={formData.hotel_name || ""} onChange={e => updateField("hotel_name", e.target.value)} placeholder="Nombre del hotel" />
                  </div>
                  <div>
                    <Label className="text-xs">Estrellas</Label>
                    <Select value={String(formData.hotel_stars || "")} onValueChange={v => updateField("hotel_stars", parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder="★" /></SelectTrigger>
                      <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Teléfono</Label>
                    <Input value={formData.hotel_phone || ""} onChange={e => updateField("hotel_phone", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Dirección</Label>
                  <Input value={formData.hotel_address || ""} onChange={e => updateField("hotel_address", e.target.value)} />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Check-in</Label>
                    <Input type="date" value={formData.checkin_date || ""} onChange={e => updateField("checkin_date", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Check-out</Label>
                    <Input type="date" value={formData.checkout_date || ""} onChange={e => updateField("checkout_date", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Noches</Label>
                    <Input type="number" value={formData.nights || ""} onChange={e => updateField("nights", parseInt(e.target.value) || null)} />
                  </div>
                  <div>
                    <Label className="text-xs">Habitaciones</Label>
                    <Input type="number" value={formData.rooms || ""} onChange={e => updateField("rooms", parseInt(e.target.value) || null)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo Habitación</Label>
                    <Input value={formData.room_type || ""} onChange={e => updateField("room_type", e.target.value)} placeholder="Ej: Standard Dbl" />
                  </div>
                  <div>
                    <Label className="text-xs">Régimen</Label>
                    <Input value={formData.meal_plan || ""} onChange={e => updateField("meal_plan", e.target.value)} placeholder="Ej: Con Desayuno" />
                  </div>
                </div>
              </>
            )}

            {selectedType === "FLIGHT" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Aerolínea</Label>
                  <Input value={formData.airline || ""} onChange={e => updateField("airline", e.target.value)} placeholder="Ej: Air Europa" />
                </div>
                <div>
                  <Label className="text-xs">Ruta *</Label>
                  <Input value={formData.flight_route || ""} onChange={e => updateField("flight_route", e.target.value)} placeholder="Buenos Aires → Roma" />
                </div>
                <div>
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={formData.flight_date || ""} onChange={e => updateField("flight_date", e.target.value)} />
                </div>
              </div>
            )}

            {selectedType === "TRANSFER" && (
              <div>
                <Label className="text-xs">Descripción *</Label>
                <Input value={formData.transfer_description || ""} onChange={e => updateField("transfer_description", e.target.value)} placeholder="Ej: Traslado desde aeropuerto hacia hotel" />
              </div>
            )}

            {selectedType === "CAR" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Empresa</Label><Input value={formData.car_company || ""} onChange={e => updateField("car_company", e.target.value)} /></div>
                  <div><Label className="text-xs">Vehículo</Label><Input value={formData.car_details || ""} onChange={e => updateField("car_details", e.target.value)} placeholder="Citroen C3 o similar" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Retiro</Label><Input type="date" value={formData.car_pickup_date || ""} onChange={e => updateField("car_pickup_date", e.target.value)} /></div>
                  <div><Label className="text-xs">Lugar retiro</Label><Input value={formData.car_pickup_location || ""} onChange={e => updateField("car_pickup_location", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Devolución</Label><Input type="date" value={formData.car_return_date || ""} onChange={e => updateField("car_return_date", e.target.value)} /></div>
                  <div><Label className="text-xs">Lugar devolución</Label><Input value={formData.car_return_location || ""} onChange={e => updateField("car_return_location", e.target.value)} /></div>
                </div>
              </>
            )}

            {selectedType === "NOTE" && (
              <div><Label className="text-xs">Texto</Label><Textarea value={formData.notes || ""} onChange={e => updateField("notes", e.target.value)} rows={4} /></div>
            )}

            {selectedType !== "NOTE" && (
              <div><Label className="text-xs">Notas adicionales</Label><Input value={formData.notes || ""} onChange={e => updateField("notes", e.target.value)} placeholder="Opcional" /></div>
            )}

            {/* Image */}
            <div>
              <Label className="text-xs">Screenshot / Foto</Label>
              {formData.image_url ? (
                <div className="mt-1 relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={formData.image_url} alt="" className="h-24 rounded border" />
                  <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => updateField("image_url", null)}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <label className="mt-1 flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted/50 w-fit text-sm">
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadingImage ? "Subiendo..." : "Subir imagen"}
                  <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingItem ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar bloque?</AlertDialogTitle>
            <AlertDialogDescription>No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
