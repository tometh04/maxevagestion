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
  Loader2, Plus, FileText, Search, Star, Eye, Edit2, Trash2, 
  MoreHorizontal, Copy, Download
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { TEMPLATE_VARIABLES, DEFAULT_INVOICE_TEMPLATE, DEFAULT_BUDGET_TEMPLATE } from "@/lib/pdf/pdf-generator"

interface Template {
  id: string
  name: string
  description: string
  template_type: string
  html_content: string
  css_styles: string
  page_size: string
  page_orientation: string
  is_default: boolean
  is_active: boolean
  primary_color: string
  secondary_color: string
  created_at: string
  created_by_user?: {
    id: string
    first_name: string
    last_name: string
  }
}

const templateTypeLabels: Record<string, string> = {
  invoice: 'Factura',
  budget: 'Presupuesto',
  voucher: 'Voucher',
  itinerary: 'Itinerario',
  receipt: 'Recibo',
  contract: 'Contrato',
  general: 'General',
}

const templateTypeIcons: Record<string, string> = {
  invoice: '🧾',
  budget: '💰',
  voucher: '🎫',
  itinerary: '📋',
  receipt: '🧾',
  contract: '📄',
  general: '📝',
}

export function TemplatesPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [search, setSearch] = useState("")
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template_type: 'invoice' as string,
    html_content: '',
    css_styles: '',
    page_size: 'A4',
    page_orientation: 'portrait' as 'portrait' | 'landscape',
    is_default: false,
    primary_color: '#000000',
    secondary_color: '#666666',
  })

  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (typeFilter !== "ALL") params.append("type", typeFilter)

      const response = await fetch(`/api/templates?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar templates')
      }

      const data = await response.json()
      setTemplates(data.templates || [])
    } catch (error: any) {
      console.error('Error loading templates:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar los templates",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createTemplate = async () => {
    try {
      setSaving(true)
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear template')
      }

      toast({
        title: "Template creado",
        description: "El template se creó correctamente",
      })
      
      setIsCreateOpen(false)
      resetForm()
      loadTemplates()
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

  const deleteTemplate = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Error al eliminar template')
      }

      toast({
        title: "Template eliminado",
        description: "El template se eliminó correctamente",
      })
      
      loadTemplates()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const setAsDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar template')
      }

      toast({
        title: "Template actualizado",
        description: "El template se estableció como predeterminado",
      })
      
      loadTemplates()
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
      template_type: 'invoice',
      html_content: '',
      css_styles: '',
      page_size: 'A4',
      page_orientation: 'portrait',
      is_default: false,
      primary_color: '#000000',
      secondary_color: '#666666',
    })
  }

  const loadDefaultTemplate = (type: string) => {
    if (type === 'invoice') {
      setFormData(prev => ({ ...prev, html_content: DEFAULT_INVOICE_TEMPLATE }))
    } else if (type === 'budget') {
      setFormData(prev => ({ ...prev, html_content: DEFAULT_BUDGET_TEMPLATE }))
    }
  }

  const filteredTemplates = templates.filter(template => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      template.name.toLowerCase().includes(searchLower) ||
      template.description?.toLowerCase().includes(searchLower)
    )
  })

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
              <Link href="/resources">Recursos</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Templates PDF</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates PDF</h1>
          <p className="text-muted-foreground">
            Gestiona los templates para generar documentos PDF
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Template
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar templates..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los tipos</SelectItem>
                {Object.entries(templateTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {templateTypeIcons[value]} {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Grid de templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <Card 
            key={template.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              setSelectedTemplate(template)
              setIsViewOpen(true)
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{templateTypeIcons[template.template_type]}</span>
                  <Badge variant="outline">
                    {templateTypeLabels[template.template_type]}
                  </Badge>
                  {template.is_default && (
                    <Badge className="bg-amber-500">
                      <Star className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedTemplate(template)
                        setIsViewOpen(true)
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Ver
                    </DropdownMenuItem>
                    {!template.is_default && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          setAsDefault(template.id)
                        }}
                      >
                        <Star className="mr-2 h-4 w-4" />
                        Establecer como default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTemplate(template.id)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              {template.description && (
                <CardDescription className="line-clamp-2">
                  {template.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{template.page_size} - {template.page_orientation}</span>
                <span>
                  {format(new Date(template.created_at), "dd MMM yyyy", { locale: es })}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {filteredTemplates.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {search || typeFilter !== "ALL"
              ? "No se encontraron templates con los filtros aplicados"
              : "No hay templates. Crea tu primer template."
            }
          </div>
        )}
      </div>

      {/* Dialog crear template */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Template PDF</DialogTitle>
            <DialogDescription>
              Crea un nuevo template para generar documentos PDF
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Información</TabsTrigger>
              <TabsTrigger value="content">Contenido HTML</TabsTrigger>
              <TabsTrigger value="variables">Variables</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Factura Estándar"
                  />
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select 
                    value={formData.template_type} 
                    onValueChange={(v) => setFormData({ ...formData, template_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(templateTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {templateTypeIcons[value]} {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del template..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Tamaño de página</Label>
                  <Select 
                    value={formData.page_size} 
                    onValueChange={(v) => setFormData({ ...formData, page_size: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="Letter">Carta</SelectItem>
                      <SelectItem value="Legal">Legal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Orientación</Label>
                  <Select 
                    value={formData.page_orientation} 
                    onValueChange={(v: any) => setFormData({ ...formData, page_orientation: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Vertical</SelectItem>
                      <SelectItem value="landscape">Horizontal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_default}
                      onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Template por defecto</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Color primario</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Color secundario</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.secondary_color}
                      onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={formData.secondary_color}
                      onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4">
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadDefaultTemplate(formData.template_type)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Cargar template base
                </Button>
              </div>
              <div>
                <Label>Contenido HTML *</Label>
                <Textarea
                  value={formData.html_content}
                  onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                  placeholder="<!DOCTYPE html>..."
                  className="font-mono text-sm h-[400px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usa {"{{variable}}"} para insertar variables. Ver pestaña &quot;Variables&quot; para la lista completa.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="variables" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Variables disponibles para el tipo de template seleccionado ({templateTypeLabels[formData.template_type]}):
              </p>
              <div className="border rounded-md p-4 max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Variable</th>
                      <th className="text-left py-2">Descripción</th>
                      <th className="text-left py-2">Ejemplo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(TEMPLATE_VARIABLES[formData.template_type] || []).map((variable) => (
                      <tr key={variable.name} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{`{{${variable.name}}}`}</td>
                        <td className="py-2">{variable.description}</td>
                        <td className="py-2 text-muted-foreground">{variable.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Sintaxis especial:</strong><br />
                - Loops: {`{{#each items}}...{{/each}}`}<br />
                - Condicionales: {`{{#if variable}}...{{/if}}`}
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createTemplate} disabled={saving || !formData.name || !formData.html_content}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ver template */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedTemplate && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{templateTypeIcons[selectedTemplate.template_type]}</span>
                  <Badge variant="outline">
                    {templateTypeLabels[selectedTemplate.template_type]}
                  </Badge>
                  {selectedTemplate.is_default && (
                    <Badge className="bg-amber-500">
                      <Star className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>
                <DialogTitle>{selectedTemplate.name}</DialogTitle>
                {selectedTemplate.description && (
                  <DialogDescription>{selectedTemplate.description}</DialogDescription>
                )}
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tamaño:</span> {selectedTemplate.page_size}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Orientación:</span> {selectedTemplate.page_orientation}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Creado:</span>{' '}
                    {format(new Date(selectedTemplate.created_at), "dd/MM/yyyy", { locale: es })}
                  </div>
                </div>

                <div>
                  <Label>Vista previa del HTML</Label>
                  <div className="border rounded-md p-4 bg-muted/50 max-h-[400px] overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap">
                      {selectedTemplate.html_content.substring(0, 2000)}
                      {selectedTemplate.html_content.length > 2000 && '...'}
                    </pre>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsViewOpen(false)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
