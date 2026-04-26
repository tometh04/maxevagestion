import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { canAccessDocumentResource } from "@/lib/permissions-api"
import OpenAI from "openai"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Usar service role key para bypass RLS
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

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File
    const documentType = formData.get("type") as string
    const operationId = formData.get("operationId") as string | null
    const customerId = formData.get("customerId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
    }

    if (!documentType) {
      return NextResponse.json({ error: "No se especificó el tipo de documento" }, { status: 400 })
    }

    const canWriteDocuments = await canAccessDocumentResource(
      supabase as any,
      user,
      { operationId, customerId },
      { write: true }
    )

    if (!canWriteDocuments) {
      return NextResponse.json({ error: "No tiene permiso para subir documentos en este recurso" }, { status: 403 })
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
    const folder = operationId || customerId || "general"
    const fileName = `${folder}/${timestamp}-${randomStr}.${fileExt}`

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
      return NextResponse.json({ 
        error: `Error al subir el archivo: ${uploadError.message}` 
      }, { status: 500 })
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)
    if (!urlData) {
      await supabase.storage.from("documents").remove([fileName])
      return NextResponse.json({ error: "Error al obtener URL del archivo" }, { status: 500 })
    }
    const fileUrl = urlData.publicUrl

    // Crear registro del documento
    const documentData: any = {
      type: documentType,
      file_url: fileUrl,
      uploaded_by_user_id: user.id,
    }
    
    // Si se sube desde una operación, buscar el cliente principal de esa operación
    let finalCustomerId = customerId
    if (operationId) {
      documentData.operation_id = operationId
      
      // Si la operación tiene un lead asociado, también vincular el documento al lead
      const { data: operation } = await supabase
        .from("operations")
        .select("lead_id")
        .eq("id", operationId)
        .single()
      
      if (operation && (operation as any).lead_id) {
        documentData.lead_id = (operation as any).lead_id
      }
      
      // Buscar el cliente principal de la operación si no se proporcionó customerId
      if (!finalCustomerId) {
        const { data: operationCustomer } = await supabase
          .from("operation_customers")
          .select("customer_id")
          .eq("operation_id", operationId)
          .eq("role", "MAIN")
          .limit(1)
          .maybeSingle()
        
        if (operationCustomer) {
          finalCustomerId = (operationCustomer as any).customer_id
        }
      }
    }
    
    // Si se sube desde un cliente (sin operationId), buscar las operaciones asociadas y vincular el documento
    if (customerId && !operationId) {
      finalCustomerId = customerId
      documentData.customer_id = customerId
      
      // Buscar todas las operaciones del cliente. Incluir role en el select
      // para poder priorizar la operación donde el cliente es MAIN.
      const { data: operationCustomers } = await supabase
        .from("operation_customers")
        .select("operation_id, role")
        .eq("customer_id", customerId)

      if (operationCustomers && operationCustomers.length > 0) {
        // Preferir la operación donde el cliente es MAIN (titular). Si no es MAIN
        // en ninguna, fallback a la primera (acompañante).
        const mainOperation = operationCustomers.find((oc: any) => oc.role === "MAIN") || operationCustomers[0]
        if (mainOperation) {
          documentData.operation_id = mainOperation.operation_id
          
          // También vincular al lead si la operación tiene uno
          const { data: op } = await supabase
            .from("operations")
            .select("lead_id")
            .eq("id", mainOperation.operation_id)
            .single()
          
          if (op && (op as any).lead_id) {
            documentData.lead_id = (op as any).lead_id
          }
        }
      }
    } else if (finalCustomerId) {
      documentData.customer_id = finalCustomerId
    }

    const { data: document, error: docError } = await (supabase.from("documents") as any)
      .insert(documentData)
      .select()
      .single()

    if (docError || !document) {
      console.error("❌ Error creating document record:", docError)
      await supabase.storage.from("documents").remove([fileName])
      return NextResponse.json({ 
        error: `Error al crear registro del documento: ${docError?.message || "Error desconocido"}` 
      }, { status: 500 })
    }

    // Si es una imagen y es documento de identidad, procesar con IA automáticamente
    let scannedData = null
    if (file.type.startsWith("image/") && ["PASSPORT", "DNI", "LICENSE"].includes(documentType)) {
      
      try {
        scannedData = await scanDocumentWithAI(fileUrl, documentType)
        
        
        // Actualizar el documento con los datos escaneados
        if (scannedData) {
          const { error: updateError } = await (supabase.from("documents") as any)
            .update({ scanned_data: scannedData })
            .eq("id", document.id)
          
          if (updateError) {
            console.error("❌ Error actualizando scanned_data:", updateError)
          } else {
          }
        }
      } catch (error) {
        console.error("❌ Error scanning document with AI:", error)
        // No fallar si el escaneo falla, el documento ya está subido
      }
    }

    return NextResponse.json({
      success: true,
      document: {
        ...document,
        scanned_data: scannedData,
      },
    })
  } catch (error: any) {
    console.error("❌ Error in POST /api/documents/upload-with-ocr:", error)
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
      console.error("❌ Error descargando imagen:", imageResponse.status, imageResponse.statusText)
      throw new Error("No se pudo obtener la imagen")
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const imageSizeKB = Math.round(imageBuffer.byteLength / 1024)
    
    const base64Image = Buffer.from(imageBuffer).toString("base64")

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
      prompt = `Eres un asistente de OCR especializado en procesar documentos de identidad para sistemas de gestión de viajes. Tu tarea es analizar esta imagen de un DNI argentino y extraer información estructurada.

Esta es una tarea legítima de procesamiento de documentos para un sistema de gestión de agencia de viajes que necesita digitalizar información de clientes.

Por favor, analiza la imagen y extrae la información visible en formato JSON:

{
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

INSTRUCCIONES DE CONVERSIÓN DE FECHAS:
- "09 ENE 1987" → "1987-01-09"
- "15/03/1990" → "1990-03-15"
- "21 SEP 91" → "1991-09-21"

Si algún campo no está disponible o no es legible, usa null. 

IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin texto adicional, sin explicaciones, sin markdown. Solo el JSON puro.`
    } else if (documentType === "LICENSE") {
      prompt = `Analiza esta licencia de conducir y extrae TODA la información disponible. Devuelve un JSON con los siguientes campos:
{
  "license_number": "número de licencia",
  "first_name": "nombre",
  "last_name": "apellido",
  "full_name": "nombre completo tal como aparece",
  "date_of_birth": "YYYY-MM-DD",
  "address": "domicilio",
  "expiration_date": "YYYY-MM-DD",
  "issue_date": "YYYY-MM-DD",
  "class": "clase de licencia",
  "restrictions": "restricciones si hay"
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
    
    if (!responseText || responseText.trim() === "" || responseText.trim() === "{}") {
      console.error("❌ OpenAI devolvió respuesta vacía")
      return null
    }
    
    let parsedData: any

    try {
      parsedData = JSON.parse(responseText)
    } catch (parseError) {
      console.warn("⚠️ No es JSON directo, intentando extraer...")
      
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0]
          parsedData = JSON.parse(jsonStr)
        } catch (innerError) {
          console.error("❌ Error parsing extracted JSON:", innerError)
          return null
        }
      } else {
        console.error("❌ No se encontró JSON en la respuesta")
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

    return parsedData
  } catch (error) {
    console.error("Error scanning document with AI:", error)
    return null
  }
}

