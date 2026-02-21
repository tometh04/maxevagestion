"use client"

import { useState } from "react"
import { format, isPast, isToday } from "date-fns"
import { es } from "date-fns/locale"
import {
  CheckCircle2,
  Circle,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Link,
  User,
  Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** Parsea fecha ISO como local para evitar desfase UTC */
function parseLocalDate(dateStr: string): Date {
  const d = dateStr.split("T")[0]
  const [year, month, day] = d.split("-").map(Number)
  return new Date(year, month - 1, day)
}

const PRIORITY_CONFIG = {
  URGENT: { label: "Urgente", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", dot: "bg-red-500" },
  HIGH: { label: "Alta", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", dot: "bg-orange-500" },
  MEDIUM: { label: "Media", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", dot: "bg-blue-500" },
  LOW: { label: "Baja", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", dot: "bg-gray-400" },
} as const

const STATUS_ICONS = {
  PENDING: Circle,
  IN_PROGRESS: Clock,
  DONE: CheckCircle2,
} as const

interface TaskCardProps {
  task: any
  currentUserId: string
  userRole: string
  onEdit: (task: any) => void
  onRefresh: () => void
  variant?: "full" | "compact"
}

export function TaskCard({
  task,
  currentUserId,
  userRole,
  onEdit,
  onRefresh,
  variant = "full",
}: TaskCardProps) {
  const [isToggling, setIsToggling] = useState(false)

  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.MEDIUM
  const StatusIcon = STATUS_ICONS[task.status as keyof typeof STATUS_ICONS] || Circle
  const isDone = task.status === "DONE"
  const parsedDueDate = task.due_date ? parseLocalDate(task.due_date) : null
  const isOverdue = parsedDueDate && !isDone && isPast(parsedDueDate) && !isToday(parsedDueDate)
  const isDueToday = parsedDueDate && !isDone && isToday(parsedDueDate)

  const canDelete =
    task.created_by === currentUserId ||
    userRole === "SUPER_ADMIN" ||
    userRole === "ADMIN"

  async function toggleStatus() {
    setIsToggling(true)
    try {
      const newStatus = isDone ? "PENDING" : "DONE"
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(newStatus === "DONE" ? "Tarea completada" : "Tarea reabierta")
      onRefresh()
    } catch {
      toast.error("Error al actualizar tarea")
    } finally {
      setIsToggling(false)
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Tarea eliminada")
      onRefresh()
    } catch {
      toast.error("Error al eliminar tarea")
    }
  }

  // Vista compacta para la grilla semanal
  if (variant === "compact") {
    return (
      <div
        onClick={() => onEdit(task)}
        className={cn(
          "group flex items-start gap-1.5 p-2 rounded-md border text-sm cursor-pointer transition-colors",
          isDone && "opacity-50 bg-muted/30",
          isOverdue && "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20",
          isDueToday && "border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20",
          !isDone && !isOverdue && !isDueToday && "hover:bg-muted/50"
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleStatus()
          }}
          disabled={isToggling}
          className={cn(
            "mt-0.5 shrink-0 transition-colors",
            isDone ? "text-green-600" : "text-muted-foreground hover:text-primary"
          )}
        >
          {isToggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <StatusIcon className={cn("h-3.5 w-3.5", isDone && "fill-green-600")} />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", priority.dot)} />
            <span className={cn("truncate text-xs font-medium", isDone && "line-through text-muted-foreground")}>
              {task.title}
            </span>
          </div>
          {task.assignee && (
            <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
              {task.assignee.name}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Vista completa
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border transition-colors",
        isDone && "opacity-60 bg-muted/30",
        isOverdue && "border-red-300 dark:border-red-800",
        isDueToday && "border-orange-300 dark:border-orange-800",
        !isDone && !isOverdue && !isDueToday && "hover:bg-muted/50"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={toggleStatus}
        disabled={isToggling}
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          isDone ? "text-green-600" : "text-muted-foreground hover:text-primary"
        )}
      >
        {isToggling ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <StatusIcon className={cn("h-5 w-5", isDone && "fill-green-600")} />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("font-medium", isDone && "line-through text-muted-foreground")}>
            {task.title}
          </span>
          <Badge variant="secondary" className={cn("text-xs", priority.className)}>
            {priority.label}
          </Badge>
          {task.operation_id && (
            <Link className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {task.assignee && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assignee.name}
            </span>
          )}
          {task.due_date && (
            <span
              className={cn(
                "flex items-center gap-1",
                isOverdue && "text-red-600 font-medium",
                isDueToday && "text-orange-600 font-medium"
              )}
            >
              <Clock className="h-3 w-3" />
              {isOverdue && "Vencida · "}
              {isDueToday && "Hoy · "}
              {format(parsedDueDate!, "dd MMM yyyy", { locale: es })}
            </span>
          )}
          {task.operations && (
            <span className="flex items-center gap-1">
              <Link className="h-3 w-3" />
              {task.operations.destination || task.operations.file_code}
            </span>
          )}
          {task.customers && (
            <span>
              {task.customers.first_name} {task.customers.last_name}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
