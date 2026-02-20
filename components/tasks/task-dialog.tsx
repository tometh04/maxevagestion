"use client"

import { useState, useEffect } from "react"
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
  { value: "1440", label: "1 día antes" },
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
  const [operations, setOperations] = useState<{ id: string; label: string }[]>([])
  const [customers, setCustomers] = useState<{ id: string; label: string }[]>([])

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

  // Load users, operations, customers when dialog opens
  useEffect(() => {
    if (!open) return

    // Reset form for new task or set values for edit
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
    }

    // Fetch users from agency
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

    // Fetch recent operations
    fetch(`/api/operations?limit=50&page=1`)
      .then((r) => r.json())
      .then((data) => {
        const ops = (data.data || []).map((op: any) => ({
          id: op.id,
          label: `${op.file_code || op.id.slice(0, 8)} - ${op.destination || "Sin destino"}`,
        }))
        setOperations(ops)
      })
      .catch(() => {})

    // Fetch recent customers
    fetch(`/api/customers?limit=50&page=1`)
      .then((r) => r.json())
      .then((data) => {
        const custs = (data.data || []).map((c: any) => ({
          id: c.id,
          label: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Sin nombre",
        }))
        setCustomers(custs)
      })
      .catch(() => {})
  }, [open, editTask, prefill, currentUserId, form])

  const dueDate = form.watch("due_date")

  async function onSubmit(values: TaskFormValues) {
    setIsLoading(true)
    try {
      const payload = {
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        assigned_to: values.assigned_to,
        due_date: values.due_date || null,
        reminder_minutes: values.due_date && values.reminder_minutes ? parseInt(values.reminder_minutes) : null,
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
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin recordatorio" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REMINDER_OPTIONS.map((r) => (
                            <SelectItem key={r.value || "none"} value={r.value || "none"}>
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
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ninguna" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Ninguna</SelectItem>
                        {operations.map((op) => (
                          <SelectItem key={op.id} value={op.id}>
                            {op.label}
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
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vincular a cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ninguno" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Ninguno</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editTask ? "Guardar" : "Crear Tarea"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
