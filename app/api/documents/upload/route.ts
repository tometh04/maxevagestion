import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
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
    
    const formData = await request.formData()

    const file = formData.get("file") as File
    const type = formData.get("type") as string
    const operationId = formData.get("operationId") as string | null
    const customerId = formData.get("customerId") as string | null

    if (!file || !type) {
      return NextResponse.json({ error: "Falta archivo o tipo de documento" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "El archivo es demasiado grande (máx 10MB)" }, { status: 400 })
    }

    // Generate unique filename with folder structure
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileExt = file.name.split(".").pop()
    const folder = operationId || customerId || "general"
    const fileName = `${folder}/${timestamp}-${randomStr}.${fileExt}`

    console.log(`📄 Subiendo documento: ${fileName}`)

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError || !uploadData) {
      console.error("❌ Error uploading file:", uploadError)
      
      // Check if bucket doesn't exist
      const errorMessage = uploadError?.message || JSON.stringify(uploadError)
      if (errorMessage.includes("Bucket not found") || errorMessage.includes("not found")) {
        return NextResponse.json({ 
          error: "El bucket 'documents' no existe en Supabase Storage. Créalo desde el dashboard." 
        }, { status: 500 })
      }
      
      return NextResponse.json({ error: `Error al subir el archivo: ${errorMessage}` }, { status: 500 })
    }

    console.log(`✅ Archivo subido: ${uploadData.path}`)

    // Get public URL
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)
    const fileUrl = urlData.publicUrl

    // Si se sube desde una operación, buscar el cliente principal de esa operación
    let finalCustomerId = customerId
    let finalOperationId = operationId || null
    
    if (operationId && !finalCustomerId) {
      const { data: operationCustomer } = await supabase
        .from("operation_customers")
        .select("customer_id")
        .eq("operation_id", operationId)
        .eq("role", "MAIN")
        .limit(1)
        .maybeSingle()
      
      if (operationCustomer) {
        finalCustomerId = (operationCustomer as any).customer_id
        console.log(`✅ Documento asociado automáticamente al cliente ${finalCustomerId} de la operación ${operationId}`)
      }
    }
    
    // Si se sube desde un cliente (sin operationId), buscar las operaciones asociadas y vincular el documento
    if (customerId && !operationId) {
      finalCustomerId = customerId
      
      // Buscar todas las operaciones del cliente
      const { data: operationCustomers } = await supabase
        .from("operation_customers")
        .select("operation_id, role")
        .eq("customer_id", customerId)
      
      if (operationCustomers && operationCustomers.length > 0) {
        // Si el cliente tiene solo una operación, asociar el documento a esa operación
        // Si tiene múltiples, asociar a la principal (MAIN) o la primera
        const mainOperation = operationCustomers.find((oc: any) => oc.role === "MAIN") || operationCustomers[0]
        if (mainOperation) {
          finalOperationId = mainOperation.operation_id
          console.log(`✅ Documento asociado automáticamente a la operación ${mainOperation.operation_id} del cliente ${customerId}`)
        }
      }
    }

    // Create document record
    const { data: document, error: docError } = await (supabase.from("documents") as any)
      .insert({
        operation_id: finalOperationId,
        customer_id: finalCustomerId || null,
        type: type as any,
        file_url: fileUrl,
        uploaded_by_user_id: user.id,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error("❌ Error creating document record:", docError)
      // Try to delete uploaded file if document creation fails
      await supabase.storage.from("documents").remove([fileName])
      return NextResponse.json({ error: "Error al crear registro del documento" }, { status: 500 })
    }

    console.log(`✅ Documento creado: ${document.id}`)

    // Si es imagen y es DNI/Pasaporte, procesar con IA
    let scannedData = null
    if (file.type.startsWith("image/") && ["PASSPORT", "DNI", "LICENSE"].includes(type)) {
      console.log(`📄 Iniciando escaneo OCR para documento tipo: ${type}`)
      try {
        scannedData = await scanDocumentWithAI(fileUrl, type)
        
        if (scannedData) {
          const { error: updateError } = await (supabase.from("documents") as any)
            .update({ scanned_data: scannedData })
            .eq("id", document.id)
          
          if (updateError) {
            console.error("❌ Error actualizando scanned_data:", updateError)
          } else {
            console.log("✅ scanned_data actualizado correctamente")
          }
        }
      } catch (error) {
        console.error("❌ Error scanning document with AI:", error)
      }
    }

    return NextResponse.json({ 
      success: true, 
      document: {
        ...document,
        scanned_data: scannedData,
      }
    })
  } catch (error) {
    console.error("Error in POST /api/documents/upload:", error)
    return NextResponse.json({ error: "Error al subir documento" }, { status: 500 })
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
    console.log("📄 Descargando imagen desde:", fileUrl)
    const imageResponse = await fetch(fileUrl)
    if (!imageResponse.ok) {
      console.error("❌ Error descargando imagen:", imageResponse.status)
      throw new Error("No se pudo obtener la imagen")
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString("base64")

    let prompt = ""
    if (documentType === "PASSPORT") {
      prompt = `Analiza este PASAPORTE y extrae la información. Devuelve SOLO un JSON con estos campos:
{
  "document_number": "número del pasaporte",
  "first_name": "nombre",
  "last_name": "apellido",
  "full_name": "nombre completo",
  "date_of_birth": "YYYY-MM-DD",
  "nationality": "nacionalidad",
  "sex": "M/F",
  "expiration_date": "YYYY-MM-DD",
  "issue_date": "YYYY-MM-DD"
}
Si un campo no es legible, usa null. Convierte fechas como "09 ENE 87" a "1987-01-09".`
    } else if (documentType === "DNI") {
      prompt = `Analiza este DNI argentino y extrae la información. Devuelve SOLO un JSON con estos campos:
{
  "document_number": "número de DNI",
  "first_name": "nombre",
  "last_name": "apellido",
  "full_name": "nombre completo",
  "date_of_birth": "YYYY-MM-DD",
  "sex": "M/F",
  "expiration_date": "YYYY-MM-DD si está visible"
}
Si un campo no es legible, usa null.`
    } else {
      return null
    }

    console.log("📄 Llamando a OpenAI Vision...")
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
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
      max_tokens: 1000,
      temperature: 0.1,
    })

    const responseText = completion.choices[0]?.message?.content || ""
    console.log("📄 OpenAI response:", responseText.substring(0, 300))

    if (!responseText || responseText.trim() === "{}") {
      return null
    }

    let parsedData: any
    try {
      parsedData = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[1] || jsonMatch[0])
      } else {
        return null
      }
    }

    parsedData.scanned_at = new Date().toISOString()
    parsedData.scanned_by = "openai_gpt4o"

    return parsedData
  } catch (error) {
    console.error("Error scanning document:", error)
    return null
  }
}
