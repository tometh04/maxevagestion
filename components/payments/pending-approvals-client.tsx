"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"

type Props = {
  userRole: string
  customerPayments: any[]
  operatorPayments: any[]
}

function fmtMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
  }).format(amount)
}

export function PendingApprovalsClient({ userRole, customerPayments, operatorPayments }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<{ id: string; entity: "payments" | "accounting/operator-payments" } | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  async function approve(id: string, entity: "payments" | "accounting/operator-payments") {
    setBusyId(id)
    try {
      const res = await fetch(`/api/${entity}/${id}/approve`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Pago aprobado")
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusyId(null)
    }
  }

  async function confirmReject() {
    if (!rejecting) return
    setBusyId(rejecting.id)
    try {
      const res = await fetch(`/api/${rejecting.entity}/${rejecting.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Pago rechazado")
      setRejecting(null)
      setRejectReason("")
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pagos clientes pendientes</CardTitle>
          <CardDescription>{customerPayments.length} pago{customerPayments.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {customerPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nada pendiente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operación</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-[200px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.operation?.file_code} · {p.operation?.destination}</TableCell>
                    <TableCell className="text-xs">{p.method}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(Number(p.amount), p.currency)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approve(p.id, "payments")} disabled={busyId === p.id}>
                          {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Aprobar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejecting({ id: p.id, entity: "payments" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Rechazar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos a operadores pendientes</CardTitle>
          <CardDescription>{operatorPayments.length} pago{operatorPayments.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {operatorPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nada pendiente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-[200px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.operator?.name}</TableCell>
                    <TableCell className="text-xs">{p.operation?.file_code}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(Number(p.amount), p.currency)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approve(p.id, "accounting/operator-payments")} disabled={busyId === p.id}>
                          {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Aprobar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejecting({ id: p.id, entity: "accounting/operator-payments" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Rechazar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar pago</DialogTitle>
            <DialogDescription>Ingresá el motivo del rechazo. El creador recibirá una notificación.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: monto erróneo, pago duplicado..." rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectReason.trim() || busyId !== null}>
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
