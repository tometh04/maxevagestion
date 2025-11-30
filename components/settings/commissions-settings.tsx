"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Alert, AlertDescription } from "@/components/ui/alert"
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

const commissionRuleSchema = z.object({
  type: z.enum(["SELLER", "AGENCY"]),
  basis: z.enum(["FIXED_PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.number().min(0),
  destination_region: z.string().optional().nullable(),
  agency_id: z.string().optional().nullable(),
  valid_from: z.string().min(1, "La fecha de inicio es requerida"),
  valid_to: z.string().optional().nullable(),
})

type CommissionRuleFormValues = z.infer<typeof commissionRuleSchema>

interface CommissionRule {
  id: string
  type: "SELLER" | "AGENCY"
  basis: "FIXED_PERCENTAGE" | "FIXED_AMOUNT"
  value: number
  destination_region: string | null
  agency_id: string | null
  valid_from: string
  valid_to: string | null
  created_at: string
  updated_at: string
}

export function CommissionsSettings() {
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)
  const [agencies, setAgencies] = useState<Array<{ id: string; name: string }>>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)

  const form = useForm<CommissionRuleFormValues>({
    resolver: zodResolver(commissionRuleSchema),
    defaultValues: {
      type: "SELLER",
      basis: "FIXED_PERCENTAGE",
      value: 0,
      destination_region: null,
      agency_id: null,
      valid_from: new Date().toISOString().split("T")[0],
      valid_to: null,
    },
  })

  useEffect(() => {
    fetchRules()
    fetchAgencies()
  }, [])

  const fetchRules = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/settings/commissions")
      const data = await response.json()
      setRules(data.rules || [])
    } catch (error) {
      console.error("Error fetching rules:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAgencies = async () => {
    try {
      const response = await fetch("/api/settings/agencies")
      const data = await response.json()
      setAgencies(data.agencies || [])
    } catch (error) {
      console.error("Error fetching agencies:", error)
    }
  }

  const handleOpenDialog = (rule?: CommissionRule) => {
    if (rule) {
      setEditingRule(rule)
      form.reset({
        type: rule.type,
        basis: rule.basis,
        value: rule.value,
        destination_region: rule.destination_region || null,
        agency_id: rule.agency_id || null,
        valid_from: rule.valid_from.split("T")[0],
        valid_to: rule.valid_to ? rule.valid_to.split("T")[0] : null,
      })
    } else {
      setEditingRule(null)
      form.reset({
        type: "SELLER",
        basis: "FIXED_PERCENTAGE",
        value: 0,
        destination_region: null,
        agency_id: null,
        valid_from: new Date().toISOString().split("T")[0],
        valid_to: null,
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async (values: CommissionRuleFormValues) => {
    try {
      if (editingRule) {
        // Update
        const response = await fetch(`/api/settings/commissions/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })

        if (!response.ok) {
          throw new Error("Error al actualizar")
        }
      } else {
        // Create
        const response = await fetch("/api/settings/commissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })

        if (!response.ok) {
          throw new Error("Error al crear")
        }
      }

      setDialogOpen(false)
      fetchRules()
    } catch (error) {
      console.error("Error saving rule:", error)
      alert("Error al guardar la regla")
    }
  }

  const handleDeleteClick = (ruleId: string) => {
    setRuleToDelete(ruleId)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!ruleToDelete) return

    try {
      const response = await fetch(`/api/settings/commissions/${ruleToDelete}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al eliminar")
      }

      fetchRules()
      setDeleteDialogOpen(false)
      setRuleToDelete(null)
    } catch (error) {
      console.error("Error deleting rule:", error)
      alert("Error al eliminar la regla")
      setDeleteDialogOpen(false)
      setRuleToDelete(null)
    }
  }

  const regionOptions = [
    { value: "ARGENTINA", label: "Argentina" },
    { value: "CARIBE", label: "Caribe" },
    { value: "BRASIL", label: "Brasil" },
    { value: "EUROPA", label: "Europa" },
    { value: "EEUU", label: "EEUU" },
    { value: "OTROS", label: "Otros" },
    { value: "CRUCEROS", label: "Cruceros" },
  ]

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Reglas de Comisiones</h2>
        <Button onClick={() => handleOpenDialog()}>Nueva Regla</Button>
      </div>

      <Alert>
        <AlertDescription>
          Las reglas de comisión se aplican automáticamente cuando una operación está CONFIRMED y todos los pagos de
          cliente están PAID. Las reglas se evalúan por fecha de validez y región de destino.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Reglas Activas</CardTitle>
          <CardDescription>Gestiona las reglas de comisión para vendedores y agencias</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay reglas configuradas</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Región</TableHead>
                    <TableHead>Válido Desde</TableHead>
                    <TableHead>Válido Hasta</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Badge variant="outline">{rule.type === "SELLER" ? "Vendedor" : "Agencia"}</Badge>
                      </TableCell>
                      <TableCell>
                        {rule.basis === "FIXED_PERCENTAGE" ? "Porcentaje Fijo" : "Monto Fijo"}
                      </TableCell>
                      <TableCell>
                        {rule.basis === "FIXED_PERCENTAGE" ? `${rule.value}%` : `$${rule.value.toLocaleString("es-AR")}`}
                      </TableCell>
                      <TableCell>{rule.destination_region || "Todas"}</TableCell>
                      <TableCell>{format(new Date(rule.valid_from), "dd/MM/yyyy", { locale: es })}</TableCell>
                      <TableCell>
                        {rule.valid_to ? format(new Date(rule.valid_to), "dd/MM/yyyy", { locale: es }) : "Sin límite"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(rule)}>
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(rule.id)}>
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar Regla" : "Nueva Regla de Comisión"}</DialogTitle>
            <DialogDescription>
              Configura una regla de comisión que se aplicará automáticamente a las operaciones
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="SELLER">Vendedor</SelectItem>
                          <SelectItem value="AGENCY">Agencia</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="basis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base de Cálculo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="FIXED_PERCENTAGE">Porcentaje Fijo</SelectItem>
                          <SelectItem value="FIXED_AMOUNT">Monto Fijo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Valor {form.watch("basis") === "FIXED_PERCENTAGE" ? "(%)" : "(Monto)"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={form.watch("basis") === "FIXED_PERCENTAGE" ? "0.01" : "1"}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination_region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Región de Destino (opcional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "ALL" ? null : value)}
                      value={field.value || "ALL"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ALL">Todas las regiones</SelectItem>
                        {regionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="valid_from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Válido Desde</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value || ""}
                          onChange={(value) => field.onChange(value)}
                          placeholder="Seleccionar fecha"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valid_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Válido Hasta (opcional)</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value || ""}
                          onChange={(value) => field.onChange(value || null)}
                          placeholder="Seleccionar fecha"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente esta regla de comisión.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
