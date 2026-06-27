"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle2, Loader2, WifiOff } from "lucide-react"

interface EveAgencia {
  id: string
  nombre: string
  plan?: string
  activa: boolean
  prompt_custom?: string | null
}

interface EveCanal {
  id: string
  tipo: string
  external_id: string
  activa: boolean
}

interface ConnectionState {
  connected: boolean
  webhook_configured?: boolean
  agencia?: EveAgencia | null
  canales?: EveCanal[]
  error?: string
}

interface EveConnectionClientProps {
  initial: ConnectionState
  canWrite: boolean
}

export function EveConnectionClient({ initial, canWrite }: EveConnectionClientProps) {
  const [state, setState] = useState<ConnectionState>(initial)
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    try {
      const res = await fetch("/api/eve/connection", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Error al conectar con Eve")
        return
      }
      toast.success(
        data.reconnected ? "Reconexión exitosa con Eve" : "Agente Eve conectado correctamente"
      )
      // Recargar estado actualizado
      const refreshRes = await fetch("/api/eve/connection")
      const refreshData = await refreshRes.json()
      if (refreshRes.ok) {
        setState(refreshData)
      }
    } catch {
      toast.error("Error de red al conectar con Eve")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Aviso Eve inalcanzable */}
      {state.error === "eve_unreachable" && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>El servicio Eve no responde en este momento. El estado mostrado puede estar desactualizado.</span>
        </div>
      )}

      {/* Card estado de conexión */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Estado de la integración
            {state.connected ? (
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                No conectado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-4">
          {state.connected && state.agencia && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <span className="text-muted-foreground">Agencia</span>
              <span className="font-medium">{state.agencia.nombre}</span>
              {state.agencia.plan && (
                <>
                  <span className="text-muted-foreground">Plan</span>
                  <span>{state.agencia.plan}</span>
                </>
              )}
              <span className="text-muted-foreground">Webhook configurado</span>
              <span>
                {state.webhook_configured ? (
                  <span className="text-green-600 font-medium">Sí</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </span>
            </div>
          )}

          {!state.connected && (
            <p className="text-sm text-muted-foreground">
              Conectá tu cuenta de Eve para que el agente conversacional pueda capturar leads
              y enviarlos automáticamente a este sistema.
            </p>
          )}

          {canWrite && (
            <Button
              onClick={handleConnect}
              disabled={loading}
              variant={state.connected ? "outline" : "default"}
              size="sm"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {state.connected ? "Reconectar" : "Conectar con Eve"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Card canales */}
      {state.connected && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-semibold">Canales activos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {!state.canales || state.canales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin canales configurados. Andá a la pestaña{" "}
                <a href="/eve/channels" className="underline underline-offset-2">Canales</a>{" "}
                para agregar uno.
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
                  {state.canales.map((canal) => (
                    <tr key={canal.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 capitalize">{canal.tipo}</td>
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
      )}
    </div>
  )
}
