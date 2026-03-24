"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Pencil, ChevronUp, ChevronDown, FileDown, Hotel, Plane, Bus, Car, FileText, Upload, X } from "lucide-react"

interface ItineraryItem {
  id: string
  operation_id: string
  sort_order: number
  item_type: "HOTEL" | "FLIGHT" | "TRANSFER" | "CAR" | "NOTE"
  hotel_name?: string
  hotel_stars?: number
  hotel_address?: string
  hotel_phone?: string
  room_type?: string
  meal_plan?: string
  checkin_date?: string
  checkout_date?: string
  nights?: number
  rooms?: number
  airline?: string
  flight_route?: string
  flight_date?: string
  transfer_description?: string
  car_company?: string
  car_details?: string
  car_pickup_date?: string
  car_return_date?: string
  car_pickup_location?: string
  car_return_location?: string
  destination_city?: string
  date_from?: string
  date_to?: string
  notes?: string
  image_url?: string
}

const ITEM_TYPES = {
  HOTEL: { label: "Hotel", icon: Hotel, color: "bg-blue-100 text-blue-700" },
  FLIGHT: { label: "Vuelo", icon: Plane, color: "bg-sky-100 text-sky-700" },
  TRANSFER: { label: "Traslado", icon: Bus, color: "bg-green-100 text-green-700" },
  CAR: { label: "Auto", icon: Car, color: "bg-purple-100 text-purple-700" },
  NOTE: { label: "Nota", icon: FileText, color: "bg-gray-100 text-gray-700" },
}

interface ItinerarySectionProps {
  operationId: string
}

export function ItinerarySection({ operationId }: ItinerarySectionProps) {
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

  const openNewDialog = (type: string) => {
    setEditingItem(null)
    setSelectedType(type)
    setFormData({ item_type: type })
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
        toast.success(editingItem ? "Bloque actualizado" : "Bloque agregado")
        setDialogOpen(false)
        fetchItems()
      } else {
        const err = await res.json()
        toast.error(err.error || "Error al guardar")
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
      const res = await fetch(`/api/operations/${operationId}/itinerary/${deleteItem.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Bloque eliminado")
        fetchItems()
      }
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: other.sort_order }),
      }),
      fetch(`/api/operations/${operationId}/itinerary/${other.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: item.sort_order }),
      }),
    ])
    fetchItems()
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Máximo 10MB")
      return
    }

    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/operations/${operationId}/itinerary/upload-image`, {
        method: "POST",
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        setFormData(prev => ({ ...prev, image_url: data.url }))
        toast.success("Imagen subida")
      } else {
        toast.error("Error al subir imagen")
      }
    } catch {
      toast.error("Error al subir imagen")
    } finally {
      setUploadingImage(false)
      e.target.value = ""
    }
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
        a.download = `Detalle_Compra.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        toast.success("PDF descargado")
      } else {
        const err = await res.json()
        toast.error(err.error || "Error al generar PDF")
      }
    } catch {
      toast.error("Error al generar PDF")
    } finally {
      setGeneratingPdf(false)
    }
  }

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const getItemSummary = (item: ItineraryItem) => {
    switch (item.item_type) {
      case "HOTEL":
        return `${item.hotel_name || "Hotel"} ${item.hotel_stars ? "★".repeat(item.hotel_stars) : ""} — ${item.destination_city || ""}`
      case "FLIGHT":
        return `${item.airline || ""} ${item.flight_route || "Vuelo"} — ${item.flight_date || ""}`
      case "TRANSFER":
        return item.transfer_description || "Traslado"
      case "CAR":
        return `${item.car_company || "Auto"} — ${item.car_pickup_location || ""}`
      case "NOTE":
        return item.notes?.substring(0, 60) || "Nota"
      default:
        return ""
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Detalle de Compra</h3>
          <p className="text-sm text-muted-foreground">Armá el itinerario bloque por bloque para generar el PDF</p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button onClick={handleGeneratePdf} disabled={generatingPdf} variant="outline">
              {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
              Generar PDF
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Agregar bloque</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.entries(ITEM_TYPES).map(([key, { label, icon: Icon }]) => (
                <DropdownMenuItem key={key} onClick={() => openNewDialog(key)}>
                  <Icon className="h-4 w-4 mr-2" /> {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No hay bloques en el itinerario</p>
            <p className="text-xs mt-1">Agregá hoteles, vuelos, traslados y más para generar el detalle de compra</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const typeInfo = ITEM_TYPES[item.item_type]
            const Icon = typeInfo.icon
            return (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => handleMove(item, "up")}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === items.length - 1} onClick={() => handleMove(item, "down")}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Badge variant="secondary" className={typeInfo.color}>
                      <Icon className="h-3 w-3 mr-1" /> {typeInfo.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getItemSummary(item)}</p>
                      {item.date_from && item.date_to && (
                        <p className="text-xs text-muted-foreground">{item.date_from} al {item.date_to}</p>
                      )}
                    </div>
                    {item.image_url && (
                      <img src={item.image_url} alt="" className="h-10 w-14 object-cover rounded border" />
                    )}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteItem(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Agregar"} {ITEM_TYPES[selectedType as keyof typeof ITEM_TYPES]?.label}</DialogTitle>
            <DialogDescription>Completá los datos del bloque</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Common: destination city */}
            {(selectedType === "HOTEL" || selectedType === "CAR") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Ciudad/Destino</Label>
                  <Input value={formData.destination_city || ""} onChange={e => updateField("destination_city", e.target.value)} placeholder="Ej: Roma" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Fecha desde</Label>
                    <Input type="date" value={formData.date_from || ""} onChange={e => updateField("date_from", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha hasta</Label>
                    <Input type="date" value={formData.date_to || ""} onChange={e => updateField("date_to", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* HOTEL fields */}
            {selectedType === "HOTEL" && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Nombre del Hotel *</Label>
                    <Input value={formData.hotel_name || ""} onChange={e => updateField("hotel_name", e.target.value)} placeholder="Ej: Sheraton" />
                  </div>
                  <div>
                    <Label className="text-xs">Estrellas</Label>
                    <Select value={String(formData.hotel_stars || "")} onValueChange={v => updateField("hotel_stars", parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder="★" /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Dirección</Label>
                    <Input value={formData.hotel_address || ""} onChange={e => updateField("hotel_address", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Teléfono</Label>
                    <Input value={formData.hotel_phone || ""} onChange={e => updateField("hotel_phone", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Check-in</Label>
                    <Input type="date" value={formData.checkin_date || ""} onChange={e => updateField("checkin_date", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Check-out</Label>
                    <Input type="date" value={formData.checkout_date || ""} onChange={e => updateField("checkout_date", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Tipo Habitación</Label>
                    <Input value={formData.room_type || ""} onChange={e => updateField("room_type", e.target.value)} placeholder="Ej: Standard Dbl" />
                  </div>
                  <div>
                    <Label className="text-xs">Régimen</Label>
                    <Input value={formData.meal_plan || ""} onChange={e => updateField("meal_plan", e.target.value)} placeholder="Ej: Con Desayuno" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Noches</Label>
                      <Input type="number" value={formData.nights || ""} onChange={e => updateField("nights", parseInt(e.target.value) || null)} />
                    </div>
                    <div>
                      <Label className="text-xs">Habs.</Label>
                      <Input type="number" value={formData.rooms || ""} onChange={e => updateField("rooms", parseInt(e.target.value) || null)} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* FLIGHT fields */}
            {selectedType === "FLIGHT" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Aerolínea</Label>
                  <Input value={formData.airline || ""} onChange={e => updateField("airline", e.target.value)} placeholder="Ej: Air Europa" />
                </div>
                <div>
                  <Label className="text-xs">Ruta</Label>
                  <Input value={formData.flight_route || ""} onChange={e => updateField("flight_route", e.target.value)} placeholder="Ej: Buenos Aires → Roma" />
                </div>
                <div>
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={formData.flight_date || ""} onChange={e => updateField("flight_date", e.target.value)} />
                </div>
              </div>
            )}

            {/* TRANSFER fields */}
            {selectedType === "TRANSFER" && (
              <div>
                <Label className="text-xs">Descripción del traslado</Label>
                <Input value={formData.transfer_description || ""} onChange={e => updateField("transfer_description", e.target.value)} placeholder="Ej: Traslado desde aeropuerto hacia hotel" />
              </div>
            )}

            {/* CAR fields */}
            {selectedType === "CAR" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Empresa</Label>
                    <Input value={formData.car_company || ""} onChange={e => updateField("car_company", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Detalles del vehículo</Label>
                    <Input value={formData.car_details || ""} onChange={e => updateField("car_details", e.target.value)} placeholder="Ej: Citroen C3 o similar" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Retiro</Label>
                    <Input type="date" value={formData.car_pickup_date || ""} onChange={e => updateField("car_pickup_date", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Lugar de retiro</Label>
                    <Input value={formData.car_pickup_location || ""} onChange={e => updateField("car_pickup_location", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Devolución</Label>
                    <Input type="date" value={formData.car_return_date || ""} onChange={e => updateField("car_return_date", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Lugar de devolución</Label>
                    <Input value={formData.car_return_location || ""} onChange={e => updateField("car_return_location", e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* NOTE fields */}
            {selectedType === "NOTE" && (
              <div>
                <Label className="text-xs">Nota</Label>
                <Textarea value={formData.notes || ""} onChange={e => updateField("notes", e.target.value)} rows={4} placeholder="Texto libre para incluir en el detalle..." />
              </div>
            )}

            {/* Notes (for all types except NOTE) */}
            {selectedType !== "NOTE" && (
              <div>
                <Label className="text-xs">Notas adicionales</Label>
                <Input value={formData.notes || ""} onChange={e => updateField("notes", e.target.value)} placeholder="Opcional" />
              </div>
            )}

            {/* Image upload */}
            <div>
              <Label className="text-xs">Screenshot / Imagen</Label>
              {formData.image_url ? (
                <div className="mt-1 relative inline-block">
                  <img src={formData.image_url} alt="" className="h-24 rounded border" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => updateField("image_url", null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="mt-1">
                  <label className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors w-fit text-sm">
                    {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingImage ? "Subiendo..." : "Subir imagen"}
                    <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG o WebP. Máx 10MB.</p>
                </div>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar bloque?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
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
