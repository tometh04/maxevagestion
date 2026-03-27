"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AfipSettingsProps {
  agencies: Array<{ id: string; name: string }>
  defaultAgencyId: string | null
}

interface AfipStatus {
  configured: boolean
  config?: {
    cuit: string
    environment: string
    punto_venta: number
  }
}

export function AfipSettings({ agencies, defaultAgencyId }: AfipSettingsProps) {
  const { toast } = useToast()

  const [selectedAgencyId, setSelectedAgencyId] = useState(defaultAgencyId || agencies[0]?.id || "")
  const [status, setStatus] = useState<AfipStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [reconfiguring, setReconfiguring] = useState(false)

  // Form state
  const [cuit, setCuit] = useState("")
  const [password, setPassword] = useState("")
  const [puntoVenta, setPuntoVenta] = useState("1")
  const [environment, setEnvironment] = useState<"production" | "sandbox">("production")
  const [submitting, setSubmitting] = useState(false)

  const fetchStatus = async (agencyId: string) => {
    if (!agencyId) return
    setLoadingStatus(true)
    try {
      const res = await fetch(`/api/settings/afip/status?agencyId=${agencyId}`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {
      setStatus(null)
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    if (selectedAgencyId) {
      fetchStatus(selectedAgencyId)
      setReconfiguring(false)
    }
  }, [selectedAgencyId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgencyId || !cuit || !password) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/settings/afip/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: selectedAgencyId,
          cuit,
          password,
          punto_venta: parseInt(puntoVenta) || 1,
          environment,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "AFIP configurado correctamente",
          description: `CUIT ${cuit} autorizado en ${environment === 'production' ? 'Producción' : 'Sandbox'}`,
        })
        setPassword("")
        setReconfiguring(false)
        await fetchStatus(selectedAgencyId)
      } else {
        toast({
          title: "Error al configurar AFIP",
          description: data.error || "Error desconocido",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Error de conexión",
        description: "No se pudo conectar con el servidor",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleTestConnection = async () => {
    if (!selectedAgencyId) return
    const res = await fetch(`/api/settings/afip/test?agencyId=${selectedAgencyId}`)
    const data = await res.json()
    if (data.success) {
      toast({ title: "Conexión exitosa", description: data.message })
    } else {
      toast({ title: "Error de conexión", description: data.message, variant: "destructive" })
    }
  }

  const showForm = !status?.configured || reconfiguring

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Facturación Electrónica AFIP</CardTitle>
          <CardDescription>
            Configurá las credenciales para emitir facturas electrónicas a través de AFIP.
            La clave fiscal nunca se almacena — solo se usa una vez para autorizar el certificado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {agencies.length > 1 && (
            <div className="space-y-2">
              <Label>Agencia</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Seleccionar agencia" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loadingStatus ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verificando configuración...</span>
            </div>
          ) : status?.configured && !reconfiguring ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-green-800 dark:text-green-300">AFIP Activo</p>
                  <p className="text-sm text-green-700 dark:text-green-400">
                    CUIT: {status.config?.cuit} · Pto. Venta: {status.config?.punto_venta} ·{" "}
                    <Badge variant="outline" className="text-xs">
                      {status.config?.environment === 'production' ? 'Producción' : 'Sandbox'}
                    </Badge>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTestConnection}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Probar conexión
                </Button>
                <Button variant="outline" size="sm" onClick={() => setReconfiguring(true)}>
                  Reconfigurar
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!status?.configured && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    El proceso de configuración puede tardar hasta 2 minutos mientras se crea y autoriza el certificado AFIP automáticamente.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="afip-cuit">CUIT (sin guiones)</Label>
                  <Input
                    id="afip-cuit"
                    placeholder="20123456789"
                    value={cuit}
                    onChange={e => setCuit(e.target.value.replace(/\D/g, ''))}
                    maxLength={11}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="afip-pto-venta">Punto de Venta</Label>
                  <Input
                    id="afip-pto-venta"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={puntoVenta}
                    onChange={e => setPuntoVenta(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="afip-password">Clave Fiscal AFIP</Label>
                <Input
                  id="afip-password"
                  type="password"
                  placeholder="Clave Fiscal de AFIP"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  La clave fiscal no se guarda. Solo se usa para crear el certificado digital.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Entorno</Label>
                <Select value={environment} onValueChange={(v: any) => setEnvironment(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Producción</SelectItem>
                    <SelectItem value="sandbox">Sandbox (pruebas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || !cuit || !password}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Configurando AFIP... (puede tardar hasta 2 min)
                    </>
                  ) : (
                    "Configurar AFIP"
                  )}
                </Button>
                {reconfiguring && (
                  <Button type="button" variant="ghost" onClick={() => setReconfiguring(false)}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
