/**
 * Exporta a CSV los servicios que dejaron ganancia y nunca comisionaron (VIB-180).
 *
 * Son los anteriores al cambio del 18/08: hasta entonces un servicio no generaba
 * su propia comisión, quedaba colgado de la del vendedor de la venta, que se
 * calcula sobre el margen del paquete y no incluye los servicios.
 *
 * El porcentaje se resuelve con la MISMA precedencia que usa el sistema:
 * regla de la oficina → regla general del vendedor → el de su ficha. Y se
 * descuenta el IVA en los posteriores al corte de la agencia, igual que el
 * cálculo real.
 *
 *   npx tsx scripts/export-service-commissions-gap.ts <org_id> [salida.csv]
 *
 * Formato Excel-ES: separador ";", directiva sep=;, coma decimal, BOM y CRLF.
 * Con "," Excel en español abre todo amontonado en la columna A.
 */

import { createClient } from "@supabase/supabase-js"
import { writeFileSync } from "fs"
import { config } from "dotenv"

config({ path: ".env.local" })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const orgId = process.argv[2]
const outPath = process.argv[3] || "comisiones-servicio-sin-liquidar.csv"

if (!orgId) {
  console.error("Uso: npx tsx scripts/export-service-commissions-gap.ts <org_id> [salida.csv]")
  process.exit(1)
}

const supabase = createClient(url, key)

// La RPC `execute_readonly_query` sólo acepta queries que empiecen con SELECT,
// así que el CTE va envuelto en un subselect. Y el string NO puede empezar con
// un salto de línea: la RPC valida con `TRIM()`, que en Postgres saca espacios
// pero no saltos, así que un `\n` inicial hace fallar el LIKE 'SELECT%'.
const SQL = `SELECT * FROM (
WITH servicios AS (
  SELECT o.id AS operation_id, o.agency_id, a.name AS oficina, o.file_code,
         o.operation_date, os.service_type, os.description,
         os.sale_amount, os.cost_amount, os.sale_currency,
         (os.sale_amount - os.cost_amount) AS ganancia,
         COALESCE(os.seller_id, o.seller_id) AS vendedor_id,
         COALESCE(fs.commission_base_net_of_iva, false) AS neta,
         fs.commission_net_from, COALESCE(fs.commission_iva_rate, 0.105) AS tasa
  FROM operation_services os
  JOIN operations o ON o.id = os.operation_id
  JOIN agencies a ON a.id = o.agency_id
  LEFT JOIN financial_settings fs ON fs.agency_id = a.id
  LEFT JOIN commission_records cr ON cr.id = os.commission_record_id
  WHERE os.generates_commission = true
    AND o.status <> 'CANCELLED'
    AND o.org_id = '${orgId}'
    AND cr.kind IS DISTINCT FROM 'SERVICE'
    AND os.sale_currency = os.cost_currency
    AND (os.sale_amount - os.cost_amount) > 0
),
con_pct AS (
  SELECT s.*, u.name AS vendedor,
    COALESCE(
      (SELECT r.value FROM commission_rules r
        WHERE r.type='SELLER' AND r.seller_id = s.vendedor_id AND r.agency_id = s.agency_id
          AND r.valid_from <= CURRENT_DATE AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
        ORDER BY r.valid_from DESC LIMIT 1),
      (SELECT r.value FROM commission_rules r
        WHERE r.type='SELLER' AND r.seller_id = s.vendedor_id AND r.agency_id IS NULL
          AND r.valid_from <= CURRENT_DATE AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
        ORDER BY r.valid_from DESC LIMIT 1),
      u.default_commission_percentage
    ) AS pct
  FROM servicios s JOIN users u ON u.id = s.vendedor_id
),
cliente AS (
  SELECT oc.operation_id,
         (array_agg(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
                    ORDER BY CASE WHEN oc.role = 'MAIN' THEN 0 ELSE 1 END))[1] AS nombre
  FROM operation_customers oc JOIN customers c ON c.id = oc.customer_id
  GROUP BY oc.operation_id
)
SELECT p.oficina, to_char(p.operation_date,'DD/MM/YYYY') AS fecha, p.file_code AS operacion,
       COALESCE(cl.nombre,'') AS cliente, p.service_type AS servicio,
       COALESCE(p.description,'') AS detalle, p.vendedor, p.sale_currency AS moneda,
       p.sale_amount AS venta, p.cost_amount AS costo, p.ganancia,
       p.pct,
       CASE WHEN p.neta AND p.operation_date >= p.commission_net_from THEN 'Neta' ELSE 'Bruta' END AS base,
       round((p.ganancia * CASE WHEN p.neta AND p.operation_date >= p.commission_net_from
                                THEN (1 - p.tasa) ELSE 1 END * p.pct / 100)::numeric, 2) AS comision,
       to_char(p.operation_date,'YYYY-MM') AS mes
FROM con_pct p LEFT JOIN cliente cl ON cl.operation_id = p.operation_id
ORDER BY p.sale_currency, p.vendedor, p.operation_date
) AS export_rows
`

const HEADERS = [
  "Oficina", "Fecha", "Operación", "Cliente", "Servicio", "Detalle", "Vendedor",
  "Moneda", "Venta", "Costo", "Ganancia", "%", "Base", "Comisión estimada", "Mes",
]

/** Excel-ES: coma decimal y sin separador de miles, para que la celda sea numérica. */
const numero = (v: unknown) =>
  v == null ? "" : Number(v).toFixed(2).replace(".", ",")

const texto = (v: unknown) =>
  v == null ? "" : String(v).replace(/[;\r\n]+/g, " ").trim()

async function main() {
  const { data, error } = await (supabase.rpc as any)("execute_readonly_query", {
    query_text: SQL,
  })

  if (error) {
    console.error("Error consultando:", error.message)
    process.exit(1)
  }

  const rows: any[] = Array.isArray(data) ? data : data ? [data] : []

  const lineas = rows.map((r) =>
    [
      texto(r.oficina), texto(r.fecha), texto(r.operacion), texto(r.cliente),
      texto(r.servicio), texto(r.detalle), texto(r.vendedor), texto(r.moneda),
      numero(r.venta), numero(r.costo), numero(r.ganancia), numero(r.pct),
      texto(r.base), numero(r.comision), texto(r.mes),
    ].join(";")
  )

  const csv = `sep=;\r\n${HEADERS.join(";")}\r\n${lineas.join("\r\n")}\r\n`
  writeFileSync(outPath, "﻿" + csv, "utf8")

  // Totales por moneda, para poder cotejar el archivo contra el informe.
  const porMoneda = new Map<string, { n: number; ganancia: number; comision: number }>()
  for (const r of rows) {
    const m = String(r.moneda)
    const acc = porMoneda.get(m) ?? { n: 0, ganancia: 0, comision: 0 }
    acc.n += 1
    acc.ganancia += Number(r.ganancia) || 0
    acc.comision += Number(r.comision) || 0
    porMoneda.set(m, acc)
  }

  console.log(`Escrito: ${outPath} — ${rows.length} servicios`)
  for (const [moneda, t] of Array.from(porMoneda.entries())) {
    console.log(
      `  ${moneda}: ${t.n} servicios · ganancia ${t.ganancia.toFixed(2)} · comisión ${t.comision.toFixed(2)}`
    )
  }
}

main()
