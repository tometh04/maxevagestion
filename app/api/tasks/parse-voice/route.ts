import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const body = await request.json()
    const { transcript } = body

    if (!transcript?.trim()) {
      return NextResponse.json({ error: "Sin transcripción" }, { status: 400 })
    }

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      // Fallback: return transcript as title
      return NextResponse.json({ task: { title: transcript.trim() } })
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    const today = new Date().toISOString().split("T")[0]

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `Sos un asistente que parsea instrucciones de voz en español argentino y las convierte en tareas estructuradas para un sistema de gestión de agencia de viajes.

Fecha de hoy: ${today}

Devolvé SOLO un JSON válido con estos campos (todos opcionales excepto title):
{
  "title": "string - título conciso de la tarea",
  "description": "string - detalles adicionales si los hay",
  "priority": "LOW | MEDIUM | HIGH | URGENT",
  "due_date": "YYYY-MM-DD o YYYY-MM-DDTHH:mm - si mencionan fecha/hora",
  "reminder_minutes": number - 15, 30, 60, o 1440 si mencionan recordatorio
}

Reglas:
- Si dicen "urgente" o "ya" → priority: "URGENT"
- Si dicen "importante" → priority: "HIGH"
- Si dicen "mañana" → due_date del día siguiente
- Si dicen "hoy" → due_date de hoy
- Si dicen "esta semana" → due_date del viernes
- Si mencionan hora → incluir en due_date como "T" + hora
- Si dicen "recordame" o "avisame" → agregar reminder_minutes: 30 por defecto
- El título debe ser conciso y claro
- La descripción solo si hay info extra que no cabe en el título`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      response_format: { type: "json_object" },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ task: { title: transcript.trim() } })
    }

    try {
      const parsed = JSON.parse(content)
      return NextResponse.json({ task: parsed })
    } catch {
      return NextResponse.json({ task: { title: transcript.trim() } })
    }
  } catch (error) {
    console.error("Error in POST /api/tasks/parse-voice:", error)
    return NextResponse.json({ task: { title: "" }, error: "Error al procesar voz" }, { status: 500 })
  }
}
