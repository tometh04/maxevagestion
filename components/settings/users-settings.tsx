"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Checkbox } from "@/components/ui/checkbox"

const inviteSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "CONTABLE", "SELLER", "VIEWER"]),
  agencies: z.array(z.string()).min(1, "Debe seleccionar al menos una agencia"),
  default_commission_percentage: z.number().min(0).max(100).optional(),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export function UsersSettings() {
  const [users, setUsers] = useState<any[]>([])
  const [agencies, setAgencies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "SELLER",
      agencies: [],
      default_commission_percentage: undefined,
    },
  })

  const selectedRole = form.watch("role")

  useEffect(() => {
    loadUsers()
    loadAgencies()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/settings/users")
      const data = await res.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error("Error loading users:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadAgencies = async () => {
    try {
      const res = await fetch("/api/settings/agencies")
      const data = await res.json()
      setAgencies(data.agencies || [])
    } catch (error) {
      console.error("Error loading agencies:", error)
    }
  }

  const handleInvite = async (values: InviteFormValues) => {
    try {
      const res = await fetch("/api/settings/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (res.ok) {
        setOpen(false)
        form.reset()
        loadUsers()
      } else {
        alert(data.error || "Error al invitar usuario")
      }
    } catch (error) {
      console.error("Error inviting user:", error)
      alert("Error al invitar usuario")
    }
  }

  const handleEdit = (user: any) => {
    setEditingUser(user)
    setEditOpen(true)
  }

  const handleUpdateUser = async (userId: string, updates: { role?: string; is_active?: boolean }) => {
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, ...updates }),
      })
      if (res.ok) {
        setEditOpen(false)
        setEditingUser(null)
        loadUsers()
      }
    } catch (error) {
      console.error("Error updating user:", error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Usuarios</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Invitar Usuario</Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invitar Nuevo Usuario</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleInvite)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="CONTABLE">Contable</SelectItem>
                          <SelectItem value="SELLER">Vendedor</SelectItem>
                          <SelectItem value="VIEWER">Solo Lectura</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedRole === "SELLER" && (
                  <FormField
                    control={form.control}
                    name="default_commission_percentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comisión por Defecto (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="Ej: 10.5"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value === "" ? undefined : parseFloat(e.target.value)
                              field.onChange(value)
                            }}
                            value={field.value === undefined ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          Porcentaje de comisión por defecto para este vendedor (opcional)
                        </p>
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="agencies"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel className="text-base">Agencias</FormLabel>
                      </div>
                      {agencies.map((agency) => (
                        <FormField
                          key={agency.id}
                          control={form.control}
                          name="agencies"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={agency.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(agency.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, agency.id])
                                        : field.onChange(
                                            field.value?.filter((value) => value !== agency.id)
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">{agency.name}</FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Invitar
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No hay usuarios
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? "default" : "secondary"}>
                      {user.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <Label>Rol</Label>
                <Select
                  defaultValue={editingUser.role}
                  onValueChange={(value) =>
                    handleUpdateUser(editingUser.id, { role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="CONTABLE">Contable</SelectItem>
                    <SelectItem value="SELLER">Vendedor</SelectItem>
                    <SelectItem value="VIEWER">Solo Lectura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  defaultValue={editingUser.is_active ? "active" : "inactive"}
                  onValueChange={(value) =>
                    handleUpdateUser(editingUser.id, { is_active: value === "active" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

