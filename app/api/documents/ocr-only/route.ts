import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import { PDFDocument } from "pdf-lib"

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
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP) o PDFs" },
        { status: 400 }
      )
    }

    // Validar tamaño (máximo 15MB)
    const maxSize = 15 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "El archivo es demasiado grande. Máximo 15MB" },
        { status: 400 }
      )
    }

    // Convertir a base64
    const fileBuffer = await file.arrayBuffer()
    let base64Image: string
    let mimeType = "image/jpeg"

    // ============================================
    // NUEVO: Si es PDF, extraer la imagen embebida
    // ============================================
    if (file.type === "application/pdf") {
      console.log("📄 Procesando PDF...")
      try {
        const extractedImage = await extractImageFromPdf(Buffer.from(fileBuffer))
        if (!extractedImage) {
          return NextResponse.json(
            { error: "No se pudo extraer la imagen del PDF. Asegurate de que el PDF contenga una imagen escaneada del documento." },
            { status: 400 }
          )
        }
        base64Image = extractedImage.base64
        mimeType = extractedImage.mimeType
        console.log(`✅ Imagen extraída del PDF: ${mimeType}, ${Math.round(base64Image.length / 1024)}KB`)
      } catch (error) {
        console.error("❌ Error procesando PDF:", error)
        return NextResponse.json(
          { error: "Error al procesar el PDF. Intentá subir una imagen directamente (JPG, PNG)." },
          { status: 400 }
        )
      }
    } else {
      // Imagen normal
      base64Image = Buffer.from(fileBuffer).toString("base64")
      mimeType = file.type
    }

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
                url: `data:${mimeType};base64,${base64Image}`,
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

/**
 * Extrae la imagen más grande embebida en un PDF
 * La mayoría de los PDFs de documentos escaneados contienen una imagen JPG o PNG
 */
async function extractImageFromPdf(pdfBuffer: Buffer): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { 
      ignoreEncryption: true,
      updateMetadata: false 
    })
    
    const pages = pdfDoc.getPages()
    if (pages.length === 0) {
      console.log("❌ PDF sin páginas")
      return null
    }

    // Buscar imágenes en todas las páginas (priorizando la primera)
    let largestImage: { base64: string; mimeType: string; size: number } | null = null

    for (const page of pages) {
      // @ts-ignore - Acceder a recursos internos del PDF
      const resources = page.node.Resources()
      if (!resources) continue

      // @ts-ignore
      const xObjects = resources.lookup(PDFDocument.prototype.context?.obj?.('XObject') as any)
      if (!xObjects) continue

      // Iterar sobre los XObjects buscando imágenes
      // @ts-ignore
      const xObjectDict = resources.get(pdfDoc.context.obj('XObject'))
      if (!xObjectDict) continue

      // @ts-ignore
      const keys = xObjectDict.keys()
      for (const key of keys) {
        try {
          // @ts-ignore
          const xObject = xObjectDict.get(key)
          if (!xObject) continue

          // @ts-ignore
          const subtype = xObject.get(pdfDoc.context.obj('Subtype'))
          // @ts-ignore
          if (subtype?.toString() !== '/Image') continue

          // Extraer datos de la imagen
          // @ts-ignore
          const stream = xObject.getContents?.() || xObject.contents
          if (!stream) continue

          // Determinar tipo de imagen
          // @ts-ignore
          const filter = xObject.get(pdfDoc.context.obj('Filter'))
          let mimeType = 'image/jpeg' // Default
          
          if (filter) {
            const filterStr = filter.toString()
            if (filterStr.includes('DCTDecode')) {
              mimeType = 'image/jpeg'
            } else if (filterStr.includes('FlateDecode')) {
              mimeType = 'image/png'
            }
          }

          const imageData = Buffer.from(stream)
          const base64 = imageData.toString('base64')
          const size = imageData.length

          // Guardar si es la más grande
          if (!largestImage || size > largestImage.size) {
            largestImage = { base64, mimeType, size }
          }
        } catch (e) {
          // Continuar con el siguiente objeto
          continue
        }
      }

      // Si encontramos una imagen en la primera página, usarla
      if (largestImage && pages.indexOf(page) === 0) {
        break
      }
    }

    if (largestImage) {
      return { base64: largestImage.base64, mimeType: largestImage.mimeType }
    }

    // Fallback: Si no encontramos imágenes con el método anterior,
    // intentar obtener los bytes raw del PDF y buscar marcadores JPEG/PNG
    console.log("⚠️ No se encontraron imágenes con XObject, intentando extracción directa...")
    
    const extractedImage = extractImageFromRawPdf(pdfBuffer)
    if (extractedImage) {
      return extractedImage
    }

    console.log("❌ No se encontraron imágenes en el PDF")
    return null

  } catch (error) {
    console.error("Error extracting image from PDF:", error)
    
    // Último intento: extracción directa de bytes
    const extractedImage = extractImageFromRawPdf(pdfBuffer)
    if (extractedImage) {
      return extractedImage
    }
    
    return null
  }
}

/**
 * Extrae imágenes directamente de los bytes del PDF buscando marcadores JPEG/PNG
 * Este es un fallback cuando pdf-lib no puede extraer las imágenes con XObject
 */
function extractImageFromRawPdf(pdfBuffer: Buffer): { base64: string; mimeType: string } | null {
  const bytes = pdfBuffer

  // Buscar imágenes JPEG (marcadores SOI y EOI)
  const jpegStart = Buffer.from([0xFF, 0xD8, 0xFF])
  const jpegEnd = Buffer.from([0xFF, 0xD9])

  let startIdx = bytes.indexOf(jpegStart)
  let endIdx = -1
  
  // Encontrar todas las imágenes JPEG y quedarnos con la más grande
  let largestJpeg: Buffer | null = null
  
  while (startIdx !== -1) {
    // Buscar el final de esta imagen JPEG
    endIdx = bytes.indexOf(jpegEnd, startIdx + 3)
    
    if (endIdx !== -1) {
      const jpegData = bytes.slice(startIdx, endIdx + 2)
      
      // Solo considerar imágenes de tamaño razonable (> 10KB)
      if (jpegData.length > 10000 && (!largestJpeg || jpegData.length > largestJpeg.length)) {
        largestJpeg = jpegData
      }
    }
    
    // Buscar la siguiente imagen JPEG
    startIdx = bytes.indexOf(jpegStart, startIdx + 3)
  }

  if (largestJpeg) {
    console.log(`✅ Imagen JPEG encontrada: ${Math.round(largestJpeg.length / 1024)}KB`)
    return {
      base64: largestJpeg.toString('base64'),
      mimeType: 'image/jpeg'
    }
  }

  // Buscar imágenes PNG
  const pngStart = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const pngEnd = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])
  
  startIdx = bytes.indexOf(pngStart)
  if (startIdx !== -1) {
    endIdx = bytes.indexOf(pngEnd, startIdx)
    if (endIdx !== -1) {
      const pngData = bytes.slice(startIdx, endIdx + 8)
      if (pngData.length > 10000) {
        console.log(`✅ Imagen PNG encontrada: ${Math.round(pngData.length / 1024)}KB`)
        return {
          base64: pngData.toString('base64'),
          mimeType: 'image/png'
        }
      }
    }
  }

  return null
}
