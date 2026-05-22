import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"

/**
 * API route to seed mock data
 * Only accessible by platform admins (tabla platform_admins).
 *
 * DESHABILITADO (SEG-001): la ejecución vía child_process.exec representa
 * ejecución remota de comandos shell desde HTTP. Para seedear datos de prueba
 * usar `npm run db:seed:mock` localmente.
 *
 * Para re-habilitar: descomentar el bloque marcado con [SEG-001 DISABLED]
 * y asegurarse de reemplazar el exec por una llamada directa a la función
 * exportada de scripts/seed-mock-data.ts en lugar de spawn de proceso.
 */
export async function POST(_request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!(await isPlatformAdmin(supabase, user.id))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // [SEG-001 DISABLED] — child_process.exec removido por seguridad.
    // El endpoint existe para preservar el código; la funcionalidad debe
    // re-implementarse importando la función directamente en lugar de exec.
    //
    // const { exec } = await import("child_process")
    // const { promisify } = await import("util")
    // const execAsync = promisify(exec)
    //
    // const { stdout, stderr } = await execAsync("npm run db:seed:mock", {
    //   cwd: process.cwd(),
    //   env: process.env,
    // })
    //
    // return NextResponse.json({
    //   success: true,
    //   message: "Mock data seeded successfully",
    //   output: stdout,
    //   errors: stderr,
    // })

    return NextResponse.json(
      {
        success: false,
        error: "Endpoint deshabilitado (SEG-001). Usar `npm run db:seed:mock` localmente.",
      },
      { status: 503 },
    )
  } catch (error) {
    console.error("Error in POST /api/admin/seed-mock-data:", error)
    return NextResponse.json({ error: "Error al ejecutar seed" }, { status: 500 })
  }
}

