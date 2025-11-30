import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * API route to seed mock data
 * Only accessible by SUPER_ADMIN
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Import and execute the seed script
    // Note: This is a simplified version. In production, you might want to
    // call the seed function directly instead of spawning a process
    const { exec } = await import("child_process")
    const { promisify } = await import("util")
    const execAsync = promisify(exec)

    try {
      const { stdout, stderr } = await execAsync("npm run db:seed:mock", {
        cwd: process.cwd(),
        env: process.env,
      })

      return NextResponse.json({
        success: true,
        message: "Mock data seeded successfully",
        output: stdout,
        errors: stderr,
      })
    } catch (error: any) {
      console.error("Error executing seed script:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Error al ejecutar el script de seed",
          details: error.message,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("Error in POST /api/admin/seed-mock-data:", error)
    return NextResponse.json({ error: "Error al ejecutar seed" }, { status: 500 })
  }
}

