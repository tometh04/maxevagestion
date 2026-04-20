import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

type RegisterBody = {
  email: string
  password: string
  name: string
  companyName: string
  legalAccepted: boolean
  legalVersion: string
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "org"
}

export async function POST(req: Request) {
  let createdAuthUserId: string | null = null
  let admin: ReturnType<typeof createAdminClient> | null = null

  try {
    const body = (await req.json()) as Partial<RegisterBody>
    const email = body.email?.trim().toLowerCase()
    const password = body.password
    const name = body.name?.trim()
    const companyName = body.companyName?.trim()
    const legalAccepted = body.legalAccepted === true
    const legalVersion = body.legalVersion?.trim()

    if (!email || !password || !name || !companyName) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      )
    }
    // Server-side gate: no aceptamos signup sin aceptación explícita de legales.
    // El checkbox del form es bloqueante, pero revalidamos acá por si alguien
    // postea directo al endpoint.
    if (!legalAccepted || !legalVersion) {
      return NextResponse.json(
        { error: "Debés aceptar los términos para crear la cuenta" },
        { status: 400 }
      )
    }

    admin = createAdminClient()

    // 1. Check email no duplicado en public.users
    const { data: existingUser } = await (admin.from("users") as any)
      .select("id")
      .eq("email", email)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json(
        { error: "Ese email ya está registrado" },
        { status: 400 }
      )
    }

    // 2. Crear auth user (email_confirm=true para permitir login inmediato)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, company_name: companyName },
    })

    if (authError || !authData.user) {
      const msg = authError?.message || ""
      if (msg.toLowerCase().includes("already been registered")) {
        return NextResponse.json(
          { error: "Ese email ya está registrado" },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: msg || "Error al crear usuario" },
        { status: 400 }
      )
    }
    createdAuthUserId = authData.user.id

    // 3. Resolver slug único (si colisiona, agregar sufijo numérico)
    const baseSlug = slugify(companyName)
    let slug = baseSlug
    let attempt = 1
    while (attempt < 20) {
      const { data: existing } = await (admin.from("organizations") as any)
        .select("id")
        .eq("slug", slug)
        .maybeSingle()
      if (!existing) break
      attempt += 1
      slug = `${baseSlug}-${attempt}`
    }

    // 4. Crear organization (STARTER, TRIAL 7 dias)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 7)

    const { data: org, error: orgError } = await (admin.from("organizations") as any)
      .insert({
        name: companyName,
        slug,
        owner_id: authData.user.id,
        plan: "STARTER",
        subscription_status: "TRIAL",
        trial_ends_at: trialEndsAt.toISOString(),
        billing_email: email,
        max_users: 5,
        max_agencies: 2,
        max_operations_per_month: 200,
      })
      .select()
      .single()

    if (orgError || !org) {
      throw new Error(`org insert failed: ${orgError?.message}`)
    }

    // 5. Crear agency default
    const { data: agency, error: agencyError } = await (admin.from("agencies") as any)
      .insert({
        org_id: org.id,
        name: companyName,
        city: "—",
        timezone: "America/Argentina/Buenos_Aires",
      })
      .select()
      .single()

    if (agencyError || !agency) {
      throw new Error(`agency insert failed: ${agencyError?.message}`)
    }

    // 6. Crear public.users (role SUPER_ADMIN dentro de su propia org)
    const { data: userRow, error: userError } = await (admin.from("users") as any)
      .insert({
        auth_id: authData.user.id,
        org_id: org.id,
        name,
        email,
        role: "SUPER_ADMIN",
        is_active: true,
        legal_accepted_at: new Date().toISOString(),
        legal_version: legalVersion,
      })
      .select()
      .single()

    if (userError || !userRow) {
      throw new Error(`users insert failed: ${userError?.message}`)
    }

    // 7. Crear organization_member (OWNER)
    const { error: memberError } = await (admin.from("organization_members") as any)
      .insert({
        organization_id: org.id,
        user_id: authData.user.id,
        role: "OWNER",
        status: "ACTIVE",
      })

    if (memberError) {
      throw new Error(`member insert failed: ${memberError.message}`)
    }

    // 8. Vincular user a agency (user_agencies)
    await (admin.from("user_agencies") as any).insert({
      user_id: userRow.id,
      agency_id: agency.id,
    })

    return NextResponse.json({
      success: true,
      org: { id: org.id, slug: org.slug, name: org.name, trial_ends_at: org.trial_ends_at },
    })
  } catch (error: any) {
    console.error("❌ Register error:", error)

    // Rollback: si creamos auth user pero algo falló después, limpiarlo
    if (createdAuthUserId && admin) {
      try {
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch (cleanupErr) {
        console.error("⚠️ Cleanup auth user failed:", cleanupErr)
      }
    }

    return NextResponse.json(
      { error: error?.message || "Error al registrar" },
      { status: 500 }
    )
  }
}
