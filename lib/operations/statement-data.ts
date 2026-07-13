/**
 * Assembler del "Detalle de la Operación" (Liquidación de Servicios) para
 * enviar al pasajero como comprobante de la reserva confirmada.
 *
 * CONTEXTO (2026-07-07): una clienta pidió replicar la "Liquidación de
 * Servicios" de su sistema anterior (Savia): una vez reservada la operación,
 * mandarle al pasajero por email un PDF con QUÉ servicios contrató, A QUÉ VALOR
 * y HASTA CUÁNDO tiene para pagar (vencimiento). La cotización pública no sirve
 * porque puede diferir de lo finalmente contratado; esto refleja la operación
 * real.
 *
 * Este módulo SOLO arma los datos (lectura). El render del PDF vive en
 * `lib/pdf/operation-statement-pdf.ts` y los endpoints en
 * `app/api/operations/[id]/statement/*`.
 *
 * Fuentes de datos (ver page.tsx del detalle de operación):
 *   - Servicios base:       operation_operators (product_type + sale_amount)
 *   - Servicios adicionales: operation_services (solo si la flag de servicios
 *                            en la venta está ON, para que el total y las líneas
 *                            listadas queden consistentes)
 *   - Total a pagar:         operations.sale_amount_total (+ serviceExtra si flag)
 *   - Vencimiento:           min(operator_payments.due_date no-PAID), fallback
 *                            min(payments.date_due pendientes del cliente)
 *   - Branding:              organization_settings (key/value)
 *
 * Multi-tenant: TODAS las queries scopeadas por org_id explícito (regla de oro
 * de CLAUDE.md; no confiar en RLS). `operation_legs` no tiene org_id → se
 * scopea por agency_id de la operación.
 */

import { roundMoney } from "@/lib/currency"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import {
  FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL,
} from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"

export interface StatementCompany {
  name: string
  address: string
  phone: string
  website: string
  taxId: string
  email: string
  logo: string
}

export interface StatementServiceLine {
  /** Etiqueta del tipo de servicio, ya legible (ej. "ALOJAMIENTO", "Asistencia"). */
  label: string
  /** Detalle (nombre del operador / descripción libre). */
  description: string
  /** Cantidad (nº de pasajeros de la operación). */
  quantity: number
  /** Importe de venta de la línea (null si no hay monto informado). */
  amount: number | null
  currency: string
}

export interface OperationStatementData {
  operationId: string
  company: StatementCompany
  // Cabecera de la operación
  fileCode: string
  destination: string
  departureDate: string | null
  returnDate: string | null
  customerName: string
  sellerName: string
  agencyName: string
  passengerCount: number
  // Servicios contratados
  services: StatementServiceLine[]
  // Valores
  currency: string
  totalAmount: number
  dueDate: string | null
  // Destinatario sugerido (cliente MAIN o lead)
  recipientEmail: string | null
}

/** Mapea códigos de tipo de servicio a etiquetas legibles en español. */
const SERVICE_LABELS: Record<string, string> = {
  FLIGHT: "Aéreo",
  HOTEL: "Alojamiento",
  ALOJAMIENTO: "Alojamiento",
  PACKAGE: "Paquete",
  CRUISE: "Crucero",
  TRANSFER: "Traslado",
  MIXED: "Servicios",
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
  ASSISTANCE: "Asistencia",
  EXCURSION: "Excursión",
  EXCURSIONES: "Excursiones",
  SEGURO: "Seguro",
}

function labelForType(rawType: string | null | undefined): string {
  if (!rawType) return "Servicio"
  const key = String(rawType).trim().toUpperCase()
  if (SERVICE_LABELS[key]) return SERVICE_LABELS[key]
  // Tipo custom (product_type libre): devolver capitalizado tal cual.
  const t = String(rawType).trim()
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

/** Formatea una fecha YYYY-MM-DD a dd/MM/yyyy (sin dependencias). */
function fmtShort(d: string | null | undefined): string {
  if (!d) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d)
}

/** Normaliza el product_type a HOTEL | FLIGHT | OTHER (para mapear con los tramos). */
function serviceKind(rawType: string | null | undefined): "HOTEL" | "FLIGHT" | "OTHER" {
  const t = String(rawType || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sacar acentos (AÉREO -> AEREO)
    .trim()
    .toUpperCase()
  if (["HOTEL", "ALOJAMIENTO", "HOSPEDAJE"].includes(t)) return "HOTEL"
  if (["FLIGHT", "AEREO", "VUELO", "AIR"].includes(t)) return "FLIGHT"
  return "OTHER"
}

/**
 * Arma el detalle de la operación para el PDF/email.
 *
 * @returns null si la operación no existe o no pertenece al org del user
 *          (404 enmascarado — el caller decide el status).
 */
export async function buildOperationStatementData(params: {
  supabase: any
  operationId: string
  orgId: string
}): Promise<OperationStatementData | null> {
  const { supabase, operationId, orgId } = params

  // --- Operación (scoped por org) + relaciones necesarias ---
  const { data: operation } = await supabase
    .from("operations")
    .select(`
      id, file_code, destination, departure_date, return_date,
      sale_amount_total, sale_currency, currency, operator_cost_currency,
      adults, children, infants, agency_id,
      hotel_name, airline_name, customer_payment_deadline,
      sellers:seller_id(name),
      agencies:agency_id(name),
      leads:lead_id(contact_name, contact_email),
      operation_customers(role, customers:customer_id(first_name, last_name, email)),
      operation_operators(product_type, sale_amount, cost, cost_currency, operators:operator_id(name))
    `)
    .eq("id", operationId)
    .eq("org_id", orgId)
    .single()

  if (!operation) return null

  const op = operation as any
  const currency: string = op.sale_currency || op.currency || "USD"
  const passengerCount =
    (op.adults || 0) + (op.children || 0) + (op.infants || 0) || 1

  // --- Branding (scoped por org, NO confiar en RLS) ---
  const { data: settingsRows } = await supabase
    .from("organization_settings")
    .select("key, value")
    .eq("org_id", orgId)

  const getSetting = (key: string, fallback = "") =>
    (settingsRows || []).find((s: any) => s.key === key)?.value || fallback

  const company: StatementCompany = {
    name: getSetting("company_name", op.agencies?.name || "Mi Empresa"),
    address: getSetting("address"),
    phone: getSetting("phone"),
    website: getSetting("website"),
    taxId: getSetting("tax_id"),
    email: getSetting("email"),
    logo: getSetting("brand_logo"),
  }

  // --- Cliente MAIN + destinatario sugerido ---
  const operationCustomers = (op.operation_customers || []) as any[]
  const mainCustomer =
    operationCustomers.find((c) => c.role === "MAIN")?.customers ||
    operationCustomers[0]?.customers ||
    null
  const customerName = mainCustomer
    ? `${mainCustomer.first_name || ""} ${mainCustomer.last_name || ""}`.trim() ||
      op.leads?.contact_name ||
      "Cliente"
    : op.leads?.contact_name || "Cliente"
  const recipientEmail =
    mainCustomer?.email || op.leads?.contact_email || null

  // --- Flag: contar operation_services en la venta ---
  const includeServices = await getOrgFeatureFlag(
    supabase,
    orgId,
    FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
  )

  // --- Tramos del viaje (operation_legs): fuente del detalle para el pasajero
  //     (hotel / aerolínea / fechas). NO tiene org_id → se filtra por el
  //     agency_id de la operación (ya scopeada por org). ---
  const { data: legs } = await supabase
    .from("operation_legs")
    .select("order_index, destination, departure_date, airline_name, hotel_name, checkin_date, checkout_date")
    .eq("operation_id", operationId)
    .eq("agency_id", op.agency_id)
    .order("order_index", { ascending: true })

  // Colas por tipo: se consumen en orden a medida que aparecen líneas de ese tipo.
  const hotelLegs = ((legs || []) as any[]).filter((l) => l.hotel_name)
  const flightLegs = ((legs || []) as any[]).filter((l) => l.airline_name || l.departure_date)

  const hotelDetailFromLeg = (leg: any): string => {
    const range =
      leg.checkin_date && leg.checkout_date
        ? ` · Del ${fmtShort(leg.checkin_date)} al ${fmtShort(leg.checkout_date)}`
        : ""
    return `${leg.hotel_name || ""}${range}`.trim()
  }
  const flightDetailFromLeg = (leg: any): string => {
    const date = leg.departure_date ? ` · ${fmtShort(leg.departure_date)}` : ""
    return `${leg.airline_name || ""}${date}`.trim()
  }

  // --- Líneas de servicios ---
  const services: StatementServiceLine[] = []

  // Servicios base (operation_operators): una línea por operador contratado.
  // El DETALLE que ve el pasajero sale de los tramos (hotel/aerolínea/fechas),
  // NUNCA del operador mayorista (genera confusión). Fallback: hotel_name /
  // airline_name de la operación; si no hay, queda en blanco (el label del tipo
  // ya identifica el servicio).
  for (const oo of (op.operation_operators || []) as any[]) {
    const amount = Number(oo.sale_amount)
    const kind = serviceKind(oo.product_type)
    let description = ""
    if (kind === "HOTEL") {
      const leg = hotelLegs.shift()
      description = leg ? hotelDetailFromLeg(leg) : op.hotel_name || ""
    } else if (kind === "FLIGHT") {
      const leg = flightLegs.shift()
      description = leg ? flightDetailFromLeg(leg) : op.airline_name || ""
    }
    services.push({
      label: labelForType(oo.product_type),
      description,
      quantity: passengerCount,
      amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null,
      currency,
    })
  }

  // Servicios adicionales (operation_services): SOLO cuando la flag está ON,
  // así el listado queda consistente con el total (que también los suma solo
  // con la flag ON). Se listan únicamente los que están en la moneda de venta.
  if (includeServices) {
    const { data: opServices } = await supabase
      .from("operation_services")
      .select("service_type, description, sale_amount, sale_currency, operators:operator_id(name)")
      .eq("operation_id", operationId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })

    for (const svc of (opServices || []) as any[]) {
      if (svc.sale_currency !== currency) continue
      const amount = Number(svc.sale_amount)
      services.push({
        label: labelForType(svc.service_type),
        description: svc.description || "",
        quantity: passengerCount,
        amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null,
        currency,
      })
    }
  }

  // Si no hay desglose de servicios, mostrar una única línea "Paquete {destino}".
  if (services.length === 0) {
    const base = Number(op.sale_amount_total)
    services.push({
      label: "Paquete",
      description: op.destination || "",
      quantity: passengerCount,
      amount: Number.isFinite(base) && base > 0 ? roundMoney(base) : null,
      currency,
    })
  }

  // --- Total a pagar (venta base + extras de servicios si flag ON) ---
  let serviceExtra = 0
  if (includeServices) {
    const extras = await getServiceExtrasByOperation(supabase, [op], orgId)
    serviceExtra = extras[op.id]?.saleExtra || 0
  }
  const totalAmount = roundMoney((Number(op.sale_amount_total) || 0) + serviceExtra)

  // --- Vencimiento: fecha máxima de pago del cliente, cargada por la agencia en
  //     la operación. Si no está cargada, queda null → el PDF muestra "a convenir".
  //     (Antes se derivaba de operator_payments/payments y daba la fecha de salida,
  //     lo que confundía al pasajero.) ---
  const dueDate: string | null = op.customer_payment_deadline || null

  return {
    operationId: op.id,
    company,
    fileCode: op.file_code || op.id.slice(0, 8),
    destination: op.destination || "",
    departureDate: op.departure_date || null,
    returnDate: op.return_date || null,
    customerName,
    sellerName: op.sellers?.name || "",
    agencyName: op.agencies?.name || company.name,
    passengerCount,
    services,
    currency,
    totalAmount,
    dueDate,
    recipientEmail,
  }
}
