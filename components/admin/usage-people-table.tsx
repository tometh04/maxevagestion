import { USAGE_ROLE_LABELS, isUsageRole } from "@/lib/analytics/roles"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"
import { EmptyState } from "@/components/admin/empty-state"
import { classifyUsage, formatLastSeen, type UsageByUserRow } from "@/lib/admin/usage"
import { cn } from "@/lib/utils"

type Props = {
  rows: UsageByUserRow[]
  days: number
}

/**
 * Drill-down por persona. Es el UNICO lugar del sistema con PII de un tenant, y
 * vive detras de `isPlatformAdmin()`.
 *
 * El nombre y el email NO estan en `usage_events`: salen del JOIN a `users` que
 * hace la RPC. El stream sigue sin PII.
 */
export function UsagePeopleTable({ rows, days }: Props) {
  if (rows.length === 0) {
    return <EmptyState title="Esta organizacion no tiene usuarios" />
  }

  const ranked = [...rows].sort(
    (a, b) => b.writes + b.reads - (a.writes + a.reads)
  )

  return (
    <DataTableShell>
      <DataTableHead>
        <DataTableRow>
          <DataTableTh>Persona</DataTableTh>
          <DataTableTh>Rol</DataTableTh>
          <DataTableTh>Agencia</DataTableTh>
          <DataTableTh className="text-right">Escrituras</DataTableTh>
          <DataTableTh className="text-right">Lecturas</DataTableTh>
          <DataTableTh className="text-right">Sesiones</DataTableTh>
          <DataTableTh className="text-right">
            Días activos <span className="normal-case">/ {days}</span>
          </DataTableTh>
          <DataTableTh className="text-right">Últ. login</DataTableTh>
          <DataTableTh>Uso</DataTableTh>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {ranked.map((row) => {
          const health = classifyUsage(row.last_event_at)
          const total = row.writes + row.reads
          return (
            <DataTableRow key={row.user_id} muted={total === 0 || !row.is_active}>
              <DataTableTd>
                <div className="font-medium text-foreground">
                  {row.name ?? "—"}
                  {row.is_platform_admin && (
                    // Tienen org_id de una agencia real: sin la marca, aparecen
                    // como el usuario mas activo del tenant y no son del tenant.
                    <span
                      className="ml-1.5 rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary"
                      title="Platform admin — no es personal de la agencia"
                    >
                      staff
                    </span>
                  )}
                  {!row.is_active && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      (inactivo)
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{row.email ?? "—"}</div>
              </DataTableTd>
              <DataTableTd className="text-xs">
                {row.role && isUsageRole(row.role)
                  ? USAGE_ROLE_LABELS[row.role]
                  : row.role ?? "—"}
              </DataTableTd>
              <DataTableTd className="text-xs text-muted-foreground">
                {row.agency_name ?? "—"}
              </DataTableTd>
              <DataTableTd className="text-right tabular-nums">
                {row.writes.toLocaleString("es-AR")}
              </DataTableTd>
              <DataTableTd className="text-right tabular-nums">
                {row.reads.toLocaleString("es-AR")}
              </DataTableTd>
              <DataTableTd className="text-right tabular-nums">
                {row.sessions || "—"}
              </DataTableTd>
              <DataTableTd className="text-right tabular-nums">
                {row.active_days}
              </DataTableTd>
              <DataTableTd className="whitespace-nowrap text-right text-xs text-muted-foreground">
                {formatLastSeen(row.last_login_at)}
              </DataTableTd>
              <DataTableTd>
                <span
                  className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px]", health.className)}
                >
                  {health.label}
                </span>
              </DataTableTd>
            </DataTableRow>
          )
        })}
      </DataTableBody>
    </DataTableShell>
  )
}
