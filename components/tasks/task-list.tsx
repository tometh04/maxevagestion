"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Filter, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskCard } from "./task-card"
import { TaskDialog } from "./task-dialog"

interface TaskListProps {
  currentUserId: string
  agencyId: string
  userRole: string
  showAssignedFilter?: boolean
}

export function TaskList({
  currentUserId,
  agencyId,
  userRole,
  showAssignedFilter = false,
}: TaskListProps) {
  const [tasks, setTasks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("ACTIVE")
  const [priorityFilter, setPriorityFilter] = useState("ALL")
  const [assignedFilter, setAssignedFilter] = useState("ALL")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any | null>(null)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  const canSeeAll = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", pagination.page.toString())
      params.set("limit", "50")

      if (statusFilter === "ACTIVE") {
        // Show PENDING + IN_PROGRESS
        params.set("status", "PENDING")
      } else if (statusFilter !== "ALL") {
        params.set("status", statusFilter)
      }

      if (priorityFilter !== "ALL") {
        params.set("priority", priorityFilter)
      }

      if (assignedFilter !== "ALL") {
        params.set("assignedTo", assignedFilter)
      }

      const res = await fetch(`/api/tasks?${params}`)
      const data = await res.json()

      let taskList = data.data || []

      // If showing ACTIVE, also fetch IN_PROGRESS
      if (statusFilter === "ACTIVE") {
        const params2 = new URLSearchParams(params)
        params2.set("status", "IN_PROGRESS")
        const res2 = await fetch(`/api/tasks?${params2}`)
        const data2 = await res2.json()
        taskList = [...taskList, ...(data2.data || [])]
      }

      // Sort: URGENT first, then by due_date
      taskList.sort((a: any, b: any) => {
        const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2
        const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2
        if (pa !== pb) return pa - pb
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        if (a.due_date) return -1
        if (b.due_date) return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      setTasks(taskList)
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0,
      }))
    } catch {
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, priorityFilter, assignedFilter, pagination.page])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Load users for filter
  useEffect(() => {
    if (!canSeeAll) return
    fetch(`/api/settings/users?limit=100`)
      .then((r) => r.json())
      .then((data) => {
        setUsers((data.users || data || []).map((u: any) => ({ id: u.id, name: u.name || u.email })))
      })
      .catch(() => {})
  }, [canSeeAll])

  function handleEdit(task: any) {
    setEditingTask(task)
    setDialogOpen(true)
  }

  function handleNew() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tareas</h1>
          <p className="text-muted-foreground text-sm">
            {canSeeAll ? "Gestiona las tareas de todo el equipo" : "Tus tareas pendientes"}
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Tarea
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="ACTIVE">Activas</TabsTrigger>
            <TabsTrigger value="DONE">Completadas</TabsTrigger>
            <TabsTrigger value="ALL">Todas</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="URGENT">Urgente</SelectItem>
            <SelectItem value="HIGH">Alta</SelectItem>
            <SelectItem value="MEDIUM">Media</SelectItem>
            <SelectItem value="LOW">Baja</SelectItem>
          </SelectContent>
        </Select>

        {canSeeAll && (
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Asignado a" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListTodo className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-medium text-lg">No hay tareas</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {statusFilter === "DONE"
              ? "No hay tareas completadas"
              : "Crea tu primera tarea para empezar"}
          </p>
          {statusFilter !== "DONE" && (
            <Button onClick={handleNew} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Nueva Tarea
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              currentUserId={currentUserId}
              userRole={userRole}
              onEdit={handleEdit}
              onRefresh={fetchTasks}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchTasks}
        currentUserId={currentUserId}
        agencyId={agencyId}
        editTask={editingTask}
      />
    </div>
  )
}
