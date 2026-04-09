"use client"

import { useState, useEffect } from "react"
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
  Send,
  KeyRound,
  Eye,
  EyeOff,
  Users,
  UserPlus2
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
  can_view_agency_operations_support?: boolean
  can_add_services_on_agency_operations?: boolean
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
  ADMIN: "bg-info",
  CONTABLE: "bg-green-500",
  SELLER: "bg-warning",
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
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false)
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [specialPermissions, setSpecialPermissions] = useState({
    can_view_agency_operations_support: false,
    can_add_services_on_agency_operations: false,
  })

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
    try {
      toast.info("Reenviando invitación...")

      const response = await fetch("/api/settings/users/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(data.message || `Invitación reenviada a ${user.email}`)
      } else {
        toast.error(data.error || "Error al reenviar invitación")
      }
    } catch (error) {
      console.error("Error resending invite:", error)
      toast.error("Error al reenviar invitación")
    }
  }

  const handleOpenPermissions = (user: User) => {
    setSelectedUser(user)
    setSpecialPermissions({
      can_view_agency_operations_support: Boolean(user.can_view_agency_operations_support),
      can_add_services_on_agency_operations: Boolean(user.can_add_services_on_agency_operations),
    })
    setPermissionsDialogOpen(true)
  }

  const handleSavePermissions = async () => {
    if (!selectedUser) return

    setSubmitting(true)
    try {
      const response = await fetch(`/api/settings/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(specialPermissions),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || "Error al guardar permisos especiales")
        return
      }

      toast.success("Permisos especiales actualizados")
      setPermissionsDialogOpen(false)
      setSelectedUser(null)
      loadData()
    } catch (error) {
      console.error("Error saving special permissions:", error)
      toast.error("Error al guardar permisos especiales")
    } finally {
      setSubmitting(false)
    }
  }

  const handleChangePassword = async () => {
    if (!selectedUser) return

    // Validaciones
    if (newPassword.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden")
      return
    }

    // Validar fortaleza
    const hasUpperCase = /[A-Z]/.test(newPassword)
    const hasLowerCase = /[a-z]/.test(newPassword)
    const hasNumbers = /\d/.test(newPassword)

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      toast.error("La contraseña debe contener mayúsculas, minúsculas y números")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/settings/users/${selectedUser.id}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Contraseña actualizada para ${selectedUser.name}`)
        setChangePasswordDialogOpen(false)
        setSelectedUser(null)
        setNewPassword("")
        setConfirmPassword("")
      } else {
        toast.error(data.error || "Error al cambiar la contraseña")
      }
    } catch (error) {
      console.error("Error changing password:", error)
      toast.error("Error al cambiar la contraseña")
    } finally {
      setSubmitting(false)
    }
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
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Gestión de Usuarios</h2>
            <p className="text-sm text-muted-foreground">Invita nuevos usuarios y gestiona sus permisos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="mr-2 h-3.5 w-3.5" />
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

              <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Datos del Usuario */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                      <UserPlus2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos del Usuario</h4>
                  </div>
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
                </div>

                {/* Rol y Permisos */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-500/10">
                      <Shield className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Rol y Permisos</h4>
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
                    <div className="rounded-lg border border-border/30 bg-background p-3 space-y-2 max-h-40 overflow-y-auto">
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
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInviteDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleInvite} disabled={submitting}>
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

      {/* Users Table */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Users className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Equipo</h4>
        </div>
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
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
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {(user.name || "")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{user.name || "Sin nombre"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge className={`${roleColors[user.role]} text-white`}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                      {user.role === "SELLER" && (user.can_view_agency_operations_support || user.can_add_services_on_agency_operations) && (
                        <div className="flex flex-wrap gap-1">
                          {user.can_view_agency_operations_support && (
                            <Badge variant="outline" className="text-[10px]">
                              Postventa
                            </Badge>
                          )}
                          {user.can_add_services_on_agency_operations && (
                            <Badge variant="outline" className="text-[10px]">
                              Alta servicios
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
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
                      <Badge variant="outline" className="text-destructive border-destructive">
                        <XCircle className="mr-1 h-3 w-3" />
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
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
                        {user.role === "SELLER" && (
                          <DropdownMenuItem onClick={() => handleOpenPermissions(user)}>
                            <Shield className="mr-2 h-4 w-4" />
                            Permisos especiales
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedUser(user)
                            setChangePasswordDialogOpen(true)
                            setNewPassword("")
                            setConfirmPassword("")
                          }}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          Cambiar contraseña
                        </DropdownMenuItem>
                        {user.role !== "SUPER_ADMIN" && (
                          <DropdownMenuItem
                            className="text-destructive"
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
            <div className="text-center py-8 text-muted-foreground text-sm">
              No hay usuarios registrados. Invita al primer usuario.
            </div>
          )}
        </div>
      </div>

      {/* Permisos por rol */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Shield className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Permisos por Rol</h4>
        </div>
        <p className="text-sm text-muted-foreground">Resumen de qué puede hacer cada rol en el sistema</p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(roleLabels).map(([role, label]) => (
            <div
              key={role}
              className="rounded-xl border border-border/40 p-4 space-y-2"
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
      </div>

      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Permisos especiales</DialogTitle>
            <DialogDescription>
              Ajustes puntuales para <strong>{selectedUser?.name}</strong> sin cambiar su rol base.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-xl border border-border/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Ver postventa de la agencia</p>
                  <p className="text-xs text-muted-foreground">
                    Permite consultar pasajeros, documentos y servicios de todas las operaciones de sus agencias.
                  </p>
                </div>
                <Switch
                  checked={specialPermissions.can_view_agency_operations_support}
                  onCheckedChange={(checked) =>
                    setSpecialPermissions((prev) => ({
                      ...prev,
                      can_view_agency_operations_support: checked,
                      can_add_services_on_agency_operations: checked
                        ? prev.can_add_services_on_agency_operations
                        : false,
                    }))
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Agregar servicios en postventa</p>
                  <p className="text-xs text-muted-foreground">
                    Mantiene la vista en modo operativo y solo habilita el alta de servicios en operaciones ajenas.
                  </p>
                </div>
                <Switch
                  checked={specialPermissions.can_add_services_on_agency_operations}
                  disabled={!specialPermissions.can_view_agency_operations_support}
                  onCheckedChange={(checked) =>
                    setSpecialPermissions((prev) => ({
                      ...prev,
                      can_add_services_on_agency_operations: checked,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPermissionsDialogOpen(false)
                setSelectedUser(null)
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSavePermissions} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar permisos"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de cambiar contraseña */}
      <Dialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>
              Establecer una nueva contraseña para{" "}
              <strong>{selectedUser?.name}</strong> ({selectedUser?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className={newPassword.length >= 8 ? "text-green-500" : ""}>
                  • Mínimo 8 caracteres
                </p>
                <p className={/[A-Z]/.test(newPassword) ? "text-green-500" : ""}>
                  • Al menos una mayúscula
                </p>
                <p className={/[a-z]/.test(newPassword) ? "text-green-500" : ""}>
                  • Al menos una minúscula
                </p>
                <p className={/\d/.test(newPassword) ? "text-green-500" : ""}>
                  • Al menos un número
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChangePasswordDialogOpen(false)
                setNewPassword("")
                setConfirmPassword("")
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleChangePassword} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cambiando...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Cambiar Contraseña
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              className="bg-destructive hover:bg-destructive/90"
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
