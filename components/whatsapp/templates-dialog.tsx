"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Edit, Save, X, Plus, Info, Code } from "lucide-react"
import { toast } from "sonner"

interface Template {
  id: string
  name: string
  description?: string
  category: string
  trigger_type: string
  template: string
  emoji_prefix: string
  is_active: boolean
}

interface TemplatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
}

const categories = [
  { value: "PAYMENT", label: "💰 Pagos" },
  { value: "TRIP", label: "✈️ Viajes" },
  { value: "QUOTATION", label: "📄 Cotizaciones" },
  { value: "BIRTHDAY", label: "🎂 Cumpleaños" },
  { value: "ANNIVERSARY", label: "🎉 Aniversario" },
  { value: "MARKETING", label: "📢 Marketing" },
  { value: "CUSTOM", label: "⚙️ Personalizado" },
]

const triggers = [
  { value: "MANUAL", label: "Manual" },
  { value: "QUOTATION_SENT", label: "Cotización enviada" },
  { value: "QUOTATION_EXPIRING", label: "Cotización por vencer" },
  { value: "QUOTATION_APPROVED", label: "Cotización aprobada" },
  { value: "PAYMENT_PLAN_CREATED", label: "Plan de pagos creado" },
  { value: "PAYMENT_DUE_3D", label: "Pago vence en 3 días" },
  { value: "PAYMENT_DUE_1D", label: "Pago vence mañana" },
  { value: "PAYMENT_RECEIVED", label: "Pago recibido" },
  { value: "PAYMENT_OVERDUE", label: "Pago vencido" },
  { value: "PAYMENT_COMPLETE", label: "Pagos completados" },
  { value: "TRIP_7D_BEFORE", label: "7 días antes del viaje" },
  { value: "TRIP_1D_BEFORE", label: "1 día antes del viaje" },
  { value: "TRIP_RETURN", label: "Día de regreso" },
  { value: "TRIP_POST_7D", label: "7 días post-viaje" },
  { value: "BIRTHDAY", label: "Cumpleaños" },
  { value: "ANNIVERSARY_1Y", label: "Aniversario 1 año" },
]

const availableVariables = [
  { name: "{nombre}", description: "Nombre del cliente" },
  { name: "{destino}", description: "Destino del viaje" },
  { name: "{monto}", description: "Monto del pago/cotización" },
  { name: "{moneda}", description: "Moneda (ARS, USD)" },
  { name: "{fecha_vencimiento}", description: "Fecha de vencimiento del pago" },
  { name: "{fecha_validez}", description: "Fecha de validez de cotización" },
  { name: "{fecha_salida}", description: "Fecha de salida del viaje" },
  { name: "{mensaje_cuotas}", description: "Info de cuotas pendientes" },
]

export function TemplatesDialog({ open, onOpenChange, templates }: TemplatesDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Template>>({})
  const [saving, setSaving] = useState(false)

  function startEdit(template: Template) {
    setEditingId(template.id)
    setEditData({ ...template })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditData({})
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)

    try {
      const response = await fetch(`/api/whatsapp/templates/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      })

      if (response.ok) {
        toast.success("Template actualizado")
        cancelEdit()
      } else {
        toast.error("Error al guardar")
      }
    } catch (error) {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(templateId: string, isActive: boolean) {
    try {
      await fetch(`/api/whatsapp/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      })
      toast.success(isActive ? "Template desactivado" : "Template activado")
    } catch (error) {
      toast.error("Error al actualizar")
    }
  }

  const groupedTemplates = categories.map((cat) => ({
    ...cat,
    templates: templates.filter((t) => t.category === cat.value),
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Templates de Mensajes
          </DialogTitle>
          <DialogDescription>
            Configura los templates de mensajes automáticos para WhatsApp
          </DialogDescription>
        </DialogHeader>

        {/* Variables disponibles */}
        <Card className="bg-muted/50">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Variables disponibles
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex flex-wrap gap-2">
              {availableVariables.map((v) => (
                <Badge
                  key={v.name}
                  variant="outline"
                  className="cursor-help"
                  title={v.description}
                >
                  {v.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Templates por categoría */}
        <Accordion type="multiple" defaultValue={["PAYMENT", "TRIP", "BIRTHDAY"]}>
          {groupedTemplates
            .filter((group) => group.templates.length > 0)
            .map((group) => (
              <AccordionItem key={group.value} value={group.value}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    {group.label}
                    <Badge variant="secondary" className="ml-2">
                      {group.templates.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {group.templates.map((template) => (
                    <Card key={template.id} className={!template.is_active ? "opacity-50" : ""}>
                      <CardContent className="p-4">
                        {editingId === template.id ? (
                          // Edit Mode
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input
                                  value={editData.name || ""}
                                  onChange={(e) =>
                                    setEditData({ ...editData, name: e.target.value })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Emoji</Label>
                                <Input
                                  value={editData.emoji_prefix || ""}
                                  onChange={(e) =>
                                    setEditData({ ...editData, emoji_prefix: e.target.value })
                                  }
                                  className="w-20"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Trigger</Label>
                              <Select
                                value={editData.trigger_type}
                                onValueChange={(v) =>
                                  setEditData({ ...editData, trigger_type: v })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {triggers.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>
                                      {t.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Mensaje</Label>
                              <Textarea
                                value={editData.template || ""}
                                onChange={(e) =>
                                  setEditData({ ...editData, template: e.target.value })
                                }
                                rows={6}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={saveEdit} disabled={saving}>
                                <Save className="h-4 w-4 mr-2" />
                                Guardar
                              </Button>
                              <Button variant="ghost" onClick={cancelEdit}>
                                <X className="h-4 w-4 mr-2" />
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{template.emoji_prefix}</span>
                                <div>
                                  <div className="font-medium">{template.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Trigger:{" "}
                                    {triggers.find((t) => t.value === template.trigger_type)?.label}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={template.is_active}
                                  onCheckedChange={() =>
                                    toggleActive(template.id, template.is_active)
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEdit(template)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-green-500">
                              <pre className="whitespace-pre-wrap text-sm font-sans">
                                {template.template}
                              </pre>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
        </Accordion>
      </DialogContent>
    </Dialog>
  )
}

