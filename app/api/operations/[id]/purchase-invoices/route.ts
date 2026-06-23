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

    // Cross-tenant fix (2026-05-18): validar operación del org del user antes
    // de listar facturas de compra.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: opOwner } = await (supabase.from("operations") as any)
      .select("id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()
    if (!opOwner) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

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

    // Cross-tenant fix (2026-05-18): este endpoint usa service role key
    // (bypassea RLS por completo). Validamos ownership de la operación con
    // el server client antes de proceder.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userScopedSupabase = await createServerClient()
    const { data: opOwner } = await (userScopedSupabase.from("operations") as any)
      .select("id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()
    if (!opOwner) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

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
  // extract_only: hacer OCR + subir el archivo, pero NO crear la factura todavía.
  // El usuario revisa/corrige en el modal y recién al Guardar se inserta el row
  // (con sus percepciones e IVA). Evita guardar antes de confirmar.
  const extractOnly = formData.get("extract_only") === "true"

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
  let ocrError: string | null = null
  let ocrDebug: any = null
  try {
    const ocrResult = await scanInvoiceWithAI(fileBuffer, file.type)
    ocrData = ocrResult.data
    ocrError = ocrResult.error
    ocrDebug = ocrResult.debug || null
  } catch (err: any) {
    // No-fatal: la factura se sube igual, pero propagamos el motivo al frontend.
    console.error("OCR error (non-fatal):", err)
    ocrError = err?.message || "No se pudo leer la factura automáticamente."
    ocrDebug = { fatalError: err?.message || String(err) }
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

  // extract_only: devolver los datos extraídos para precargar el modal, SIN
  // insertar la factura. El insert (y percepciones/IVA) ocurre recién al Guardar.
  if (extractOnly) {
    return NextResponse.json({
      extract_only: true,
      ocr_extracted: !!ocrData,
      ocr_error: ocrData ? null : ocrError,
      ocr_debug: ocrDebug, // TEMPORAL: diagnóstico de extracción (se muestra en el modal)
      document_url: documentUrl,
      document_name: file.name,
      extracted: {
        invoice_type: ocrData?.invoice_type || "FACTURA_A",
        invoice_number: ocrData?.invoice_number || "",
        invoice_date: ocrData?.invoice_date || new Date().toISOString().split("T")[0],
        emitter_cuit: emitterCuit,
        emitter_name: emitterName,
        currency: ocrData?.currency || "ARS",
        net_amount: ocrData?.net_amount || 0,
        iva_rate: ocrData?.iva_rate ?? 21, // ?? para no pisar 0 (exento) con 21
        iva_amount: ocrData?.iva_amount || 0,
        perception_iva: ocrData?.perception_iva || 0,
        perception_iibb: ocrData?.perception_iibb || 0,
        other_taxes: ocrData?.other_taxes || 0,
        total_amount: ocrData?.total_amount || 0,
      },
    })
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
    iva_rate: ocrData?.iva_rate ?? 21, // ?? para no pisar 0 (exento) con 21
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
    ocr_error: ocrData ? null : ocrError,
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
    iva_rate: body.iva_rate ?? 21, // ?? para no pisar 0 (exento) con 21
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
 * Renderiza la 1ª página de un PDF a un PNG de alta resolución (data URL).
 *
 * Las facturas electrónicas argentinas suelen venir RASTERIZADAS (sin capa de
 * texto), y si le mandamos el PDF crudo a GPT lo procesa en baja fidelidad y
 * ALUCINA los dígitos largos (CUIT, nro de factura). Renderizando nosotros la
 * página a una imagen nítida (scale 3) y pasándole ESA imagen, GPT lee exacto.
 * Verificado contra una factura real (CUIT, moneda, exento, total correctos).
 *
 * Usa unpdf (pdf.js) + @napi-rs/canvas (binario nativo precompilado, sin deps
 * de sistema, corre en Railway). Ambos están en serverExternalPackages.
 */
async function renderPdfFirstPageToPng(fileBuffer: ArrayBuffer): Promise<string> {
  const { renderPageAsImage } = await import("unpdf")
  const canvasMod = await import("@napi-rs/canvas")
  const ab = await renderPageAsImage(new Uint8Array(fileBuffer), 1, {
    scale: 3,
    canvasImport: () => Promise.resolve(canvasMod),
  })
  return `data:image/png;base64,${Buffer.from(ab).toString("base64")}`
}

/**
 * OCR: Scan invoice with OpenAI Vision to extract structured data.
 * Devuelve { data, error }: data con los campos extraídos, o error con el
 * motivo legible para mostrarle al usuario cuando no se pudo leer la factura.
 */
async function scanInvoiceWithAI(
  fileBuffer: ArrayBuffer,
  mimeType: string
): Promise<{ data: any | null; error: string | null; debug?: any }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { data: null, error: "El OCR no está configurado (falta la API key de OpenAI). Cargá los datos a mano." }
  }

  const openai = new OpenAI({ apiKey })
  const isPdf = mimeType === "application/pdf"

  // Imagen a leer por GPT. Para PDFs lo renderizamos a PNG nítido (ver
  // renderPdfFirstPageToPng): mandar el PDF crudo hace que GPT alucine dígitos.
  // Para imágenes (JPG/PNG) usamos el archivo directo.
  let imageDataUrl: string
  let renderError: string | undefined
  if (isPdf) {
    try {
      imageDataUrl = await renderPdfFirstPageToPng(fileBuffer)
    } catch (err: any) {
      // Fallback: si el render falla, mandamos el PDF crudo (mejor que nada).
      console.error("PDF render failed, falling back to raw PDF:", err)
      renderError = err?.message || String(err)
      imageDataUrl = `data:${mimeType};base64,${Buffer.from(fileBuffer).toString("base64")}`
    }
  } else {
    imageDataUrl = `data:${mimeType};base64,${Buffer.from(fileBuffer).toString("base64")}`
  }

  const usedRender = isPdf && !renderError
  console.log(`[purchase-invoice OCR] isPdf=${isPdf} usedRender=${usedRender} renderError=${renderError || "none"}`)
  // Debug temporal para diagnosticar en prod (se ve en el modal).
  const debug: any = { isPdf, usedRender, renderError: renderError || null }

  // PDF renderizado o imagen: GPT no acepta PDF vía image_url, pero el render ya
  // es PNG. Si hubo fallback al PDF crudo, usamos el content part "file".
  const userContent: any[] = (isPdf && renderError)
    ? [
        { type: "file", file: { filename: "factura.pdf", file_data: imageDataUrl } },
        { type: "text", text: "Extraé los datos de esta factura argentina." },
      ]
    : [
        { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        { type: "text", text: "Extraé los datos de esta factura argentina." },
      ]

  let response
  try {
    response = await openai.chat.completions.create({
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
- invoice_date: fecha de EMISIÓN (no la de vencimiento). Las fechas argentinas vienen como DD/MM/YYYY; convertila a "YYYY-MM-DD" sin invertir día/mes ni cambiar el año.
- cuit: CUIT del emisor (el que emite la factura)
- emitter_name: razón social del emisor
- currency: moneda de la factura. Leela del campo "Moneda" o de cómo está rotulado el TOTAL (ej. "TOTAL USD" → "USD"; "TOTAL $"/"TOTAL ARS"/"Pesos" → "ARS"). NO asumas "ARS" por defecto: si dice USD, devolvé "USD". Solo "ARS" o "USD".
- net_amount: base imponible neta (número).
- iva_rate: alícuota de IVA del comprobante (21, 10.5, 27 o 0).
- iva_amount: importe de IVA discriminado (número).
- perception_iva: percepciones de IVA si hay (número, 0 si no hay).
- perception_iibb: percepciones de IIBB si hay (número, 0 si no hay).
- other_taxes: otros impuestos/tasas (número, 0 si no hay).
- total_amount: total final de la factura (número).

REGLAS IMPORTANTES:
1. Montos en formato argentino: "2.951,19" significa 2951.19 (punto = miles, coma = decimales). Devolvé siempre números con punto decimal y sin separador de miles.
2. FACTURA EXENTA / SIN IVA: si los servicios son exentos o no gravados (ej. textos como "exento", "no gravado", "Srvs de transporte exento s/ley 23871", "operaciones exentas"), o si los renglones "Gravado 21%" y "Gravado 10,5%" están en 0,00 y el IVA discriminado es 0,00, entonces es EXENTA: poné iva_rate=0 e iva_amount=0. NO inventes un 21%.
3. Consistencia obligatoria: net_amount = total_amount − iva_amount − perception_iva − perception_iibb − other_taxes. En una factura exenta (iva_amount=0 y sin percepciones), net_amount = total_amount.
4. Si la factura tiene importes en USD y un tipo de cambio, currency = "USD" y total_amount es el total en USD.

Devolvé SOLO el JSON, sin markdown ni explicaciones. Si no podés leer algún campo, poné null.`
        },
        {
          role: "user",
          content: userContent as any,
        },
      ],
    })
  } catch (err: any) {
    console.error("OpenAI OCR request failed:", err)
    return {
      data: null,
      error: "No se pudo leer la factura automáticamente. Revisá que el archivo sea legible o cargá los datos a mano.",
      debug: { ...debug, openaiError: err?.message || String(err) },
    }
  }

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) {
    return { data: null, error: "No se pudieron extraer datos de la factura. Cargá los datos a mano.", debug }
  }

  try {
    // Clean potential markdown wrapping
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)
    console.log("[purchase-invoice OCR] parsed:", JSON.stringify(parsed))
    debug.parsed = parsed

    // Regla determinística (red de seguridad sobre el prompt): si el comprobante
    // NO tiene IVA discriminado (iva_amount = 0), es exento/no gravado → alícuota 0.
    // Evita que una alícuota mal leída (o el default 21) le invente un IVA que en
    // la factura no existe y lo sume al total. Solo aplica cuando iva_amount es un
    // 0 explícito; si vino null (no se pudo leer) no asumimos nada.
    if (parsed && parsed.iva_amount != null && Number(parsed.iva_amount) === 0) {
      parsed.iva_rate = 0
      parsed.iva_amount = 0
    }

    return { data: parsed, error: null, debug }
  } catch {
    console.error("Failed to parse OCR response:", content)
    return { data: null, error: "No se pudieron interpretar los datos de la factura. Cargá los datos a mano.", debug: { ...debug, rawContent: content?.slice(0, 500) } }
  }
}
