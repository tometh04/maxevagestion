"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  MessageSquare,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Settings,
  RefreshCw,
  ExternalLink,
  Edit,
  Loader2,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { toast } from "sonner"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageCard } from "./message-card"
import { TemplatesDialog } from "./templates-dialog"

interface Message {
  id: string
  customer_name: string
  phone: string
  message: string
  whatsapp_link: string
  status: string
  scheduled_for: string
  sent_at?: string
  message_templates?: {
    name: string
    emoji_prefix: string
    category: string
  }
  customers?: {
    first_name: string
    last_name: string
    email: string
  }
  operations?: {
    destination: string
    departure_date: string
  }
}

interface Template {
  id: string
  name: string
  category: string
  trigger_type: string
  template: string
  emoji_prefix: string
  is_active: boolean
}

interface MessagesPageClientProps {
  initialMessages: Message[]
  templates: Template[]
  agencies: Array<{ id: string; name: string }>
  userId: string
  userRole: string
}

export function MessagesPageClient({
  initialMessages,
  templates,
  agencies,
  userId,
  userRole,
}: MessagesPageClientProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [filter, setFilter] = useState("PENDING")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState<"TODAY" | "TOMORROW" | "THIS_WEEK" | "ALL">("TODAY")

  // Filtrar mensajes por fecha y estado
  const filteredMessages = messages.filter((msg) => {
    // Filtro por estado
    if (filter !== "ALL" && msg.status !== filter) return false
    
    // Filtro por fecha (aplica a todos los estados)
    if (dateFilter !== "ALL") {
      const scheduledDate = new Date(msg.scheduled_for)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const scheduledDay = new Date(scheduledDate)
      scheduledDay.setHours(0, 0, 0, 0)
      
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const thisWeekEnd = new Date(today)
      thisWeekEnd.setDate(thisWeekEnd.getDate() + 7)
      
      if (dateFilter === "TODAY") {
        if (scheduledDay.getTime() !== today.getTime()) return false
      } else if (dateFilter === "TOMORROW") {
        if (scheduledDay.getTime() !== tomorrow.getTime()) return false
      } else if (dateFilter === "THIS_WEEK") {
        if (scheduledDay < today || scheduledDay > thisWeekEnd) return false
      }
    }
    
    // Filtro por búsqueda
    if (search) {
      const searchLower = search.toLowerCase()
      return (
        msg.customer_name.toLowerCase().includes(searchLower) ||
        msg.message.toLowerCase().includes(searchLower) ||
        msg.operations?.destination?.toLowerCase().includes(searchLower)
      )
    }
    return true
  })

  const counts = {
    PENDING: messages.filter((m) => m.status === "PENDING").length,
    SENT: messages.filter((m) => m.status === "SENT").length,
    SKIPPED: messages.filter((m) => m.status === "SKIPPED").length,
  }

  async function fetchMessages() {
    setLoading(true)
    try {
      const response = await fetch("/api/whatsapp/messages?status=ALL&limit=2000")
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error("Error fetching messages:", error)
    } finally {
      setLoading(false)
    }
  }

  async function generateMessages() {
    setLoading(true)
    try {
      const response = await fetch("/api/whatsapp/generate-from-operations", { method: "POST" })
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Se generaron ${data.messagesGenerated} mensajes de ${data.operationsProcessed} operaciones`)
        fetchMessages()
      } else {
        toast.error(data.error || "Error al generar mensajes")
      }
    } catch (error) {
      toast.error("Error al generar mensajes")
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkSent(messageId: string) {
    try {
      const response = await fetch(`/api/whatsapp/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SENT" }),
      })

      if (response.ok) {
        setMessages(messages.map((m) =>
          m.id === messageId ? { ...m, status: "SENT", sent_at: new Date().toISOString() } : m
        ))
        toast.success("Mensaje marcado como enviado")
      }
    } catch (error) {
      toast.error("Error al actualizar mensaje")
    }
  }

  async function handleSkip(messageId: string) {
    try {
      const response = await fetch(`/api/whatsapp/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SKIPPED" }),
      })

      if (response.ok) {
        setMessages(messages.map((m) =>
          m.id === messageId ? { ...m, status: "SKIPPED" } : m
        ))
        toast.success("Mensaje omitido")
      }
    } catch (error) {
      toast.error("Error al actualizar mensaje")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-8 w-8" />
            Centro de Mensajes
          </h1>
          <p className="text-muted-foreground">
            Gestiona mensajes WhatsApp para tus clientes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateMessages} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Generar Mensajes
          </Button>
          {(userRole === "SUPER_ADMIN" || userRole === "ADMIN") && (
            <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Templates
            </Button>
          )}
        </div>
      </div>

      {/* Stats - KPIs clickeables como filtros */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card 
          className={`${filter === "PENDING" ? "ring-2 ring-primary" : ""} cursor-pointer transition-all hover:shadow-md`}
          onClick={() => setFilter("PENDING")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.PENDING}</div>
          </CardContent>
        </Card>
        <Card 
          className={`${filter === "SENT" ? "ring-2 ring-primary" : ""} cursor-pointer transition-all hover:shadow-md`}
          onClick={() => setFilter("SENT")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.SENT}</div>
          </CardContent>
        </Card>
        <Card 
          className={`${filter === "SKIPPED" ? "ring-2 ring-primary" : ""} cursor-pointer transition-all hover:shadow-md`}
          onClick={() => setFilter("SKIPPED")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              Omitidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{counts.SKIPPED}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, mensaje, destino..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="TODAY">Hoy</TabsTrigger>
            <TabsTrigger value="TOMORROW">Mañana</TabsTrigger>
            <TabsTrigger value="THIS_WEEK">Esta Semana</TabsTrigger>
            <TabsTrigger value="ALL">Todas las Fechas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Messages List */}
      {filteredMessages.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No hay mensajes"
          description={
            filter === "PENDING"
              ? `No hay mensajes ${dateFilter === "TODAY" ? "de hoy" : dateFilter === "TOMORROW" ? "de mañana" : dateFilter === "THIS_WEEK" ? "de esta semana" : ""} pendientes de envío. Hacé clic en 'Generar Mensajes' para crear nuevos.`
              : filter === "SENT"
              ? `No hay mensajes ${dateFilter === "TODAY" ? "de hoy" : dateFilter === "TOMORROW" ? "de mañana" : dateFilter === "THIS_WEEK" ? "de esta semana" : ""} enviados.`
              : filter === "SKIPPED"
              ? `No hay mensajes ${dateFilter === "TODAY" ? "de hoy" : dateFilter === "TOMORROW" ? "de mañana" : dateFilter === "THIS_WEEK" ? "de esta semana" : ""} omitidos.`
              : "No hay mensajes que mostrar con los filtros actuales."
          }
          action={
            filter === "PENDING"
              ? { label: "Generar Mensajes", onClick: generateMessages }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((msg) => (
            <MessageCard
              key={msg.id}
              message={msg}
              onMarkSent={() => handleMarkSent(msg.id)}
              onSkip={() => handleSkip(msg.id)}
            />
          ))}
        </div>
      )}

      {/* Templates Dialog */}
      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        onRefresh={() => window.location.reload()}
      />
    </div>
  )
}

