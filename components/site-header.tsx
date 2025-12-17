"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"

const getPageTitle = (pathname: string): string => {
  const routes: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/sales/leads": "Leads",
    "/operations": "Operaciones",
    "/customers": "Clientes",
    "/operators": "Operadores",
    "/cash": "Caja",
    "/cash/movements": "Movimientos",
    "/cash/payments": "Pagos",
    "/accounting/ledger": "Libro Mayor",
    "/accounting/iva": "IVA",
    "/accounting/financial-accounts": "Cuentas Financieras",
    "/accounting/operator-payments": "Pagos a Operadores",
    "/accounting/recurring-payments": "Pagos Recurrentes",
    "/alerts": "Alertas",
    "/calendar": "Calendario",
    "/reports": "Reportes",
    "/my/balance": "Mi Balance",
    "/my/commissions": "Mis Comisiones",
    "/settings": "Configuración",
  }

  // Buscar coincidencia exacta o parcial
  for (const [route, title] of Object.entries(routes)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return title
    }
  }

  return "MAXEVA GESTION"
}

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const title = getPageTitle(pathname)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessage, setAiMessage] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState<Array<{ role: string; content: string }>>([])
  
  // Detectar si estamos en una página de operación
  const operationIdMatch = pathname?.match(/\/operations\/([a-f0-9-]{36})/i)
  const currentOperationId = operationIdMatch ? operationIdMatch[1] : undefined

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
        body: JSON.stringify({ 
          message: userMessage,
          operationId: currentOperationId, // Pasar operationId si estamos en esa página
        }),
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
            content: `❌ Error: ${data.error}\n\nAsegúrate de tener configurada la API key de OpenAI en las variables de entorno.`,
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

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Sheet open={aiOpen} onOpenChange={setAiOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" title="AI Copilot">
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
                            "rounded-lg p-3 whitespace-pre-wrap",
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
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  )
}

