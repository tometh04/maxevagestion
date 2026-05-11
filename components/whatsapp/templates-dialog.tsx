"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Edit, Save, X, Plus, Info, Code, Download, Loader2, Zap, FileText, LayoutList } from "lucide-react"
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
  onRefresh?: () => void
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
  { name: "{nota_disponibilidad}", description: "Leyenda fija de disponibilidad de cotización" },
  { name: "{fecha_salida}", description: "Fecha de salida del viaje" },
  { name: "{mensaje_cuotas}", description: "Info de cuotas pendientes" },
]

export function TemplatesDialog({ open, onOpenChange, templates, onRefresh }: TemplatesDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Template>>({})
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "CUSTOM",
    trigger_type: "MANUAL",
    template: "",
    emoji_prefix: "📱",
  })

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
        onRefresh?.()
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
      onRefresh?.()
    } catch (error) {
      toast.error("Error al actualizar")
    }
  }

  async function loadDefaultTemplates() {
    setSeeding(true)
    try {
      const response = await fetch("/api/whatsapp/seed", { method: "POST" })
      const data = await response.json()

      if (response.ok) {
        if (data.existing) {
          toast.info(data.message)
        } else {
          toast.success(data.message)
          onRefresh?.()
        }
      } else {
        toast.error(data.error || "Error al cargar templates")
      }
    } catch (error) {
      toast.error("Error al cargar templates")
    } finally {
      setSeeding(false)
    }
  }

  async function createTemplate() {
    if (!newTemplate.name || !newTemplate.template) {
      toast.error("Completa nombre y mensaje")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newTemplate,
          is_active: true,
        }),
      })

      if (response.ok) {
        toast.success("Template creado")
        setShowNewForm(false)
        setNewTemplate({
          name: "",
          category: "CUSTOM",
          trigger_type: "MANUAL",
          template: "",
          emoji_prefix: "📱",
        })
        onRefresh?.()
      } else {
        toast.error("Error al crear template")
      }
    } catch (error) {
      toast.error("Error al crear template")
    } finally {
      setSaving(false)
    }
  }

  const groupedTemplates = categories.map((cat) => ({
    ...cat,
    templates: templates.filter((t) => t.category === cat.value),
  }))

  const hasTemplates = templates.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Templates de Mensajes
          </DialogTitle>
          <DialogDescription>
            Configura los templates de mensajes automáticos para WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
        {/* Variables disponibles */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
              <Info className="h-3.5 w-3.5 text-primary" />
            </div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Variables disponibles</h4>
          </div>
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
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          {!hasTemplates && (
            <Button onClick={loadDefaultTemplates} disabled={seeding} variant="outline">
              {seeding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Cargar Templates por Defecto
            </Button>
          )}
          <Button onClick={() => setShowNewForm(!showNewForm)} variant={showNewForm ? "secondary" : "default"}>
            <Plus className="h-4 w-4 mr-2" />
            {showNewForm ? "Cancelar" : "Nuevo Template"}
          </Button>
        </div>

        {/* Formulario nuevo template */}
        {showNewForm && (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                <FileText className="h-3.5 w-3.5 text-success" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Crear nuevo template</h4>
            </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    placeholder="Ej: Promoción de temporada"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <Input
                    value={newTemplate.emoji_prefix}
                    onChange={(e) => setNewTemplate({ ...newTemplate, emoji_prefix: e.target.value })}
                    className="w-20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select
                    value={newTemplate.category}
                    onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trigger</Label>
                  <Select
                    value={newTemplate.trigger_type}
                    onValueChange={(v) => setNewTemplate({ ...newTemplate, trigger_type: v })}
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
              </div>
              <div className="space-y-2">
                <Label>Mensaje</Label>
                <Textarea
                  value={newTemplate.template}
                  onChange={(e) => setNewTemplate({ ...newTemplate, template: e.target.value })}
                  rows={5}
                  placeholder="Hola {nombre}! ..."
                />
              </div>
              <Button onClick={createTemplate} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Crear Template
              </Button>
          </div>
        )}

        {/* Templates por categoría */}
        {hasTemplates ? (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-violet/10">
                <LayoutList className="h-3.5 w-3.5 text-accent-violet" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Templates por categoria</h4>
            </div>
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
                      <div key={template.id} className={`rounded-xl border border-border/40 bg-background p-4 ${!template.is_active ? "opacity-50" : ""}`}>
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
                              <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-success">
                                <pre className="whitespace-pre-wrap text-sm font-sans">
                                  {template.template}
                                </pre>
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-8 text-center">
            <div className="text-muted-foreground space-y-4">
              <div>
                <p className="text-lg font-medium mb-2">No hay templates configurados</p>
                <p className="text-sm">
                  Cargá los templates pre-configurados (pagos, viajes, cumpleaños...) o creá uno nuevo manualmente.
                </p>
              </div>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={loadDefaultTemplates} disabled={seeding}>
                  {seeding ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Cargar Templates por Defecto
                </Button>
                <Button onClick={() => setShowNewForm(!showNewForm)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear template manual
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
