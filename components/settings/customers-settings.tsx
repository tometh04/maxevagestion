"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

/**
 * Configuración de la carga de clientes (VIB-154 / VIB-158).
 *
 * La tabla `customer_settings` y su API sobrevivieron al borrado de la pantalla
 * `/customers/settings` (commit 0ed311d6, 19/01/2026, "sistema usa valores
 * predeterminados"). El enforcement nunca se sacó: los diálogos de cliente
 * siguen leyendo `validations.email.required` y `app/api/customers/route.ts`
 * sigue aplicando `require_document` y el chequeo de duplicados. Como el default
 * que se crea solo es `email.required = true`, las agencias quedaron con reglas
 * activas y sin ninguna perilla para cambiarlas — al punto que el mensaje de
 * error de duplicados manda a "Configuración → Clientes", que no existía.
 *
 * Esta pantalla expone exactamente esas tres reglas. No agrega enforcement
 * nuevo: hace configurable lo que ya se estaba aplicando.
 */

/**
 * Campos por los que se puede detectar un duplicado.
 *
 * `phone` queda afuera a propósito: `app/api/customers/route.ts` lo filtra de
 * `duplicate_check_fields` antes de llamar a `checkDuplicateCustomer`, así que
 * ofrecerlo acá sería prometer algo que no pasa.
 */
const DUPLICATE_FIELDS = [
  { value: "email", label: "Email" },
  { value: "document_number", label: "Número de documento" },
] as const

interface CustomerSettings {
  validations?: {
    email?: { required?: boolean; format?: "email" }
    phone?: { required?: boolean; format?: "phone" }
  }
  require_document?: boolean
  duplicate_check_enabled?: boolean
  duplicate_check_fields?: string[]
}

export function CustomersSettings() {
  const [settings, setSettings] = useState<CustomerSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/customers/settings")
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al cargar la configuración")
      setSettings(data)
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar la configuración")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const emailRequired = settings?.validations?.email?.required ?? false
  const requireDocument = settings?.require_document ?? false
  const duplicateEnabled = settings?.duplicate_check_enabled ?? false
  const duplicateFields = settings?.duplicate_check_fields ?? []

  const setEmailRequired = (value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      // Se preserva el resto de `validations` (incluido phone): el PUT pisa el
      // objeto entero, así que mandar solo email borraría lo demás.
      validations: {
        ...prev?.validations,
        email: { ...prev?.validations?.email, required: value },
      },
    }))
  }

  const toggleDuplicateField = (field: string, checked: boolean) => {
    setSettings((prev) => {
      const current = prev?.duplicate_check_fields ?? []
      return {
        ...prev,
        duplicate_check_fields: checked
          ? Array.from(new Set([...current, field]))
          : current.filter((f) => f !== field),
      }
    })
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch("/api/customers/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validations: settings.validations ?? {},
          require_document: requireDocument,
          duplicate_check_enabled: duplicateEnabled,
          duplicate_check_fields: duplicateFields,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al guardar la configuración")
      setSettings(data)
      toast.success("Configuración guardada")
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar la configuración")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración...
      </div>
    )
  }

  if (!settings) {
    return (
      <Card className="rounded-xl border border-border/40">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No se pudo cargar la configuración de clientes.
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={load}>
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border border-border/40">
        <CardHeader>
          <CardTitle>Datos obligatorios</CardTitle>
          <CardDescription>
            Qué se le exige a un vendedor al dar de alta o editar un cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="space-y-1">
              <Label htmlFor="email-required" className="font-semibold">
                Email obligatorio
              </Label>
              <p className="text-sm text-muted-foreground">
                Si está apagado, se puede cargar un cliente sin email. Cuando se carga uno,
                se valida igual que tenga formato válido.
              </p>
            </div>
            <Switch
              id="email-required"
              checked={emailRequired}
              onCheckedChange={setEmailRequired}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="space-y-1">
              <Label htmlFor="require-document" className="font-semibold">
                Documento obligatorio
              </Label>
              <p className="text-sm text-muted-foreground">
                Exige tipo y número de documento para poder guardar el cliente.
              </p>
            </div>
            <Switch
              id="require-document"
              checked={requireDocument}
              onCheckedChange={(value) =>
                setSettings((prev) => ({ ...prev, require_document: value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border/40">
        <CardHeader>
          <CardTitle>Clientes duplicados</CardTitle>
          <CardDescription>
            Bloquea el alta cuando ya existe otro cliente con los mismos datos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="space-y-1">
              <Label htmlFor="duplicate-enabled" className="font-semibold">
                Detectar clientes duplicados
              </Label>
              <p className="text-sm text-muted-foreground">
                Apagalo si necesitás repetir un dato entre clientes distintos — por ejemplo,
                usar el email de un familiar para varios pasajeros.
              </p>
            </div>
            <Switch
              id="duplicate-enabled"
              checked={duplicateEnabled}
              onCheckedChange={(value) =>
                setSettings((prev) => ({ ...prev, duplicate_check_enabled: value }))
              }
            />
          </div>

          {duplicateEnabled && (
            <div className="space-y-3 rounded-xl border border-border/40 p-4">
              <p className="text-sm font-medium">Comparar por</p>
              {DUPLICATE_FIELDS.map((field) => (
                <div key={field.value} className="flex items-center gap-3">
                  <Checkbox
                    id={`dup-${field.value}`}
                    checked={duplicateFields.includes(field.value)}
                    onCheckedChange={(checked) =>
                      toggleDuplicateField(field.value, checked === true)
                    }
                  />
                  <Label htmlFor={`dup-${field.value}`} className="font-normal">
                    {field.label}
                  </Label>
                </div>
              ))}
              {duplicateFields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin campos seleccionados no se detecta ningún duplicado, igual que si
                  apagaras la opción de arriba.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
