import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { name, email, role, agencies, default_commission_percentage } = body

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: "temp-password-123", // User should reset on first login
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Error al crear usuario" }, { status: 400 })
    }

    // Create user record
    const usersTable = supabase.from("users") as any
    const userInsertData: any = {
      auth_id: authData.user.id,
      name,
      email,
      role,
      is_active: true,
    }

    // Si es vendedor y se especificó comisión, agregarla
    if (role === "SELLER" && default_commission_percentage !== undefined && default_commission_percentage !== null) {
      userInsertData.default_commission_percentage = default_commission_percentage
    }

    const { data: userData, error: userError } = await usersTable
      .insert(userInsertData)
      .select()
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "Error al crear registro de usuario" }, { status: 400 })
    }

    // Link agencies
    if (agencies && agencies.length > 0) {
      const userAgenciesTable = supabase.from("user_agencies") as any
      await userAgenciesTable.insert(
        agencies.map((agencyId: string) => ({
          user_id: (userData as any).id,
          agency_id: agencyId,
        }))
      )
    }

    return NextResponse.json({ success: true, user: userData })
  } catch (error) {
    return NextResponse.json({ error: "Error al invitar usuario" }, { status: 500 })
  }
}

