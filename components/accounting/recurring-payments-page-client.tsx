"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Plus, RefreshCw, AlertCircle, Filter, HelpCircle, Info } from "lucide-react"
import { NewRecurringPaymentDialog } from "./new-recurring-payment-dialog"
import { EditRecurringPaymentDialog } from "./edit-recurring-payment-dialog"
import { PayRecurringExpenseDialog } from "./pay-recurring-expense-dialog"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

const frequencyLabels: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
}

interface RecurringPaymentsPageClientProps {
  agencies: Array<{ id: string; name: string }>
}

export function RecurringPaymentsPageClient({ agencies }: RecurringPaymentsPageClientProps) {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<any[]>([])
  const [isActiveFilter, setIsActiveFilter] = useState<string>("ALL")
  const [providerFilter, setProviderFilter] = useState<string>("ALL")
  const [agencyFilter, setAgencyFilter] = useState<string>("ALL")
  const [monthFilter, setMonthFilter] = useState<string>("")
  const [yearFilter, setYearFilter] = useState<string>("")
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<any | null>(null)
  const [payingExpense, setPayingExpense] = useState<any | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Array<{ id: string; name: string; color: string }>>([])

  // Inicializar filtros de fecha con mes/año actual
  useEffect(() => {
    const now = new Date()
    if (!monthFilter || monthFilter === "") {
      setMonthFilter(String(now.getMonth() + 1).padStart(2, "0"))
    }
    if (!yearFilter || yearFilter === "") {
      setYearFilter(String(now.getFullYear()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setTableError(null)
    try {
      const params = new URLSearchParams()
      if (isActiveFilter !== "ALL") {
        params.append("isActive", isActiveFilter === "ACTIVE" ? "true" : "false")
      }
      if (agencyFilter !== "ALL") {
        params.append("agencyId", agencyFilter)
      }

      const response = await fetch(`/api/recurring-payments?${params.toString()}`)
      const data = await response.json()

      if (data.tableNotFound || data.message) {
        setTableError(data.message || "La tabla recurring_payments no existe. Ejecuta la migración SQL.")
        setPayments([])
      } else {
        setPayments(data.payments || [])
      }
    } catch (error) {
      console.error("Error fetching recurring payments:", error)
      setTableError("La tabla recurring_payments no existe. Ejecuta la migración SQL en Supabase.")
      setPayments([])
    } finally {
      setLoading(false)
    }
  }, [isActiveFilter, agencyFilter])

  // Cargar categorías
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch("/api/accounting/recurring-payments/categories")
        if (response.ok) {
          const data = await response.json()
          setCategories(data.categories || [])
        }
      } catch (error) {
        console.error("Error fetching categories:", error)
      }
    }
    fetchCategories()
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleGeneratePayments() {
    try {
      const response = await fetch("/api/recurring-payments/generate", {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al generar pagos")
      }

      const result = await response.json()
      if (result.generated > 0) {
        toast.success(`Se procesaron ${result.generated} pagos recurrentes. ${result.alertsCreated || 0} alertas creadas.`)
      } else {
        toast.info("No hay pagos recurrentes vencidos para procesar")
      }
      fetchData()
    } catch (error: any) {
      console.error("Error generating payments:", error)
      toast.error(error.message || "Error al generar pagos recurrentes")
    }
  }

  // Extraer proveedores únicos de los pagos
  const uniqueProviders = useMemo(() => {
    const providers = new Set<string>()
    payments.forEach((p) => {
      const name = p.provider_name || p.operators?.name
      if (name) providers.add(name)
    })
    return Array.from(providers).sort()
  }, [payments])

  // Función para calcular si un gasto recurrente tiene vencimiento en un mes específico
  const hasVencimientoInMonth = (payment: any, year: string, month: string): boolean => {
    const filterDate = `${year}-${month.padStart(2, "0")}`
    const filterStart = new Date(parseInt(year), parseInt(month) - 1, 1)
    const filterEnd = new Date(parseInt(year), parseInt(month), 0) // Último día del mes

    // CRÍTICO: Si tiene end_date y el mes seleccionado está DESPUÉS de end_date, NO mostrar
    if (payment.end_date) {
      const endDate = new Date(payment.end_date)
      // Si el primer día del mes filtrado es después de end_date, no mostrar
      if (filterStart > endDate) {
        return false
      }
    }

    // Si no está activo, no mostrar
    if (!payment.is_active) {
      // Aún así, verificar si es parte del filtro de estado
      // Esta validación se hace después en el filtro por estado
    }
    
    // Si tiene next_due_date, verificar si está en el mes
    if (payment.next_due_date) {
      const dueDate = payment.next_due_date.substring(0, 7) // YYYY-MM
      if (dueDate === filterDate) {
        // Verificar que no haya pasado end_date
        if (payment.end_date) {
          const endDate = new Date(payment.end_date)
          const nextDue = new Date(payment.next_due_date)
          if (nextDue <= endDate) {
            return true
          }
        } else {
          return true
        }
      }
    }

    // Si no tiene next_due_date pero tiene start_date y frecuencia,
    // calcular si alguno de los vencimientos futuros cae en el mes seleccionado
    if (payment.start_date && payment.frequency) {
      const startDate = new Date(payment.start_date)

      // Verificar si start_date está en el mes seleccionado (y no ha pasado end_date)
      if (startDate.getFullYear() === parseInt(year) && startDate.getMonth() === parseInt(month) - 1) {
        if (!payment.end_date || startDate <= new Date(payment.end_date)) {
          return true
        }
      }

      // Calcular vencimientos futuros según la frecuencia
      let currentDate = new Date(startDate)
      let iterations = 0
      const maxIterations = 120 // Máximo 10 años para evitar loops infinitos

      while (iterations < maxIterations && currentDate <= filterEnd) {
        // Verificar si este vencimiento está dentro del mes seleccionado
        if (currentDate >= filterStart && currentDate <= filterEnd) {
          // Verificar que no haya pasado end_date
          if (payment.end_date) {
            const endDate = new Date(payment.end_date)
            if (currentDate <= endDate) {
              return true // Este vencimiento cae en el mes seleccionado y antes de end_date
            }
          } else {
            return true // Este vencimiento cae en el mes seleccionado
          }
        }

        // Si ya pasamos el mes seleccionado Y también pasamos end_date, salir
        if (currentDate > filterEnd) {
          if (payment.end_date && currentDate > new Date(payment.end_date)) {
            break
          }
        }

        // Calcular siguiente vencimiento según frecuencia
        switch (payment.frequency) {
          case "WEEKLY":
            currentDate = new Date(currentDate)
            currentDate.setDate(currentDate.getDate() + 7)
            break
          case "BIWEEKLY":
            currentDate = new Date(currentDate)
            currentDate.setDate(currentDate.getDate() + 14)
            break
          case "MONTHLY":
            currentDate = new Date(currentDate)
            currentDate.setMonth(currentDate.getMonth() + 1)
            break
          case "QUARTERLY":
            currentDate = new Date(currentDate)
            currentDate.setMonth(currentDate.getMonth() + 3)
            break
          case "YEARLY":
            currentDate = new Date(currentDate)
            currentDate.setFullYear(currentDate.getFullYear() + 1)
            break
          default:
            currentDate = new Date(currentDate)
            currentDate.setMonth(currentDate.getMonth() + 1)
        }

        // Si llegamos más allá del mes seleccionado sin encontrarlo, salir
        if (currentDate > filterEnd && currentDate.getFullYear() > parseInt(year)) {
          break
        }

        iterations++
      }
    }

    return false
  }

  // Filtrar pagos por proveedor y fecha
  const filteredPayments = useMemo(() => {
    let filtered = payments

    // Filtro por proveedor
    if (providerFilter !== "ALL") {
      filtered = filtered.filter((p) => {
      const name = p.provider_name || p.operators?.name
      return name === providerFilter
    })
    }

    // Filtro por mes/año (mejorado: calcula vencimientos futuros según frecuencia)
    if (monthFilter && monthFilter !== "ALL" && yearFilter && yearFilter !== "ALL") {
      filtered = filtered.filter((p) => hasVencimientoInMonth(p, yearFilter, monthFilter))
    }

    return filtered
  }, [payments, providerFilter, monthFilter, yearFilter])

  const activeCount = payments.filter((p) => p.is_active).length
  const inactiveCount = payments.filter((p) => !p.is_active).length
  const totalMonthly = payments
    .filter((p) => p.is_active && p.frequency === "MONTHLY")
    .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0)
  const totalMonthlyUSD = payments
    .filter((p) => p.is_active && p.frequency === "MONTHLY" && p.currency === "USD")
    .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0)

  // Datos para gráficos
  // 1. Gráfico de barras: Gastos por categoría (mensual)
  const expensesByCategory = useMemo(() => {
    const categoryMap = new Map<string, number>()
    
    filteredPayments.forEach((p) => {
      const categoryId = p.category_id || "sin_categoria"
      const category = categories.find(c => c.id === categoryId)
      const categoryName = category?.name || "Sin categoría"
      const amount = parseFloat(p.amount || "0")
      
      // Convertir todo a USD para comparación (simplificado - usar 1:1 para USD, convertir ARS)
      const amountUsd = p.currency === "USD" ? amount : amount / 1500 // Simplificado, idealmente usar TC real
      
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amountUsd)
    })

    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
  }, [filteredPayments, categories])

  // 2. Gráfico de torta: Distribución porcentual
  const categoryDistribution = useMemo(() => {
    const total = expensesByCategory.reduce((sum, item) => sum + item.value, 0)
    if (total === 0) return []
    
    return expensesByCategory.map((item) => ({
      name: item.name,
      value: item.value,
      percentage: ((item.value / total) * 100).toFixed(1),
    }))
  }, [expensesByCategory])

  // 3. Gráfico de líneas: Evolución mensual (últimos 6 meses)
  const monthlyEvolution = useMemo(() => {
    const months: Record<string, Record<string, number>> = {}
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    }).reverse()

    // Inicializar meses
    last6Months.forEach((month) => {
      months[month] = {}
      categories.forEach((cat) => {
        months[month][cat.name] = 0
      })
      months[month]["Sin categoría"] = 0
    })

    // Agregar gastos a sus meses correspondientes
    filteredPayments.forEach((p) => {
      if (p.next_due_date) {
        const monthKey = p.next_due_date.substring(0, 7)
        if (months[monthKey]) {
          const categoryId = p.category_id || "sin_categoria"
          const category = categories.find(c => c.id === categoryId)
          const categoryName = category?.name || "Sin categoría"
          const amount = parseFloat(p.amount || "0")
          const amountUsd = p.currency === "USD" ? amount : amount / 1500
          
          months[monthKey][categoryName] = (months[monthKey][categoryName] || 0) + amountUsd
        }
      }
    })

    return last6Months.map((month) => {
      const monthName = new Date(month + "-01").toLocaleDateString("es-AR", { month: "short", year: "numeric" })
      return {
        month: monthName,
        ...months[month],
      }
    })
  }, [filteredPayments, categories])

  const CHART_COLORS = categories.map(c => c.color).concat(["#6b7280"]) // Agregar color para "Sin categoría"

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error de tabla */}
      {tableError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Migración Pendiente</AlertTitle>
          <AlertDescription>
            <p className="mb-2">{tableError}</p>
            <p className="text-sm">
              Ve a <strong>Supabase → SQL Editor</strong> y ejecuta el archivo:{" "}
              <code className="bg-muted px-1 rounded">supabase/migrations/041_fix_recurring_payments.sql</code>
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">
              {inactiveCount} inactivos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensual ARS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalMonthly - (totalMonthlyUSD * 1), "ARS")}
            </div>
            <p className="text-xs text-muted-foreground">
              Pagos mensuales en pesos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensual USD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalMonthlyUSD, "USD")}
            </div>
            <p className="text-xs text-muted-foreground">
              Pagos mensuales en dólares
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acciones</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGeneratePayments} size="sm" variant="outline" className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              Generar Pagos Hoy
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Gastos Recurrentes</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">¿Cómo funciona?</p>
                      <p className="text-xs mb-2">
                        <strong>Crear Gasto:</strong> Define un gasto que se repetirá automáticamente (ej: alquiler mensual, servicios).
                      </p>
                      <p className="text-xs">
                        <strong>Pagar Gasto:</strong> Procesa el pago cuando el gasto está vencido, impactando en tu caja.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <CardDescription>
                Define gastos recurrentes y procesa sus pagos cuando correspondan
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro por Proveedor */}
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los proveedores</SelectItem>
                  {uniqueProviders.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por Agencia */}
              <Select value={agencyFilter} onValueChange={setAgencyFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Agencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por Estado */}
              <Select value={isActiveFilter} onValueChange={setIsActiveFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ACTIVE">Activos</SelectItem>
                  <SelectItem value="INACTIVE">Inactivos</SelectItem>
                </SelectContent>
              </Select>

              {/* Filtro por Mes */}
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los meses</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = String(i + 1).padStart(2, "0")
                    const monthName = new Date(2024, i).toLocaleDateString("es-AR", { month: "long" })
                    return (
                      <SelectItem key={month} value={month}>
                        {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              {/* Filtro por Año */}
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los años</SelectItem>
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i
                    return (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              <Button onClick={() => setNewDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Gasto Recurrente
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {providerFilter !== "ALL" 
                ? `No hay gastos recurrentes para "${providerFilter}"`
                : "No se encontraron gastos recurrentes"
              }
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Próximo Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => {
                  const daysUntilDue = Math.ceil(
                    (new Date(payment.next_due_date).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  )

                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="font-normal">
                          {payment.provider_name || payment.operators?.name || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {payment.description}
                      </TableCell>
                      <TableCell className={payment.currency === "USD" ? "text-emerald-600 font-medium" : ""}>
                        {formatCurrency(payment.amount, payment.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {frequencyLabels[payment.frequency] || payment.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>
                            {format(new Date(payment.next_due_date), "dd/MM/yyyy", {
                              locale: es,
                            })}
                          </span>
                          {daysUntilDue <= 0 && (
                            <span className="text-xs text-red-500 font-medium">
                              {daysUntilDue === 0 ? "Vence hoy" : `Vencido hace ${Math.abs(daysUntilDue)} días`}
                            </span>
                          )}
                          {daysUntilDue > 0 && daysUntilDue <= 7 && (
                            <span className="text-xs text-amber-600">
                              {daysUntilDue === 1 ? "Mañana" : `En ${daysUntilDue} días`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={payment.is_active ? "default" : "secondary"}>
                          {payment.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setPayingExpense(payment)
                              setPayDialogOpen(true)
                            }}
                            disabled={!payment.is_active}
                          >
                            Pagar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingPayment(payment)}
                          >
                            Editar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Gráficos de Análisis */}
      {filteredPayments.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {/* Gráfico de barras: Gastos por categoría */}
          <Card className="md:col-span-2">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Gastos por Categoría (Mensual)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expensesByCategory} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickFormatter={(value) => formatCurrency(value, "USD")}
                    />
                    <RechartsTooltip 
                      formatter={(value: number) => formatCurrency(value, "USD")} 
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="value" name="Total" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico de torta: Distribución porcentual */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Distribución por Categoría</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ percentage }) => `${percentage}%`}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryDistribution.map((entry, index) => {
                        const category = categories.find(c => c.name === entry.name)
                        return (
                          <Cell key={`cell-${index}`} fill={category?.color || "#6b7280"} />
                        )
                      })}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number, name: string, props: any) => [
                        formatCurrency(value, "USD"),
                        props.payload.name
                      ]} 
                      contentStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {categoryDistribution.slice(0, 4).map((entry) => {
                  const category = categories.find(c => c.name === entry.name)
                  return (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: category?.color || "#6b7280" }}
                        />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium">{entry.percentage}%</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Gráfico de líneas: Evolución mensual */}
          <Card className="md:col-span-3">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Evolución de Gastos por Categoría - Últimos 6 Meses</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyEvolution} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickFormatter={(value) => formatCurrency(value, "USD")}
                    />
                    <RechartsTooltip 
                      formatter={(value: number) => formatCurrency(value, "USD")} 
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {categories.map((cat) => (
                      <Line
                        key={cat.id}
                        type="monotone"
                        dataKey={cat.name}
                        name={cat.name}
                        stroke={cat.color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: cat.color }}
                      />
                    ))}
                    {monthlyEvolution.some((d: any) => d["Sin categoría"] > 0) && (
                      <Line
                        type="monotone"
                        dataKey="Sin categoría"
                        name="Sin categoría"
                        stroke="#6b7280"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#6b7280" }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas adicionales */}
          <Card className="md:col-span-3">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Estadísticas Adicionales</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {filteredPayments.filter(p => p.is_active).length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Gastos Activos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {filteredPayments.filter(p => {
                      const daysUntilDue = Math.ceil(
                        (new Date(p.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      )
                      return daysUntilDue <= 7 && daysUntilDue >= 0
                    }).length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Vencen Esta Semana</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {filteredPayments.filter(p => {
                      const daysUntilDue = Math.ceil(
                        (new Date(p.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      )
                      return daysUntilDue < 0
                    }).length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Vencidos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {filteredPayments.filter(p => p.currency === "USD").length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">En USD</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      <NewRecurringPaymentDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onSuccess={fetchData}
      />

      {editingPayment && (
        <EditRecurringPaymentDialog
          open={!!editingPayment}
          onOpenChange={(open) => !open && setEditingPayment(null)}
          onSuccess={fetchData}
          payment={editingPayment}
        />
      )}

      <PayRecurringExpenseDialog
        expense={payingExpense}
        open={payDialogOpen}
        onOpenChange={(open) => {
          setPayDialogOpen(open)
          if (!open) setPayingExpense(null)
        }}
        onSuccess={fetchData}
      />
    </div>
  )
}
