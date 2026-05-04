"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

interface Check {
  id: string
  name: string
  description: string
  status: "ok" | "warning" | "error"
  expected?: string
  actual?: string
  difference?: string
  details?: string
}

interface Summary {
  total: number
  ok: number
  warnings: number
  errors: number
  checkedAt: string
}

const statusConfig = {
  ok: {
    icon: CheckCircle2,
    color: "text-success dark:text-success",
    bg: "bg-success/5 dark:bg-success/30 border-success/15 dark:border-success",
    badge: "bg-success/10 text-success dark:bg-success dark:text-success",
    label: "OK",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-accent-coral dark:text-accent-coral",
    bg: "bg-accent-coral/5 dark:bg-accent-coral/30 border-accent-coral/15 dark:border-accent-coral",
    badge: "bg-accent-coral/10 text-accent-coral dark:bg-accent-coral dark:text-accent-coral",
    label: "Atención",
  },
  error: {
    icon: XCircle,
    color: "text-destructive dark:text-destructive",
    bg: "bg-destructive/5 dark:bg-destructive/30 border-destructive/15 dark:border-destructive",
    badge: "bg-destructive/10 text-destructive dark:bg-destructive dark:text-destructive",
    label: "Error",
  },
}

export function ReconciliationSettings() {
  const [checks, setChecks] = useState<Check[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  const runReconciliation = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/audit-logs/reconciliation")
      if (!response.ok) throw new Error("Error al ejecutar verificación")

      const data = await response.json()
      setChecks(data.checks || [])
      setSummary(data.summary || null)
      setHasRun(true)

      if (data.summary?.errors > 0) {
        toast.error(`Se encontraron ${data.summary.errors} error(es) en la verificación`)
      } else if (data.summary?.warnings > 0) {
        toast.warning(`${data.summary.warnings} advertencia(s) encontradas`)
      } else {
        toast.success("Todas las verificaciones pasaron correctamente")
      }
    } catch (error) {
      console.error("Error running reconciliation:", error)
      toast.error("Error al ejecutar la verificación de integridad")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reconciliación</h2>
          <p className="text-sm text-muted-foreground">
            Verifica la integridad contable del sistema comparando balances, pagos y movimientos.
          </p>
        </div>
        <Button onClick={runReconciliation} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Verificando...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4 mr-2" />
              {hasRun ? "Verificar de nuevo" : "Ejecutar verificación"}
            </>
          )}
        </Button>
      </div>

      {!hasRun && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mb-3" />
            <p className="text-sm font-medium">Verificación de integridad contable</p>
            <p className="text-xs mt-1">Presioná el botón para ejecutar las verificaciones</p>
          </CardContent>
        </Card>
      )}

      {/* Resumen */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-success/15 dark:border-success">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="text-2xl font-bold text-success">{summary.ok}</p>
                <p className="text-xs text-muted-foreground">Correctos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-accent-coral/15 dark:border-accent-coral">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <AlertTriangle className="h-5 w-5 text-accent-coral" />
              <div>
                <p className="text-2xl font-bold text-accent-coral">{summary.warnings}</p>
                <p className="text-xs text-muted-foreground">Advertencias</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive/15 dark:border-destructive">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <XCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold text-destructive">{summary.errors}</p>
                <p className="text-xs text-muted-foreground">Errores</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Checks individuales */}
      {checks.length > 0 && (
        <div className="space-y-3">
          {checks.map((check) => {
            const config = statusConfig[check.status]
            const Icon = config.icon

            return (
              <Card key={check.id} className={`border ${config.bg}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{check.name}</span>
                        <Badge variant="secondary" className={`text-[10px] ${config.badge}`}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{check.description}</p>

                      {(check.expected || check.actual) && (
                        <div className="grid grid-cols-3 gap-2 text-xs bg-background/50 rounded-md p-2 mb-1.5">
                          {check.expected && (
                            <div>
                              <span className="text-muted-foreground">Esperado: </span>
                              <span className="font-medium">{check.expected}</span>
                            </div>
                          )}
                          {check.actual && (
                            <div>
                              <span className="text-muted-foreground">Actual: </span>
                              <span className="font-medium">{check.actual}</span>
                            </div>
                          )}
                          {check.difference && (
                            <div>
                              <span className="text-muted-foreground">Diferencia: </span>
                              <span className={`font-medium ${check.status !== "ok" ? config.color : ""}`}>
                                {check.difference}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {check.details && (
                        <p className="text-xs text-muted-foreground italic">{check.details}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {summary && (
        <p className="text-xs text-muted-foreground text-center">
          Última verificación: {new Date(summary.checkedAt).toLocaleString("es-AR")}
        </p>
      )}
    </div>
  )
}
