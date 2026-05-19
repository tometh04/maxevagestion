import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

type RegisterBody = {
  email: string
  password: string
  name: string
  companyName: string
  legalAccepted: boolean
  legalVersion: string
  seedDefaultLists: boolean
}

// Listas CRM sugeridas por destino. Cubren la mayoría de las agencias argentinas.
// Si el user las acepta en el signup, se crean en manychat_list_order. Si no,
// empieza con el CRM vacío.
const DEFAULT_CRM_LISTS = [
  "Argentina",
  "Caribe",
  "Europa",
  "USA",
  "Varios",
]

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
  // adminDb justificado (caso C auth flow, 2026-05-18):
  // - No hay user logueado todavía. createServerClient devolvería un cliente
  //   anónimo que no puede crear auth users ni inserts privilegiadas.
  // - Necesita supabase.auth.admin.createUser (solo service role).
  // - El handler nunca acepta org_id ni agency_id del body — los IDs los
  //   genera el server al crear org/agency. No hay risk de privilege escalation
  //   via body forge.
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
    const seedDefaultLists = body.seedDefaultLists === true

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

    // 4. Crear organization en estado PENDING_PAYMENT — el signup NO otorga
    // acceso por sí mismo. El acceso se activa al elegir un plan y pasar por
    // MP (que autoriza la tarjeta y arranca el free_trial de 7 días).
    // trial_ends_at se setea cuando el webhook recibe preapproval authorized
    // con free_trial activo (= next_payment_date de MP).
    const { data: org, error: orgError } = await (admin.from("organizations") as any)
      .insert({
        name: companyName,
        slug,
        owner_id: authData.user.id,
        plan: "PRO",
        subscription_status: "PENDING_PAYMENT",
        trial_ends_at: null,
        billing_email: email,
        max_users: 999,
        max_agencies: 99,
        max_operations_per_month: 99999,
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

    // 9. (Opcional) Seed de listas CRM default. El user puede optar por esto
    //    en el form de signup para no arrancar con el CRM completamente vacío.
    //    Si falla, no es blocker — el tenant puede crearlas manualmente después.
    if (seedDefaultLists) {
      const listRows = DEFAULT_CRM_LISTS.map((listName, index) => ({
        agency_id: agency.id,
        list_name: listName,
        position: index,
      }))
      const { error: listError } = await (admin.from("manychat_list_order") as any)
        .insert(listRows)
      if (listError) {
        console.warn(`[register] Seed de listas CRM falló para org ${org.id}:`, listError.message)
      }
    }

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
