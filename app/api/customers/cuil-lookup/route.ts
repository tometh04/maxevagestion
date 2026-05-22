import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    await getCurrentUser() // Verify authenticated

    const { searchParams } = new URL(request.url)
    const cuil = searchParams.get("cuil")

    if (!cuil) {
      return NextResponse.json({ error: "CUIL es requerido" }, { status: 400 })
    }

    // Clean CUIL - remove dashes
    const cuilClean = cuil.replace(/\D/g, "")
    if (cuilClean.length !== 11) {
      return NextResponse.json({ error: "CUIL debe tener 11 dígitos" }, { status: 400 })
    }

    // Try AFIP SDK padron lookup (free, no auth required)
    // Devolvemos `reason` para que el frontend pueda mostrar UX distinta entre
    // "AFIP no tiene a esta persona" (consumidor final) y "el servicio se cayó".
    try {
      const url = `https://app.afipsdk.com/api/v1/padron/contribuyente/${cuilClean}`
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        const data = await res.json()
        const nombre = data.nombre || data.razonSocial || ""

        if (!nombre) {
          // AFIP respondió pero sin nombre → CUIL no registrado en padrón
          // (típicamente un consumidor final, no un contribuyente).
          return NextResponse.json({
            success: false,
            reason: "not_found",
            error: "AFIP no encontró datos para este CUIL (probablemente un consumidor final, no un contribuyente registrado)",
          })
        }

        // Try to split name (AFIP returns "APELLIDO NOMBRE" format)
        let firstName = ""
        let lastName = ""
        // AFIP typically returns: "PEREZ JUAN CARLOS"
        const parts = nombre.split(" ")
        if (parts.length >= 2) {
          lastName = parts[0]
          firstName = parts.slice(1).join(" ")
        } else {
          lastName = nombre
        }
        // Capitalize properly
        firstName = firstName.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
        lastName = lastName.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")

        return NextResponse.json({
          success: true,
          data: {
            nombre,
            firstName,
            lastName,
            domicilio: data.domicilio?.direccion || null,
            tipoPersona: data.tipoPersona || null,
          }
        })
      }

      // HTTP no-OK del servicio third-party (404 = no encontrado, 4xx/5xx = error)
      if (res.status === 404) {
        return NextResponse.json({
          success: false,
          reason: "not_found",
          error: "AFIP no encontró datos para este CUIL (probablemente un consumidor final, no un contribuyente registrado)",
        })
      }
      console.error(`AFIP lookup HTTP error: ${res.status} ${res.statusText}`)
      return NextResponse.json({
        success: false,
        reason: "service_error",
        error: `El servicio de consulta AFIP no respondió (HTTP ${res.status})`,
      })
    } catch (afipError) {
      console.error("AFIP lookup error:", afipError)
      return NextResponse.json({
        success: false,
        reason: "service_error",
        error: "No se pudo conectar con el servicio de consulta AFIP",
      })
    }
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in CUIL lookup:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
