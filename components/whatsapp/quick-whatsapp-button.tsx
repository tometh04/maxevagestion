"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MessageSquare, Send, ChevronDown, ExternalLink, Edit } from "lucide-react"
import { toast } from "sonner"

interface QuickWhatsAppButtonProps {
  phone: string
  customerName: string
  customerId: string
  agencyId: string
  // Contexto opcional
  operationId?: string
  operationDestination?: string
  paymentAmount?: number
  paymentCurrency?: string
  variant?: "default" | "outline" | "ghost" | "icon"
  size?: "default" | "sm" | "lg" | "icon"
}

const quickMessages = [
  {
    label: "Saludo general",
    emoji: "👋",
    template: "Hola {nombre}! ¿Cómo estás? Te escribo de la agencia.",
  },
  {
    label: "Consulta de viaje",
    emoji: "✈️",
    template: "Hola {nombre}! ¿Cómo viene el viaje a {destino}? ¿Tenés alguna consulta?",
  },
  {
    label: "Recordatorio de pago",
    emoji: "💰",
    template: "Hola {nombre}! Te escribo para recordarte sobre el pago pendiente. ¿Necesitás los datos para transferir?",
  },
  {
    label: "Documentación",
    emoji: "📄",
    template: "Hola {nombre}! Te escribo por la documentación del viaje. ¿Ya tenés todo listo?",
  },
  {
    label: "Seguimiento",
    emoji: "📲",
    template: "Hola {nombre}! ¿Cómo venís con la decisión? Cualquier duda que tengas, avisame!",
  },
]

export function QuickWhatsAppButton({
  phone,
  customerName,
  customerId,
  agencyId,
  operationId,
  operationDestination,
  paymentAmount,
  paymentCurrency,
  variant = "outline",
  size = "sm",
}: QuickWhatsAppButtonProps) {
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customMessage, setCustomMessage] = useState("")
  const [saving, setSaving] = useState(false)

  if (!phone) {
    return null
  }

  function replaceVariables(template: string): string {
    const firstName = (customerName || "").split(" ")[0] || "Cliente"
    let message = template
      .replace(/{nombre}/g, firstName)
      .replace(/{destino}/g, operationDestination || "tu viaje")

    if (paymentAmount && paymentCurrency) {
      message = message
        .replace(/{monto}/g, paymentAmount.toLocaleString("es-AR"))
        .replace(/{moneda}/g, paymentCurrency)
    }

    return message
  }

  function openWhatsApp(message: string) {
    const cleanPhone = phone.replace(/\D/g, "")
    const encodedMessage = encodeURIComponent(message)
    const url = `https://wa.me/${cleanPhone}?text=${encodedMessage}`
    window.open(url, "_blank")
  }

  function handleQuickMessage(template: string) {
    const message = replaceVariables(template)
    openWhatsApp(message)
    
    // Guardar en historial
    saveToHistory(message)
  }

  async function saveToHistory(message: string) {
    try {
      const cleanPhone = phone.replace(/\D/g, "")
      await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          phone: cleanPhone,
          customer_name: customerName,
          message,
          agency_id: agencyId,
          operation_id: operationId,
          status: "SENT",
        }),
      })
    } catch (error) {
      // No mostrar error, es solo para tracking
      console.error("Error guardando mensaje en historial:", error)
    }
  }

  async function handleCustomMessage() {
    if (!customMessage.trim()) {
      toast.error("Escribe un mensaje")
      return
    }

    setSaving(true)
    openWhatsApp(customMessage)
    await saveToHistory(customMessage)
    setSaving(false)
    setCustomDialogOpen(false)
    setCustomMessage("")
    toast.success("Mensaje enviado")
  }

  // Si es un botón de icono, mostrar dropdown directamente
  if (size === "icon" || variant === "icon") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-success">
            <MessageSquare className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {quickMessages.map((msg, idx) => (
            <DropdownMenuItem
              key={idx}
              onClick={() => handleQuickMessage(msg.template)}
            >
              <span className="mr-2">{msg.emoji}</span>
              {msg.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setCustomDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Mensaje personalizado
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className="gap-1">
            <MessageSquare className="h-4 w-4" />
            WhatsApp
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {quickMessages.map((msg, idx) => (
            <DropdownMenuItem
              key={idx}
              onClick={() => handleQuickMessage(msg.template)}
            >
              <span className="mr-2">{msg.emoji}</span>
              {msg.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setCustomDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Mensaje personalizado
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog para mensaje personalizado */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp a {customerName}</DialogTitle>
            <DialogDescription>
              Escribe un mensaje personalizado para enviar por WhatsApp
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Mensaje</Label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={5}
                placeholder={`Hola ${(customerName || "").split(" ")[0] || ""}...`}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCustomMessage}
                disabled={saving || !customMessage.trim()}
                className="bg-success hover:bg-success"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

