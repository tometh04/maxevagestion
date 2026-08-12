/**
 * Comprobante de liquidación al referidor (VIB-86).
 *
 * Función pura sobre `lib/pdf/report-kit.ts`: recibe la liquidación ya resuelta
 * y el branding del tenant, y devuelve el PDF.
 *
 * Para qué sirve: el referidor es un tercero externo (otra agencia que deriva
 * clientes), no un empleado. Cuando cobra necesita poder conciliar de dónde sale
 * el total — qué ventas entraron, con qué ganancia y a qué porcentaje. Sin esto,
 * la agencia le pasa un número suelto.
 */

import type { ReportCompany } from "@/lib/reports/report-company"
import {
  REPORT_COLORS,
  REPORT_GEOMETRY,
  ReportPdfBuilder,
  fmtDate,
  fmtDateTime,
  fmtMoney,
} from "@/lib/pdf/report-kit"

const { DARK, GRAY } = REPORT_COLORS
const { MARGIN, RIGHT } = REPORT_GEOMETRY

export interface ReferralSettlementPdfLine {
  /** Legajo de la operación. */
  fileCode: string | null
  destination: string | null
  customerName: string | null
  departureDate: string | null
  /** Ganancia sobre la que se calculó la comisión. */
  baseAmount: number
  percentage: number
  amount: number
}

export interface ReferralSettlementPdfData {
  id: string
  partnerName: string
  currency: string
  amount: number
  commissionsCount: number
  accountName: string
  accountCurrency: string
  cashAmount: number
  exchangeRate: number | null
  periodFrom: string | null
  periodTo: string | null
  paidAt: string
  notes: string | null
  status: string
  isRegularization: boolean
  lines: ReferralSettlementPdfLine[]
}

export interface ReferralSettlementPdfParams {
  settlement: ReferralSettlementPdfData
  company: ReportCompany
  generatedAt?: Date
}

/** Tope de filas del detalle. Si se supera, el PDF lo dice en vez de recortar en silencio. */
const MAX_DETAIL_ROWS = 400

export function generateReferralSettlementPdf({
  settlement,
  company,
  generatedAt = new Date(),
}: ReferralSettlementPdfParams): ArrayBuffer {
  const money = (amount: number) => fmtMoney(amount, settlement.currency)
  const periodo =
    settlement.periodFrom && settlement.periodTo
      ? settlement.periodFrom === settlement.periodTo
        ? fmtDate(settlement.periodFrom)
        : `${fmtDate(settlement.periodFrom)}  –  ${fmtDate(settlement.periodTo)}`
      : "Sin período"

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "LIQUIDACIÓN A REFERIDOR",
    subtitle: settlement.partnerName,
    meta: `Moneda: ${settlement.currency}`,
    continuationLine: `Liquidación · ${settlement.partnerName} · ${periodo}`,
  })

  b.coverBand()

  b.filtersLine([
    `Referidor: ${settlement.partnerName}`,
    `Período: ${periodo}`,
    `Pagado: ${fmtDate(settlement.paidAt.slice(0, 10))}`,
    `Generado: ${fmtDateTime(generatedAt)}`,
  ])

  // Cuánto salió de la cuenta. Cuando la moneda de la cuenta difiere de la de
  // las comisiones, el número que le importa a la agencia no es el mismo que el
  // que le importa al referidor, así que se muestran los dos.
  const cruzaMoneda = settlement.accountCurrency !== settlement.currency
  b.kpiRow([
    {
      label: "Total liquidado",
      value: money(settlement.amount),
      hint: `${settlement.commissionsCount} venta${settlement.commissionsCount === 1 ? "" : "s"}`,
      accent: true,
    },
    {
      label: "Salió de",
      value: settlement.accountName,
      hint: cruzaMoneda
        ? `${fmtMoney(settlement.cashAmount, settlement.accountCurrency)} · TC ${settlement.exchangeRate ?? "—"}`
        : fmtMoney(settlement.cashAmount, settlement.accountCurrency),
    },
    {
      label: "Fecha de pago",
      value: fmtDate(settlement.paidAt.slice(0, 10)),
      hint: settlement.status === "REVERTED" ? "Liquidación REVERTIDA" : "Liquidación vigente",
    },
  ])

  if (settlement.status === "REVERTED") {
    b.note(
      "Esta liquidación fue REVERTIDA. El pago se contra-asentó y las comisiones volvieron a su " +
        "estado anterior. El comprobante se conserva sólo como constancia de lo que se había liquidado."
    )
  } else if (settlement.isRegularization) {
    b.note(
      "Regularización: estas comisiones ya figuraban como pagadas y esta liquidación registró la " +
        "salida de caja que faltaba. No implica un segundo pago al referidor."
    )
  }

  if (settlement.lines.length === 0) {
    b.emptyState(
      "Sin detalle disponible",
      "La liquidación no tiene comisiones asociadas. Puede haber sido revertida."
    )
    return b.finish()
  }

  b.sectionTitle(
    "Detalle de las ventas liquidadas",
    `Comisión calculada sobre la ganancia de cada venta`
  )

  const filas = settlement.lines.slice(0, MAX_DETAIL_ROWS)

  b.table({
    rows: filas,
    columns: [
      {
        header: "LEGAJO",
        x: MARGIN + 2,
        width: 32,
        cell: (l) => l.fileCode || "—",
        color: () => DARK,
      },
      {
        header: "DESTINO",
        x: MARGIN + 36,
        width: 38,
        cell: (l) => l.destination || "—",
      },
      {
        header: "PASAJERO",
        x: MARGIN + 76,
        width: 40,
        cell: (l) => l.customerName || "—",
      },
      {
        header: "GANANCIA",
        x: RIGHT - 52,
        align: "right",
        cell: (l) => money(l.baseAmount),
      },
      {
        header: "%",
        x: RIGHT - 28,
        align: "right",
        cell: (l) => `${l.percentage}%`,
      },
      {
        header: "COMISIÓN",
        x: RIGHT,
        align: "right",
        cell: (l) => money(l.amount),
        bold: true,
        color: () => DARK,
      },
    ],
    zebra: true,
    total: {
      accent: true,
      cells: [
        { x: MARGIN + 2, text: `TOTAL · ${settlement.commissionsCount} venta(s)` },
        { x: RIGHT, align: "right", text: money(settlement.amount) },
      ],
    },
  })

  if (settlement.lines.length > filas.length) {
    b.note(
      `El detalle muestra las primeras ${filas.length} de ${settlement.lines.length} ventas ` +
        `liquidadas. El total del encabezado sí incluye todas.`
    )
  }

  if (settlement.notes) {
    b.sectionTitle("Observaciones")
    b.doc.setFontSize(9)
    b.setText(GRAY)
    const wrapped = b.doc.splitTextToSize(settlement.notes, RIGHT - MARGIN - 4) as string[]
    for (const linea of wrapped) {
      b.ensure(6)
      b.doc.text(linea, MARGIN + 2, b.y)
      b.y += 5
    }
  }

  return b.finish()
}
