import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const operationId = searchParams.get("operationId")

    if (!operationId) {
      return NextResponse.json({ error: "operationId es requerido" }, { status: 400 })
    }

    // Eliminar todas las alertas de esta operación
    const { error, count } = await supabase
      .from("alerts")
      .delete()
      .eq("operation_id", operationId)

    if (error) {
      console.error("Error deleting alerts:", error)
      return NextResponse.json({ error: "Error al eliminar alertas" }, { status: 500 })
    }

    console.log(`✅ Eliminadas ${count || 0} alertas de operación ${operationId}`)

    return NextResponse.json({ 
      success: true, 
      deletedAlerts: count || 0 
    })
  } catch (error) {
    console.error("Error in DELETE /api/alerts/cleanup:", error)
    return NextResponse.json({ error: "Error al limpiar alertas" }, { status: 500 })
  }
}

