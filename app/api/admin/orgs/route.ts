import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { seedChartOfAccountsForOrg } from "@/lib/accounting/seed-chart-of-accounts"
import { seedManychatListsForAgency } from "@/lib/manychat/seed-lists"

/**
 * POST /api/admin/orgs
 *
 * Crea una org nueva desde el admin panel — flow para Enterprise custom 1-a-1
 * (vs /api/auth/register que es self-serve y asume MP).
 *
 * Steps:
 *  1. Validar isPlatformAdmin
 *  2. Crear auth user (invite — no se setea password, el cliente lo hace via email)
 *  3. Crear organization
 *  4. Crear agency default
 *  5. Crear public.users (SUPER_ADMIN dentro de su org)
 *  6. Crear organization_members (OWNER) + user_agencies
 *  7. Setear organization_settings.default_currency
 *  8. (opcional) Seed chart of accounts desde Lozada
 *  9. (opcional) Seed Manychat lists default
 * 10. logSecurityEvent
 */

type Body = {
  org_name?: string
  cuit?: string
  agency_name?: string
  default_currency?: "ARS" | "USD"
  admin_email?: string
  admin_name?: string
  seed_chart_of_accounts?: boolean
  seed_manychat_lists?: boolean
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "org"
  )
}

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as Body
  const orgName = body.org_name?.trim()
  const cuit = body.cuit?.trim() || null
  const agencyName = body.agency_name?.trim() || orgName
  const defaultCurrency = body.default_currency === "ARS" ? "ARS" : "USD"
  const adminEmail = body.admin_email?.trim().toLowerCase()
  const adminName = body.admin_name?.trim()
  const seedChart = body.seed_chart_of_accounts !== false
  const seedLists = body.seed_manychat_lists !== false

  if (!orgName || orgName.length < 2) {
    return NextResponse.json({ error: "Nombre de org requerido (min 2 chars)" }, { status: 400 })
  }
  if (!adminEmail || !adminEmail.includes("@")) {
    return NextResponse.json({ error: "Email del admin inválido" }, { status: 400 })
  }
  if (!adminName || adminName.length < 2) {
    return NextResponse.json({ error: "Nombre del admin requerido" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  let createdAuthUserId: string | null = null
  let createdOrgId: string | null = null

  try {
    // 1. Email no duplicado en public.users
    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", adminEmail)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ error: "Ese email ya está registrado en otra org" }, { status: 400 })
    }

    // 2. Slug único
    const baseSlug = slugify(orgName)
    let slug = baseSlug
    for (let i = 2; i < 50; i++) {
      const { data: collision } = await admin
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle()
      if (!collision) break
      slug = `${baseSlug}-${i}`
    }

    // 3. Crear auth user via inviteUserByEmail (Supabase manda email con link de set-password)
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      adminEmail,
      { data: { name: adminName, company_name: orgName } },
    )

    if (inviteError || !invited?.user) {
      return NextResponse.json(
        { error: `Error invitando user: ${inviteError?.message || "unknown"}` },
        { status: 500 },
      )
    }
    createdAuthUserId = invited.user.id

    // 4. Crear organization (ACTIVE — el platform_admin la está activando manualmente)
    const orgInsert: any = {
      name: orgName,
      slug,
      owner_id: invited.user.id,
      plan: "ENTERPRISE",
      subscription_status: "ACTIVE",
      trial_ends_at: null,
      billing_email: adminEmail,
      max_users: 999,
      max_agencies: 99,
      max_operations_per_month: 99999,
    }
    if (cuit) orgInsert.cuit = cuit

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert(orgInsert)
      .select()
      .single()

    if (orgError || !org) throw new Error(`org insert failed: ${orgError?.message}`)
    createdOrgId = org.id

    // 5. Crear agency default
    const { data: agency, error: agencyError } = await admin
      .from("agencies")
      .insert({
        org_id: org.id,
        name: agencyName,
        city: "—",
        timezone: "America/Argentina/Buenos_Aires",
      })
      .select()
      .single()

    if (agencyError || !agency) throw new Error(`agency insert failed: ${agencyError?.message}`)

    // 6. public.users (SUPER_ADMIN dentro de su org)
    const { data: userRow, error: userError } = await admin
      .from("users")
      .insert({
        auth_id: invited.user.id,
        org_id: org.id,
        name: adminName,
        email: adminEmail,
        role: "SUPER_ADMIN",
        is_active: true,
      })
      .select()
      .single()

    if (userError || !userRow) throw new Error(`users insert failed: ${userError?.message}`)

    // 7. organization_members (OWNER)
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: org.id,
      user_id: invited.user.id,
      role: "OWNER",
      status: "ACTIVE",
    })
    if (memberError) throw new Error(`organization_members insert failed: ${memberError.message}`)

    // 8. user_agencies link
    await admin.from("user_agencies").insert({ user_id: userRow.id, agency_id: agency.id })

    // 9. organization_settings.default_currency
    await admin.from("organization_settings").insert({
      org_id: org.id,
      key: "default_currency",
      value: defaultCurrency,
    })

    // 10. Seed chart of accounts (opcional)
    let chartResult = { created: 0, skipped: 0 }
    if (seedChart) {
      try {
        const r = await seedChartOfAccountsForOrg(org.id, admin)
        chartResult = { created: r.created, skipped: r.skipped }
      } catch (e: any) {
        console.warn(`[admin/orgs] seed chart failed for ${org.id}:`, e?.message)
      }
    }

    // 11. Seed Manychat lists (opcional)
    let listsResult = { created: 0, skipped: 0 }
    if (seedLists) {
      try {
        const r = await seedManychatListsForAgency(agency.id, org.id, admin)
        listsResult = r
      } catch (e: any) {
        console.warn(`[admin/orgs] seed lists failed for ${agency.id}:`, e?.message)
      }
    }

    logSecurityEvent({
      eventType: "ADMIN_CREATE_ORG",
      severity: "INFO",
      actorUserId: user.id,
      targetOrgId: org.id,
      requestPath: "/api/admin/orgs",
      details: {
        orgName,
        slug,
        adminEmail,
        defaultCurrency,
        chartCreated: chartResult.created,
        listsCreated: listsResult.created,
      },
    })

    return NextResponse.json({
      success: true,
      org: { id: org.id, slug: org.slug, name: org.name },
      agency: { id: agency.id, name: agency.name },
      user: { id: userRow.id, email: adminEmail },
      seeds: { chart: chartResult, lists: listsResult },
    })
  } catch (error: any) {
    console.error("[admin/orgs] create failed:", error)

    // Rollback: borrar auth user (cascade limpia public.users si llegamos a crearlo)
    if (createdAuthUserId) {
      try {
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch (cleanupErr) {
        console.error("[admin/orgs] cleanup auth user failed:", cleanupErr)
      }
    }
    // Rollback org (cascade limpia agencies, users, etc.)
    if (createdOrgId) {
      try {
        await admin.from("organizations").delete().eq("id", createdOrgId)
      } catch (cleanupErr) {
        console.error("[admin/orgs] cleanup org failed:", cleanupErr)
      }
    }

    return NextResponse.json(
      { error: error?.message || "Error creando org" },
      { status: 500 },
    )
  }
}
