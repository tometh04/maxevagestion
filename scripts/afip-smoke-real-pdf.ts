/**
 * Smoke test: genera un PDF con datos REALES de una factura autorizada de Lozada,
 * para validar que el QR AFIP oficial (RG 4291) scanea y AFIP lo reconoce.
 *
 * NO corre en CI. Uso manual para verificación post-implement.
 *
 *   npx tsx scripts/afip-smoke-real-pdf.ts
 *
 * Abre el PDF generado en Chrome: file:///tmp/factura-smoke-real.pdf
 */

import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import fs from "fs"
import path from "path"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Lozada org_id from memory
const LOZADA_ORG_ID = "1b326d20-d133-4112-a798-f54b5af7e7cb"

async function main() {
  const { renderInvoicePdf } = await import("../lib/pdf/invoice-pdf")

  // Fetch the most recent authorized invoice of Lozada with a real CAE
  const { data: invoice, error: invErr } = await (supabase
    .from("invoices") as any)
    .select("*, invoice_items(*)")
    .eq("org_id", LOZADA_ORG_ID)
    .eq("status", "authorized")
    .not("cae", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (invErr || !invoice) {
    console.error("No se encontró factura autorizada con CAE para Lozada:", invErr?.message)
    process.exit(1)
  }

  console.log("Factura encontrada:")
  console.log(`  id: ${invoice.id}`)
  console.log(`  comprobante: ${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`)
  console.log(`  CAE: ${invoice.cae}`)
  console.log(`  fecha: ${invoice.fecha_emision}`)
  console.log(`  total: ${invoice.imp_total} ${invoice.moneda}`)

  // Fetch agency name
  const { data: agency } = await (supabase.from("agencies") as any)
    .select("name")
    .eq("id", invoice.agency_id)
    .single()

  // Fetch AFIP config (CUIT emisor) filtrado por agency_id de la factura
  // (Lozada tiene múltiples agencias con integración AFIP, una por cada)
  const { data: integration } = await (supabase.from("integrations") as any)
    .select("config")
    .eq("agency_id", invoice.agency_id)
    .eq("integration_type", "afip")
    .eq("status", "active")
    .maybeSingle()

  const cuit: string = integration?.config?.cuit || ""
  console.log(`  CUIT emisor: ${cuit || "(no configurado)"}`)
  console.log(`  agency: ${agency?.name || "(n/a)"}`)

  if (!cuit) {
    console.warn("⚠️  CUIT emisor vacío — el QR no va a poder validarse en AFIP")
  }

  const pdfBytes = await renderInvoicePdf({
    invoice,
    emisor: { cuit, razonSocial: agency?.name || "" },
    agency: { name: agency?.name || "Lozada" },
    footerCompanyName: "MAXEVA",
  })

  const outPath = "/tmp/factura-smoke-real.pdf"
  fs.writeFileSync(outPath, Buffer.from(pdfBytes))
  console.log(`\n✅ PDF generado: ${outPath}`)
  console.log(`   Abrir en Chrome: file://${outPath}`)
  console.log(`   Scanear el QR con iPhone → AFIP validator`)
}

main().catch((err) => {
  console.error("ERROR:", err)
  process.exit(1)
})
