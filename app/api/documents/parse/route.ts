import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json({ error: "Falta documentId" }, { status: 400 })
    }

    // Get document
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    // Get file from Supabase Storage
    const doc = document as any
    const fileUrl = doc.file_url
    const imageResponse = await fetch(fileUrl)
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString("base64")

    // Call OpenAI Vision
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extrae la información de este documento (${doc.type}). 
              Devuelve un JSON con: first_name, last_name, document_type, document_number, date_of_birth, expiration_date, nationality.
              Si algún campo no está disponible, usa null.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    })

    const responseText = completion.choices[0]?.message?.content || "{}"
    let parsedData: any
    try {
      parsedData = JSON.parse(responseText)
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/)
      parsedData = jsonMatch ? JSON.parse(jsonMatch[1]) : {}
    }

    // Create or update customer
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
          // @ts-ignore - Supabase type inference issue with customers table
          const updateQuery = supabase.from("customers").update(updateData).eq("id", customerId)
          await updateQuery
        }
      }
    }

    return NextResponse.json({ success: true, data: parsedData })
  } catch (error) {
    console.error("OCR error:", error)
    return NextResponse.json({ error: "Error al procesar el documento" }, { status: 500 })
  }
}
