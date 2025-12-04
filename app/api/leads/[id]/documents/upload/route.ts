import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: leadId } = await params
    
    // Usar service role key para bypass RLS (ya validamos autenticación arriba)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Faltan variables de entorno para Supabase")
      return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verificar que el lead existe
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File
    const documentType = formData.get("type") as string

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
    }

    if (!documentType) {
      return NextResponse.json({ error: "No se especificó el tipo de documento" }, { status: 400 })
    }

    // Validar tipo de archivo
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP) y PDF" },
        { status: 400 }
      )
    }

    // Validar tamaño (máximo 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "El archivo es demasiado grande. Máximo 10MB" },
        { status: 400 }
      )
    }

    // Generar nombre único para el archivo
    const fileExt = file.name.split(".").pop() || "jpg"
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileName = `${leadId}/${timestamp}-${randomStr}.${fileExt}`

    // Convertir File a ArrayBuffer
    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await file.arrayBuffer()
    } catch (error: any) {
      console.error("❌ Error converting file to ArrayBuffer:", error)
      return NextResponse.json({ error: "Error al procesar el archivo" }, { status: 500 })
    }

    // Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error("❌ Error uploading file to Supabase Storage:", uploadError)
      console.error("❌ Upload error details:", JSON.stringify(uploadError, null, 2))
      
      // Verificar si el error es porque el bucket no existe
      const errorMessage = uploadError.message || JSON.stringify(uploadError)
      if (errorMessage.includes("Bucket not found") || 
          errorMessage.includes("not found") ||
          errorMessage.includes("does not exist")) {
        return NextResponse.json({ 
          error: "El bucket 'documents' no existe en Supabase Storage. Por favor, créalo desde el dashboard de Supabase (Storage > Create bucket > nombre: 'documents' > público)." 
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: `Error al subir el archivo: ${errorMessage}` 
      }, { status: 500 })
    }

    if (!uploadData) {
      console.error("❌ Upload data is null")
      return NextResponse.json({ error: "Error al subir el archivo: no se recibió confirmación" }, { status: 500 })
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)
    if (!urlData) {
      console.error("❌ Error getting public URL")
      // Intentar eliminar el archivo subido
      await supabase.storage.from("documents").remove([fileName])
      return NextResponse.json({ error: "Error al obtener URL del archivo" }, { status: 500 })
    }
    const fileUrl = urlData.publicUrl

    // Crear registro del documento
    const { data: document, error: docError } = await (supabase.from("documents") as any)
      .insert({
        lead_id: leadId,
        type: documentType as any,
        file_url: fileUrl,
        uploaded_by_user_id: user.id,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error("❌ Error creating document record:", docError)
      // Intentar eliminar el archivo si falla la creación del registro
      try {
        await supabase.storage.from("documents").remove([fileName])
      } catch (removeError) {
        console.error("Error removing file after failed insert:", removeError)
      }
      
      // Verificar si el error es porque falta la columna lead_id
      if (docError?.message?.includes("column") && docError?.message?.includes("lead_id")) {
        return NextResponse.json({ 
          error: "La migración no se ha ejecutado. Por favor, ejecuta la migración 027_add_lead_documents.sql en Supabase." 
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: `Error al crear registro del documento: ${docError?.message || "Error desconocido"}` 
      }, { status: 500 })
    }

    // Si es una imagen, procesar con IA automáticamente
    let scannedData = null
    if (file.type.startsWith("image/") && ["PASSPORT", "DNI", "LICENSE"].includes(documentType)) {
      console.log(`📄 Iniciando escaneo OCR para documento tipo: ${documentType}`)
      console.log(`📄 URL del archivo: ${fileUrl}`)
      
      try {
        scannedData = await scanDocumentWithAI(fileUrl, documentType)
        
        console.log(`📄 Resultado del OCR:`, JSON.stringify(scannedData, null, 2))
        
        // Actualizar el documento con los datos escaneados
        if (scannedData) {
          const { error: updateError } = await (supabase.from("documents") as any)
            .update({ scanned_data: scannedData })
            .eq("id", document.id)
          
          if (updateError) {
            console.error("❌ Error actualizando scanned_data:", updateError)
          } else {
            console.log("✅ scanned_data actualizado correctamente")
          }
        } else {
          console.warn("⚠️ El OCR devolvió null")
        }
      } catch (error) {
        console.error("❌ Error scanning document with AI:", error)
        // No fallar si el escaneo falla, el documento ya está subido
      }
    } else {
      console.log(`📄 No se escanea: tipo de archivo=${file.type}, tipo de documento=${documentType}`)
    }

    return NextResponse.json({
      success: true,
      document: {
        ...document,
        scanned_data: scannedData,
      },
    })
  } catch (error: any) {
    console.error("❌ Error in POST /api/leads/[id]/documents/upload:", error)
    return NextResponse.json({ 
      error: `Error al subir documento: ${error.message || "Error desconocido"}` 
    }, { status: 500 })
  }
}

/**
 * Escanea un documento con OpenAI Vision y extrae datos estructurados
 */
async function scanDocumentWithAI(fileUrl: string, documentType: string): Promise<any | null> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey || openaiApiKey.trim() === "") {
    console.warn("OpenAI API key no configurada, saltando escaneo")
    return null
  }

  const openai = new OpenAI({
    apiKey: openaiApiKey,
  })

  try {
    // Obtener la imagen
    const imageResponse = await fetch(fileUrl)
    if (!imageResponse.ok) {
      throw new Error("No se pudo obtener la imagen")
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString("base64")

    // Determinar el prompt según el tipo de documento
    let prompt = ""
    if (documentType === "PASSPORT") {
      prompt = `Analiza este pasaporte cuidadosamente y extrae TODA la información disponible. 

INSTRUCCIONES IMPORTANTES:
- Lee TODOS los campos visibles en el pasaporte
- Para fechas, conviértelas al formato YYYY-MM-DD (ejemplo: "09 ENE 87" = "1987-01-09", "06 DIC 16" = "2016-12-06")
- Para nombres, respeta exactamente como aparecen (mayúsculas, acentos, etc.)
- El número de pasaporte está en el campo "Número / Number"
- El DNI/Personal Number puede estar en un campo separado
- La autoridad emisora puede ser RENAPER, Policía Federal, etc.
- Lee las líneas MRZ (Machine Readable Zone) en la parte inferior si están visibles

Devuelve un JSON con los siguientes campos:
{
  "document_type": "PASSPORT",
  "document_number": "número completo del pasaporte (ej: AAE422895)",
  "first_name": "nombre(s) de pila (ej: LUCAS ALEJANDRO)",
  "last_name": "apellido(s) (ej: SANCHEZ)",
  "full_name": "nombre completo tal como aparece en el pasaporte",
  "date_of_birth": "YYYY-MM-DD (convertir formato del pasaporte)",
  "nationality": "código de nacionalidad (ej: ARG, ARGENTINA)",
  "place_of_birth": "lugar de nacimiento completo o código",
  "sex": "M/F/X",
  "expiration_date": "YYYY-MM-DD (fecha de vencimiento)",
  "issue_date": "YYYY-MM-DD (fecha de emisión)",
  "issuing_authority": "autoridad emisora (ej: RENAPER, Policía Federal)",
  "personal_number": "número de documento/DNI si está visible",
  "mrz_line1": "primera línea MRZ completa si está visible",
  "mrz_line2": "segunda línea MRZ completa si está visible"
}

IMPORTANTE: 
- Convierte TODAS las fechas al formato YYYY-MM-DD
- Si ves "09 ENE 87" significa 9 de enero de 1987 = "1987-01-09"
- Si ves "06 DIC 16" significa 6 de diciembre de 2016 = "2016-12-06"
- Si ves "06 DIC 26" significa 6 de diciembre de 2026 = "2026-12-06"
- Extrae el número de pasaporte completo (puede tener letras y números)
- Si algún campo no está disponible o no es legible, usa null
- Devuelve SOLO el JSON válido, sin texto adicional, sin markdown, sin comentarios`
    } else if (documentType === "DNI") {
      prompt = `Analiza este DNI argentino y extrae TODA la información disponible. Devuelve un JSON con los siguientes campos:
{
  "document_type": "DNI",
  "document_number": "número de documento",
  "first_name": "nombre",
  "last_name": "apellido",
  "full_name": "nombre completo tal como aparece",
  "date_of_birth": "YYYY-MM-DD",
  "nationality": "ARG",
  "sex": "M/F/X",
  "address": "domicilio si está visible",
  "place_of_birth": "lugar de nacimiento",
  "tramite_number": "número de trámite si está visible",
  "expiration_date": "YYYY-MM-DD si está visible"
}
Si algún campo no está disponible o no es legible, usa null. Devuelve SOLO el JSON, sin texto adicional.`
    } else if (documentType === "LICENSE") {
      prompt = `Analiza esta licencia de conducir y extrae TODA la información disponible. Devuelve un JSON con los siguientes campos:
{
  "document_type": "LICENSE",
  "license_number": "número de licencia",
  "first_name": "nombre",
  "last_name": "apellido",
  "full_name": "nombre completo tal como aparece",
  "date_of_birth": "YYYY-MM-DD",
  "address": "domicilio",
  "expiration_date": "YYYY-MM-DD",
  "issue_date": "YYYY-MM-DD",
  "class": "clase de licencia",
  "restrictions": "restricciones si hay",
  "endorsements": "endorsements si hay"
}
Si algún campo no está disponible o no es legible, usa null. Devuelve SOLO el JSON, sin texto adicional.`
    } else {
      return null
    }

    // Llamar a OpenAI Vision
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
                detail: "high", // Alta resolución para mejor OCR
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" },
    })

    const responseText = completion.choices[0]?.message?.content || "{}"
    console.log("📄 OpenAI response raw:", responseText)
    
    let parsedData: any

    try {
      parsedData = JSON.parse(responseText)
      console.log("📄 Parsed JSON successfully:", Object.keys(parsedData))
    } catch (parseError) {
      console.warn("⚠️ Error parsing JSON, intentando extraer de markdown...")
      // Intentar extraer JSON de markdown code blocks
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[1])
        console.log("📄 Extracted from markdown:", Object.keys(parsedData))
      } else {
        console.error("❌ Error parsing AI response:", responseText)
        return null
      }
    }

    // Agregar metadata
    parsedData.scanned_at = new Date().toISOString()
    parsedData.scanned_by = "openai_gpt4o"
    
    // Contar campos no nulos
    const nonNullFields = Object.entries(parsedData).filter(([k, v]) => v !== null && v !== "").length
    console.log(`📄 Campos extraídos: ${nonNullFields}`)

    return parsedData
  } catch (error) {
    console.error("Error scanning document with AI:", error)
    return null
  }
}

