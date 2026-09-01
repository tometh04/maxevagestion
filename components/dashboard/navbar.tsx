"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Bot, LogOut, User } from "lucide-react"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface NavbarProps {
  user: {
    name: string
    email: string
    role: string
  }
  agencies?: Array<{ id: string; name: string }>
  currentAgencyId?: string
}

export function Navbar({ user, agencies = [], currentAgencyId }: NavbarProps) {
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessage, setAiMessage] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState<Array<{ role: string; content: string }>>([])

  /**
   * Navegacion DURA y no `router.push`.
   *
   * `signOut()` con el scope default (global) revoca todos los refresh tokens
   * del usuario, pero un `router.push` es navegacion blanda: el cliente
   * Supabase es un singleton a nivel modulo y sobrevive con sus timers de
   * auto-refresh, su handler de visibilitychange y cualquier refresh en vuelo.
   *
   * Si el usuario vuelve a loguearse enseguida, ese refresh viejo falla — su
   * token ya esta revocado — y gotrue-js, en el handler de error, llama
   * `_removeSession()`: borra las cookies de auth, que a esa altura son las de
   * la sesion NUEVA. El primer render server-side no encuentra sesion y manda
   * al login. Reproducible: cerrar sesion y volver a entrar en el acto.
   *
   * Recargar de verdad destruye el contexto JS, o sea el singleton, sus timers
   * y todo lo que este en vuelo. No queda nada de la sesion vieja que pueda
   * pisar a la nueva.
   */
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      // Si el signOut no sale (red caida), igual hay que sacar al usuario de
      // la app. El `finally` navega siempre.
      console.error("[auth] signOut fallo, se sale igual:", error)
    } finally {
      window.location.assign("/login")
    }
  }

  const handleAISend = async () => {
    if (!aiMessage.trim()) return

    const userMessage = aiMessage
    setAiMessage("")
    setAiHistory((prev) => [...prev, { role: "user", content: userMessage }])
    setAiLoading(true)

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, agencyId: currentAgencyId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.error) {
        setAiHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `❌ Error: ${data.error}\n\nAsegúrate de tener configurada la API key de OpenAI en .env.local`,
          },
        ])
      } else {
        setAiHistory((prev) => [
          ...prev,
          { role: "assistant", content: data.response || "No pude procesar tu consulta." },
        ])
      }
    } catch (error: any) {
      console.error("AI Copilot error:", error)
      setAiHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Error al comunicarse con el asistente: ${error.message || "Error desconocido"}\n\nVerifica la consola del servidor para más detalles.`,
        },
      ])
    } finally {
      setAiLoading(false)
    }
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        {agencies.length > 0 && (
          <Select defaultValue={currentAgencyId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar agencia" />
            </SelectTrigger>
            <SelectContent>
              {agencies.map((agency) => (
                <SelectItem key={agency.id} value={agency.id}>
                  {agency.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-4">
        <NotificationBell />
        
        <Sheet open={aiOpen} onOpenChange={setAiOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon">
              <Bot className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle>AI Copilot</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex h-[calc(100vh-120px)] flex-col">
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {aiHistory.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      Haz una pregunta sobre el negocio. Por ejemplo: &quot;¿Cuánto vendimos esta semana?&quot;
                    </div>
                  )}
                  {aiHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-lg p-3",
                        msg.role === "user"
                          ? "ml-auto max-w-[80%] bg-primary text-primary-foreground"
                          : "mr-auto max-w-[80%] bg-muted"
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="mr-auto max-w-[80%] rounded-lg bg-muted p-3">
                      Pensando...
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="mt-4 flex gap-2">
                <Textarea
                  placeholder="Escribe tu pregunta..."
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleAISend()
                    }
                  }}
                  className="min-h-[60px]"
                />
                <Button onClick={handleAISend} disabled={aiLoading || !aiMessage.trim()}>
                  Enviar
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar>
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

