import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seed() {
  console.log("🌱 Starting seed...")

  // Create agencies
  const { data: agency1 } = await supabase
    .from("agencies")
    .insert({ name: "Rosario", city: "Rosario", timezone: "America/Argentina/Buenos_Aires" })
    .select()
    .single()

  const { data: agency2 } = await supabase
    .from("agencies")
    .insert({ name: "Madero", city: "Buenos Aires", timezone: "America/Argentina/Buenos_Aires" })
    .select()
    .single()

  console.log("✅ Created agencies")

  // Create SUPER_ADMIN user (Maxi)
  const { data: authUser } = await supabase.auth.admin.createUser({
    email: "maxi@erplozada.com",
    password: "admin123",
    email_confirm: true,
  })

  if (authUser.user) {
    const { data: superAdmin } = await supabase
      .from("users")
      .insert({
        auth_id: authUser.user.id,
        name: "Maxi",
        email: "maxi@erplozada.com",
        role: "SUPER_ADMIN",
        is_active: true,
      })
      .select()
      .single()

    if (superAdmin && agency1 && agency2) {
      await supabase.from("user_agencies").insert([
        { user_id: superAdmin.id, agency_id: agency1.id },
        { user_id: superAdmin.id, agency_id: agency2.id },
      ])
    }
  }

  console.log("✅ Created SUPER_ADMIN user")

  // Create operators
  const { data: operators } = await supabase
    .from("operators")
    .insert([
      { name: "Despegar", contact_name: "Juan Pérez", contact_email: "juan@despegar.com" },
      { name: "Aerolineas Argentinas", contact_name: "María García", contact_email: "maria@aerolineas.com" },
      { name: "Latam", contact_name: "Carlos López", contact_email: "carlos@latam.com" },
    ])
    .select()

  console.log("✅ Created operators")

  // Create commission rule
  await supabase.from("commission_rules").insert({
    type: "SELLER",
    basis: "FIXED_PERCENTAGE",
    value: 20,
    valid_from: new Date().toISOString().split("T")[0],
  })

  console.log("✅ Created commission rule")

  console.log("🎉 Seed completed!")
}

seed().catch(console.error)

