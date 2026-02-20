"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format, isPast, isToday } from "date-fns"
import { es } from "date-fns/locale"
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronRight,
  ListTodo,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const PRIORITY_COLORS = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  LOW: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
} as const

interface PendingTasksCardProps {
  className?: string
}

export function PendingTasksCard({ className }: PendingTasksCardProps) {
  const [tasks, setTasks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks?status=PENDING&limit=5")
      const data = await res.json()

      let taskList = data.data || []

      // Also get IN_PROGRESS
      const res2 = await fetch("/api/tasks?status=IN_PROGRESS&limit=5")
      const data2 = await res2.json()
      taskList = [...taskList, ...(data2.data || [])]

      // Sort by priority then due_date
      taskList.sort((a: any, b: any) => {
        const order = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        const pa = order[a.priority as keyof typeof order] ?? 2
        const pb = order[b.priority as keyof typeof order] ?? 2
        if (pa !== pb) return pa - pb
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        return 0
      })

      setTasks(taskList.slice(0, 3))
    } catch {
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  async function toggleDone(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      })
      if (!res.ok) throw new Error()
      toast.success("Tarea completada")
      fetchTasks()
    } catch {
      toast.error("Error al completar tarea")
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ListTodo className="h-4 w-4" />
          Mis Tareas Pendientes
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => router.push("/tools/tasks")}
        >
          Ver todas
          <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin tareas pendientes
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date))
              const isDueToday = task.due_date && isToday(new Date(task.due_date))
              const priorityColor = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM

              return (
                <div key={task.id} className="flex items-start gap-2">
                  <button
                    onClick={() => toggleDone(task.id)}
                    className="mt-0.5 text-muted-foreground hover:text-green-600 transition-colors shrink-0"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{task.title}</span>
                      <Badge variant="secondary" className={cn("text-[10px] px-1 py-0", priorityColor)}>
                        {task.priority === "URGENT" ? "!" : task.priority === "HIGH" ? "H" : ""}
                      </Badge>
                    </div>
                    {task.due_date && (
                      <span
                        className={cn(
                          "text-xs flex items-center gap-1 mt-0.5",
                          isOverdue ? "text-red-600" : isDueToday ? "text-orange-600" : "text-muted-foreground"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {isOverdue && "Vencida · "}
                        {isDueToday && "Hoy · "}
                        {format(new Date(task.due_date), "dd MMM", { locale: es })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
