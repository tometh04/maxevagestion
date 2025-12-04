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
    console.log("📄 Descargando imagen desde:", fileUrl)
    const imageResponse = await fetch(fileUrl)
    if (!imageResponse.ok) {
      console.error("❌ Error descargando imagen:", imageResponse.status, imageResponse.statusText)
      throw new Error("No se pudo obtener la imagen")
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const imageSizeKB = Math.round(imageBuffer.byteLength / 1024)
    console.log(`📄 Imagen descargada: ${imageSizeKB} KB`)
    
    // Si la imagen es muy grande, puede causar problemas
    if (imageSizeKB > 5000) {
      console.warn(`⚠️ Imagen muy grande (${imageSizeKB} KB), puede afectar el OCR`)
    }
    
    const base64Image = Buffer.from(imageBuffer).toString("base64")
    console.log(`📄 Base64 generado: ${Math.round(base64Image.length / 1024)} KB`)

    // Determinar el prompt según el tipo de documento
    let prompt = ""
    if (documentType === "PASSPORT") {
      prompt = `Eres un experto en OCR de documentos de identidad. Analiza esta imagen de un PASAPORTE y extrae la información.

TAREA: Extraer los datos visibles del pasaporte y devolverlos en formato JSON.

CAMPOS A EXTRAER:
- document_number: Número del pasaporte (ej: "AAE422895")
- first_name: Nombre(s) 
- last_name: Apellido(s)
- full_name: Nombre completo
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD
- nationality: Nacionalidad (ej: "ARG" o "ARGENTINA")
- sex: Sexo (M/F)
- expiration_date: Fecha de vencimiento en formato YYYY-MM-DD
- issue_date: Fecha de emisión en formato YYYY-MM-DD
- place_of_birth: Lugar de nacimiento
- personal_number: Número de DNI si está visible

CONVERSIÓN DE FECHAS:
- "09 ENE 87" → "1987-01-09"
- "06 DIC 16" → "2016-12-06"  
- "06 DIC 26" → "2026-12-06"

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.

Ejemplo de respuesta:
{"document_number": "AAE123456", "full_name": "JUAN PEREZ", "expiration_date": "2030-01-15"}`
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
    console.log("📄 Llamando a OpenAI Vision...")
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
      max_tokens: 2000,
      temperature: 0.1, // Más determinístico para OCR
    })
    
    console.log("📄 OpenAI respondió, finish_reason:", completion.choices[0]?.finish_reason)

    const responseText = completion.choices[0]?.message?.content || ""
    console.log("📄 OpenAI response raw:", responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""))
    
    if (!responseText || responseText.trim() === "" || responseText.trim() === "{}") {
      console.error("❌ OpenAI devolvió respuesta vacía")
      return null
    }
    
    let parsedData: any

    try {
      // Intentar parsear directamente
      parsedData = JSON.parse(responseText)
      console.log("📄 Parsed JSON successfully:", Object.keys(parsedData))
    } catch (parseError) {
      console.warn("⚠️ No es JSON directo, intentando extraer...")
      
      // Intentar extraer JSON de markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0]
          parsedData = JSON.parse(jsonStr)
          console.log("📄 Extracted JSON:", Object.keys(parsedData))
        } catch (innerError) {
          console.error("❌ Error parsing extracted JSON:", innerError)
          console.error("❌ Content was:", jsonMatch[0]?.substring(0, 200))
          return null
        }
      } else {
        console.error("❌ No se encontró JSON en la respuesta")
        console.error("❌ Respuesta completa:", responseText)
        return null
      }
    }
    
    // Verificar que parsedData tenga datos útiles
    const usefulKeys = Object.keys(parsedData).filter(k => 
      parsedData[k] !== null && 
      parsedData[k] !== "" && 
      !["scanned_at", "scanned_by", "document_type"].includes(k)
    )
    
    if (usefulKeys.length === 0) {
      console.error("❌ El JSON parseado no tiene datos útiles:", parsedData)
      return null
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

