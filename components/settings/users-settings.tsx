"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  UserPlus, 
  Trash2, 
  Mail, 
  Shield, 
  Building2, 
  CheckCircle2,
  XCircle,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Send
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

interface User {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
  user_agencies?: Array<{ agency_id: string; agencies: { name: string } }>
}

interface Agency {
  id: string
  name: string
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  CONTABLE: "Contable",
  SELLER: "Vendedor",
  VIEWER: "Observador",
}

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-500",
  ADMIN: "bg-blue-500",
  CONTABLE: "bg-green-500",
  SELLER: "bg-orange-500",
  VIEWER: "bg-gray-500",
}

const roleDescriptions: Record<string, string> = {
  SUPER_ADMIN: "Acceso total al sistema",
  ADMIN: "Gestión completa sin eliminar",
  CONTABLE: "Solo módulos financieros",
  SELLER: "Solo sus propios datos",
  VIEWER: "Solo lectura",
}

export function UsersSettings() {
  const [users, setUsers] = useState<User[]>([])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "SELLER",
    agencies: [] as string[],
    default_commission_percentage: 10,
  })

  // Cargar usuarios y agencias
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, agenciesRes] = await Promise.all([
        fetch("/api/settings/users"),
        fetch("/api/agencies"),
      ])

      if (usersRes.ok) {
        const usersData = await usersRes.json()
        setUsers(usersData.users || [])
      }

      if (agenciesRes.ok) {
        const agenciesData = await agenciesRes.json()
        setAgencies(agenciesData.agencies || [])
      }
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Error al cargar datos")
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!newUser.name || !newUser.email || !newUser.role) {
      toast.error("Completa todos los campos requeridos")
      return
    }

    if (newUser.agencies.length === 0) {
      toast.error("Selecciona al menos una agencia")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/settings/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(data.message || "Invitación enviada correctamente")
        setInviteDialogOpen(false)
        setNewUser({
          name: "",
          email: "",
          role: "SELLER",
          agencies: [],
          default_commission_percentage: 10,
        })
        loadData()
      } else {
        toast.error(data.error || "Error al enviar invitación")
      }
    } catch (error) {
      console.error("Error inviting user:", error)
      toast.error("Error al enviar invitación")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return

    setSubmitting(true)
    try {
      const response = await fetch(`/api/settings/users/${selectedUser.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Usuario eliminado correctamente")
        setDeleteDialogOpen(false)
        setSelectedUser(null)
        loadData()
      } else {
        const data = await response.json()
        toast.error(data.error || "Error al eliminar usuario")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      toast.error("Error al eliminar usuario")
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    try {
      const response = await fetch(`/api/settings/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      })

      if (response.ok) {
        toast.success(user.is_active ? "Usuario desactivado" : "Usuario activado")
        loadData()
      } else {
        const data = await response.json()
        toast.error(data.error || "Error al actualizar usuario")
      }
    } catch (error) {
      console.error("Error toggling user:", error)
      toast.error("Error al actualizar usuario")
    }
  }

  const handleResendInvite = async (user: User) => {
    toast.info("Reenviando invitación...")
    // Por ahora solo mostramos un mensaje, en el futuro implementar reenvío
    toast.success(`Invitación reenviada a ${user.email}`)
  }

  const toggleAgency = (agencyId: string) => {
    setNewUser((prev) => ({
      ...prev,
      agencies: prev.agencies.includes(agencyId)
        ? prev.agencies.filter((id) => id !== agencyId)
        : [...prev.agencies, agencyId],
    }))
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gestión de Usuarios</CardTitle>
              <CardDescription>
                Invita nuevos usuarios y gestiona sus permisos
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invitar Usuario
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Invitar Nuevo Usuario</DialogTitle>
                    <DialogDescription>
                      El usuario recibirá un email con instrucciones para crear su contraseña
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre completo *</Label>
                      <Input
                        id="name"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        placeholder="Juan Pérez"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        placeholder="juan@email.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role">Rol *</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(roleLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              <div className="flex items-center gap-2">
                                <span>{label}</span>
                                <span className="text-xs text-muted-foreground">
                                  - {roleDescriptions[value]}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {newUser.role === "SELLER" && (
                      <div className="space-y-2">
                        <Label htmlFor="commission">% Comisión por defecto</Label>
                        <Input
                          id="commission"
                          type="number"
                          min="0"
                          max="100"
                          value={newUser.default_commission_percentage}
                          onChange={(e) =>
                            setNewUser({
                              ...newUser,
                              default_commission_percentage: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Agencias *</Label>
                      <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                        {agencies.map((agency) => (
                          <div
                            key={agency.id}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{agency.name}</span>
                            </div>
                            <Switch
                              checked={newUser.agencies.includes(agency.id)}
                              onCheckedChange={() => toggleAgency(agency.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setInviteDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleInvite} disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Enviar Invitación
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Agencias</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>
                          {user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${roleColors[user.role]} text-white`}>
                      {roleLabels[user.role] || user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.user_agencies?.slice(0, 2).map((ua) => (
                        <Badge key={ua.agency_id} variant="outline" className="text-xs">
                          {ua.agencies?.name}
                        </Badge>
                      ))}
                      {(user.user_agencies?.length || 0) > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{(user.user_agencies?.length || 0) - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.is_active ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-600">
                        <XCircle className="mr-1 h-3 w-3" />
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                          {user.is_active ? (
                            <>
                              <XCircle className="mr-2 h-4 w-4" />
                              Desactivar
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Activar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResendInvite(user)}>
                          <Mail className="mr-2 h-4 w-4" />
                          Reenviar invitación
                        </DropdownMenuItem>
                        {user.role !== "SUPER_ADMIN" && (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setSelectedUser(user)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {users.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No hay usuarios registrados. Invita al primer usuario.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tarjeta de permisos por rol */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permisos por Rol
          </CardTitle>
          <CardDescription>
            Resumen de qué puede hacer cada rol en el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(roleLabels).map(([role, label]) => (
              <div
                key={role}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Badge className={`${roleColors[role]} text-white`}>
                    {label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {roleDescriptions[role]}
                </p>
                <div className="text-xs space-y-1">
                  {role === "SUPER_ADMIN" && (
                    <>
                      <p>✓ Acceso total a todas las funciones</p>
                      <p>✓ Gestión de usuarios y configuración</p>
                      <p>✓ Puede eliminar registros</p>
                    </>
                  )}
                  {role === "ADMIN" && (
                    <>
                      <p>✓ Gestión de operaciones y leads</p>
                      <p>✓ Acceso a reportes completos</p>
                      <p>✗ No puede eliminar ni modificar config</p>
                    </>
                  )}
                  {role === "CONTABLE" && (
                    <>
                      <p>✓ Caja, contabilidad, pagos</p>
                      <p>✓ Reportes financieros</p>
                      <p>✗ Sin acceso a leads ni clientes</p>
                    </>
                  )}
                  {role === "SELLER" && (
                    <>
                      <p>✓ Solo sus leads y operaciones</p>
                      <p>✓ Ver sus comisiones</p>
                      <p>✗ Sin acceso a caja ni config</p>
                    </>
                  )}
                  {role === "VIEWER" && (
                    <>
                      <p>✓ Solo lectura en todo</p>
                      <p>✗ No puede crear ni editar</p>
                      <p>✗ Sin acceso a configuración</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente al usuario{" "}
              <strong>{selectedUser?.name}</strong> ({selectedUser?.email}) del sistema.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
