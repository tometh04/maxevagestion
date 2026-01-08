"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Send,
  Loader2,
  Sparkles,
  Plane,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  BarChart3,
  Zap,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface CerebroChatProps {
  userId: string
  userName: string
}

const QUICK_ACTIONS = [
  {
    icon: TrendingUp,
    title: "Ventas del mes",
    description: "Resumen de ventas y métricas",
    query: "Dame un resumen de ventas de este mes",
  },
  {
    icon: Plane,
    title: "Próximos viajes",
    description: "Salidas programadas",
    query: "¿Qué viajes salen esta semana?",
  },
  {
    icon: DollarSign,
    title: "Estado de caja",
    description: "Balance actual",
    query: "¿Cuánto hay en caja?",
  },
  {
    icon: Users,
    title: "Leads activos",
    description: "Consultas pendientes",
    query: "¿Cuántos leads nuevos tenemos?",
  },
  {
    icon: Clock,
    title: "Pagos pendientes",
    description: "Vencimientos próximos",
    query: "¿Qué pagos vencen esta semana?",
  },
  {
    icon: BarChart3,
    title: "Análisis completo",
    description: "Resumen general del sistema",
    query: "¿Cómo estamos hoy? Dame un análisis completo",
  },
]

export function CerebroChat({ userId, userName }: CerebroChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error ${response.status}`)
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || "No pude procesar tu consulta.",
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      console.error("Cerebro error:", error)
      toast({
        title: "Error",
        description: error.message || "Error al comunicarse con Cerebro",
        variant: "destructive",
      })
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${error.message || "No se pudo conectar"}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const firstName = userName.split(' ')[0]

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto">
      {messages.length === 0 ? (
        // Empty State - Welcome Screen
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {/* Logo/Icon */}
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Zap className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-4 border-background" />
          </div>

          {/* Welcome Text */}
          <h1 className="text-3xl font-bold mb-2 text-center">
            Hola, {firstName}
          </h1>
          <p className="text-muted-foreground text-center mb-10 max-w-md">
            Soy Cerebro, tu asistente de MAXEVA. Puedo ayudarte con información sobre ventas, clientes, operaciones y más.
          </p>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl mb-8">
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(action.query)}
                className="group flex flex-col items-start p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-orange-500/50 transition-all duration-200 text-left"
              >
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 mb-3 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="font-medium text-sm mb-1">{action.title}</span>
                <span className="text-xs text-muted-foreground">{action.description}</span>
              </button>
            ))}
          </div>

          {/* Input at bottom of welcome */}
          <div className="w-full max-w-2xl">
            <div className="relative">
              <Textarea
                ref={textareaRef}
                placeholder="Preguntá lo que quieras..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="min-h-[56px] max-h-[120px] pr-14 resize-none rounded-xl border-2 focus:border-orange-500 transition-colors"
                rows={1}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="absolute right-2 bottom-2 h-10 w-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:shadow-none"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Cerebro analiza datos en tiempo real de tu sistema
            </p>
          </div>
        </div>
      ) : (
        // Chat View
        <>
          <ScrollArea ref={scrollAreaRef} className="flex-1 px-4">
            <div className="max-w-3xl mx-auto py-6 space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-4",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 shadow-sm">
                      <Zap className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 max-w-[80%]",
                      msg.role === "user"
                        ? "bg-orange-500 text-white rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shrink-0 text-white text-xs font-medium shadow-sm">
                      {firstName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 shadow-sm">
                    <Zap className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                      <span className="text-sm text-muted-foreground">Analizando...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area - Chat Mode */}
          <div className="p-4 border-t bg-background/80 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto relative">
              <Textarea
                ref={textareaRef}
                placeholder="Seguí preguntando..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="min-h-[56px] max-h-[120px] pr-14 resize-none rounded-xl border-2 focus:border-orange-500 transition-colors"
                rows={1}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="absolute right-2 bottom-2 h-10 w-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:shadow-none"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
