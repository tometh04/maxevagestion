"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  isToday,
  format,
} from "date-fns"
import { es } from "date-fns/locale"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Inbox,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getTaskDueDateMoment } from "@/lib/tasks/due-date"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { TaskCard } from "./task-card"
import { TaskDialog } from "./task-dialog"

interface TaskWeekViewProps {
  currentUserId: string
  agencyId: string
  userRole: string
  showAssignedFilter?: boolean
}

export function TaskWeekView({
  currentUserId,
  agencyId,
  userRole,
  showAssignedFilter = false,
}: TaskWeekViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [tasks, setTasks] = useState<any[]>([])
  const [undatedTasks, setUndatedTasks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("ACTIVE")
  const [priorityFilter, setPriorityFilter] = useState("ALL")
  const [assignedFilter, setAssignedFilter] = useState("ALL")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any | null>(null)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [prefillDate, setPrefillDate] = useState<string>("")
  const [calendarOpen, setCalendarOpen] = useState(false)

  const weekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart])
  const days = useMemo(() => eachDayOfInterval({ start: currentWeekStart, end: weekEnd }), [currentWeekStart, weekEnd])

  // Cargar usuarios
  useEffect(() => {
    if (!showAssignedFilter) return
    fetch(`/api/settings/users?limit=100`)
      .then((r) => r.json())
      .then((data) => {
        setUsers((data.users || data || []).map((u: any) => ({ id: u.id, name: u.name || u.email })))
      })
      .catch(() => {})
  }, [showAssignedFilter])

  // Fetch tareas de la semana
  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("weekStart", currentWeekStart.toISOString())
      params.set("weekEnd", weekEnd.toISOString())
      params.set("includeUndated", "true")
      params.set("limit", "200")

      if (statusFilter === "ACTIVE") {
        params.set("status", "ACTIVE")
      } else if (statusFilter !== "ALL") {
        params.set("status", statusFilter)
      }
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter)
      if (assignedFilter !== "ALL") params.set("assignedTo", assignedFilter)

      const res = await fetch(`/api/tasks?${params}`)
      if (!res.ok) {
        console.error("Error fetching tasks:", res.status)
        setTasks([])
        setUndatedTasks([])
        return
      }
      const data = await res.json()
      const allTasks = data.data || []

      // Separar tareas con y sin fecha
      const dated = allTasks.filter((t: any) => t.due_date)
      const undated = allTasks.filter((t: any) => !t.due_date)

      setTasks(dated)
      setUndatedTasks(undated)
    } catch {
      setTasks([])
      setUndatedTasks([])
    } finally {
      setIsLoading(false)
    }
  }, [currentWeekStart, weekEnd, statusFilter, priorityFilter, assignedFilter])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Agrupar tareas por día (parseando como fecha local para evitar desfase UTC)
  const tasksByDay = days.map((day) => ({
    date: day,
    tasks: tasks.filter(
      (t) => {
        const dueDate = getTaskDueDateMoment(t)
        return dueDate ? isSameDay(dueDate, day) : false
      }
    ),
  }))

  function handleEditTask(task: any) {
    setEditingTask(task)
    setPrefillDate("")
    setDialogOpen(true)
  }

  function handleNewTask(date?: Date) {
    setEditingTask(null)
    setPrefillDate(date ? format(date, "yyyy-MM-dd") : "")
    setDialogOpen(true)
  }

  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

  return (
    <div className="space-y-4">
      {/* Header: navegación semanal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentWeekStart((s) => subWeeks(s, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 h-8 px-2 hover:bg-muted"
              >
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold whitespace-nowrap">
                  {format(currentWeekStart, "d MMM", { locale: es })} –{" "}
                  {format(weekEnd, "d MMM yyyy", { locale: es })}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentWeekStart}
                onSelect={(date) => {
                  if (date) {
                    setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }))
                    setCalendarOpen(false)
                  }
                }}
                locale={es}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentWeekStart((s) => addWeeks(s, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() =>
              setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
          >
            Hoy
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro de estado */}
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="h-8">
              <TabsTrigger value="ACTIVE" className="text-xs h-7 px-2.5">
                Activas
              </TabsTrigger>
              <TabsTrigger value="DONE" className="text-xs h-7 px-2.5">
                Completadas
              </TabsTrigger>
              <TabsTrigger value="ALL" className="text-xs h-7 px-2.5">
                Todas
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filtro prioridad */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Prioridad</SelectItem>
              <SelectItem value="URGENT">Urgente</SelectItem>
              <SelectItem value="HIGH">Alta</SelectItem>
              <SelectItem value="MEDIUM">Media</SelectItem>
              <SelectItem value="LOW">Baja</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro asignado (solo admin) */}
          {showAssignedFilter && isAdmin && (
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
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

          <Button size="sm" className="h-8" onClick={() => handleNewTask()}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      {/* Grilla semanal */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Weekly summary */}
          {(() => {
            const allDayTasks = tasksByDay.flatMap(({ tasks: dt }) => dt)
            const totalTasks = allDayTasks.length + undatedTasks.length
            const completedTasks = allDayTasks.filter((t) => t.status === "DONE").length + undatedTasks.filter((t) => t.status === "DONE").length
            const pendingTasks = totalTasks - completedTasks
            return (
              <div className="hidden md:flex items-center gap-3 rounded-xl border border-border/40 bg-muted/30 px-4 py-2">
                <span className="text-xs text-muted-foreground font-medium">Resumen semanal:</span>
                <Badge variant="secondary" className="text-xs">
                  {totalTasks} {totalTasks === 1 ? "tarea" : "tareas"}
                </Badge>
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                  {completedTasks} {completedTasks === 1 ? "completada" : "completadas"}
                </Badge>
                <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                  {pendingTasks} {pendingTasks === 1 ? "pendiente" : "pendientes"}
                </Badge>
              </div>
            )
          })()}

          {/* Desktop: 7 columnas — today column gets extra width */}
          <div className="hidden md:grid gap-2" style={{ gridTemplateColumns: tasksByDay.map(({ date }) => isToday(date) ? "1.3fr" : "1fr").join(" ") }}>
            {tasksByDay.map(({ date, tasks: dayTasks }) => (
              <Card
                key={date.toISOString()}
                className={cn(
                  "min-h-[100px] flex flex-col rounded-xl border-border/40",
                  isToday(date) && "ring-2 ring-primary/50 border-primary bg-primary/[0.02]"
                )}
              >
                <CardHeader className="py-2 px-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-xs font-medium capitalize",
                          isToday(date) && "text-primary"
                        )}
                      >
                        {format(date, "EEE", { locale: es })}
                      </span>
                      {dayTasks.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 min-w-[18px] justify-center">
                          {dayTasks.length}
                        </Badge>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        isToday(date)
                          ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                          : "text-muted-foreground"
                      )}
                    >
                      {format(date, "d")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 p-1 space-y-1 overflow-y-auto max-h-[400px]">
                  {dayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      userRole={userRole}
                      onEdit={handleEditTask}
                      onRefresh={fetchTasks}
                      variant="compact"
                    />
                  ))}
                  <button
                    onClick={() => handleNewTask(date)}
                    className="w-full min-h-[32px] flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/30 rounded transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Mobile: lista vertical */}
          <div className="md:hidden space-y-3">
            {tasksByDay.map(({ date, tasks: dayTasks }) => (
              <div key={date.toISOString()}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 mb-1",
                    isToday(date) && "text-primary"
                  )}
                >
                  <span className="text-sm font-semibold capitalize">
                    {format(date, "EEEE d", { locale: es })}
                  </span>
                  {isToday(date) && (
                    <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                      Hoy
                    </span>
                  )}
                  {dayTasks.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({dayTasks.length})
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayTasks.length === 0 && (
                    <div className="text-xs text-muted-foreground px-2">
                      Sin tareas
                    </div>
                  )}
                  {dayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      userRole={userRole}
                      onEdit={handleEditTask}
                      onRefresh={fetchTasks}
                      variant="compact"
                    />
                  ))}
                  <button
                    onClick={() => handleNewTask(date)}
                    className="w-full h-8 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30 rounded transition-colors text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar tarea
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Tareas sin fecha */}
          {undatedTasks.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Sin fecha asignada
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({undatedTasks.length})
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {undatedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    currentUserId={currentUserId}
                    userRole={userRole}
                    onEdit={handleEditTask}
                    onRefresh={fetchTasks}
                    variant="full"
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {tasks.length === 0 && undatedTasks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No hay tareas esta semana</p>
              <p className="text-sm mt-1">
                Creá una nueva tarea para empezar a organizar tu trabajo
              </p>
              <Button className="mt-4" onClick={() => handleNewTask()}>
                <Plus className="h-4 w-4 mr-2" />
                Crear tarea
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchTasks}
        currentUserId={currentUserId}
        agencyId={agencyId}
        editTask={editingTask}
        prefill={prefillDate ? { due_date: prefillDate } : undefined}
      />
    </div>
  )
}
