"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
import { productTypeLabel, normalizeProductType } from "@/lib/operations/product-types"
import type { PackageConsumingOperation, PackageWithAvailability } from "@/lib/packages/queries"
import { PackageFormDialog } from "./package-form-dialog"
import { QuotaMeter } from "./quota-meter"

interface PackageDetailClientProps {
  pkg: PackageWithAvailability
  operations: PackageConsumingOperation[]
  salesByCurrency: Record<string, number>
  agencies: Array<{ id: string; name: string }>
  canWrite: boolean
}

const money = (amount: number) =>
  amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatDateOnly(value: string | null): string {
  if (!value) return "—"
  // parseDateOnlyLocal evita el corrimiento de un día que produce `new Date()`
  // sobre una columna DATE en UTC-3; devuelve undefined si el valor no parsea.
  const parsed = parseDateOnlyLocal(value)
  if (!parsed) return value
  return format(parsed, "dd MMM yyyy", { locale: es })
}

const STATUS_LABEL: Record<string, string> = {
  RESERVED: "Reservada",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  TRAVELLING: "En viaje",
  TRAVELLED: "Viajada",
}

export function PackageDetailClient({
  pkg,
  operations,
  salesByCurrency,
  agencies,
  canWrite,
}: PackageDetailClientProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  const ventas = Object.entries(salesByCurrency).filter(([, total]) => Math.abs(total) > 0.005)
  const costoPorMoneda = pkg.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.cost_currency] = (acc[item.cost_currency] || 0) + item.cost
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{pkg.name}</h1>
            {pkg.status === "ACTIVE" ? (
              <Badge variant="outline">Abierto</Badge>
            ) : (
              <Badge variant="secondary">Cerrado</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {pkg.destination || "Sin destino"}
            {pkg.agency_name ? ` · ${pkg.agency_name}` : " · Todas las oficinas"}
            {pkg.departure_date
              ? ` · ${formatDateOnly(pkg.departure_date)} → ${formatDateOnly(pkg.return_date)}`
              : ""}
          </p>
        </div>

        {canWrite && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
        )}
      </div>

      {/* Franja de estado: una sola pieza dividida, no tarjetas repetidas. */}
      <div className="grid divide-y rounded-md border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="space-y-2 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plazas</p>
          <QuotaMeter
            consumed={pkg.availability.consumed}
            totalQuota={pkg.availability.total_quota}
            size="lg"
          />
          {pkg.availability.cancelled_bookings > 0 && (
            <p className="text-xs text-muted-foreground">
              {pkg.availability.cancelled_bookings} venta(s) cancelada(s) liberaron su lugar
            </p>
          )}
        </div>

        <div className="space-y-2 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendido</p>
          {ventas.length === 0 ? (
            <p className="text-2xl font-medium text-muted-foreground">—</p>
          ) : (
            <div className="space-y-0.5">
              {ventas.map(([currency, total]) => (
                <p key={currency} className="text-2xl font-medium tabular-nums">
                  <span className="text-base text-muted-foreground">{currency} </span>
                  {money(total)}
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {pkg.availability.active_bookings} operación(es) vigente(s)
          </p>
        </div>

        <div className="space-y-2 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio de lista</p>
          <p className="text-2xl font-medium tabular-nums">
            {pkg.sale_amount_total === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <>
                <span className="text-base text-muted-foreground">{pkg.sale_currency} </span>
                {money(pkg.sale_amount_total)}
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Costo de las patas:{" "}
            {Object.entries(costoPorMoneda).length === 0
              ? "—"
              : Object.entries(costoPorMoneda)
                  .map(([currency, total]) => `${currency} ${money(total)}`)
                  .join(" · ")}
          </p>
        </div>
      </div>

      {pkg.notes && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Notas</p>
          <p className="whitespace-pre-wrap">{pkg.notes}</p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Patas del paquete</h2>
        {pkg.items.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Este paquete todavía no tiene operadores cargados.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pkg.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.operator_name || "—"}</TableCell>
                    <TableCell>
                      {item.product_type
                        ? productTypeLabel(normalizeProductType(item.product_type))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.cost_currency} {money(item.cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.sale_amount ? money(item.sale_amount) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Operaciones que consumieron cupo</h2>
        {operations.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no se vendió ninguna plaza de este paquete.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operación</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead className="text-right">Plazas</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((op) => (
                  <TableRow
                    key={op.operation_id}
                    className={op.consumes_quota ? undefined : "text-muted-foreground"}
                  >
                    <TableCell>
                      <Link
                        href={`/operations/${op.operation_id}`}
                        className="font-medium hover:underline"
                      >
                        {op.file_code || op.operation_id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{op.destination || "—"}</div>
                    </TableCell>
                    <TableCell>{op.seller_name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDateOnly(op.departure_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{op.seats}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {op.sale_amount_total === null
                        ? "—"
                        : `${op.sale_currency || ""} ${money(op.sale_amount_total)}`}
                    </TableCell>
                    <TableCell>
                      {op.consumes_quota ? (
                        <Badge variant="outline">{STATUS_LABEL[op.status] || op.status}</Badge>
                      ) : (
                        // No se oculta: es la única forma de entender por qué
                        // bajó el número de plazas vendidas.
                        <Badge variant="secondary">Cancelada · cupo liberado</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PackageFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => router.refresh()}
        agencies={agencies}
        packageId={pkg.id}
      />
    </div>
  )
}
