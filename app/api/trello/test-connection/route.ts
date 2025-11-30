import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, apiKey, token, boardId } = body

    if (!apiKey || !token || !boardId) {
      return NextResponse.json({ error: "Faltan credenciales" }, { status: 400 })
    }

    // Test Trello API connection
    const response = await fetch(`https://api.trello.com/1/boards/${boardId}?key=${apiKey}&token=${token}`)

    if (!response.ok) {
      return NextResponse.json({ error: "Error al conectar con Trello" }, { status: 400 })
    }

    const board = await response.json()

    return NextResponse.json({ success: true, board: { name: board.name, id: board.id } })
  } catch (error) {
    return NextResponse.json({ error: "Error al probar conexión" }, { status: 500 })
  }
}

