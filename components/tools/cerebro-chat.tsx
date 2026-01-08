"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Send,
  Loader2,
  Sparkles,
  Plane,
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  FileText,
  Brain,
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

const QUICK_QUESTIONS = [
  {
    icon: Plane,
    text: "¿Qué viajes salen esta semana?",
  },
  {
    icon: DollarSign,
    text: "¿Cuánto hay en caja?",
  },
  {
    icon: TrendingUp,
    text: "¿Cuánto vendimos este mes?",
  },
  {
    icon: Users,
    text: "¿Cuántos leads nuevos tenemos?",
  },
  {
    icon: Clock,
    text: "¿Qué pagos vencen esta semana?",
  },
  {
    icon: Calendar,
    text: "¿Cuáles son las próximas salidas?",
  },
  {
    icon: FileText,
    text: "Dame un resumen del mes",
  },
  {
    icon: Sparkles,
    text: "¿Cómo estamos hoy?",
  },
]

export function CerebroChat({ userId, userName }: CerebroChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
          content: `❌ ${error.message || "Error de conexión"}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleQuickQuestion = (question: string) => {
    sendMessage(question)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            Cerebro
            <Badge variant="outline" className="text-xs font-normal">
              AI
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Preguntame lo que quieras sobre el sistema
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Brain className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium mb-2">¡Hola {userName.split(' ')[0]}!</h2>
            <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
              Soy Cerebro, tu asistente de MAXEVA. Tengo acceso a toda la información del sistema.
              Preguntame sobre ventas, clientes, viajes, pagos, o lo que necesites.
            </p>
            
            {/* Quick Questions Grid */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {QUICK_QUESTIONS.map((q, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="h-auto py-3 px-4 justify-start text-left"
                  onClick={() => handleQuickQuestion(q.text)}
                >
                  <q.icon className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate">{q.text}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                    <Brain className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-lg px-4 py-3 max-w-[85%]",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pensando...
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="pt-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Escribí tu pregunta..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Cerebro ejecuta consultas en tiempo real sobre la base de datos
        </p>
      </div>
    </div>
  )
}
