"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Send, Loader2, Check, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface SendEmailButtonProps {
  type: "quotation" | "payment_confirmation" | "payment_reminder"
  entityId: string
  defaultEmail?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  children?: React.ReactNode
}

const typeLabels = {
  quotation: {
    title: "Enviar Cotización",
    description: "Se enviará la cotización con el PDF adjunto al email indicado.",
    buttonText: "Enviar Cotización",
    successMessage: "Cotización enviada exitosamente",
  },
  payment_confirmation: {
    title: "Enviar Confirmación de Pago",
    description: "Se enviará una confirmación del pago recibido.",
    buttonText: "Enviar Confirmación",
    successMessage: "Confirmación enviada exitosamente",
  },
  payment_reminder: {
    title: "Enviar Recordatorio de Pago",
    description: "Se enviará un recordatorio amigable sobre el pago pendiente.",
    buttonText: "Enviar Recordatorio",
    successMessage: "Recordatorio enviado exitosamente",
  },
}

export function SendEmailButton({
  type,
  entityId,
  defaultEmail = "",
  variant = "outline",
  size = "sm",
  children,
}: SendEmailButtonProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const labels = typeLabels[type]

  async function handleSend() {
    if (!email) {
      toast.error("Ingresa un email de destino")
      return
    }

    setSending(true)
    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          entityId,
          to: email,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error al enviar email")
      }

      setSent(true)
      toast.success(labels.successMessage)
      
      setTimeout(() => {
        setOpen(false)
        setSent(false)
      }, 1500)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {children || (
            <>
              <Mail className="h-4 w-4 mr-2" />
              Enviar por Email
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {labels.title}
          </DialogTitle>
          <DialogDescription>
            {labels.description}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-lg font-medium text-green-600">¡Email enviado!</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email de destino</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Nota:</p>
                  <p>El servicio de email requiere configurar RESEND_API_KEY en las variables de entorno.</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={sending || !email}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {labels.buttonText}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

