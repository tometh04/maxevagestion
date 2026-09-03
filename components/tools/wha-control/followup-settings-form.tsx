"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface FollowupSettings {
  wait_hours: number
  message_text: string
  send_window_from: number
  send_window_to: number
}

export function FollowupSettingsForm() {
  const [settings, setSettings] = useState<FollowupSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/wha-control/followup-settings")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSettings(data.settings)
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo cargar la configuración")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    if (!settings) return
    if (!settings.message_text.trim()) {
      toast.error("El mensaje de seguimiento no puede estar vacío")
      return
    }
    if (settings.send_window_from >= settings.send_window_to) {
      toast.error("La ventana horaria es inválida (desde debe ser menor que hasta)")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/wha-control/followup-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "No se pudo guardar")
        return
      }
      toast.success("Configuración guardada")
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!settings) return null

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Seguimiento automático de cotizaciones</CardTitle>
        <CardDescription>
          Cuando marcás una conversación como &quot;Cotización enviada&quot;, el
          sistema le escribe solo al cliente si no respondió pasado el tiempo de
          espera. El mensaje se congela al marcar: cambiarlo acá no afecta los
          seguimientos ya agendados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="wait-hours">Horas de espera</Label>
          <Input
            id="wait-hours"
            type="number"
            min={1}
            max={168}
            value={settings.wait_hours}
            onChange={(e) =>
              setSettings({ ...settings, wait_hours: parseInt(e.target.value) || 1 })
            }
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Cuánto esperar desde la marca antes de enviar el seguimiento (1 a 168 horas).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="message-text">Mensaje de seguimiento</Label>
          <Textarea
            id="message-text"
            rows={4}
            maxLength={2000}
            placeholder="Hola {nombre}! ¿Pudiste ver la cotización que te mandamos? Quedo a disposición por cualquier consulta."
            value={settings.message_text}
            onChange={(e) => setSettings({ ...settings, message_text: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Usá <code className="rounded bg-muted px-1">{"{nombre}"}</code> para
            insertar el nombre del contacto.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Ventana horaria de envío</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={23}
              value={settings.send_window_from}
              onChange={(e) =>
                setSettings({ ...settings, send_window_from: parseInt(e.target.value) || 0 })
              }
              className="w-20"
              aria-label="Desde (hora)"
            />
            <span className="text-sm text-muted-foreground">a</span>
            <Input
              type="number"
              min={1}
              max={24}
              value={settings.send_window_to}
              onChange={(e) =>
                setSettings({ ...settings, send_window_to: parseInt(e.target.value) || 1 })
              }
              className="w-20"
              aria-label="Hasta (hora)"
            />
            <span className="text-sm text-muted-foreground">hs (Argentina)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Los seguimientos que venzan fuera de esta ventana se envían al
            inicio de la ventana siguiente.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar
        </Button>
      </CardContent>
    </Card>
  )
}
