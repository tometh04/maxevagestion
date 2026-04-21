interface Event {
  id: string
  created_at: string
  event_type: string
  amount_cents: number | null
  currency: string | null
  status: string | null
}

const LABELS: Record<string, string> = {
  CHECKOUT_INITIATED: "Checkout iniciado",
  SUBSCRIPTION_CREATED: "Suscripción creada",
  SUBSCRIPTION_AUTHORIZED: "Suscripción autorizada",
  PAYMENT_APPROVED: "Cobro aprobado",
  PAYMENT_REJECTED: "Cobro rechazado",
  SUBSCRIPTION_CANCELLED: "Suscripción cancelada",
  SUBSCRIPTION_CANCELLED_BY_USER: "Cancelada por vos",
  SUBSCRIPTION_PAUSED: "Suscripción pausada",
  SUBSCRIPTION_FINISHED: "Suscripción finalizada",
  RECONCILED: "Sincronizado con MP",
}

function fmtAmount(cents: number | null, currency: string | null): string {
  if (cents == null) return "—"
  return `$${(cents / 100).toLocaleString("es-AR")} ${currency || ""}`.trim()
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function BillingHistoryTable({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay movimientos todavía.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="text-left py-2">Fecha</th>
            <th className="text-left py-2">Evento</th>
            <th className="text-right py-2">Monto</th>
            <th className="text-left py-2 pl-4">Estado</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b last:border-0">
              <td className="py-2">{fmtDate(e.created_at)}</td>
              <td>{LABELS[e.event_type] || e.event_type}</td>
              <td className="text-right">{fmtAmount(e.amount_cents, e.currency)}</td>
              <td className="pl-4 text-muted-foreground">{e.status || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
