"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Send,
  Loader2,
  Brain,
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  Plane,
  Calendar,
  BarChart3,
  AlertCircle,
  Clock,
  Wallet,
  Target,
  MessageSquare,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  queryExecuted?: boolean
}

interface CerebroChatProps {
  userName: string
}

// Preguntas sugeridas organizadas por categoría
const SUGGESTED_QUESTIONS = {
  ventas: {
    icon: TrendingUp,
    color: "text-green-500",
    bgColor: "bg-green-500/10 hover:bg-green-500/20",
    borderColor: "border-green-500/30",
    questions: [
      "¿Cuánto vendimos esta semana?",
      "¿Quién vendió más este mes?",
      "¿Cuál es la tasa de conversión de leads?",
    ],
  },
  finanzas: {
    icon: DollarSign,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
    borderColor: "border-blue-500/30",
    questions: [
      "¿Cuánto hay en caja?",
      "¿Qué pagos vencen hoy?",
      "¿Cuánto IVA tenemos que pagar este mes?",
    ],
  },
  operaciones: {
    icon: Plane,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
    borderColor: "border-purple-500/30",
    questions: [
      "¿Qué viajes salen esta semana?",
      "¿Cuál es el destino más rentable?",
      "¿Cuántas operaciones hay pendientes?",
    ],
  },
  analisis: {
    icon: BarChart3,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
    borderColor: "border-orange-500/30",
    questions: [
      "¿Cuál es el margen promedio por destino?",
      "¿Cuántas comisiones están pendientes?",
      "Dame un resumen del mes",
    ],
  },
}

// Preguntas rápidas destacadas
const QUICK_QUESTIONS = [
  { text: "¿Cómo estamos hoy?", icon: Target },
  { text: "¿Qué tengo pendiente?", icon: Clock },
  { text: "Resumen de la semana", icon: Calendar },
]

export function CerebroChat({ userName }: CerebroChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll al final cuando hay nuevos mensajes
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
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
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
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
        id: `msg_${Date.now()}_assistant`,
        role: "assistant",
        content: data.response || "No pude procesar tu consulta.",
        timestamp: new Date(),
        queryExecuted: data.queryExecuted,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      console.error("Cerebro error:", error)
      
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: "assistant",
        content: `❌ Error: ${error.message || "No pude conectarme con el servidor"}`,
        timestamp: new Date(),
      }
      
      setMessages((prev) => [...prev, errorMessage])
      toast.error("Error al comunicarse con Cerebro")
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSuggestionClick = (question: string) => {
    sendMessage(question)
  }

  const clearChat = () => {
    setMessages([])
  }

  // Renderizar mensaje con formato markdown básico
  const renderMessageContent = (content: string) => {
    // Convertir markdown básico a HTML
    const formatted = content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\n/g, "<br />")

    return <div dangerouslySetInnerHTML={{ __html: formatted }} />
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              Cerebro
            </h1>
            <p className="text-sm text-muted-foreground">
              Tu asistente inteligente de MAXEVA
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearChat}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Nueva conversación
          </Button>
        )}
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden border-2">
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          {messages.length === 0 ? (
            /* Estado inicial - Preguntas sugeridas */
            <div className="space-y-8">
              {/* Saludo */}
              <div className="text-center py-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">
                  ¡Hola, {userName.split(" ")[0]}! 👋
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Soy tu asistente inteligente. Puedo responder preguntas sobre ventas, 
                  finanzas, operaciones y más. ¿En qué puedo ayudarte?
                </p>
              </div>

              {/* Preguntas rápidas destacadas */}
              <div className="flex flex-wrap justify-center gap-3">
                {QUICK_QUESTIONS.map((q, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="rounded-full px-4 py-2 h-auto border-2 hover:border-violet-500 hover:bg-violet-500/10 transition-all"
                    onClick={() => handleSuggestionClick(q.text)}
                  >
                    <q.icon className="h-4 w-4 mr-2 text-violet-500" />
                    {q.text}
                  </Button>
                ))}
              </div>

              {/* Categorías de preguntas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                {Object.entries(SUGGESTED_QUESTIONS).map(([key, category]) => (
                  <Card 
                    key={key} 
                    className={cn(
                      "border-2 transition-all hover:shadow-md",
                      category.borderColor
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-2 rounded-lg", category.bgColor)}>
                          <category.icon className={cn("h-5 w-5", category.color)} />
                        </div>
                        <CardTitle className="text-base capitalize">{key}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {category.questions.map((question, idx) => (
                        <Button
                          key={idx}
                          variant="ghost"
                          className={cn(
                            "w-full justify-start text-left h-auto py-2 px-3 font-normal",
                            "hover:bg-accent"
                          )}
                          onClick={() => handleSuggestionClick(question)}
                        >
                          <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
                          <span className="text-sm">{question}</span>
                        </Button>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            /* Mensajes del chat */
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600">
                        <Brain className="h-4 w-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    <div className="text-sm leading-relaxed">
                      {renderMessageContent(message.content)}
                    </div>
                    {message.queryExecuted && (
                      <Badge variant="secondary" className="mt-2 text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Consulta ejecutada
                      </Badge>
                    )}
                  </div>
                  {message.role === "user" && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="bg-primary">
                        {userName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600">
                      <Brain className="h-4 w-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
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

        {/* Input area */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntame lo que quieras sobre el sistema..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Cerebro tiene acceso a toda la información del sistema en tiempo real
          </p>
        </div>
      </Card>
    </div>
  )
}
