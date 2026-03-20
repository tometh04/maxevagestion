"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, RefreshCw, Power, PowerOff, Trash2, Smartphone, Loader2 } from "lucide-react"
import { ConnectDeviceDialog } from "./connect-device-dialog"

interface Device {
  id: string
  display_name: string
  phone_number: string | null
  status: string
  last_connection_at: string | null
  last_seen_event_at: string | null
  is_active: boolean
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  CONNECTED: { label: "Conectado", variant: "default" },
  PENDING_QR: { label: "Esperando QR", variant: "secondary" },
  PAIRING: { label: "Vinculando", variant: "secondary" },
  RECONNECTING: { label: "Reconectando", variant: "outline" },
  DISCONNECTED: { label: "Desconectado", variant: "outline" },
  LOGGED_OUT: { label: "Sesión cerrada", variant: "destructive" },
  ERROR: { label: "Error", variant: "destructive" },
}

export function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showConnect, setShowConnect] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/wha-control/devices")
      if (res.ok) {
        const data = await res.json()
        setDevices(data.devices || [])
      }
    } catch (err) {
      console.error("Error fetching devices:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
    // Poll every 10 seconds
    const interval = setInterval(fetchDevices, 10000)
    return () => clearInterval(interval)
  }, [fetchDevices])

  const handleDisconnect = async (deviceId: string) => {
    setActionLoading(deviceId)
    try {
      await fetch(`/api/wha-control/devices/${deviceId}/disconnect`, { method: "POST" })
      await fetchDevices()
    } catch (err) {
      console.error("Error disconnecting:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReconnect = async (deviceId: string) => {
    setActionLoading(deviceId)
    try {
      await fetch(`/api/wha-control/devices/${deviceId}/reconnect`, { method: "POST" })
      await fetchDevices()
    } catch (err) {
      console.error("Error reconnecting:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (deviceId: string) => {
    if (!confirm("¿Estás seguro de eliminar este dispositivo?")) return
    setActionLoading(deviceId)
    try {
      await fetch(`/api/wha-control/devices/${deviceId}`, { method: "DELETE" })
      await fetchDevices()
    } catch (err) {
      console.error("Error deleting:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return "—"
    return new Date(date).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {devices.length} dispositivo{devices.length !== 1 ? "s" : ""} vinculado{devices.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={() => setShowConnect(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Vincular número
        </Button>
      </div>

      {devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Smartphone className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-1">No hay dispositivos</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Vinculá el primer número de WhatsApp para empezar
            </p>
            <Button onClick={() => setShowConnect(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Vincular número
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            const statusConfig = STATUS_CONFIG[device.status] || { label: device.status, variant: "outline" as const }
            const isLoading = actionLoading === device.id

            return (
              <Card key={device.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{device.display_name}</CardTitle>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Número</span>
                      <span className="font-mono">{device.phone_number || "Sin vincular"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Última conexión</span>
                      <span>{formatDate(device.last_connection_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Último evento</span>
                      <span>{formatDate(device.last_seen_event_at)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {device.status === "CONNECTED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleDisconnect(device.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="mr-1 h-3 w-3" />}
                        Desconectar
                      </Button>
                    ) : device.status === "DISCONNECTED" || device.status === "LOGGED_OUT" || device.status === "ERROR" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleReconnect(device.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                        Reconectar
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(device.id)}
                      disabled={isLoading}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ConnectDeviceDialog
        open={showConnect}
        onOpenChange={setShowConnect}
        onDeviceCreated={fetchDevices}
      />
    </div>
  )
}
