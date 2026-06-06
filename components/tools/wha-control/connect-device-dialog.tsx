"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Loader2, QrCode, Smartphone, Building2, AlertCircle, RefreshCw } from "lucide-react"

interface Agency {
  id: string
  name: string
}

interface ConnectDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeviceCreated: () => void
  agencies: Agency[]
}

type Step = "name" | "qr" | "success"

// After MAX_QR_ATTEMPTS × 3s (~2 min) without connection, show timeout UI
const MAX_QR_ATTEMPTS = 40

export function ConnectDeviceDialog({ open, onOpenChange, onDeviceCreated, agencies }: ConnectDeviceDialogProps) {
  const [step, setStep] = useState<Step>("name")
  const [name, setName] = useState("")
  const [agencyId, setAgencyId] = useState<string | undefined>(undefined)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [qrValue, setQrValue] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("PENDING_QR")
  const [loading, setLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [qrTimedOut, setQrTimedOut] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const attemptsRef = useRef(0)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("name")
      setName("")
      setAgencyId(undefined)
      setDeviceId(null)
      setQrValue(null)
      setStatus("PENDING_QR")
      setCreateError(null)
      setQrTimedOut(false)
      attemptsRef.current = 0
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open])

  // Poll for QR and status updates
  useEffect(() => {
    if (step !== "qr" || !deviceId) return

    attemptsRef.current = 0
    setQrTimedOut(false)

    const poll = async () => {
      attemptsRef.current += 1

      if (attemptsRef.current > MAX_QR_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current)
        setQrTimedOut(true)
        return
      }

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
          // QR scanned — clear the QR image and let the user confirm on their phone
          if (data.status === "PAIRING") {
            setQrValue(null)
          }
        }
      } catch (err) {
        console.error("Error polling QR:", err)
      }
    }

    poll()
    pollRef.current = setInterval(poll, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [step, deviceId, onDeviceCreated])

  const handleCreateDevice = async () => {
    if (!name.trim()) return
    setLoading(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/wha-control/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          agencyId: agencyId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || "Error al crear el dispositivo. Verificá que el conector esté activo.")
        return
      }
      setDeviceId(data.device.id)
      setStep("qr")
    } catch (err) {
      setCreateError("Error de red. Verificá tu conexión e intentá nuevamente.")
    } finally {
      setLoading(false)
    }
  }

  const handleRetryQr = () => {
    setQrTimedOut(false)
    setQrValue(null)
    attemptsRef.current = 0
    // Re-trigger the polling effect by nudging deviceId (re-mount via key change not needed,
    // just reset and let the existing interval restart on next effect run)
    if (pollRef.current) clearInterval(pollRef.current)
    if (!deviceId) return

    const poll = async () => {
      attemptsRef.current += 1
      if (attemptsRef.current > MAX_QR_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current)
        setQrTimedOut(true)
        return
      }
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

    poll()
    pollRef.current = setInterval(poll, 3000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "name" && (
          <>
            <DialogHeader>
              <DialogTitle>Vincular nuevo número</DialogTitle>
              <DialogDescription>
                Poné un nombre para identificar este teléfono y seleccioná la agencia
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5 space-y-5">
              {createError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-foreground/70" />
                  <span className="text-xs font-medium text-foreground/70">Datos del dispositivo</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="device-name" className="text-xs">Nombre del dispositivo</Label>
                    <Input
                      id="device-name"
                      placeholder="Ej: Josefina"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateDevice()}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Agencia</Label>
                    <Select value={agencyId} onValueChange={setAgencyId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar agencia" />
                      </SelectTrigger>
                      <SelectContent>
                        {agencies.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {agency.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateDevice}
                disabled={!name.trim() || loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continuar
              </Button>
            </DialogFooter>
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
            <div className="px-6 py-6 flex flex-col items-center space-y-4">
              {qrTimedOut ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="flex h-[288px] w-[288px] items-center justify-center rounded-xl border border-border/40">
                    <div className="text-center px-6">
                      <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm font-medium">Tiempo de espera agotado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        El QR no se generó. El conector puede estar ocupado.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRetryQr}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Reintentar
                  </Button>
                </div>
              ) : status === "PAIRING" ? (
                <div className="flex h-[288px] w-[288px] items-center justify-center rounded-xl border border-border/40">
                  <div className="text-center px-6">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm font-medium">QR escaneado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Confirmá en tu teléfono para vincular el dispositivo
                    </p>
                  </div>
                </div>
              ) : qrValue ? (
                <div className="rounded-xl border border-border/40 bg-white p-4">
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
                <div className="flex h-[288px] w-[288px] items-center justify-center rounded-xl border border-border/40">
                  <div className="text-center">
                    <QrCode className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">Generando QR...</p>
                  </div>
                </div>
              )}
              {!qrTimedOut && status !== "PAIRING" && (
                <p className="text-xs text-muted-foreground">
                  El QR se actualiza automáticamente cada ~20 segundos
                </p>
              )}
            </div>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>Vinculado exitosamente</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-8 flex flex-col items-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 dark:bg-success/30">
                <CheckCircle2 className="h-8 w-8 text-success dark:text-success" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                <strong>{name}</strong> se vinculó correctamente. Los mensajes se empezarán a sincronizar automáticamente.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
