"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Loader2, Bot, User, ThumbsUp, ThumbsDown, LifeBuoy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  dbId?: string
  role: "user" | "assistant"
  content: string
  feedback?: "positive" | "negative" | null
}

interface SupportChatProps {
  conversationId?: string
  onConversationCreated?: (id: string) => void
  onEscalate?: (conversationId: string) => void
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "¡Hola! Soy el asistente de Vibook. Podés preguntarme sobre cualquier funcionalidad del sistema: operaciones, pagos, clientes, contabilidad, y más. ¿En qué te puedo ayudar?",
}

export function SupportChat({ conversationId, onConversationCreated, onEscalate }: SupportChatProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [convId, setConvId] = useState<string | undefined>(conversationId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll al fondo
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px"
    }
  }, [input])

  useEffect(() => {
    if (!conversationId) return
    setLoadingHistory(true)
    fetch(`/api/support/conversations/${conversationId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages?.length) {
          const loaded: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            dbId: m.id,
            role: m.role,
            content: m.content,
            feedback: m.feedback,
          }))
          setMessages([WELCOME_MESSAGE, ...loaded])
        }
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [conversationId])

  const handleFeedback = useCallback(
    async (msg: Message, type: "positive" | "negative") => {
      if (!msg.dbId) return
      const newFeedback = msg.feedback === type ? null : type
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, feedback: newFeedback } : m
        )
      )
      try {
        await fetch(`/api/support/messages/${msg.dbId}/feedback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: newFeedback }),
        })
      } catch {}
    },
    []
  )

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsLoading(true)

    // Placeholder para el response del asistente
    const assistantId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ])

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, conversationId: convId }),
      })

      const returnedConvId = res.headers.get("X-Conversation-Id")
      if (returnedConvId && !convId) {
        setConvId(returnedConvId)
        onConversationCreated?.(returnedConvId)
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Leer stream
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let accumulated = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          const current = accumulated
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: current } : m
            )
          )
        }
      }
    } catch (err) {
      console.error("Support chat error:", err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Hubo un error al procesar tu consulta. Por favor intentá de nuevo.",
              }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, convId, onConversationCreated])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 px-3" ref={scrollRef}>
        <div className="py-3 space-y-4">
          {loadingHistory && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="min-w-0 max-w-[85%]">
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {msg.content || (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {msg.role === "assistant" && msg.id !== "welcome" && msg.content && (
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <button
                      onClick={() => handleFeedback(msg, "positive")}
                      className={cn(
                        "p-1 rounded hover:bg-accent transition-colors",
                        msg.feedback === "positive" ? "text-green-600" : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                      title="Útil"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg, "negative")}
                      className={cn(
                        "p-1 rounded hover:bg-accent transition-colors",
                        msg.feedback === "negative" ? "text-red-500" : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                      title="No fue útil"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t space-y-2">
        {convId && onEscalate && messages.length > 2 && (
          <button
            onClick={() => onEscalate(convId)}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-orange-600 transition-colors py-1"
          >
            <LifeBuoy className="h-3 w-3" />
            ¿No resolvimos tu duda? Creá un ticket de soporte
          </button>
        )}
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí tu pregunta..."
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="h-10 w-10 shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
