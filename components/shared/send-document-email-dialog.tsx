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
import { Mail, Send, Loader2, Check, Download } from "lucide-react"
import { toast } from "sonner"

interface SendDocumentEmailDialogProps {
  /** Endpoint POST que genera el PDF y lo manda por email. Recibe { to }. */
  endpoint: string
  title: string
  description: string
  /** Email precargado (cliente MAIN). Puede quedar vacío: el server lo resuelve. */
  defaultEmail?: string
  /** URL GET para descargar el PDF (opcional, muestra botón "Descargar PDF"). */
  downloadUrl?: string
  successMessage?: string
  /** Trigger custom (ej. un icon-button). Si falta, usa un botón por defecto. */
  children?: React.ReactNode
}

export function SendDocumentEmailDialog({
  endpoint,
  title,
  description,
  defaultEmail = "",
  downloadUrl,
  successMessage = "Documento enviado",
  children,
}: SendDocumentEmailDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email.trim() ? { to: email.trim() } : {}),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Error al enviar el email")
      }

      const data = await response.json().catch(() => ({}))
      setSent(true)
      toast.success(data.sentTo ? `${successMessage} a ${data.sentTo}` : successMessage)

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
        {children || (
          <Button variant="outline" size="sm">
            <Mail className="mr-2 h-4 w-4" />
            Enviar por email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-success" />
            </div>
            <p className="text-lg font-medium text-success">¡Enviado!</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="doc-email">Email de destino</Label>
                <Input
                  id="doc-email"
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Si lo dejás vacío, se usa el email del cliente cargado en el sistema.
                </p>
              </div>

              {downloadUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 text-muted-foreground"
                  onClick={() => window.open(downloadUrl, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </Button>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={sending}>
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
