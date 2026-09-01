/**
 * Extracto de cuenta corriente — el PDF.
 *
 * Es el papel que la agencia le manda a un cliente que discute su saldo, o a un
 * operador que reclama un pago. Por eso el saldo final va destacado arriba y el
 * detalle abajo: el que lo recibe quiere primero el número y después el porqué.
 */
import {
  fmtDate,
  ReportPdfBuilder,
  REPORT_COLORS,
  REPORT_GEOMETRY,
  type ReportPdfCompany,
} from "./report-kit"
import type { CuentaCorriente, RenglonDelExtracto } from "@/lib/accounting/current-account"

const { MARGIN, RIGHT } = REPORT_GEOMETRY

const plata = (n: number) =>
  n === 0 ? "" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ETIQUETA: Record<string, string> = {
  VENTA: "Venta",
  COBRO: "Cobro",
  DEVOLUCION: "Devolución",
  COSTO: "Costo",
  PAGO: "Pago",
  AJUSTE: "Ajuste",
}

export interface CurrentAccountPdfParams {
  contraparte: string
  tipo: "CLIENTE" | "OPERADOR"
  cuentas: CuentaCorriente[]
  company: ReportPdfCompany
  generatedAt?: Date
}

/**
 * Cómo se lee un saldo, dicho con palabras y no con un signo.
 *
 * Un "−180" obliga al que recibe el papel a deducir de qué lado está. Escribirlo
 * evita la discusión que el extracto vino a terminar.
 */
function leyendaDelSaldo(saldo: number, tipo: "CLIENTE" | "OPERADOR", moneda: string): string {
  const abs = Math.abs(saldo).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (Math.abs(saldo) < 0.01) return "Sin saldo pendiente"
  if (saldo > 0) {
    return tipo === "CLIENTE" ? `Nos debe ${moneda} ${abs}` : `Nos debe ${moneda} ${abs}`
  }
  return tipo === "CLIENTE" ? `Le debemos ${moneda} ${abs}` : `Le debemos ${moneda} ${abs}`
}

export function generateCurrentAccountPdf({
  contraparte,
  tipo,
  cuentas,
  company,
  generatedAt = new Date(),
}: CurrentAccountPdfParams): ArrayBuffer {
  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "CUENTA CORRIENTE",
    subtitle: contraparte,
    meta: tipo === "CLIENTE" ? "Cliente" : "Operador",
    continuationLine: `Cuenta corriente · ${contraparte}`,
  })

  b.coverBand()

  if (cuentas.length === 0) {
    b.emptyState(
      "Sin movimientos",
      "No hay operaciones ni pagos registrados para esta cuenta."
    )
    return b.finish()
  }

  // El saldo de cada moneda, arriba de todo: es lo primero que se busca.
  b.kpiRow(
    cuentas.map((c, i) => ({
      label: `Saldo en ${c.currency}`,
      value: leyendaDelSaldo(c.saldoFinal, tipo, c.currency),
      hint: `${c.renglones.length} ${c.renglones.length === 1 ? "movimiento" : "movimientos"}`,
      accent: i === 0,
    }))
  )

  for (const c of cuentas) {
    b.sectionTitle(
      `Movimientos en ${c.currency}`,
      leyendaDelSaldo(c.saldoFinal, tipo, c.currency)
    )

    b.table<RenglonDelExtracto>({
      rows: c.renglones,
      rowHeight: 5.5,
      fontSize: 7.5,
      columns: [
        { header: "Fecha", x: MARGIN, width: 20, cell: (r) => fmtDate(r.fecha) },
        { header: "Tipo", x: MARGIN + 22, width: 22, cell: (r) => ETIQUETA[r.tipo] ?? r.tipo },
        { header: "Operación", x: MARGIN + 46, width: 30, cell: (r) => r.operacion ?? "" },
        { header: "Detalle", x: MARGIN + 78, width: 40, cell: (r) => r.detalle },
        { header: "Debe", x: RIGHT - 52, align: "right", cell: (r) => plata(r.debe) },
        { header: "Haber", x: RIGHT - 26, align: "right", cell: (r) => plata(r.haber) },
        {
          header: "Saldo",
          x: RIGHT,
          align: "right",
          bold: true,
          cell: (r) => plata(r.saldo) || "0,00",
          // El saldo a favor de la contraparte se pinta distinto: es la
          // situación que hay que notar al recorrer la columna.
          color: (r) => (r.saldo < 0 ? REPORT_COLORS.DANGER : REPORT_COLORS.DARK),
        },
      ],
      total: {
        accent: true,
        cells: [
          { x: MARGIN, text: `Totales en ${c.currency}` },
          { x: RIGHT - 52, align: "right", text: plata(c.totalDebe) },
          { x: RIGHT - 26, align: "right", text: plata(c.totalHaber) },
          { x: RIGHT, align: "right", text: plata(c.saldoFinal) || "0,00" },
        ],
      },
    })
  }

  b.note(
    "El saldo de esta cuenta netea todas las operaciones: un excedente pagado en un viaje se descuenta de lo adeudado por otro. La ficha de cada operación, en cambio, muestra su deuda por separado y nunca en negativo."
  )

  return b.finish()
}
