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
      try {
        const extractedImage = await extractImageFromPdf(Buffer.from(fileBuffer))
        if (!extractedImage) {
          console.error("❌ No se pudo extraer ninguna imagen del PDF")
          return NextResponse.json(
            { error: "No se encontraron imágenes en el PDF. El PDF debe contener una imagen escaneada del documento (no texto digitalizado). Intentá convertir el PDF a JPG o PNG primero." },
            { status: 400 }
          )
        }
        base64Image = extractedImage.base64
        mimeType = extractedImage.mimeType
      } catch (error) {
        console.error("❌ Error procesando PDF:", error)
        const errorMessage = error instanceof Error ? error.message : "Error desconocido"
        return NextResponse.json(
          { error: `Error al procesar el PDF: ${errorMessage}. Intentá subir una imagen directamente (JPG, PNG).` },
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
- procedure_number: Número de trámite o pasaporte (si está visible en el documento)
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
- procedure_number: Número de trámite del DNI (generalmente aparece en el frente del documento, puede estar como "TRAMITE N°", "Tram. N°", "Trámite" o similar)
- first_name: Nombre(s)
- last_name: Apellido(s)
- full_name: Nombre completo tal como aparece
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD
- nationality: "Argentina" o "ARG"
- sex: Sexo (M/F/X)

CONVERSIÓN DE FECHAS:
- Si la fecha aparece como "09 ENE 1987" convierte a "1987-01-09"
- Si aparece como "09/01/1987" convierte a "1987-01-09"

IMPORTANTE SOBRE EL NÚMERO DE TRÁMITE:
- Busca el número de trámite en el frente del documento, generalmente en la parte inferior o cerca del número de documento
- Puede aparecer como "TRAMITE N° XXXXXXXX" o similar
- Solo inclúyelo si lo puedes leer claramente

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.`
    }

    // Llamar a OpenAI Vision
    const openai = new OpenAI({ apiKey: openaiApiKey })
    
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
    // Primero intentar extracción directa de bytes (más rápido y confiable para PDFs escaneados)
    const extractedImage = extractImageFromRawPdf(pdfBuffer)
    if (extractedImage) {
      return extractedImage
    }

    // Si falla, intentar con pdf-lib para acceder a recursos estructurados
    const pdfDoc = await PDFDocument.load(pdfBuffer, { 
      ignoreEncryption: true,
      updateMetadata: false 
    })
    
    const pages = pdfDoc.getPages()
    if (pages.length === 0) {
      return null
    }

    // Buscar imágenes en todas las páginas (priorizando la primera)
    let largestImage: { base64: string; mimeType: string; size: number } | null = null

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex]
      
      try {
        // @ts-ignore - Acceder a recursos internos del PDF usando el nodo
        const pageNode = page.node
        const resources = pageNode.Resources()
        if (!resources) {
          continue
        }

        // @ts-ignore - Buscar diccionario XObject
        const xObjectDict = resources.get(page.doc.context.obj('XObject'))
        if (!xObjectDict) {
          continue
        }

        // @ts-ignore - Obtener claves del diccionario
        const keys = xObjectDict.keys() || []

        for (const key of keys) {
          try {
            // @ts-ignore
            const xObject = xObjectDict.get(key)
            if (!xObject) continue

            // @ts-ignore - Verificar si es una imagen
            const subtype = xObject.get(page.doc.context.obj('Subtype'))
            const subtypeStr = subtype?.toString()
            
            if (subtypeStr !== '/Image' && subtypeStr !== 'Image') {
              continue
            }


            // Extraer datos de la imagen
            // @ts-ignore
            let stream = null
            if (xObject.contents) {
              stream = xObject.contents
            } else if (xObject.getContents) {
              stream = xObject.getContents()
            } else if (xObject.stream) {
              stream = xObject.stream
            }

            if (!stream) {
              continue
            }

            // Convertir stream a buffer
            let imageData: Buffer
            if (Buffer.isBuffer(stream)) {
              imageData = stream
            } else if (typeof stream === 'string') {
              imageData = Buffer.from(stream, 'binary')
            } else if (stream instanceof Uint8Array) {
              imageData = Buffer.from(stream)
            } else {
              // Intentar obtener bytes directamente
              try {
                // @ts-ignore
                const bytes = stream.bytes || stream
                imageData = Buffer.from(bytes)
              } catch {
                continue
              }
            }

            // Determinar tipo de imagen
            let mimeType = 'image/jpeg' // Default
            try {
              // @ts-ignore
              const filter = xObject.get(page.doc.context.obj('Filter'))
              if (filter) {
                const filterStr = filter.toString()
                if (filterStr.includes('DCTDecode') || filterStr.includes('/DCTDecode')) {
                  mimeType = 'image/jpeg'
                } else if (filterStr.includes('FlateDecode') || filterStr.includes('/FlateDecode')) {
                  mimeType = 'image/png'
                } else if (filterStr.includes('CCITTFaxDecode') || filterStr.includes('/CCITTFaxDecode')) {
                  mimeType = 'image/tiff'
                }
              }

              // También verificar ColorSpace
              // @ts-ignore
              const colorSpace = xObject.get(page.doc.context.obj('ColorSpace'))
              if (colorSpace) {
                const csStr = colorSpace.toString()
                if (csStr.includes('DeviceCMYK')) {
                  // CMYK, probablemente JPEG
                  mimeType = 'image/jpeg'
                }
              }
            } catch (e) {
              // Usar default
            }

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

        // Si encontramos una imagen en la primera página, usarla inmediatamente
        if (largestImage && pageIndex === 0) {
          break
        }
      } catch (e) {
        continue
      }
    }

    if (largestImage) {
      return { base64: largestImage.base64, mimeType: largestImage.mimeType }
    }

    return null

  } catch (error) {
    console.error("❌ Error general extrayendo imagen del PDF:", error)
    
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
 * Funciona bien para PDFs escaneados que guardan las imágenes como objetos binarios
 */
function extractImageFromRawPdf(pdfBuffer: Buffer): { base64: string; mimeType: string } | null {
  const bytes = pdfBuffer
  const minSize = 5000 // Reducido a 5KB para encontrar imágenes más pequeñas

  // Buscar imágenes JPEG (marcadores SOI: 0xFF 0xD8 0xFF)
  const jpegStart1 = Buffer.from([0xFF, 0xD8, 0xFF])
  const jpegStart2 = Buffer.from([0xFF, 0xD8]) // También aceptar inicio simple
  const jpegEnd = Buffer.from([0xFF, 0xD9])

  // Encontrar todas las imágenes JPEG y quedarnos con la más grande
  let largestJpeg: Buffer | null = null
  let largestJpegSize = 0
  
  // Buscar con marcador completo primero
  let startIdx = 0
  while (true) {
    startIdx = bytes.indexOf(jpegStart1, startIdx)
    if (startIdx === -1) break
    
    // Buscar el final de esta imagen JPEG
    let endIdx = bytes.indexOf(jpegEnd, startIdx + 3)
    
    if (endIdx !== -1 && endIdx > startIdx) {
      const jpegData = bytes.slice(startIdx, endIdx + 2)
      const size = jpegData.length
      
      // Solo considerar imágenes de tamaño razonable
      if (size >= minSize && size > largestJpegSize) {
        largestJpeg = jpegData
        largestJpegSize = size
      }
    }
    
    // Buscar la siguiente imagen JPEG
    startIdx += 3
  }

  // Si no encontramos con el marcador completo, intentar con marcador simple
  if (!largestJpeg) {
    startIdx = 0
    while (true) {
      startIdx = bytes.indexOf(jpegStart2, startIdx)
      if (startIdx === -1) break
      
      // Verificar que el siguiente byte sea válido para JPEG
      if (startIdx + 2 < bytes.length) {
        const thirdByte = bytes[startIdx + 2]
        if (thirdByte === 0xE0 || thirdByte === 0xE1 || thirdByte === 0xFF) {
          let endIdx = bytes.indexOf(jpegEnd, startIdx + 2)
          
          if (endIdx !== -1 && endIdx > startIdx) {
            const jpegData = bytes.slice(startIdx, endIdx + 2)
            const size = jpegData.length
            
            if (size >= minSize && size > largestJpegSize) {
              largestJpeg = jpegData
              largestJpegSize = size
            }
          }
        }
      }
      
      startIdx += 2
    }
  }

  if (largestJpeg) {
    return {
      base64: largestJpeg.toString('base64'),
      mimeType: 'image/jpeg'
    }
  }

  // Buscar imágenes PNG (marcador: 89 50 4E 47 0D 0A 1A 0A)
  const pngStart = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const pngEnd = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])
  
  startIdx = bytes.indexOf(pngStart)
  if (startIdx !== -1) {
    let endIdx = bytes.indexOf(pngEnd, startIdx + 8)
    if (endIdx !== -1 && endIdx > startIdx) {
      const pngData = bytes.slice(startIdx, endIdx + 8)
      const size = pngData.length
      
      if (size >= minSize) {
        return {
          base64: pngData.toString('base64'),
          mimeType: 'image/png'
        }
      }
    }
  }

  // Buscar múltiples PNGs y quedarnos con la más grande
  startIdx = 0
  let largestPng: Buffer | null = null
  let largestPngSize = 0
  
  while (true) {
    startIdx = bytes.indexOf(pngStart, startIdx)
    if (startIdx === -1) break
    
    let endIdx = bytes.indexOf(pngEnd, startIdx + 8)
    if (endIdx !== -1 && endIdx > startIdx) {
      const pngData = bytes.slice(startIdx, endIdx + 8)
      const size = pngData.length
      
      if (size >= minSize && size > largestPngSize) {
        largestPng = pngData
        largestPngSize = size
      }
    }
    
    startIdx += 8
  }

  if (largestPng) {
    return {
      base64: largestPng.toString('base64'),
      mimeType: 'image/png'
    }
  }

  return null
}
