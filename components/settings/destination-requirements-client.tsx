"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Syringe, 
  FileText, 
  CreditCard, 
  Shield, 
  File,
  Info,
  ExternalLink,
  Loader2
} from "lucide-react"

interface Requirement {
  id: string
  destination_code: string
  destination_name: string
  requirement_type: string
  requirement_name: string
  is_required: boolean
  description: string | null
  url: string | null
  days_before_trip: number
  is_active: boolean
}

const typeConfig: Record<string, { icon: any; label: string; color: string }> = {
  VACCINE: { icon: Syringe, label: "Vacuna", color: "bg-red-500" },
  FORM: { icon: FileText, label: "Formulario", color: "bg-blue-500" },
  VISA: { icon: CreditCard, label: "Visa", color: "bg-purple-500" },
  INSURANCE: { icon: Shield, label: "Seguro", color: "bg-green-500" },
  DOCUMENT: { icon: File, label: "Documento", color: "bg-orange-500" },
  OTHER: { icon: Info, label: "Otro", color: "bg-gray-500" },
}

const emptyRequirement = {
  destination_code: "",
  destination_name: "",
  requirement_type: "VACCINE",
  requirement_name: "",
  is_required: true,
  description: "",
  url: "",
  days_before_trip: 30,
}

export function DestinationRequirementsClient() {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyRequirement)
  const [saving, setSaving] = useState(false)
  const [filterDestination, setFilterDestination] = useState("")

  useEffect(() => {
    fetchRequirements()
  }, [])

  const fetchRequirements = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/destination-requirements?active=false")
      if (!response.ok) throw new Error("Error al obtener requisitos")
      const data = await response.json()
      setRequirements(data.requirements || [])
    } catch (error) {
      console.error("Error:", error)
      toast.error("Error al cargar requisitos")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingId(null)
    setFormData(emptyRequirement)
    setDialogOpen(true)
  }

  const handleOpenEdit = (req: Requirement) => {
    setEditingId(req.id)
    setFormData({
      destination_code: req.destination_code,
      destination_name: req.destination_name,
      requirement_type: req.requirement_type,
      requirement_name: req.requirement_name,
      is_required: req.is_required,
      description: req.description || "",
      url: req.url || "",
      days_before_trip: req.days_before_trip,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.destination_code || !formData.destination_name || !formData.requirement_name) {
      toast.error("Completa los campos requeridos")
      return
    }

    try {
      setSaving(true)
      const url = editingId 
        ? `/api/destination-requirements/${editingId}` 
        : "/api/destination-requirements"
      const method = editingId ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al guardar")
      }

      toast.success(editingId ? "Requisito actualizado" : "Requisito creado")
      setDialogOpen(false)
      fetchRequirements()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este requisito?")) return

    try {
      const response = await fetch(`/api/destination-requirements/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Error al eliminar")

      toast.success("Requisito eliminado")
      fetchRequirements()
    } catch (error) {
      toast.error("Error al eliminar requisito")
    }
  }

  const handleToggleActive = async (req: Requirement) => {
    try {
      const response = await fetch(`/api/destination-requirements/${req.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !req.is_active }),
      })

      if (!response.ok) throw new Error("Error al actualizar")

      toast.success(req.is_active ? "Requisito desactivado" : "Requisito activado")
      fetchRequirements()
    } catch (error) {
      toast.error("Error al actualizar requisito")
    }
  }

  // Agrupar por destino
  const groupedRequirements = requirements.reduce((acc, req) => {
    if (!acc[req.destination_name]) {
      acc[req.destination_name] = []
    }
    acc[req.destination_name].push(req)
    return acc
  }, {} as Record<string, Requirement[]>)

  // Filtrar
  const filteredGroups = Object.entries(groupedRequirements).filter(([name]) =>
    name.toLowerCase().includes(filterDestination.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Filtrar por destino..."
          value={filterDestination}
          onChange={(e) => setFilterDestination(e.target.value)}
          className="max-w-xs"
        />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Requisito
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Requisito" : "Nuevo Requisito"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código País *</Label>
                  <Input
                    placeholder="BR, US, EU..."
                    value={formData.destination_code}
                    onChange={(e) => setFormData({ ...formData, destination_code: e.target.value.toUpperCase() })}
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre Destino *</Label>
                  <Input
                    placeholder="Brasil, Estados Unidos..."
                    value={formData.destination_name}
                    onChange={(e) => setFormData({ ...formData, destination_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select
                    value={formData.requirement_type}
                    onValueChange={(value) => setFormData({ ...formData, requirement_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VACCINE">Vacuna</SelectItem>
                      <SelectItem value="VISA">Visa</SelectItem>
                      <SelectItem value="FORM">Formulario</SelectItem>
                      <SelectItem value="INSURANCE">Seguro</SelectItem>
                      <SelectItem value="DOCUMENT">Documento</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nombre Requisito *</Label>
                  <Input
                    placeholder="Fiebre Amarilla, ESTA..."
                    value={formData.requirement_name}
                    onChange={(e) => setFormData({ ...formData, requirement_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  placeholder="Detalles adicionales..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>URL (más info)</Label>
                  <Input
                    placeholder="https://..."
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Días antes para alertar</Label>
                  <Input
                    type="number"
                    value={formData.days_before_trip}
                    onChange={(e) => setFormData({ ...formData, days_before_trip: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                />
                <Label>Es obligatorio</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay requisitos configurados
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map(([destinationName, reqs]) => (
            <Card key={destinationName}>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">{reqs[0].destination_code}</Badge>
                  {destinationName}
                  <span className="text-muted-foreground font-normal text-sm">
                    ({reqs.length} requisito{reqs.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Requisito</TableHead>
                      <TableHead>Obligatorio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reqs.map((req) => {
                      const config = typeConfig[req.requirement_type] || typeConfig.OTHER
                      const Icon = config.icon
                      return (
                        <TableRow key={req.id} className={!req.is_active ? "opacity-50" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`p-1 rounded ${config.color} text-white`}>
                                <Icon className="h-3 w-3" />
                              </div>
                              <span className="text-sm">{config.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{req.requirement_name}</p>
                              {req.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-xs">
                                  {req.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {req.is_required ? (
                              <Badge variant="destructive">Obligatorio</Badge>
                            ) : (
                              <Badge variant="secondary">Recomendado</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={req.is_active}
                              onCheckedChange={() => handleToggleActive(req)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {req.url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(req.url!, "_blank")}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(req)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(req.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

