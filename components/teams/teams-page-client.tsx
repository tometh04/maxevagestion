"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  Loader2, Plus, Users, Crown, MoreHorizontal, Trash2, Edit2, 
  Target, TrendingUp, UserPlus
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

interface TeamMember {
  id: string
  role: string
  joined_at: string
  user: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string
    email: string
  }
}

interface Team {
  id: string
  name: string
  description: string
  color: string
  is_active: boolean
  created_at: string
  leader?: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string
  }
  members: TeamMember[]
  member_count: number
}

const colorOptions = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
]

export function TeamsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<Array<{ id: string; first_name: string; last_name: string; email: string }>>([])
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    leader_id: '' as string,
    member_ids: [] as string[],
  })

  useEffect(() => {
    loadTeams()
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTeams = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/teams')
      
      if (!response.ok) {
        throw new Error('Error al cargar equipos')
      }

      const data = await response.json()
      setTeams(data.teams || [])
    } catch (error: any) {
      console.error('Error loading teams:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar los equipos",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  const createTeam = async () => {
    try {
      setSaving(true)
      
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          leader_id: formData.leader_id || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear equipo')
      }

      toast({
        title: "Equipo creado",
        description: "El equipo se creó correctamente",
      })
      
      setIsCreateOpen(false)
      resetForm()
      loadTeams()
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

  const deleteTeam = async (id: string) => {
    try {
      const response = await fetch(`/api/teams/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Error al eliminar equipo')
      }

      toast({
        title: "Equipo eliminado",
        description: "El equipo se eliminó correctamente",
      })
      
      loadTeams()
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
      leader_id: '',
      member_ids: [],
    })
  }

  const toggleMember = (userId: string) => {
    if (formData.member_ids.includes(userId)) {
      setFormData({
        ...formData,
        member_ids: formData.member_ids.filter(id => id !== userId),
      })
    } else {
      setFormData({
        ...formData,
        member_ids: [...formData.member_ids, userId],
      })
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase()
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
              <Link href="/settings">Configuración</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Equipos</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Equipos de Ventas</h1>
          <p className="text-muted-foreground">
            Organiza tu equipo y asigna metas de ventas
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Equipo
        </Button>
      </div>

      {/* Grid de equipos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team) => (
          <Card key={team.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: team.color }}
                  >
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{team.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {team.member_count} miembros
                    </CardDescription>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Edit2 className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Agregar miembros
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Target className="mr-2 h-4 w-4" />
                      Ver metas
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteTeam(team.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              {team.description && (
                <p className="text-sm text-muted-foreground mb-4">
                  {team.description}
                </p>
              )}

              {/* Líder */}
              {team.leader && (
                <div className="flex items-center gap-2 mb-4 p-2 bg-muted/50 rounded">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={team.leader.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {getInitials(team.leader.first_name, team.leader.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {team.leader.first_name} {team.leader.last_name}
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">Líder</Badge>
                </div>
              )}

              {/* Miembros */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Miembros del equipo</span>
                </div>
                <div className="flex -space-x-2">
                  {team.members.slice(0, 5).map((member) => (
                    <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                      <AvatarImage src={member.user.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {getInitials(member.user.first_name, member.user.last_name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {team.members.length > 5 && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
                      +{team.members.length - 5}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {teams.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No hay equipos creados. Crea tu primer equipo para organizar a tu personal.
          </div>
        )}
      </div>

      {/* Dialog crear equipo */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Equipo</DialogTitle>
            <DialogDescription>
              Crea un nuevo equipo de ventas y asigna miembros
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Nombre del equipo *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Equipo Premium"
              />
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción del equipo..."
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

            <div>
              <Label>Líder del equipo</Label>
              <Select 
                value={formData.leader_id} 
                onValueChange={(v) => setFormData({ ...formData, leader_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar líder" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Miembros</Label>
              <div className="border rounded-md p-3 mt-2 max-h-48 overflow-y-auto space-y-2">
                {users.map(user => (
                  <label 
                    key={user.id}
                    className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.member_ids.includes(user.id)}
                      onChange={() => toggleMember(user.id)}
                      className="h-4 w-4"
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {getInitials(user.first_name, user.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{user.first_name} {user.last_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </label>
                ))}
                {users.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay usuarios disponibles
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createTeam} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear Equipo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
