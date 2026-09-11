import { getAccountBalancesBatch } from "@/lib/accounting/ledger"
import { getEffectiveOperatorPaymentStatus } from "@/lib/accounting/operator-payment-settlement"
import { csvDate, csvNumber } from "@/lib/export/csv-excel-es"

/**
 * Los datos que una agencia se lleva cuando se va y que ningún export previo
 * cubría.
 *
 * Las exportaciones que ya existían (clientes, operaciones, cobros, caja,
 * facturas en PDF, libros) salen de sus propios endpoints, cada uno con su
 * lógica. Las de acá son las que faltaban, y comparten forma: leer una tabla
 * del tenant y devolverla como filas. Por eso viven juntas y las sirve una sola
 * ruta (`/api/exports/[dataset]`) en vez de ocho rutas casi idénticas.
 *
 * Cada dataset arma sus propias columnas porque el criterio de qué mostrar es
 * de dominio, no de transporte: qué es "deuda pendiente" con un operador, o qué
 * campos de una cuenta bancaria NO pueden salir en un archivo, se decide acá.
 */

export interface DatasetContext {
  supabase: any
  orgId: string
  /** Agencia elegida en el filtro; ausente = todas las del usuario. */
  agencyId?: string
  /** YYYY-MM-DD */
  dateFrom?: string
  /** YYYY-MM-DD */
  dateTo?: string
}

export interface DatasetResult {
  headers: string[]
  rows: unknown[][]
  /** true si se llegó al tope y el archivo quedó incompleto. */
  truncated: boolean
}

export interface ExportDataset {
  id: string
  /** Base del nombre del archivo, sin fecha ni extensión. */
  filenameBase: string
  build: (context: DatasetContext) => Promise<DatasetResult>
}

const PAGE = 1000
/** Tope por archivo. Alto a propósito: esto es un respaldo, no un listado. */
const CAP = 50_000

/**
 * Trae TODAS las filas paginando.
 *
 * PostgREST corta en 1000 filas sin avisar: un export que se corta solo no se
 * ve distinto de uno completo, y el que lo recibe no tiene forma de saber que
 * le faltan datos. Si aun así se llega al tope, se avisa en el nombre del
 * archivo en vez de mentir que está entero.
 */
async function fetchAll(buildQuery: () => any): Promise<{ rows: any[]; truncated: boolean }> {
  const rows: any[] = []
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return { rows, truncated: false }
    rows.push(...data)
    if (data.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/** "2026-09-11T13:04:00Z" → "11/09/2026". Los timestamps se cortan al día. */
function fecha(value: unknown): string {
  return csvDate(value ? String(value).slice(0, 10) : "")
}

function siNo(value: unknown): string {
  return value ? "Sí" : "No"
}

function nombreAgencia(row: any): string {
  return row?.agencies?.name ?? ""
}

export const EXPORT_DATASETS: readonly ExportDataset[] = [
  {
    id: "operators",
    filenameBase: "operadores",
    async build(context) {
      const { rows, truncated } = await fetchAll(() =>
        context.supabase
          .from("operators")
          .select(
            "name, cuit, contact_name, contact_email, contact_phone, commission_percentage, admin_fee_percentage, credit_limit, cost_calculation_mode, created_at, agencies:agency_id(name)"
          )
          .eq("org_id", context.orgId)
          .order("name")
      )

      return {
        truncated,
        headers: [
          "Operador",
          "CUIT",
          "Contacto",
          "Email",
          "Teléfono",
          "Comisión %",
          "Fee administrativo %",
          "Límite de crédito",
          "Modo de cálculo de costo",
          "Agencia",
          "Alta",
        ],
        rows: rows.map((row: any) => [
          row.name,
          row.cuit,
          row.contact_name,
          row.contact_email,
          row.contact_phone,
          csvNumber(row.commission_percentage),
          csvNumber(row.admin_fee_percentage),
          csvNumber(row.credit_limit),
          row.cost_calculation_mode,
          nombreAgencia(row),
          fecha(row.created_at),
        ]),
      }
    },
  },

  {
    id: "operator-debt",
    filenameBase: "deuda-operadores",
    async build(context) {
      // Sin filtro de fecha a propósito: lo que importa al irse es cuánto se le
      // debe a cada proveedor, y una deuda vieja impaga es justamente la que no
      // puede quedar afuera por caer fuera del período.
      const { rows, truncated } = await fetchAll(() =>
        context.supabase
          .from("operator_payments")
          .select(
            "due_date, currency, amount, paid_amount, status, approval_status, is_legacy_settled, notes, file_code, operators:operator_id(name), operations:operation_id(file_code, destination)"
          )
          .eq("org_id", context.orgId)
          .order("due_date", { ascending: true })
      )

      return {
        truncated,
        headers: [
          "Operador",
          "Expediente",
          "Destino",
          "Vencimiento",
          "Moneda",
          "Importe",
          "Pagado",
          "Pendiente",
          "Estado",
          "Estado registrado",
          "Saldada antes del módulo",
          "Aprobación",
          "Notas",
        ],
        rows: rows.map((row: any) => {
          const amount = Number(row.amount ?? 0)
          const paid = Number(row.paid_amount ?? 0)
          return [
            row.operators?.name ?? "",
            row.operations?.file_code ?? row.file_code ?? "",
            row.operations?.destination ?? "",
            csvDate(row.due_date),
            row.currency,
            csvNumber(amount),
            csvNumber(paid),
            // Sin negativos: un sobrepago no descuenta deuda, igual que en el
            // reporte por operador.
            csvNumber(Math.max(0, amount - paid)),
            // El estado que muestra el listado se DERIVA de los importes; la
            // columna `status` quedó vieja en filas antiguas (dice PAID con
            // pagado 0). Van las dos, para que la diferencia se vea en vez de
            // que el archivo elija una y parezca la única verdad.
            getEffectiveOperatorPaymentStatus(row),
            row.status,
            siNo(row.is_legacy_settled),
            row.approval_status,
            row.notes,
          ]
        }),
      }
    },
  },

  {
    id: "financial-accounts",
    filenameBase: "cuentas-financieras",
    async build(context) {
      // Nunca salen `card_number` ni `card_cvv`: son datos de tarjeta que la
      // agencia ya tiene y que un CSV que viaja por mail no debería contener.
      const { rows, truncated } = await fetchAll(() =>
        context.supabase
          .from("financial_accounts")
          .select(
            "id, name, type, currency, bank_name, account_number, initial_balance, credit_limit, is_active, notes, agencies:agency_id(name)"
          )
          .eq("org_id", context.orgId)
          .order("name")
      )

      // El saldo es la razón por la que una agencia se lleva este archivo: sin
      // él, el CSV de caja no se puede conciliar contra nada.
      let balances: Record<string, number> = {}
      try {
        balances = await getAccountBalancesBatch(
          rows.map((row: any) => row.id),
          context.supabase
        )
      } catch {
        // Un saldo que no se pudo calcular se deja vacío: poner 0 sería afirmar
        // que la cuenta está en cero.
        balances = {}
      }

      return {
        truncated,
        headers: [
          "Cuenta",
          "Tipo",
          "Moneda",
          "Banco",
          "Número de cuenta",
          "Saldo inicial",
          "Saldo actual",
          "Límite de crédito",
          "Activa",
          "Agencia",
          "Notas",
        ],
        rows: rows.map((row: any) => [
          row.name,
          row.type,
          row.currency,
          row.bank_name,
          row.account_number,
          csvNumber(row.initial_balance),
          row.id in balances ? csvNumber(balances[row.id]) : "",
          csvNumber(row.credit_limit),
          siNo(row.is_active),
          nombreAgencia(row),
          row.notes,
        ]),
      }
    },
  },

  {
    id: "chart-of-accounts",
    filenameBase: "plan-de-cuentas",
    async build(context) {
      // Sin esto, el Libro Mayor y el Diario salen con códigos de cuenta que
      // del otro lado no significan nada.
      const { rows, truncated } = await fetchAll(() =>
        context.supabase
          .from("chart_of_accounts")
          .select(
            "account_code, account_name, account_type, category, subcategory, level, is_movement_account, is_active, description"
          )
          .eq("org_id", context.orgId)
          .order("account_code")
      )

      return {
        truncated,
        headers: [
          "Código",
          "Cuenta",
          "Tipo",
          "Categoría",
          "Subcategoría",
          "Nivel",
          "Imputable",
          "Activa",
          "Descripción",
        ],
        rows: rows.map((row: any) => [
          row.account_code,
          row.account_name,
          row.account_type,
          row.category,
          row.subcategory,
          row.level,
          siNo(row.is_movement_account),
          siNo(row.is_active),
          row.description,
        ]),
      }
    },
  },

  {
    id: "team",
    filenameBase: "equipo",
    async build(context) {
      const { rows, truncated } = await fetchAll(() =>
        context.supabase
          .from("users")
          .select(
            "name, email, role, additional_roles, is_active, is_independent_advisor, default_commission_percentage, created_at"
          )
          .eq("org_id", context.orgId)
          .order("name")
      )

      return {
        truncated,
        headers: [
          "Nombre",
          "Email",
          "Rol",
          "Roles adicionales",
          "Activo",
          "Asesor independiente",
          "Comisión por defecto %",
          "Alta",
        ],
        rows: rows.map((row: any) => [
          row.name,
          row.email,
          row.role,
          (row.additional_roles ?? []).join(", "),
          siNo(row.is_active),
          siNo(row.is_independent_advisor),
          row.default_commission_percentage === null
            ? ""
            : csvNumber(row.default_commission_percentage),
          fecha(row.created_at),
        ]),
      }
    },
  },

  {
    id: "leads",
    filenameBase: "leads",
    async build(context) {
      const { rows, truncated } = await fetchAll(() => {
        let query = context.supabase
          .from("leads")
          .select(
            "contact_name, contact_phone, contact_email, contact_instagram, destination, region, status, list_name, source, quoted_price, has_deposit, deposit_amount, deposit_currency, follow_up_date, outcome, archived_at, notes, created_at, users:assigned_seller_id(name), agencies:agency_id(name)"
          )
          .eq("org_id", context.orgId)
          .order("created_at", { ascending: false })

        if (context.agencyId) query = query.eq("agency_id", context.agencyId)
        if (context.dateFrom) query = query.gte("created_at", context.dateFrom)
        if (context.dateTo) query = query.lte("created_at", `${context.dateTo}T23:59:59.999Z`)
        return query
      })

      return {
        truncated,
        headers: [
          "Contacto",
          "Teléfono",
          "Email",
          "Instagram",
          "Destino",
          "Región",
          "Estado",
          "Columna del tablero",
          "Origen",
          "Precio cotizado",
          "Tiene seña",
          "Seña",
          "Moneda de la seña",
          "Próximo contacto",
          "Resultado",
          "Archivado",
          "Vendedor",
          "Agencia",
          "Notas",
          "Alta",
        ],
        rows: rows.map((row: any) => [
          row.contact_name,
          row.contact_phone,
          row.contact_email,
          row.contact_instagram,
          row.destination,
          row.region,
          row.status,
          row.list_name,
          row.source,
          row.quoted_price === null ? "" : csvNumber(row.quoted_price),
          siNo(row.has_deposit),
          row.deposit_amount === null ? "" : csvNumber(row.deposit_amount),
          row.deposit_currency,
          csvDate(row.follow_up_date),
          row.outcome,
          fecha(row.archived_at),
          row.users?.name ?? "",
          nombreAgencia(row),
          row.notes,
          fecha(row.created_at),
        ]),
      }
    },
  },

  {
    id: "quotations",
    filenameBase: "cotizaciones",
    async build(context) {
      const { rows, truncated } = await fetchAll(() => {
        let query = context.supabase
          .from("quotations")
          .select(
            "quotation_number, created_at, destination, origin, region, departure_date, return_date, adults, children, infants, currency, subtotal, taxes, discounts, insurance_amount, transfer_amount, total_amount, status, valid_until, converted_at, rejection_reason, notes, users:seller_id(name), customers:customer_id(first_name, last_name), operators:operator_id(name), agencies:agency_id(name)"
          )
          .eq("org_id", context.orgId)
          .order("created_at", { ascending: false })

        if (context.agencyId) query = query.eq("agency_id", context.agencyId)
        if (context.dateFrom) query = query.gte("created_at", context.dateFrom)
        if (context.dateTo) query = query.lte("created_at", `${context.dateTo}T23:59:59.999Z`)
        return query
      })

      return {
        truncated,
        headers: [
          "Número",
          "Fecha",
          "Cliente",
          "Destino",
          "Origen",
          "Región",
          "Salida",
          "Regreso",
          "Adultos",
          "Menores",
          "Infantes",
          "Moneda",
          "Subtotal",
          "Impuestos",
          "Descuentos",
          "Asistencia",
          "Traslados",
          "Total",
          "Estado",
          "Válida hasta",
          "Convertida en operación",
          "Motivo de rechazo",
          "Operador",
          "Vendedor",
          "Agencia",
          "Notas",
        ],
        rows: rows.map((row: any) => [
          row.quotation_number,
          fecha(row.created_at),
          [row.customers?.first_name, row.customers?.last_name].filter(Boolean).join(" "),
          row.destination,
          row.origin,
          row.region,
          csvDate(row.departure_date),
          csvDate(row.return_date),
          row.adults,
          row.children,
          row.infants,
          row.currency,
          csvNumber(row.subtotal),
          csvNumber(row.taxes),
          csvNumber(row.discounts),
          csvNumber(row.insurance_amount),
          csvNumber(row.transfer_amount),
          csvNumber(row.total_amount),
          row.status,
          csvDate(row.valid_until),
          fecha(row.converted_at),
          row.rejection_reason,
          row.operators?.name ?? "",
          row.users?.name ?? "",
          nombreAgencia(row),
          row.notes,
        ]),
      }
    },
  },

  {
    id: "invoices-data",
    filenameBase: "facturas",
    async build(context) {
      // El ZIP de facturas trae los PDF, que sirven para mostrarlos pero no
      // para sumarlos ni para cargarlos en otro sistema. Esto es el listado.
      const { rows, truncated } = await fetchAll(() => {
        let query = context.supabase
          .from("invoices")
          .select(
            "fecha_emision, cbte_tipo, pto_vta, cbte_nro, cae, cae_fch_vto, receptor_nombre, receptor_doc_tipo, receptor_doc_nro, imp_neto, imp_iva, imp_op_ex, imp_trib, imp_total, moneda, cotizacion, status, notes, operations:operation_id(file_code, destination), agencies:agency_id(name)"
          )
          .eq("org_id", context.orgId)
          .order("fecha_emision", { ascending: true })

        if (context.agencyId) query = query.eq("agency_id", context.agencyId)
        if (context.dateFrom) query = query.gte("fecha_emision", context.dateFrom)
        if (context.dateTo) query = query.lte("fecha_emision", context.dateTo)
        return query
      })

      return {
        truncated,
        headers: [
          "Fecha de emisión",
          "Tipo de comprobante",
          "Punto de venta",
          "Número",
          "CAE",
          "Vencimiento del CAE",
          "Receptor",
          "Tipo de documento",
          "Documento",
          "Neto",
          "IVA",
          "Exento",
          "Otros tributos",
          "Total",
          "Moneda",
          "Cotización",
          "Estado",
          "Expediente",
          "Destino",
          "Agencia",
          "Notas",
        ],
        rows: rows.map((row: any) => [
          csvDate(row.fecha_emision),
          row.cbte_tipo,
          row.pto_vta,
          row.cbte_nro,
          row.cae,
          csvDate(row.cae_fch_vto),
          row.receptor_nombre,
          row.receptor_doc_tipo,
          row.receptor_doc_nro,
          csvNumber(row.imp_neto),
          csvNumber(row.imp_iva),
          csvNumber(row.imp_op_ex),
          csvNumber(row.imp_trib),
          csvNumber(row.imp_total),
          row.moneda,
          row.cotizacion === null ? "" : csvNumber(row.cotizacion, 4),
          row.status,
          row.operations?.file_code ?? "",
          row.operations?.destination ?? "",
          nombreAgencia(row),
          row.notes,
        ]),
      }
    },
  },
] as const

export function getExportDataset(id: string): ExportDataset | undefined {
  return EXPORT_DATASETS.find((dataset) => dataset.id === id)
}
