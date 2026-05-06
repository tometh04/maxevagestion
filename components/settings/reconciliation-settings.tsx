"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

interface OrphanPayment {
  id: string
  operation_id: string | null
  payer_type: "CUSTOMER" | "OPERATOR"
  direction: "INCOME" | "EXPENSE"
  method: string | null
  amount: number | string
  currency: "ARS" | "USD"
  date_paid: string | null
  approval_status: string | null
  approved_at: string | null
  created_at: string
  operations?: { id: string; file_code: string | null; destination: string | null } | null
}

interface OrphanOperatorPayment {
  id: string
  operation_id: string | null
  operator_id: string | null
  amount: number | string
  paid_amount: number | string | null
  currency: "ARS" | "USD"
  approval_status: string | null
  approved_at: string | null
  created_at: string
  operations?: { id: string; file_code: string | null; destination: string | null } | null
  operators?: { id: string; name: string | null } | null
}

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

function formatMoney(value: number | string | null | undefined, currency: string) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
  }).format(n)
}

export function ReconciliationSettings() {
  const [checks, setChecks] = useState<Check[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [orphanPayments, setOrphanPayments] = useState<OrphanPayment[]>([])
  const [orphanOpPayments, setOrphanOpPayments] = useState<OrphanOperatorPayment[]>([])
  const [loadingOrphans, setLoadingOrphans] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())
  const [selectedOpPayments, setSelectedOpPayments] = useState<Set<string>>(new Set())

  const fetchOrphans = async () => {
    setLoadingOrphans(true)
    try {
      const res = await fetch("/api/payments/orphans")
      if (!res.ok) throw new Error("Error obteniendo huérfanos")
      const data = await res.json()
      setOrphanPayments(data.payments || [])
      setOrphanOpPayments(data.operator_payments || [])
    } catch (e: any) {
      toast.error(e.message || "Error obteniendo pagos huérfanos")
    } finally {
      setLoadingOrphans(false)
    }
  }

  useEffect(() => {
    fetchOrphans()
  }, [])

  const togglePayment = (id: string) => {
    setSelectedPayments((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleOpPayment = (id: string) => {
    setSelectedOpPayments((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllPayments = () => {
    if (selectedPayments.size === orphanPayments.length) {
      setSelectedPayments(new Set())
    } else {
      setSelectedPayments(new Set(orphanPayments.map((p) => p.id)))
    }
  }

  const selectAllOpPayments = () => {
    if (selectedOpPayments.size === orphanOpPayments.length) {
      setSelectedOpPayments(new Set())
    } else {
      setSelectedOpPayments(new Set(orphanOpPayments.map((p) => p.id)))
    }
  }

  const revertSelected = async () => {
    const totalSelected = selectedPayments.size + selectedOpPayments.size
    if (totalSelected === 0) {
      toast.error("Seleccioná al menos un pago para revertir")
      return
    }

    if (
      !confirm(
        `¿Revertir ${totalSelected} pago(s) huérfano(s) a estado PENDING? ` +
          `Después podés re-procesarlos vía "Marcar como cobrado" / "Registrar Pago" eligiendo cuenta financiera.`
      )
    ) {
      return
    }

    setReverting(true)
    try {
      const res = await fetch("/api/payments/orphans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIds: Array.from(selectedPayments),
          operatorPaymentIds: Array.from(selectedOpPayments),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error revirtiendo pagos")

      toast.success(
        `Revertidos: ${data.revertedPayments} pagos cliente + ${data.revertedOpPayments} pagos a operador. ` +
          `Refrescá el detalle de cada operación para procesarlos.`
      )
      setSelectedPayments(new Set())
      setSelectedOpPayments(new Set())
      await fetchOrphans()
    } catch (e: any) {
      toast.error(e.message || "Error revirtiendo pagos")
    } finally {
      setReverting(false)
    }
  }

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

  const totalOrphans = orphanPayments.length + orphanOpPayments.length
  const totalSelected = selectedPayments.size + selectedOpPayments.size

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

      {/* Pagos huérfanos: status=PAID pero sin ledger_movement_id.
          Generados antes del fix Yamil 2026-05-05 (approve flipeaba PAID
          sin disparar mark-paid). Permite revertir a PENDING para re-procesar. */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4" />
                Pagos huérfanos detectados
                {totalOrphans > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {totalOrphans}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Pagos marcados PAID en la base pero sin movimiento contable asociado.
                Bug detectado el 2026-05-05 en el flow de aprobación. Revertir a PENDING
                permite re-procesarlos vía &quot;Marcar como cobrado&quot; / &quot;Registrar Pago&quot;
                eligiendo cuenta financiera para que se actualicen saldos, libro mayor y
                deudas a operadores.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrphans}
              disabled={loadingOrphans}
            >
              {loadingOrphans ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingOrphans ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Cargando huérfanos…
            </p>
          ) : totalOrphans === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              ✓ No hay pagos huérfanos. Sistema consistente.
            </p>
          ) : (
            <div className="space-y-4">
              {orphanPayments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      Pagos cliente / operador (tabla payments) — {orphanPayments.length}
                    </h4>
                    <Button variant="ghost" size="sm" onClick={selectAllPayments}>
                      {selectedPayments.size === orphanPayments.length
                        ? "Deseleccionar todos"
                        : "Seleccionar todos"}
                    </Button>
                  </div>
                  <div className="border rounded-md max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 w-8"></th>
                          <th className="text-left p-2">Operación</th>
                          <th className="text-left p-2">Tipo</th>
                          <th className="text-right p-2">Monto</th>
                          <th className="text-left p-2">Aprobado</th>
                          <th className="text-left p-2">Creado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {orphanPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2">
                              <Checkbox
                                checked={selectedPayments.has(p.id)}
                                onCheckedChange={() => togglePayment(p.id)}
                              />
                            </td>
                            <td className="p-2">
                              <div className="font-medium">
                                {p.operations?.file_code || p.operation_id?.slice(0, 8) || "—"}
                              </div>
                              <div className="text-muted-foreground">
                                {p.operations?.destination || ""}
                              </div>
                            </td>
                            <td className="p-2">
                              {p.payer_type === "CUSTOMER" ? "Cobro" : "Pago a op."} ·{" "}
                              {p.method || "—"}
                            </td>
                            <td className="p-2 text-right font-mono">
                              {formatMoney(p.amount, p.currency)}
                            </td>
                            <td className="p-2">
                              {p.approved_at
                                ? new Date(p.approved_at).toLocaleDateString("es-AR")
                                : "—"}
                            </td>
                            <td className="p-2">
                              {new Date(p.created_at).toLocaleDateString("es-AR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {orphanOpPayments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      Deudas a operadores (operator_payments) — {orphanOpPayments.length}
                    </h4>
                    <Button variant="ghost" size="sm" onClick={selectAllOpPayments}>
                      {selectedOpPayments.size === orphanOpPayments.length
                        ? "Deseleccionar todos"
                        : "Seleccionar todos"}
                    </Button>
                  </div>
                  <div className="border rounded-md max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 w-8"></th>
                          <th className="text-left p-2">Operador</th>
                          <th className="text-left p-2">Operación</th>
                          <th className="text-right p-2">Monto</th>
                          <th className="text-left p-2">Aprobado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {orphanOpPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2">
                              <Checkbox
                                checked={selectedOpPayments.has(p.id)}
                                onCheckedChange={() => toggleOpPayment(p.id)}
                              />
                            </td>
                            <td className="p-2 font-medium">
                              {p.operators?.name || p.operator_id?.slice(0, 8) || "—"}
                            </td>
                            <td className="p-2">
                              <div>
                                {p.operations?.file_code || p.operation_id?.slice(0, 8) || "—"}
                              </div>
                              <div className="text-muted-foreground">
                                {p.operations?.destination || ""}
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono">
                              {formatMoney(p.amount, p.currency)}
                            </td>
                            <td className="p-2">
                              {p.approved_at
                                ? new Date(p.approved_at).toLocaleDateString("es-AR")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  {totalSelected > 0
                    ? `${totalSelected} seleccionado(s) para revertir`
                    : "Seleccioná los pagos a revertir a PENDING"}
                </p>
                <Button
                  onClick={revertSelected}
                  disabled={reverting || totalSelected === 0}
                  variant="destructive"
                >
                  {reverting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Revirtiendo...
                    </>
                  ) : (
                    <>
                      <Wrench className="h-4 w-4 mr-2" />
                      Revertir {totalSelected > 0 ? `${totalSelected} ` : ""}seleccionados a PENDING
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
