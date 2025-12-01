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
import { Mail, Send, Loader2, Check, FileText } from "lucide-react"
import { toast } from "sonner"

interface SendStatementButtonProps {
  customerId: string
  customerName: string
  defaultEmail?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
}

export function SendStatementButton({
  customerId,
  customerName,
  defaultEmail = "",
  variant = "outline",
  size = "sm",
}: SendStatementButtonProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    if (!email) {
      toast.error("Ingresa un email de destino")
      return
    }

    setSending(true)
    try {
      // Primero obtener el HTML del estado de cuenta
      const statementResponse = await fetch(`/api/customers/${customerId}/statement`)
      if (!statementResponse.ok) {
        throw new Error("Error al generar estado de cuenta")
      }
      const statementHtml = await statementResponse.text()

      // Enviar por email
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "statement",
          to: email,
          customerName,
          html: statementHtml,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error al enviar email")
      }

      setSent(true)
      toast.success("Estado de cuenta enviado exitosamente")
      
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

  async function handleDownload() {
    window.open(`/api/customers/${customerId}/statement`, "_blank")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <FileText className="h-4 w-4 mr-2" />
          Estado de Cuenta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Estado de Cuenta
          </DialogTitle>
          <DialogDescription>
            Envía o descarga el estado de cuenta de {customerName}
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

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleDownload}
              >
                <FileText className="h-4 w-4 mr-2" />
                Ver / Descargar PDF
              </Button>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
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
                    Enviar por Email
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

