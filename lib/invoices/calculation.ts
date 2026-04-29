export type InvoiceAmountEntryMode = "NET" | "FINAL"
export type ItemTaxTreatment = "GRAVADO" | "EXENTO" | "NO_GRAVADO"

export interface InvoiceCalculationItemInput {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje?: number
  iva_id?: number
  tax_treatment?: ItemTaxTreatment | null
}

export interface CalculatedInvoiceItem extends InvoiceCalculationItemInput {
  iva_id: number
  iva_porcentaje: number
  tax_treatment: ItemTaxTreatment
  subtotal: number
  iva_importe: number
  total: number
}

export interface CalculatedInvoiceTotals {
  imp_neto: number
  imp_iva: number
  imp_total: number
  imp_tot_conc: number
  imp_op_ex: number
  imp_trib: number
}

export interface CalculatedInvoice {
  amount_entry_mode: InvoiceAmountEntryMode
  items: CalculatedInvoiceItem[]
  totals: CalculatedInvoiceTotals
}

export const ITEM_TAX_TREATMENT_LABELS: Record<ItemTaxTreatment, string> = {
  GRAVADO: "Gravado",
  EXENTO: "Exento",
  NO_GRAVADO: "No gravado",
}

export const ITEM_TAX_TREATMENT_DESCRIPTIONS: Record<ItemTaxTreatment, string> = {
  GRAVADO: "Calcula IVA y va a neto gravado",
  EXENTO: "No calcula IVA y va a operaciones exentas",
  NO_GRAVADO: "No calcula IVA y va a conceptos no gravados",
}

export const IVA_PORCENTAJE_TO_ID: Record<number, number> = {
  0: 3,
  2.5: 9,
  5: 8,
  10.5: 4,
  21: 5,
  27: 6,
}

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

export function getRecommendedAmountEntryMode(
  cbteTipo?: number | null,
  receptorCondicionIva?: number | null
): InvoiceAmountEntryMode {
  return cbteTipo === 6 && receptorCondicionIva === 5 ? "FINAL" : "NET"
}

export function resolveAmountEntryMode(
  amountEntryMode?: InvoiceAmountEntryMode | null
): InvoiceAmountEntryMode {
  return amountEntryMode === "FINAL" ? "FINAL" : "NET"
}

export function normalizeTaxTreatment(
  taxTreatment?: ItemTaxTreatment | null,
  ivaPorcentaje?: number | null
): ItemTaxTreatment {
  if (taxTreatment === "EXENTO" || taxTreatment === "NO_GRAVADO" || taxTreatment === "GRAVADO") {
    return taxTreatment
  }

  return Number(ivaPorcentaje || 0) === 0 ? "EXENTO" : "GRAVADO"
}

export function shouldHideInvoiceTaxBreakdown(params: {
  amountEntryMode?: InvoiceAmountEntryMode | null
  cbteTipo?: number | null
  receptorCondicionIva?: number | null
}) {
  return (
    resolveAmountEntryMode(params.amountEntryMode) === "FINAL" &&
    params.cbteTipo === 6 &&
    params.receptorCondicionIva === 5
  )
}

export function calculateInvoice(items: InvoiceCalculationItemInput[], amountEntryMode?: InvoiceAmountEntryMode | null) {
  const resolvedMode = resolveAmountEntryMode(amountEntryMode)

  let impNeto = 0
  let impIva = 0
  let impTotal = 0
  let impTotConc = 0
  let impOpEx = 0

  const calculatedItems = items.map((item) => {
    const cantidad = Number(item.cantidad || 0)
    const precioUnitario = round2(Number(item.precio_unitario || 0))
    const taxTreatment = normalizeTaxTreatment(item.tax_treatment, item.iva_porcentaje)
    const ivaPorcentaje = taxTreatment === "GRAVADO" ? Number(item.iva_porcentaje || 0) : 0
    const ivaId = IVA_PORCENTAJE_TO_ID[ivaPorcentaje] ?? item.iva_id ?? 3
    const enteredLineAmount = round2(cantidad * precioUnitario)

    let subtotal = 0
    let ivaImporte = 0
    let total = 0

    if (taxTreatment !== "GRAVADO") {
      subtotal = enteredLineAmount
      total = enteredLineAmount
    } else if (resolvedMode === "FINAL") {
      total = enteredLineAmount
      subtotal = round2(total / (1 + ivaPorcentaje / 100))
      ivaImporte = round2(total - subtotal)
    } else {
      subtotal = enteredLineAmount
      ivaImporte = round2(subtotal * (ivaPorcentaje / 100))
      total = round2(subtotal + ivaImporte)
    }

    if (taxTreatment === "GRAVADO") {
      impNeto += subtotal
      impIva += ivaImporte
    } else if (taxTreatment === "EXENTO") {
      impOpEx += total
    } else {
      impTotConc += total
    }

    impTotal += total

    return {
      ...item,
      iva_id: ivaId,
      iva_porcentaje: ivaPorcentaje,
      tax_treatment: taxTreatment,
      subtotal,
      iva_importe: ivaImporte,
      total,
    }
  })

  return {
    amount_entry_mode: resolvedMode,
    items: calculatedItems,
    totals: {
      imp_neto: round2(impNeto),
      imp_iva: round2(impIva),
      imp_total: round2(impTotal),
      imp_tot_conc: round2(impTotConc),
      imp_op_ex: round2(impOpEx),
      imp_trib: 0,
    },
  } satisfies CalculatedInvoice
}

export function formatInvoiceMoney(value: number, currency?: string | null) {
  const normalizedCurrency = (currency || "PES").toUpperCase()
  const prefix = normalizedCurrency === "DOL" || normalizedCurrency === "USD" ? "USD " : "$ "
  return `${prefix}${round2(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
