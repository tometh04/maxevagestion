import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { parseStatement } from "@/lib/ai/statement-parser"

// Render de PDF + llamada a OpenAI pueden tardar; damos margen (Railway).
export const maxDuration = 120

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * POST /api/expenses/cc-payment/parse-statement
 *
 * Recibe el PDF del resumen de tarjeta y devuelve los consumos desglosados
 * (agrupados por moneda) para PRECARGAR el diálogo "Pago Tarjeta". No persiste
 * contabilidad: son datos candidatos que el usuario revisa y confirma con el
 * POST /api/expenses/cc-payment ya validado. (extract_only siempre.)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para cargar resúmenes de tarjeta" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const contentType = request.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Se espera el archivo del resumen (multipart/form-data)" }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo del resumen" }, { status: 400 })
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "El resumen debe ser un archivo PDF" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El PDF supera el tamaño máximo (10MB)" }, { status: 400 })
    }

    const fileBuffer = await file.arrayBuffer()

    // parseStatement nunca lanza por fallas de OCR: devuelve ocr_extracted:false
    // + ocr_error para que el usuario cargue a mano (degradación sin romper).
    const result = await parseStatement(fileBuffer)

    return NextResponse.json({
      extract_only: true,
      document_name: file.name,
      ...result,
    })
  } catch (error: any) {
    console.error("Error in POST /api/expenses/cc-payment/parse-statement:", error)
    return NextResponse.json({ error: "Error al procesar el resumen" }, { status: 500 })
  }
}
