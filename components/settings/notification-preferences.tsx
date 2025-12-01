"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Bell, CreditCard, Plane, FileText, AlertTriangle, Loader2, Check } from "lucide-react"
import { toast } from "sonner"

interface NotificationPreference {
  type: string
  label: string
  description: string
  icon: any
  enabled: boolean
}

const defaultPreferences: NotificationPreference[] = [
  {
    type: "payment_due",
    label: "Pagos por vencer",
    description: "Notificar 3 días antes del vencimiento de un pago",
    icon: CreditCard,
    enabled: true,
  },
  {
    type: "payment_overdue",
    label: "Pagos vencidos",
    description: "Alertar cuando un pago pasa su fecha de vencimiento",
    icon: AlertTriangle,
    enabled: true,
  },
  {
    type: "upcoming_trip",
    label: "Viajes próximos",
    description: "Recordatorio 7 días antes de la fecha de viaje",
    icon: Plane,
    enabled: true,
  },
  {
    type: "missing_documents",
    label: "Documentos faltantes",
    description: "Alertar cuando una operación próxima no tiene documentos",
    icon: FileText,
    enabled: true,
  },
  {
    type: "new_lead",
    label: "Nuevos leads",
    description: "Notificar cuando se asigna un nuevo lead",
    icon: Bell,
    enabled: true,
  },
  {
    type: "commission_generated",
    label: "Comisiones generadas",
    description: "Notificar cuando se genera una nueva comisión",
    icon: CreditCard,
    enabled: true,
  },
]

interface NotificationPreferencesProps {
  userId: string
}

export function NotificationPreferences({ userId }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [userId])

  async function fetchPreferences() {
    try {
      const response = await fetch(`/api/users/${userId}/notification-preferences`)
      if (response.ok) {
        const data = await response.json()
        if (data.preferences) {
          // Merge con las preferencias por defecto
          setPreferences(prev => prev.map(p => ({
            ...p,
            enabled: data.preferences[p.type] ?? p.enabled
          })))
        }
      }
    } catch (error) {
      console.error("Error fetching preferences:", error)
    }
  }

  function handleToggle(type: string) {
    setPreferences(prev => prev.map(p => 
      p.type === type ? { ...p, enabled: !p.enabled } : p
    ))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const prefsObject = Object.fromEntries(
        preferences.map(p => [p.type, p.enabled])
      )

      const response = await fetch(`/api/users/${userId}/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefsObject }),
      })

      if (!response.ok) {
        throw new Error("Error al guardar preferencias")
      }

      setSaved(true)
      toast.success("Preferencias guardadas")
      
      setTimeout(() => setSaved(false), 2000)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  function handleEnableAll() {
    setPreferences(prev => prev.map(p => ({ ...p, enabled: true })))
    setSaved(false)
  }

  function handleDisableAll() {
    setPreferences(prev => prev.map(p => ({ ...p, enabled: false })))
    setSaved(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Preferencias de Notificaciones
            </CardTitle>
            <CardDescription>
              Configura qué notificaciones deseas recibir
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleEnableAll}>
              Activar todas
            </Button>
            <Button variant="outline" size="sm" onClick={handleDisableAll}>
              Desactivar todas
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {preferences.map((pref, index) => {
          const Icon = pref.icon
          return (
            <div key={pref.type}>
              {index > 0 && <Separator className="my-4" />}
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <Label htmlFor={pref.type} className="font-medium">
                      {pref.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {pref.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={pref.type}
                  checked={pref.enabled}
                  onCheckedChange={() => handleToggle(pref.type)}
                />
              </div>
            </div>
          )
        })}

        <Separator className="my-6" />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Guardado
              </>
            ) : (
              "Guardar Preferencias"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

