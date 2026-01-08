"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Loader2, Plus, Users, Zap, Settings2, Trash2, Edit2, 
  MoreHorizontal, Eye, UserPlus, RefreshCw
} from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"

interface Segment {
  id: string
  name: string
  description: string
  color: string
  icon: string
  segment_type: 'manual' | 'automatic' | 'hybrid'
  rules: Array<{ field: string; operator: string; value: any }>
  rules_logic: 'AND' | 'OR'
  auto_update: boolean
  priority: number
  customer_count: number
  last_calculated_at: string | null
  created_at: string
}

const segmentTypeLabels = {
  manual: { label: 'Manual', icon: Users, description: 'Clientes agregados manualmente' },
  automatic: { label: 'Automático', icon: Zap, description: 'Basado en reglas' },
  hybrid: { label: 'Híbrido', icon: Settings2, description: 'Manual + Automático' },
}

const operatorLabels: Record<string, string> = {
  '=': 'es igual a',
  '!=': 'no es igual a',
  '>': 'mayor que',
  '<': 'menor que',
  '>=': 'mayor o igual a',
  '<=': 'menor o igual a',
  'contains': 'contiene',
  'not_contains': 'no contiene',
  'starts_with': 'comienza con',
  'ends_with': 'termina con',
  'is_null': 'está vacío',
  'is_not_null': 'no está vacío',
}

const fieldLabels: Record<string, string> = {
  'total_spent': 'Gasto total',
  'operations_count': 'Cantidad de operaciones',
  'email': 'Email',
  'phone': 'Teléfono',
  'city': 'Ciudad',
  'country': 'País',
  'created_at': 'Fecha de creación',
}

const colorOptions = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
]

export function CustomerSegmentsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [segments, setSegments] = useState<Segment[]>([])
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    segment_type: 'manual' as 'manual' | 'automatic' | 'hybrid',
    rules: [] as Array<{ field: string; operator: string; value: string }>,
    rules_logic: 'AND' as 'AND' | 'OR',
    auto_update: true,
    priority: 0,
  })

  useEffect(() => {
    loadSegments()
  }, [])

  const loadSegments = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/customers/segments')
      
      if (!response.ok) {
        throw new Error('Error al cargar segmentos')
      }

      const data = await response.json()
      setSegments(data.segments || [])
    } catch (error: any) {
      console.error('Error loading segments:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar los segmentos",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createSegment = async () => {
    try {
      setSaving(true)
      
      const response = await fetch('/api/customers/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear segmento')
      }

      toast({
        title: "Segmento creado",
        description: "El segmento se creó correctamente",
      })
      
      setIsCreateOpen(false)
      resetForm()
      loadSegments()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const deleteSegment = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/segments/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Error al eliminar segmento')
      }

      toast({
        title: "Segmento eliminado",
        description: "El segmento se eliminó correctamente",
      })
      
      loadSegments()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#6366f1',
      segment_type: 'manual',
      rules: [],
      rules_logic: 'AND',
      auto_update: true,
      priority: 0,
    })
  }

  const addRule = () => {
    setFormData({
      ...formData,
      rules: [...formData.rules, { field: 'total_spent', operator: '>', value: '' }],
    })
  }

  const updateRule = (index: number, key: string, value: string) => {
    const newRules = [...formData.rules]
    newRules[index] = { ...newRules[index], [key]: value }
    setFormData({ ...formData, rules: newRules })
  }

  const removeRule = (index: number) => {
    setFormData({
      ...formData,
      rules: formData.rules.filter((_, i) => i !== index),
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/customers">Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Segmentos</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Segmentos de Clientes</h1>
          <p className="text-muted-foreground">
            Organiza tus clientes en grupos para marketing y análisis
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Segmento
        </Button>
      </div>

      {/* Grid de segmentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {segments.map((segment) => {
          const TypeInfo = segmentTypeLabels[segment.segment_type]

          return (
            <Card key={segment.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: segment.color }}
                    >
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{segment.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          <TypeInfo.icon className="h-3 w-3 mr-1" />
                          {TypeInfo.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/customers?segment=${segment.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver clientes
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Agregar clientes
                      </DropdownMenuItem>
                      {segment.segment_type !== 'manual' && (
                        <DropdownMenuItem>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Recalcular
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteSegment(segment.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {segment.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {segment.description}
                  </p>
                )}

                {/* Mostrar reglas si es automático */}
                {segment.segment_type !== 'manual' && segment.rules.length > 0 && (
                  <div className="text-xs bg-muted p-2 rounded mb-3">
                    <span className="font-medium">Reglas ({segment.rules_logic}):</span>
                    <ul className="mt-1 space-y-1">
                      {segment.rules.slice(0, 2).map((rule, i) => (
                        <li key={i}>
                          {fieldLabels[rule.field] || rule.field} {operatorLabels[rule.operator]} {rule.value}
                        </li>
                      ))}
                      {segment.rules.length > 2 && (
                        <li>+{segment.rules.length - 2} más...</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{segment.customer_count}</span>
                    <span className="text-muted-foreground">clientes</span>
                  </div>
                  {segment.last_calculated_at && (
                    <span className="text-xs text-muted-foreground">
                      Actualizado: {format(new Date(segment.last_calculated_at), "dd/MM HH:mm")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        
        {segments.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No hay segmentos. Crea tu primer segmento para organizar tus clientes.
          </div>
        )}
      </div>

      {/* Dialog crear segmento */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Segmento</DialogTitle>
            <DialogDescription>
              Crea un nuevo segmento para organizar tus clientes
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Clientes VIP"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select 
                  value={formData.segment_type} 
                  onValueChange={(v: any) => setFormData({ ...formData, segment_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automático</SelectItem>
                    <SelectItem value="hybrid">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción del segmento..."
              />
            </div>

            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {colorOptions.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      formData.color === color 
                        ? "border-foreground ring-2 ring-offset-2" 
                        : "border-transparent hover:scale-110"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>

            {/* Reglas para segmentos automáticos */}
            {formData.segment_type !== 'manual' && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Reglas de segmentación</Label>
                  <div className="flex items-center gap-2">
                    <Select 
                      value={formData.rules_logic} 
                      onValueChange={(v: any) => setFormData({ ...formData, rules_logic: v })}
                    >
                      <SelectTrigger className="w-24 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">Y (AND)</SelectItem>
                        <SelectItem value="OR">O (OR)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" onClick={addRule}>
                      <Plus className="h-4 w-4 mr-1" />
                      Regla
                    </Button>
                  </div>
                </div>

                {formData.rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay reglas. Agrega reglas para definir qué clientes pertenecen a este segmento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {formData.rules.map((rule, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Select 
                          value={rule.field} 
                          onValueChange={(v) => updateRule(index, 'field', v)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="total_spent">Gasto total</SelectItem>
                            <SelectItem value="operations_count">Operaciones</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="city">Ciudad</SelectItem>
                            <SelectItem value="country">País</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select 
                          value={rule.operator} 
                          onValueChange={(v) => updateRule(index, 'operator', v)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="=">=</SelectItem>
                            <SelectItem value="!=">≠</SelectItem>
                            <SelectItem value=">">&gt;</SelectItem>
                            <SelectItem value="<">&lt;</SelectItem>
                            <SelectItem value=">=">&gt;=</SelectItem>
                            <SelectItem value="<=">&lt;=</SelectItem>
                            <SelectItem value="contains">contiene</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={rule.value}
                          onChange={(e) => updateRule(index, 'value', e.target.value)}
                          placeholder="Valor"
                          className="flex-1"
                        />
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeRule(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createSegment} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear Segmento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
