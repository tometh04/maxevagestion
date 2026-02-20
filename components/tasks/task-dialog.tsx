"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { SearchableCombobox } from "@/components/ui/searchable-combobox"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

const taskSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  assigned_to: z.string().min(1, "Debe asignar la tarea"),
  due_date: z.string().optional(),
  reminder_minutes: z.string().optional(),
  operation_id: z.string().optional(),
  customer_id: z.string().optional(),
})

type TaskFormValues = z.infer<typeof taskSchema>

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  currentUserId: string
  agencyId: string
  editTask?: any | null
  prefill?: Partial<TaskFormValues>
}

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Baja" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
]

const REMINDER_OPTIONS = [
  { value: "", label: "Sin recordatorio" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "1440", label: "1 día antes" },
  { value: "2880", label: "2 días antes" },
]

export function TaskDialog({
  open,
  onOpenChange,
  onSuccess,
  currentUserId,
  agencyId,
  editTask,
  prefill,
}: TaskDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [operationLabel, setOperationLabel] = useState("")
  const [customerLabel, setCustomerLabel] = useState("")

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
      assigned_to: currentUserId,
      due_date: "",
      reminder_minutes: "",
      operation_id: "",
      customer_id: "",
    },
  })

  // Load users when dialog opens
  useEffect(() => {
    if (!open) return

    if (editTask) {
      form.reset({
        title: editTask.title || "",
        description: editTask.description || "",
        priority: editTask.priority || "MEDIUM",
        assigned_to: editTask.assigned_to || currentUserId,
        due_date: editTask.due_date ? editTask.due_date.split("T")[0] : "",
        reminder_minutes: editTask.reminder_minutes?.toString() || "",
        operation_id: editTask.operation_id || "",
        customer_id: editTask.customer_id || "",
      })
      if (editTask.operations) {
        const op = editTask.operations
        setOperationLabel(
          `${op.file_code || op.id?.slice(0, 8)} - ${op.destination || "Sin destino"}`
        )
      } else {
        setOperationLabel("")
      }
      if (editTask.customers) {
        const c = editTask.customers
        setCustomerLabel(
          `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Sin nombre"
        )
      } else {
        setCustomerLabel("")
      }
    } else if (prefill) {
      form.reset({
        title: prefill.title || "",
        description: prefill.description || "",
        priority: prefill.priority || "MEDIUM",
        assigned_to: prefill.assigned_to || currentUserId,
        due_date: prefill.due_date || "",
        reminder_minutes: prefill.reminder_minutes || "",
        operation_id: prefill.operation_id || "",
        customer_id: prefill.customer_id || "",
      })
      setOperationLabel("")
      setCustomerLabel("")
    } else {
      form.reset({
        title: "",
        description: "",
        priority: "MEDIUM",
        assigned_to: currentUserId,
        due_date: "",
        reminder_minutes: "",
        operation_id: "",
        customer_id: "",
      })
      setOperationLabel("")
      setCustomerLabel("")
    }

    fetch(`/api/settings/users?limit=100`)
      .then((r) => r.json())
      .then((data) => {
        const usersList = (data.users || data || []).map((u: any) => ({
          id: u.id,
          name: u.name || u.email,
        }))
        setUsers(usersList)
      })
      .catch(() => {})
  }, [open, editTask, prefill, currentUserId, form])

  const dueDate = form.watch("due_date")

  const searchOperations = useCallback(async (q: string) => {
    try {
      const res = await fetch(
        `/api/operations?search=${encodeURIComponent(q)}&limit=10&page=1`
      )
      const data = await res.json()
      return (data.data || data.operations || []).map((op: any) => ({
        value: op.id,
        label: `${op.file_code || op.id.slice(0, 8)} - ${op.destination || "Sin destino"}`,
        subtitle: op.status || undefined,
      }))
    } catch {
      return []
    }
  }, [])

  const searchCustomers = useCallback(async (q: string) => {
    try {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(q)}&limit=10`
      )
      const data = await res.json()
      return (data.data || data.customers || []).map((c: any) => ({
        value: c.id,
        label:
          `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
          c.email ||
          "Sin nombre",
        subtitle: c.email || undefined,
      }))
    } catch {
      return []
    }
  }, [])

  async function onSubmit(values: TaskFormValues) {
    setIsLoading(true)
    try {
      const payload = {
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        assigned_to: values.assigned_to,
        due_date: values.due_date || null,
        reminder_minutes:
          values.due_date && values.reminder_minutes
            ? parseInt(values.reminder_minutes)
            : null,
        operation_id: values.operation_id || null,
        customer_id: values.customer_id || null,
        agency_id: agencyId,
      }

      const url = editTask ? `/api/tasks/${editTask.id}` : "/api/tasks"
      const method = editTask ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al guardar tarea")
      }

      toast.success(editTask ? "Tarea actualizada" : "Tarea creada")
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || "Error al guardar tarea")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTask ? "Editar Tarea" : "Nueva Tarea"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Llamar a cliente por pago pendiente"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detalles adicionales..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asignar a *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar usuario" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha límite</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="Sin fecha"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {dueDate && (
                <FormField
                  control={form.control}
                  name="reminder_minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recordatorio</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin recordatorio" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REMINDER_OPTIONS.map((r) => (
                            <SelectItem
                              key={r.value || "none"}
                              value={r.value || "none"}
                            >
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="operation_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vincular a operación</FormLabel>
                    <FormControl>
                      <SearchableCombobox
                        value={field.value || ""}
                        onChange={(val) => field.onChange(val)}
                        searchFn={searchOperations}
                        placeholder="Buscar operación..."
                        searchPlaceholder="Código o destino..."
                        emptyMessage="No se encontraron operaciones"
                        initialLabel={operationLabel}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vincular a cliente</FormLabel>
                    <FormControl>
                      <SearchableCombobox
                        value={field.value || ""}
                        onChange={(val) => field.onChange(val)}
                        searchFn={searchCustomers}
                        placeholder="Buscar cliente..."
                        searchPlaceholder="Nombre o email..."
                        emptyMessage="No se encontraron clientes"
                        initialLabel={customerLabel}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editTask ? "Guardar" : "Crear Tarea"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
