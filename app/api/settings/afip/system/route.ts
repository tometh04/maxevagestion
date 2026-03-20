/**
 * Retorna qué credenciales AFIP están pre-configuradas en variables de entorno.
 * El frontend las usa para decidir qué campos mostrar en el formulario.
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const cuit = process.env.AFIP_CUIT?.replace(/\D/g, "") || null
    const hasPassword = !!process.env.AFIP_PASSWORD

    return NextResponse.json({
      cuitConfigured: !!cuit,
      passwordConfigured: hasPassword,
      // Mascara el CUIT para mostrarlo en la UI sin exponer el número completo
      cuitMasked: cuit
        ? `${cuit.slice(0, 2)}-XXXXXXX-${cuit.slice(-1)}`
        : null,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    return NextResponse.json({ cuitConfigured: false, passwordConfigured: false, cuitMasked: null })
  }
}
