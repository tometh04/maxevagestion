"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm, type Resolver } from "react-hook-form"
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
import { Switch } from "@/components/ui/switch"
import { DatePicker } from "@/components/ui/date-picker"
import { SearchableCombobox } from "@/components/ui/searchable-combobox"
import { Loader2, ClipboardList, Users, Calendar, Link2 } from "lucide-react"
import {
  buildTaskDueDateValue,
  DEFAULT_TASK_ALERT_TIME,
  DEFAULT_TASK_REMINDER_MINUTES,
  extractTaskDatePart,
  getTaskAlertTimeValue,
  normalizeReminderMinutes,
  taskHasReminder,
} from "@/lib/tasks/due-date"
import { toast } from "sonner"

type TaskFormValues = {
  title: string
  description?: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  assigned_to: string
  due_date?: string
  has_alert: boolean
  due_time?: string
  reminder_minutes?: string
  operation_id?: string
  customer_id?: string
}

const taskSchema: z.ZodType<TaskFormValues> = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  assigned_to: z.string().min(1, "Debe asignar la tarea"),
  due_date: z.string().optional(),
  has_alert: z.boolean(),
  due_time: z.string().optional(),
  reminder_minutes: z.string().optional(),
  operation_id: z.string().optional(),
  customer_id: z.string().optional(),
}).superRefine((values, ctx) => {
  if (!values.has_alert) return

  if (!values.due_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Elegí una fecha límite antes de activar la alerta",
      path: ["due_date"],
    })
  }

  if (!values.due_time) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La hora es obligatoria si activás una alerta",
      path: ["due_time"],
    })
  }

  if (!values.reminder_minutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Elegí cuándo avisar",
      path: ["reminder_minutes"],
    })
  }
})

type TaskDialogSeed = Partial<Omit<TaskFormValues, "has_alert" | "due_time" | "reminder_minutes">> & {
  due_date?: string | null
  reminder_minutes?: string | number | null
}

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  currentUserId: string
  agencyId: string
  editTask?: any | null
  prefill?: TaskDialogSeed
}

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Baja" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
]

const REMINDER_OPTIONS = [
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "1440", label: "1 día antes" },
  { value: "2880", label: "2 días antes" },
]

function getInitialFormValues(
  source: TaskDialogSeed | null | undefined,
  currentUserId: string
): TaskFormValues {
  const hasAlert = taskHasReminder({
    due_date: source?.due_date ?? null,
    reminder_minutes: source?.reminder_minutes ?? null,
  })
  const reminderMinutes = normalizeReminderMinutes(source?.reminder_minutes)

  return {
    title: source?.title || "",
    description: source?.description || "",
    priority: source?.priority || "MEDIUM",
    assigned_to: source?.assigned_to || currentUserId,
    due_date: extractTaskDatePart(source?.due_date),
    has_alert: hasAlert,
    due_time: hasAlert ? getTaskAlertTimeValue(source?.due_date) : "",
    reminder_minutes: hasAlert
      ? String(reminderMinutes ?? DEFAULT_TASK_REMINDER_MINUTES)
      : "",
    operation_id: source?.operation_id || "",
    customer_id: source?.customer_id || "",
  }
}

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
    resolver: zodResolver(taskSchema as any) as Resolver<TaskFormValues>,
    defaultValues: getInitialFormValues(null, currentUserId),
  })

  // Load users when dialog opens
  useEffect(() => {
    if (!open) return

    if (editTask) {
      form.reset(getInitialFormValues(editTask, currentUserId))
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
      form.reset(getInitialFormValues(prefill, currentUserId))
      setOperationLabel("")
      setCustomerLabel("")
    } else {
      form.reset(getInitialFormValues(null, currentUserId))
      setOperationLabel("")
      setCustomerLabel("")
    }

    fetch(`/api/tasks/users`)
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
  const hasAlert = form.watch("has_alert")

  useEffect(() => {
    if (!hasAlert) {
      if (form.getValues("due_time")) {
        form.setValue("due_time", "", { shouldDirty: false, shouldValidate: false })
      }
      if (form.getValues("reminder_minutes")) {
        form.setValue("reminder_minutes", "", { shouldDirty: false, shouldValidate: false })
      }
      return
    }

    if (!form.getValues("due_time")) {
      form.setValue("due_time", DEFAULT_TASK_ALERT_TIME, { shouldDirty: false, shouldValidate: false })
    }
    if (!form.getValues("reminder_minutes")) {
      form.setValue("reminder_minutes", String(DEFAULT_TASK_REMINDER_MINUTES), {
        shouldDirty: false,
        shouldValidate: false,
      })
    }
  }, [hasAlert, form])

  useEffect(() => {
    if (dueDate) return

    if (form.getValues("has_alert")) {
      form.setValue("has_alert", false, { shouldDirty: false, shouldValidate: false })
    }
  }, [dueDate, form])

  const searchOperations = useCallback(async (q: string) => {
    try {
      const searchParam = q ? `search=${encodeURIComponent(q)}&` : ""
      const res = await fetch(
        `/api/operations?${searchParam}limit=10&page=1`
      )
      const data = await res.json()
      return (data.data || data.operations || []).map((op: any) => {
        const customerNames = (op.operation_customers || [])
          .map((oc: any) => {
            const c = oc.customers
            return c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : null
          })
          .filter(Boolean)
          .slice(0, 2)
          .join(", ")

        const date = op.departure_date
          ? new Date(op.departure_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
          : null

        const amount = op.sale_amount_total
          ? `${(op.sale_currency || op.currency) === "ARS" ? "$" : "U$D"} ${Number(op.sale_amount_total).toLocaleString("es-AR")}`
          : null

        const subtitleParts = [
          op.destination || null,
          date,
          customerNames || null,
          amount,
        ].filter(Boolean)

        return {
          value: op.id,
          label: op.file_code || op.id.slice(0, 8),
          subtitle: subtitleParts.join(" · ") || op.status || undefined,
        }
      })
    } catch {
      return []
    }
  }, [])

  const searchCustomers = useCallback(async (q: string) => {
    try {
      const searchParam = q ? `search=${encodeURIComponent(q)}&` : ""
      const res = await fetch(
        `/api/customers?${searchParam}limit=10`
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
      const dueDateValue = buildTaskDueDateValue(
        values.due_date,
        values.has_alert,
        values.due_time
      )

      const payload = {
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        assigned_to: values.assigned_to,
        due_date: dueDateValue,
        reminder_minutes: values.has_alert
          ? normalizeReminderMinutes(values.reminder_minutes)
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTask ? "Editar Tarea" : "Nueva Tarea"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Información de la Tarea */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Información</h4>
              </div>
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
            </div>

            {/* Asignación y Prioridad */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-500/10">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Asignación</h4>
              </div>
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
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
            </div>

            {/* Fecha y Recordatorio */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-orange-500/10">
                  <Calendar className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Fecha</h4>
              </div>
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
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

                <FormField
                  control={form.control}
                  name="has_alert"
                  render={({ field }) => (
                    <FormItem className="rounded-lg border border-border/50 bg-background/40 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <FormLabel className="text-sm">Con alerta</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {dueDate
                              ? "Si la activás, la tarea pasa a tener hora y recordatorio."
                              : "Elegí una fecha para habilitar la alerta."}
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!dueDate}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {hasAlert && dueDate && (
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="due_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hora</FormLabel>
                        <FormControl>
                          <Input type="time" step="60" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                              <SelectValue placeholder="Elegir recordatorio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {REMINDER_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Vincular */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-violet-500/10">
                  <Link2 className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Vincular</h4>
              </div>
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
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
                          searchPlaceholder="Código, destino o cliente..."
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
