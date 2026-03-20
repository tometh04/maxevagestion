"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Loader2, QrCode } from "lucide-react"

interface ConnectDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeviceCreated: () => void
}

type Step = "name" | "qr" | "success"

export function ConnectDeviceDialog({ open, onOpenChange, onDeviceCreated }: ConnectDeviceDialogProps) {
  const [step, setStep] = useState<Step>("name")
  const [name, setName] = useState("")
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [qrValue, setQrValue] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("PENDING_QR")
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("name")
      setName("")
      setDeviceId(null)
      setQrValue(null)
      setStatus("PENDING_QR")
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open])

  // Poll for QR and status updates
  useEffect(() => {
    if (step !== "qr" || !deviceId) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/wha-control/devices/${deviceId}/qr`)
        if (res.ok) {
          const data = await res.json()
          if (data.qr) setQrValue(data.qr)
          setStatus(data.status)

          if (data.status === "CONNECTED") {
            setStep("success")
            onDeviceCreated()
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }
      } catch (err) {
        console.error("Error polling QR:", err)
      }
    }

    poll() // Initial fetch
    pollRef.current = setInterval(poll, 3000) // Poll every 3 seconds

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [step, deviceId, onDeviceCreated])

  const handleCreateDevice = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/wha-control/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setDeviceId(data.device.id)
        setStep("qr")
      }
    } catch (err) {
      console.error("Error creating device:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "name" && (
          <>
            <DialogHeader>
              <DialogTitle>Vincular nuevo número</DialogTitle>
              <DialogDescription>
                Poné un nombre para identificar este teléfono (ej: &quot;Josefina&quot;, &quot;Santiago Ventas 2&quot;)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="device-name">Nombre del dispositivo</Label>
                <Input
                  id="device-name"
                  placeholder="Ej: Josefina"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateDevice()}
                  autoFocus
                />
              </div>
              <Button
                onClick={handleCreateDevice}
                disabled={!name.trim() || loading}
                className="w-full"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continuar
              </Button>
            </div>
          </>
        )}

        {step === "qr" && (
          <>
            <DialogHeader>
              <DialogTitle>Escanear código QR</DialogTitle>
              <DialogDescription>
                Abrí WhatsApp en el teléfono de <strong>{name}</strong> → Dispositivos vinculados → Vincular dispositivo → Escaneá este QR
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center py-6 space-y-4">
              {qrValue ? (
                <div className="rounded-lg border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrValue)}`}
                    alt="QR Code"
                    width={256}
                    height={256}
                    className="rounded"
                  />
                </div>
              ) : (
                <div className="flex h-[288px] w-[288px] items-center justify-center rounded-lg border">
                  <div className="text-center">
                    <QrCode className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">Generando QR...</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                El QR se actualiza automáticamente cada ~20 segundos
              </p>
            </div>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>¡Vinculado exitosamente!</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center py-8 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                <strong>{name}</strong> se vinculó correctamente. Los mensajes se empezarán a sincronizar automáticamente.
              </p>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Cerrar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
