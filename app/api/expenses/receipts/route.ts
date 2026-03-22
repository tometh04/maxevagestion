import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

/**
 * POST /api/expenses/receipts
 * Upload a receipt/proof for an expense (variable or recurring)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const formData = await request.formData()
    const file = formData.get("file") as File
    const cashMovementId = formData.get("cash_movement_id") as string | null
    const recurringPaymentId = formData.get("recurring_payment_id") as string | null

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
    }

    if (!cashMovementId && !recurringPaymentId) {
      return NextResponse.json({ error: "Se requiere cash_movement_id o recurring_payment_id" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF." }, { status: 400 })
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo es demasiado grande (máx 10MB)" }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileExt = file.name.split(".").pop()
    const folder = "expenses"
    const fileName = `${folder}/${timestamp}-${randomStr}.${fileExt}`

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError || !uploadData) {
      console.error("Error uploading receipt:", uploadError)
      return NextResponse.json({ error: "Error al subir el archivo" }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)
    const fileUrl = urlData.publicUrl

    // Create document record
    const { data: document, error: docError } = await (supabase.from("documents") as any)
      .insert({
        type: "PAYMENT_PROOF",
        file_url: fileUrl,
        uploaded_by_user_id: user.id,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error("Error creating document record:", docError)
      await supabase.storage.from("documents").remove([fileName])
      return NextResponse.json({ error: "Error al crear registro del documento" }, { status: 500 })
    }

    // Create expense_receipts bridge record
    const { error: bridgeError } = await (supabase.from("expense_receipts") as any)
      .insert({
        document_id: document.id,
        cash_movement_id: cashMovementId || null,
        recurring_payment_id: recurringPaymentId || null,
      })

    if (bridgeError) {
      console.error("Error creating expense_receipts record:", bridgeError)
      return NextResponse.json({ error: "Error al vincular comprobante" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      receipt: {
        id: document.id,
        file_url: fileUrl,
        created_at: document.uploaded_at,
      },
    })
  } catch (error: any) {
    console.error("Error in POST /api/expenses/receipts:", error)
    return NextResponse.json({ error: error.message || "Error al subir comprobante" }, { status: 500 })
  }
}

/**
 * GET /api/expenses/receipts
 * Get receipts for a specific expense
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Error de configuración" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { searchParams } = new URL(request.url)
    const cashMovementId = searchParams.get("cash_movement_id")
    const recurringPaymentId = searchParams.get("recurring_payment_id")

    if (!cashMovementId && !recurringPaymentId) {
      return NextResponse.json({ error: "Se requiere cash_movement_id o recurring_payment_id" }, { status: 400 })
    }

    let query = (supabase.from("expense_receipts") as any)
      .select(`
        id, created_at,
        documents:document_id (id, file_url, type, uploaded_at)
      `)
      .order("created_at", { ascending: false })

    if (cashMovementId) {
      query = query.eq("cash_movement_id", cashMovementId)
    } else if (recurringPaymentId) {
      query = query.eq("recurring_payment_id", recurringPaymentId)
    }

    const { data: receipts, error } = await query

    if (error) {
      console.error("Error fetching receipts:", error)
      return NextResponse.json({ error: "Error al obtener comprobantes" }, { status: 500 })
    }

    return NextResponse.json({
      receipts: (receipts || []).map((r: any) => ({
        id: r.id,
        file_url: r.documents?.file_url || null,
        uploaded_at: r.documents?.uploaded_at || r.created_at,
      })),
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/receipts:", error)
    return NextResponse.json({ error: error.message || "Error al obtener comprobantes" }, { status: 500 })
  }
}
