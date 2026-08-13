import {
  DOW_LABELS,
  USAGE_RAMP as RAMP,
  heatLevel,
  type UsageByHourRow,
} from "@/lib/admin/usage"

type Props = {
  rows: UsageByHourRow[]
  days: number
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/**
 * Cuando se usa el producto: dia de semana x hora, en hora de Buenos Aires (la
 * conversion la hace la RPC; en UTC el pico de la tarde argentina cae despues
 * de medianoche y el mapa queda ilegible).
 *
 * Sin numeros en la celda: 168 celdas con label no se leen. El valor va en el
 * tooltip nativo y el total por franja se lee del color.
 */
export function UsageHoursHeatmap({ rows, days }: Props) {
  const byCell = new Map<string, number>()
  let max = 0
  for (const r of rows) {
    byCell.set(`${r.dow}:${r.hour}`, r.events)
    if (r.events > max) max = r.events
  }

  if (max === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin actividad registrada en los ultimos {days} dias.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[1px]">
        <caption className="sr-only">
          Eventos por dia de semana y hora (America/Argentina/Buenos_Aires), ultimos {days} dias
        </caption>
        <thead>
          <tr>
            <th className="w-8" />
            {HOURS.map((h) => (
              <th
                key={h}
                scope="col"
                className="text-center text-[9px] font-normal text-muted-foreground"
              >
                {h % 3 === 0 ? h : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOW_LABELS.map((label, i) => {
            const dow = i + 1 // ISODOW: 1 = lunes
            return (
              <tr key={dow}>
                <th
                  scope="row"
                  className="pr-2 text-right text-[10px] font-normal text-muted-foreground"
                >
                  {label}
                </th>
                {HOURS.map((h) => {
                  const events = byCell.get(`${dow}:${h}`) ?? 0
                  const tone = RAMP[heatLevel(events, max)]
                  return (
                    <td key={h}>
                      <div
                        title={`${label} ${String(h).padStart(2, "0")}:00 — ${events} eventos`}
                        className="h-5 w-[22px] rounded-[2px]"
                        style={{ backgroundColor: tone.bg }}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
