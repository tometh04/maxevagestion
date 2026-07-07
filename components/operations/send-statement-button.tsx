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
import { FileText, Send, Loader2, Check, Download } from "lucide-react"
import { toast } from "sonner"

interface SendStatementButtonProps {
  operationId: string
  defaultEmail?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
}

/**
 * Botón "Enviar detalle al pasajero": manda por email el PDF con el detalle de
 * la operación (servicios + importe + vencimiento). También permite descargar
 * el PDF para reenviarlo manualmente por otro canal.
 */
export function SendStatementButton({
  operationId,
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
      toast.error("Ingresá un email de destino")
      return
    }

    setSending(true)
    try {
      const response = await fetch(
        `/api/operations/${operationId}/statement/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: email }),
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Error al enviar el email")
      }

      setSent(true)
      toast.success("Detalle enviado al pasajero")

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

  function handleDownload() {
    window.open(`/api/operations/${operationId}/statement/pdf`, "_blank")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <FileText className="mr-2 h-4 w-4" />
          Enviar detalle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Enviar detalle al pasajero
          </DialogTitle>
          <DialogDescription>
            Se enviará por email el PDF con el detalle de la operación: servicios
            contratados, importe total y fecha máxima de pago.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-success" />
            </div>
            <p className="text-lg font-medium text-success">¡Detalle enviado!</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="statement-email">Email de destino</Label>
                <Input
                  id="statement-email"
                  type="email"
                  placeholder="pasajero@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="px-0 text-muted-foreground"
                onClick={handleDownload}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
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
                    Enviar por email
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
