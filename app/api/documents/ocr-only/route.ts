import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"

/**
 * Endpoint para extraer datos de un documento usando OCR sin guardarlo
 * Solo procesa la imagen y devuelve los datos extraídos
 */
export async function POST(request: Request) {
  try {
    await getCurrentUser()
    
    // Validar API key de OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey || openaiApiKey.trim() === "") {
      return NextResponse.json(
        { error: "OpenAI API key no configurada" },
        { status: 500 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File
    const documentType = formData.get("type") as string || "DNI"

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
    }

    // Validar tipo de archivo
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP)" },
        { status: 400 }
      )
    }

    // Validar tamaño (máximo 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "El archivo es demasiado grande. Máximo 10MB" },
        { status: 400 }
      )
    }

    // Convertir a base64
    const fileBuffer = await file.arrayBuffer()
    const base64Image = Buffer.from(fileBuffer).toString("base64")

    // Preparar prompt según tipo de documento
    let prompt = ""
    if (documentType === "PASSPORT") {
      prompt = `Eres un experto en OCR de documentos de identidad. Analiza esta imagen de un PASAPORTE y extrae la información.

TAREA: Extraer los datos visibles del pasaporte y devolverlos en formato JSON.

CAMPOS A EXTRAER:
- document_type: "PASSPORT"
- document_number: Número del pasaporte (ej: "AAE422895")
- first_name: Nombre(s) 
- last_name: Apellido(s)
- full_name: Nombre completo
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD
- nationality: Nacionalidad (ej: "ARG" o "ARGENTINA")
- sex: Sexo (M/F)
- expiration_date: Fecha de vencimiento en formato YYYY-MM-DD

CONVERSIÓN DE FECHAS:
- "09 ENE 87" → "1987-01-09"
- "06 DIC 16" → "2016-12-06"  
- "06 DIC 26" → "2026-12-06"

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.`
    } else {
      prompt = `Eres un experto en OCR de documentos de identidad. Analiza esta imagen de un DNI y extrae la información.

TAREA: Extraer los datos visibles del DNI y devolverlos en formato JSON.

CAMPOS A EXTRAER:
- document_type: "DNI"
- document_number: Número de documento
- first_name: Nombre(s)
- last_name: Apellido(s)
- full_name: Nombre completo tal como aparece
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD
- nationality: "Argentina" o "ARG"
- sex: Sexo (M/F/X)

CONVERSIÓN DE FECHAS:
- Si la fecha aparece como "09 ENE 1987" convierte a "1987-01-09"
- Si aparece como "09/01/1987" convierte a "1987-01-09"

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.`
    }

    // Llamar a OpenAI Vision
    const openai = new OpenAI({ apiKey: openaiApiKey })
    
    console.log("📄 Procesando documento con OCR...")
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    })

    const responseText = completion.choices[0]?.message?.content || ""
    console.log("📄 OpenAI response:", responseText.substring(0, 300))

    if (!responseText || responseText.trim() === "" || responseText.trim() === "{}") {
      return NextResponse.json({ 
        error: "No se pudieron extraer datos del documento",
        extractedData: null 
      }, { status: 200 })
    }

    // Parsear respuesta JSON
    let extractedData: any = null
    try {
      extractedData = JSON.parse(responseText)
    } catch {
      // Intentar extraer JSON de la respuesta
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0]
          extractedData = JSON.parse(jsonStr)
        } catch {
          console.error("❌ Error parsing extracted JSON")
        }
      }
    }

    if (!extractedData) {
      return NextResponse.json({ 
        error: "No se pudieron parsear los datos del documento",
        extractedData: null 
      }, { status: 200 })
    }

    console.log("✅ Datos extraídos:", Object.keys(extractedData))

    return NextResponse.json({
      success: true,
      extractedData,
    })

  } catch (error) {
    console.error("Error in OCR-only endpoint:", error)
    return NextResponse.json(
      { error: "Error al procesar el documento" },
      { status: 500 }
    )
  }
}
