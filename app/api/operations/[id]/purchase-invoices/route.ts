import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

/**
 * GET — List purchase invoices for an operation
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params
    const supabase = await createServerClient()

    const { data: invoices, error } = await (supabase.from("purchase_invoices") as any)
      .select(`
        *,
        operators:operator_id (id, name),
        users:created_by (id, name)
      `)
      .eq("operation_id", operationId)
      .order("invoice_date", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also get associated tax withholdings
    const invoiceIds = (invoices || []).map((i: any) => i.id)
    let withholdings: any[] = []
    if (invoiceIds.length > 0) {
      const { data: wh } = await (supabase.from("tax_withholdings") as any)
        .select("*")
        .eq("source_type", "PURCHASE_INVOICE")
        .in("source_id", invoiceIds)
      withholdings = wh || []
    }

    return NextResponse.json({ invoices: invoices || [], withholdings })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST — Create a purchase invoice (with optional file upload + OCR)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const contentType = request.headers.get("content-type") || ""

    // Handle FormData (file upload) or JSON
    if (contentType.includes("multipart/form-data")) {
      return handleFileUpload(request, operationId, user, supabase)
    } else {
      return handleJsonCreate(request, operationId, user, supabase)
    }
  } catch (error: any) {
    console.error("Error creating purchase invoice:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Handle file upload with OCR extraction
 */
async function handleFileUpload(
  request: Request,
  operationId: string,
  user: any,
  supabase: any
) {
  const formData = await request.formData()
  const file = formData.get("file") as File
  const operatorId = formData.get("operator_id") as string | null

  if (!file) {
    return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido. Solo JPG, PNG, WebP o PDF" },
      { status: 400 }
    )
  }

  // Max 15MB
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Archivo demasiado grande. Máximo 15MB" }, { status: 400 })
  }

  // Upload to Supabase Storage
  const fileExt = file.name.split(".").pop() || "pdf"
  const fileName = `purchase-invoices/${operationId}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`
  const fileBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(fileName, fileBuffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Error al subir: ${uploadError.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)
  const documentUrl = urlData?.publicUrl || null

  // OCR: Extract invoice data using OpenAI Vision
  let ocrData: any = null
  try {
    ocrData = await scanInvoiceWithAI(fileBuffer, file.type)
  } catch (err) {
    console.error("OCR error (non-fatal):", err)
  }

  // Get operator info if provided
  let emitterCuit = ocrData?.cuit || ""
  let emitterName = ocrData?.emitter_name || ""
  if (operatorId) {
    const { data: operator } = await supabase
      .from("operators")
      .select("name, cuit")
      .eq("id", operatorId)
      .single()
    if (operator) {
      if (!emitterName) emitterName = operator.name
      if (!emitterCuit && operator.cuit) emitterCuit = operator.cuit
    }
  }

  // Create purchase invoice record with OCR data
  const invoiceData = {
    operation_id: operationId,
    operator_id: operatorId,
    invoice_type: ocrData?.invoice_type || "FACTURA_A",
    invoice_number: ocrData?.invoice_number || "",
    invoice_date: ocrData?.invoice_date || new Date().toISOString().split("T")[0],
    emitter_cuit: emitterCuit,
    emitter_name: emitterName,
    currency: ocrData?.currency || "ARS",
    net_amount: ocrData?.net_amount || 0,
    iva_rate: ocrData?.iva_rate || 21,
    iva_amount: ocrData?.iva_amount || 0,
    perception_iva: ocrData?.perception_iva || 0,
    perception_iibb: ocrData?.perception_iibb || 0,
    other_taxes: ocrData?.other_taxes || 0,
    total_amount: ocrData?.total_amount || 0,
    document_url: documentUrl,
    document_name: file.name,
    status: "REGISTERED",
    created_by: user.id,
  }

  const { data: invoice, error: insertError } = await supabase
    .from("purchase_invoices")
    .insert(invoiceData)
    .select("*")
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Create tax_withholdings for percepciones (if any)
  const taxPeriod = (ocrData?.invoice_date || new Date().toISOString()).substring(0, 7)
  if (ocrData?.perception_iva && ocrData.perception_iva > 0) {
    await supabase.from("tax_withholdings").insert({
      type: "PERCEPCION_IVA",
      direction: "SUFFERED",
      source_type: "PURCHASE_INVOICE",
      source_id: invoice.id,
      operation_id: operationId,
      operator_id: operatorId,
      counterpart_cuit: emitterCuit,
      counterpart_name: emitterName,
      currency: ocrData?.currency || "ARS",
      amount: ocrData.perception_iva,
      tax_period: taxPeriod,
      withholding_date: ocrData?.invoice_date || new Date().toISOString().split("T")[0],
      status: "PENDING",
      created_by: user.id,
    })
  }
  if (ocrData?.perception_iibb && ocrData.perception_iibb > 0) {
    await supabase.from("tax_withholdings").insert({
      type: "PERCEPCION_IIBB",
      direction: "SUFFERED",
      source_type: "PURCHASE_INVOICE",
      source_id: invoice.id,
      operation_id: operationId,
      operator_id: operatorId,
      counterpart_cuit: emitterCuit,
      counterpart_name: emitterName,
      currency: ocrData?.currency || "ARS",
      amount: ocrData.perception_iibb,
      tax_period: taxPeriod,
      withholding_date: ocrData?.invoice_date || new Date().toISOString().split("T")[0],
      status: "PENDING",
      created_by: user.id,
    })
  }

  // Update iva_purchases with real IVA from invoice (replace estimated)
  if (ocrData?.iva_amount && ocrData.iva_amount > 0) {
    const { data: existingIvaPurchase } = await supabase
      .from("iva_purchases")
      .select("id")
      .eq("operation_id", operationId)
      .maybeSingle()

    if (existingIvaPurchase) {
      await supabase.from("iva_purchases").update({
        operator_cost_total: ocrData.total_amount || 0,
        net_amount: ocrData.net_amount || 0,
        iva_amount: ocrData.iva_amount,
        updated_at: new Date().toISOString(),
      }).eq("id", existingIvaPurchase.id)
    }
  }

  return NextResponse.json({
    invoice,
    ocr_extracted: !!ocrData,
    message: ocrData ? "Factura cargada con datos extraídos automáticamente" : "Factura cargada, completá los datos manualmente",
  })
}

/**
 * Handle JSON create (manual entry without file)
 */
async function handleJsonCreate(
  request: Request,
  operationId: string,
  user: any,
  supabase: any
) {
  const body = await request.json()

  const invoiceData = {
    operation_id: operationId,
    operator_id: body.operator_id || null,
    invoice_type: body.invoice_type || "FACTURA_A",
    invoice_number: body.invoice_number,
    invoice_date: body.invoice_date,
    emitter_cuit: body.emitter_cuit,
    emitter_name: body.emitter_name,
    currency: body.currency || "ARS",
    net_amount: body.net_amount || 0,
    iva_rate: body.iva_rate || 21,
    iva_amount: body.iva_amount || 0,
    perception_iva: body.perception_iva || 0,
    perception_iibb: body.perception_iibb || 0,
    other_taxes: body.other_taxes || 0,
    total_amount: body.total_amount || 0,
    exchange_rate: body.exchange_rate || null,
    total_ars_equivalent: body.total_ars_equivalent || null,
    document_url: body.document_url || null,
    document_name: body.document_name || null,
    status: "REGISTERED",
    notes: body.notes || null,
    created_by: user.id,
  }

  const { data: invoice, error } = await supabase
    .from("purchase_invoices")
    .insert(invoiceData)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Create tax withholdings for percepciones
  const taxPeriod = body.invoice_date?.substring(0, 7) || new Date().toISOString().substring(0, 7)
  if (body.perception_iva > 0) {
    await supabase.from("tax_withholdings").insert({
      type: "PERCEPCION_IVA", direction: "SUFFERED", source_type: "PURCHASE_INVOICE",
      source_id: invoice.id, operation_id: operationId, operator_id: body.operator_id,
      counterpart_cuit: body.emitter_cuit, counterpart_name: body.emitter_name,
      currency: body.currency || "ARS", amount: body.perception_iva,
      tax_period: taxPeriod, withholding_date: body.invoice_date, status: "PENDING",
      created_by: user.id,
    })
  }
  if (body.perception_iibb > 0) {
    await supabase.from("tax_withholdings").insert({
      type: "PERCEPCION_IIBB", direction: "SUFFERED", source_type: "PURCHASE_INVOICE",
      source_id: invoice.id, operation_id: operationId, operator_id: body.operator_id,
      counterpart_cuit: body.emitter_cuit, counterpart_name: body.emitter_name,
      currency: body.currency || "ARS", amount: body.perception_iibb,
      tax_period: taxPeriod, withholding_date: body.invoice_date, status: "PENDING",
      created_by: user.id,
    })
  }

  // Update iva_purchases with real IVA
  if (body.iva_amount > 0) {
    const { data: existingIvaPurchase } = await supabase
      .from("iva_purchases").select("id").eq("operation_id", operationId).maybeSingle()
    if (existingIvaPurchase) {
      await supabase.from("iva_purchases").update({
        operator_cost_total: body.total_amount, net_amount: body.net_amount,
        iva_amount: body.iva_amount, updated_at: new Date().toISOString(),
      }).eq("id", existingIvaPurchase.id)
    }
  }

  return NextResponse.json({ invoice })
}

/**
 * OCR: Scan invoice with OpenAI Vision to extract structured data
 */
async function scanInvoiceWithAI(fileBuffer: ArrayBuffer, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const openai = new OpenAI({ apiKey })
  const base64 = Buffer.from(fileBuffer).toString("base64")
  const dataUrl = `data:${mimeType};base64,${base64}`

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1,
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `Sos un experto en leer facturas argentinas (AFIP). Extraé los datos de la factura en formato JSON.
Campos a extraer:
- invoice_type: "FACTURA_A", "FACTURA_B", "FACTURA_C", "NOTA_CREDITO_A", "NOTA_CREDITO_B", "NOTA_DEBITO_A", "NOTA_DEBITO_B"
- invoice_number: número completo "0001-00012345"
- invoice_date: fecha de emisión en formato "YYYY-MM-DD"
- cuit: CUIT del emisor (el que emite la factura)
- emitter_name: razón social del emisor
- currency: "ARS" o "USD"
- net_amount: importe neto gravado (número)
- iva_rate: alícuota de IVA (21, 10.5, 27, 0)
- iva_amount: importe de IVA (número)
- perception_iva: percepciones de IVA si hay (número, 0 si no hay)
- perception_iibb: percepciones de IIBB si hay (número, 0 si no hay)
- other_taxes: otros impuestos/tasas (número, 0 si no hay)
- total_amount: total de la factura (número)

IMPORTANTE: Devolvé SOLO el JSON, sin markdown ni explicaciones. Si no podés leer algún campo, poné null.`
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
          {
            type: "text",
            text: "Extraé los datos de esta factura argentina.",
          },
        ],
      },
    ],
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) return null

  try {
    // Clean potential markdown wrapping
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    return JSON.parse(cleaned)
  } catch {
    console.error("Failed to parse OCR response:", content)
    return null
  }
}
