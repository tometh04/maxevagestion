"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Loader2, Plus } from "lucide-react"
import type { EveCanal } from "@/lib/integrations/eve/client"

interface ChannelEditorProps {
  connected: boolean
  canWrite: boolean
  initialChannels: EveCanal[]
}

const TIPO_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
}

const TIPO_EXTERNAL_ID_HELP: Record<string, string> = {
  whatsapp: "Phone Number ID de la API de WhatsApp Business (ej. 123456789012345)",
  instagram: "ID de cuenta de Instagram Business vinculada a tu app de Meta",
  messenger: "ID de página de Facebook vinculada a tu app de Meta",
}

type CanalTipo = "whatsapp" | "instagram" | "messenger"

const DEFAULT_FORM = {
  tipo: "whatsapp" as CanalTipo,
  external_id: "",
  token: "",
  waba_id: "",
}

export function ChannelEditor({ connected, canWrite, initialChannels }: ChannelEditorProps) {
  const [channels, setChannels] = useState<EveCanal[]>(initialChannels)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)

  function resetForm() {
    setForm(DEFAULT_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const body: Record<string, string> = {
        tipo: form.tipo,
        external_id: form.external_id.trim(),
      }
      if (form.token.trim()) body.token = form.token.trim()
      if (form.tipo === "whatsapp" && form.waba_id.trim()) {
        body.waba_id = form.waba_id.trim()
      }

      const res = await fetch("/api/eve/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Error al registrar el canal")
        return
      }

      const successMsg = data.waba_subscribed
        ? "Canal registrado y suscrito a WhatsApp Business"
        : "Canal registrado correctamente"
      toast.success(successMsg)
      setOpen(false)
      resetForm()

      // Recargar canales
      const refreshRes = await fetch("/api/eve/channels")
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json()
        setChannels(refreshData.channels ?? [])
      }
    } catch {
      toast.error("Error de red al registrar el canal")
    } finally {
      setLoading(false)
    }
  }

  if (!connected) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Debés conectar Eve primero. Andá a la pestaña{" "}
              <a href="/eve" className="underline underline-offset-2">Estado</a>{" "}
              para configurar la integración.
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Canales de mensajería</CardTitle>
        {canWrite && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1 h-4 w-4" />
                Agregar canal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Agregar canal de mensajería</DialogTitle>
                  <DialogDescription>
                    Ingresá las credenciales del canal que querés conectar a Eve.
                    Estas credenciales se obtienen en el{" "}
                    <a
                      href="https://developers.facebook.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      panel de Meta for Developers
                    </a>
                    . El alta puede requerir App Review y permisos aprobados por Meta.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Tipo */}
                  <div className="space-y-1.5">
                    <Label htmlFor="tipo">Tipo de canal</Label>
                    <Select
                      value={form.tipo}
                      onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as CanalTipo, waba_id: "" }))}
                    >
                      <SelectTrigger id="tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="messenger">Messenger</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* External ID */}
                  <div className="space-y-1.5">
                    <Label htmlFor="external_id">
                      {form.tipo === "whatsapp" ? "Phone Number ID" : "Account ID"}
                    </Label>
                    <Input
                      id="external_id"
                      placeholder={form.tipo === "whatsapp" ? "123456789012345" : "987654321098765"}
                      value={form.external_id}
                      onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {TIPO_EXTERNAL_ID_HELP[form.tipo]}
                    </p>
                  </div>

                  {/* Token */}
                  <div className="space-y-1.5">
                    <Label htmlFor="token">
                      Access Token{" "}
                      <span className="text-muted-foreground font-normal">(opcional si ya está en Eve)</span>
                    </Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder="EAAxxxxxx..."
                      value={form.token}
                      onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      Token de acceso permanente o de sistema del canal. No se guarda en este sistema — se envía directamente al agente.
                    </p>
                  </div>

                  {/* WABA ID — solo WhatsApp */}
                  {form.tipo === "whatsapp" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="waba_id">
                        WhatsApp Business Account ID{" "}
                        <span className="text-muted-foreground font-normal">(opcional)</span>
                      </Label>
                      <Input
                        id="waba_id"
                        placeholder="111222333444555"
                        value={form.waba_id}
                        onChange={(e) => setForm((f) => ({ ...f, waba_id: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading || !form.external_id.trim()}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Registrar canal
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Sin canales configurados aún. Usá el botón para agregar el primero.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Tipo</th>
                <th className="pb-2 pr-4 font-medium">ID externo</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((canal) => (
                <tr key={canal.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {TIPO_LABELS[canal.tipo] ?? canal.tipo}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{canal.external_id}</td>
                  <td className="py-2">
                    {canal.activa ? (
                      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-xs">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">
                        Inactivo
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
