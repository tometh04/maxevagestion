import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json({ error: "Falta documentId" }, { status: 400 })
    }

    // Validar API key de OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey || openaiApiKey.trim() === "") {
      return NextResponse.json(
        { error: "OpenAI API key no configurada. Configura OPENAI_API_KEY en las variables de entorno." },
        { status: 500 }
      )
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    // Get document
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    const doc = document as any
    const fileUrl = doc.file_url
    const documentType = doc.type

    console.log(`📄 Iniciando OCR para documento ${documentId}, tipo: ${documentType}`)
    console.log(`📄 URL: ${fileUrl}`)

    // Get file from URL
    const imageResponse = await fetch(fileUrl)
    if (!imageResponse.ok) {
      console.error("❌ Error descargando imagen:", imageResponse.status)
      return NextResponse.json({ error: "No se pudo obtener la imagen" }, { status: 500 })
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const imageSizeKB = Math.round(imageBuffer.byteLength / 1024)
    console.log(`📄 Imagen descargada: ${imageSizeKB} KB`)
    
    const base64Image = Buffer.from(imageBuffer).toString("base64")

    // Determinar el prompt según el tipo de documento (igual que en leads)
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
- document_type: "PASSPORT"

CONVERSIÓN DE FECHAS:
- "09 ENE 87" → "1987-01-09"
- "06 DIC 16" → "2016-12-06"  
- "06 DIC 26" → "2026-12-06"

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.

Ejemplo de respuesta:
{"document_number": "AAE123456", "full_name": "JUAN PEREZ", "first_name": "JUAN", "last_name": "PEREZ", "expiration_date": "2030-01-15", "document_type": "PASSPORT"}`
    } else if (documentType === "DNI") {
      prompt = `Eres un experto en OCR de documentos de identidad. Analiza este DNI argentino y extrae TODA la información disponible. 

Devuelve un JSON con los siguientes campos:
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

CONVERSIÓN DE FECHAS:
- "09 ENE 1987" → "1987-01-09"
- "15/03/1990" → "1990-03-15"

Si algún campo no está disponible o no es legible, usa null. Devuelve SOLO el JSON, sin texto adicional.`
    } else {
      // Prompt genérico para otros tipos
      prompt = `Analiza este documento y extrae toda la información personal que puedas encontrar.
Devuelve un JSON con los siguientes campos (si están disponibles):
{
  "document_type": "tipo de documento",
  "document_number": "número",
  "first_name": "nombre",
  "last_name": "apellido", 
  "full_name": "nombre completo",
  "date_of_birth": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "nationality": "nacionalidad"
}
Si algún campo no está disponible, usa null. Devuelve SOLO el JSON.`
    }

    // Call OpenAI Vision con configuración optimizada
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
    console.log("📄 OpenAI response raw:", responseText.substring(0, 500))

    if (!responseText || responseText.trim() === "" || responseText.trim() === "{}") {
      console.error("❌ OpenAI devolvió respuesta vacía")
      return NextResponse.json({ error: "No se pudieron extraer datos del documento" }, { status: 400 })
    }

    let parsedData: any
    try {
      // Intentar parsear directamente
      parsedData = JSON.parse(responseText)
      console.log("📄 Parsed JSON directly:", Object.keys(parsedData))
    } catch {
      // Intentar extraer JSON de markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0]
          parsedData = JSON.parse(jsonStr)
          console.log("📄 Extracted JSON from markdown:", Object.keys(parsedData))
        } catch (innerError) {
          console.error("❌ Error parsing extracted JSON:", innerError)
          return NextResponse.json({ error: "Error al procesar respuesta del OCR" }, { status: 500 })
        }
      } else {
        console.error("❌ No se encontró JSON en la respuesta")
        return NextResponse.json({ error: "No se encontró información en la respuesta" }, { status: 500 })
      }
    }

    // Verificar que parsedData tenga datos útiles
    const usefulKeys = Object.keys(parsedData).filter(k => 
      parsedData[k] !== null && 
      parsedData[k] !== "" && 
      !["scanned_at", "scanned_by"].includes(k)
    )
    
    if (usefulKeys.length === 0) {
      console.error("❌ El JSON parseado no tiene datos útiles:", parsedData)
      return NextResponse.json({ error: "No se pudieron extraer datos útiles del documento" }, { status: 400 })
    }

    console.log(`📄 Campos extraídos exitosamente: ${usefulKeys.join(", ")}`)

    // Agregar metadata
    parsedData.scanned_at = new Date().toISOString()
    parsedData.scanned_by = "openai_gpt4o"

    // Actualizar el documento con los datos escaneados
    const { error: updateError } = await (supabase.from("documents") as any)
      .update({ scanned_data: parsedData })
      .eq("id", documentId)

    if (updateError) {
      console.error("❌ Error actualizando scanned_data:", updateError)
    } else {
      console.log("✅ scanned_data guardado en el documento")
    }

    // También actualizar/crear cliente si hay datos suficientes
    if (parsedData.first_name || parsedData.last_name || parsedData.document_number) {
      let customerId = doc.customer_id

      if (!customerId && parsedData.document_number) {
        // Check if customer exists by document
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("document_number", parsedData.document_number)
          .single()

        if (existingCustomer) {
          customerId = (existingCustomer as any).id
        } else {
          // Create new customer
          const { data: newCustomer } = await supabase
            .from("customers")
            .insert({
              first_name: parsedData.first_name || "",
              last_name: parsedData.last_name || "",
              phone: "",
              email: "",
              document_type: parsedData.document_type || doc.type,
              document_number: parsedData.document_number || null,
              date_of_birth: parsedData.date_of_birth || null,
              nationality: parsedData.nationality || null,
            } as any)
            .select()
            .single()

          if (newCustomer) {
            customerId = (newCustomer as any).id
            console.log(`✅ Cliente creado: ${customerId}`)
          }
        }
      }

      if (customerId) {
        // Update customer with parsed data
        const updateData: Record<string, any> = {}
        if (parsedData.first_name) updateData.first_name = parsedData.first_name
        if (parsedData.last_name) updateData.last_name = parsedData.last_name
        if (parsedData.document_type) updateData.document_type = parsedData.document_type
        if (parsedData.document_number) updateData.document_number = parsedData.document_number
        if (parsedData.date_of_birth) updateData.date_of_birth = parsedData.date_of_birth
        if (parsedData.nationality) updateData.nationality = parsedData.nationality
        
        if (Object.keys(updateData).length > 0) {
          const { error: custUpdateError } = await (supabase.from("customers") as any)
            .update(updateData)
            .eq("id", customerId)
          
          if (!custUpdateError) {
            console.log(`✅ Cliente actualizado: ${customerId}`)
          }
        }
      }
    }

    return NextResponse.json({ success: true, data: parsedData })
  } catch (error) {
    console.error("OCR error:", error)
    return NextResponse.json({ error: "Error al procesar el documento" }, { status: 500 })
  }
}
