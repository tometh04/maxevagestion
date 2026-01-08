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
  Loader2, Plus, FileText, Search, Filter, Pin, Archive, 
  MessageSquare, Paperclip, MoreHorizontal, Edit2, Trash2,
  Eye, Users, Lock, Building2
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

interface Note {
  id: string
  title: string
  content: string
  note_type: 'general' | 'operation' | 'customer'
  visibility: 'private' | 'team' | 'agency'
  tags: string[]
  color: string | null
  is_pinned: boolean
  status: string
  created_at: string
  updated_at: string
  created_by_user?: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string
  }
  operation?: { id: string; file_code: string; destination: string }
  customer?: { id: string; first_name: string; last_name: string }
  comments?: { count: number }[]
  attachments?: { count: number }[]
}

const visibilityIcons = {
  private: Lock,
  team: Users,
  agency: Building2,
}

const visibilityLabels = {
  private: 'Privada',
  team: 'Equipo',
  agency: 'Agencia',
}

const noteTypeLabels = {
  general: 'General',
  operation: 'Operación',
  customer: 'Cliente',
}

const noteColors = [
  { value: null, label: 'Sin color', class: 'bg-card' },
  { value: '#fef3c7', label: 'Amarillo', class: 'bg-amber-100' },
  { value: '#dbeafe', label: 'Azul', class: 'bg-blue-100' },
  { value: '#dcfce7', label: 'Verde', class: 'bg-green-100' },
  { value: '#fce7f3', label: 'Rosa', class: 'bg-pink-100' },
  { value: '#f3e8ff', label: 'Morado', class: 'bg-purple-100' },
]

interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface Operation {
  id: string
  file_code: string
  destination: string
}

export function NotesPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Note[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [tagFilter, setTagFilter] = useState("ALL")
  const [search, setSearch] = useState("")
  
  // Data for linking
  const [customers, setCustomers] = useState<Customer[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    note_type: 'general' as 'general' | 'operation' | 'customer',
    visibility: 'private' as 'private' | 'team' | 'agency',
    tags: [] as string[],
    color: null as string | null,
    is_pinned: false,
    operation_id: '' as string,
    customer_id: '' as string,
  })
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    loadNotes()
    loadRelatedData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, tagFilter])

  const loadRelatedData = async () => {
    try {
      // Cargar clientes
      const customersRes = await fetch('/api/customers?limit=100')
      if (customersRes.ok) {
        const data = await customersRes.json()
        setCustomers(data.customers || [])
      }
      
      // Cargar operaciones
      const operationsRes = await fetch('/api/operations?limit=100')
      if (operationsRes.ok) {
        const data = await operationsRes.json()
        setOperations(data.operations || [])
      }
    } catch (error) {
      console.error('Error loading related data:', error)
    }
  }

  const loadNotes = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (typeFilter !== "ALL") params.append("type", typeFilter)
      if (tagFilter !== "ALL") params.append("tag", tagFilter)

      const response = await fetch(`/api/notes?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar notas')
      }

      const data = await response.json()
      setNotes(data.notes || [])
      setAllTags(data.tags || [])
    } catch (error: any) {
      console.error('Error loading notes:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar las notas",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createNote = async () => {
    try {
      setSaving(true)
      
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear nota')
      }

      toast({
        title: "Nota creada",
        description: "La nota se creó correctamente",
      })
      
      setIsCreateOpen(false)
      resetForm()
      loadNotes()
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

  const updateNote = async (id: string, data: Partial<Note>) => {
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar nota')
      }

      loadNotes()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const deleteNote = async (id: string) => {
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Error al eliminar nota')
      }

      toast({
        title: "Nota eliminada",
        description: "La nota se eliminó correctamente",
      })
      
      loadNotes()
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
      title: '',
      content: '',
      note_type: 'general',
      visibility: 'private',
      tags: [],
      color: null,
      is_pinned: false,
      operation_id: '',
      customer_id: '',
    })
    setNewTag('')
  }

  const addTag = () => {
    if (newTag && !formData.tags.includes(newTag)) {
      setFormData({ ...formData, tags: [...formData.tags, newTag] })
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })
  }

  const filteredNotes = notes.filter(note => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      note.title.toLowerCase().includes(searchLower) ||
      note.content?.toLowerCase().includes(searchLower) ||
      note.tags.some(t => t.toLowerCase().includes(searchLower))
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
          <BreadcrumbPage>Notas</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notas Colaborativas</h1>
          <p className="text-muted-foreground">
            Crea y comparte notas con tu equipo
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Nota
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
                  placeholder="Buscar notas..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los tipos</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="operation">Operación</SelectItem>
                <SelectItem value="customer">Cliente</SelectItem>
              </SelectContent>
            </Select>
            {allTags.length > 0 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los tags</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid de notas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredNotes.map((note) => {
          const VisibilityIcon = visibilityIcons[note.visibility]
          const commentsCount = note.comments?.[0]?.count || 0
          const attachmentsCount = note.attachments?.[0]?.count || 0

          return (
            <Card 
              key={note.id}
              className={cn(
                "cursor-pointer hover:shadow-md transition-shadow",
                note.is_pinned && "ring-2 ring-primary"
              )}
              style={{ backgroundColor: note.color || undefined }}
              onClick={() => {
                setSelectedNote(note)
                setIsViewOpen(true)
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {note.is_pinned && (
                      <Pin className="h-4 w-4 text-primary" />
                    )}
                    <Badge variant="outline" className="text-xs">
                      {noteTypeLabels[note.note_type]}
                    </Badge>
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
                          updateNote(note.id, { is_pinned: !note.is_pinned })
                        }}
                      >
                        <Pin className="mr-2 h-4 w-4" />
                        {note.is_pinned ? 'Desanclar' : 'Anclar'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          updateNote(note.id, { status: 'archived' })
                        }}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archivar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNote(note.id)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="text-lg line-clamp-1">{note.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {note.content && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {note.content.replace(/<[^>]*>/g, '')}
                  </p>
                )}
                
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {note.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {note.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{note.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <VisibilityIcon className="h-3 w-3" />
                      {visibilityLabels[note.visibility]}
                    </span>
                    {commentsCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {commentsCount}
                      </span>
                    )}
                    {attachmentsCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {attachmentsCount}
                      </span>
                    )}
                  </div>
                  <span>
                    {format(new Date(note.created_at), "dd MMM", { locale: es })}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
        
        {filteredNotes.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {search || typeFilter !== "ALL" || tagFilter !== "ALL"
              ? "No se encontraron notas con los filtros aplicados"
              : "No hay notas. Crea tu primera nota."
            }
          </div>
        )}
      </div>

      {/* Dialog crear nota */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva Nota</DialogTitle>
            <DialogDescription>
              Crea una nueva nota para ti o para compartir con tu equipo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Título de la nota"
              />
            </div>

            <div>
              <Label>Contenido</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Escribe el contenido de la nota..."
                rows={6}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select 
                  value={formData.note_type} 
                  onValueChange={(v: any) => setFormData({ ...formData, note_type: v, operation_id: '', customer_id: '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="operation">Operación</SelectItem>
                    <SelectItem value="customer">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibilidad</Label>
                <Select 
                  value={formData.visibility} 
                  onValueChange={(v: any) => setFormData({ ...formData, visibility: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Privada
                      </div>
                    </SelectItem>
                    <SelectItem value="team">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Equipo
                      </div>
                    </SelectItem>
                    <SelectItem value="agency">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Agencia
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Selector de operación */}
            {formData.note_type === 'operation' && (
              <div>
                <Label>Operación vinculada *</Label>
                <Select 
                  value={formData.operation_id} 
                  onValueChange={(v) => setFormData({ ...formData, operation_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar operación" />
                  </SelectTrigger>
                  <SelectContent>
                    {operations.length > 0 ? (
                      operations.map(op => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.file_code} - {op.destination}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground p-2 text-center">
                        No hay operaciones disponibles
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Selector de cliente */}
            {formData.note_type === 'customer' && (
              <div>
                <Label>Cliente vinculado *</Label>
                <Select 
                  value={formData.customer_id} 
                  onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.length > 0 ? (
                      customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.first_name} {c.last_name} - {c.email}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground p-2 text-center">
                        No hay clientes disponibles
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {noteColors.map(color => (
                  <button
                    key={color.value || 'none'}
                    type="button"
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      color.class,
                      formData.color === color.value 
                        ? "border-primary ring-2 ring-primary/20" 
                        : "border-transparent hover:border-muted-foreground/50"
                    )}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.label}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Agregar tag"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Agregar
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags.map(tag => (
                    <Badge 
                      key={tag} 
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeTag(tag)}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createNote} disabled={saving || !formData.title}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ver nota */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedNote && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">
                    {noteTypeLabels[selectedNote.note_type]}
                  </Badge>
                  <Badge variant="secondary">
                    {visibilityLabels[selectedNote.visibility]}
                  </Badge>
                  {selectedNote.is_pinned && (
                    <Badge>
                      <Pin className="h-3 w-3 mr-1" />
                      Anclada
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-2xl">{selectedNote.title}</DialogTitle>
                <DialogDescription>
                  Creada el {format(new Date(selectedNote.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
                  {selectedNote.created_by_user && (
                    <> por {selectedNote.created_by_user.first_name} {selectedNote.created_by_user.last_name}</>
                  )}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {selectedNote.content && (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedNote.content }}
                  />
                )}

                {selectedNote.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedNote.tags.map(tag => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}

                {(selectedNote.operation || selectedNote.customer) && (
                  <div className="border-t pt-4">
                    {selectedNote.operation && (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4" />
                        <span>Operación: {selectedNote.operation.file_code} - {selectedNote.operation.destination}</span>
                      </div>
                    )}
                    {selectedNote.customer && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4" />
                        <span>Cliente: {selectedNote.customer.first_name} {selectedNote.customer.last_name}</span>
                      </div>
                    )}
                  </div>
                )}
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
