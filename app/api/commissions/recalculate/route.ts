import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { processCommissionsForOperations } from "@/lib/commissions/calculate"

export async function POST() {
  try {
    const { user } = await getCurrentUser()

    // Only admins can trigger recalculation
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    await processCommissionsForOperations()

    return NextResponse.json({ success: true, message: "Comisiones recalculadas exitosamente" })
  } catch (error) {
    console.error("Error recalculating commissions:", error)
    return NextResponse.json({ error: "Error al recalcular comisiones" }, { status: 500 })
  }
}
