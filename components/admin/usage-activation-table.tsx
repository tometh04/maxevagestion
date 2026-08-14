import Link from "next/link"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"
import { EmptyState } from "@/components/admin/empty-state"
import type { UsageActivationRow } from "@/lib/admin/usage"

type Props = { rows: UsageActivationRow[] }

/**
 * Cuanto tarda una agencia nueva en darle valor al producto.
 *
 * Las orgs migradas se muestran aparte y NO entran en la mediana: entraron con
 * datos historicos, asi que su primera operacion es anterior al alta y dan dias
 * negativos (una llega a -344). Promediarlas destruye la metrica.
 */
export function UsageActivationTable({ rows }: Props) {
  const withData = rows.filter((r) => r.days_to_first_operation !== null)
  if (withData.length === 0) {
    return <EmptyState title="Sin datos de activacion" />
  }

  const cohort = withData
    .filter((r) => !r.is_migrated)
    .sort((a, b) => (a.days_to_first_operation ?? 0) - (b.days_to_first_operation ?? 0))
  const migrated = withData.filter((r) => r.is_migrated)
  const median = medianOf(cohort.map((r) => r.days_to_first_operation ?? 0))

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Mediana hasta la primera operación:{" "}
        <span className="font-medium text-foreground">
          {median === null ? "—" : `${median} días`}
        </span>{" "}
        sobre {cohort.length} organizaciones.
        {migrated.length > 0 && (
          <> {migrated.length} migrada(s) quedan fuera del cálculo.</>
        )}
      </p>

      <DataTableShell>
        <DataTableHead>
          <DataTableRow>
            <DataTableTh>Organización</DataTableTh>
            <DataTableTh>Billing</DataTableTh>
            <DataTableTh className="text-right">Días a 1ª operación</DataTableTh>
            <DataTableTh className="text-right">Días a 1er pago</DataTableTh>
            <DataTableTh>{""}</DataTableTh>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {[...cohort, ...migrated].map((row) => (
            <DataTableRow key={row.org_id} muted={row.is_migrated}>
              <DataTableTd>
                <Link
                  href={`/admin/usage?org=${row.org_id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {row.org_name ?? "—"}
                </Link>
              </DataTableTd>
              <DataTableTd className="text-xs text-muted-foreground">
                {row.subscription_status ?? "—"}
              </DataTableTd>
              <DataTableTd className="text-right tabular-nums">
                {formatDays(row.days_to_first_operation)}
              </DataTableTd>
              <DataTableTd className="text-right tabular-nums">
                {formatDays(row.days_to_first_payment)}
              </DataTableTd>
              <DataTableTd>
                {row.is_migrated && (
                  <span
                    className="rounded bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    title="Entró con datos históricos: su primera operación es anterior al alta"
                  >
                    migrada
                  </span>
                )}
              </DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTableShell>
    </div>
  )
}

function formatDays(days: number | null): string {
  if (days === null) return "—"
  if (days < 0) return `${days}`
  return `${days}`
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return Math.round(value * 10) / 10
}
