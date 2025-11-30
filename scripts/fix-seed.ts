import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixSeed() {
  console.log("🔧 Arreglando seed...")
  
  // Get existing auth user
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const authUser = authUsers?.users?.find(u => u.email === "maxi@erplozada.com")
  
  if (!authUser) {
    console.log("❌ No se encontró el usuario en Auth")
    return
  }
  
  console.log(`✅ Usuario Auth encontrado: ${authUser.email} (${authUser.id})`)
  
  // Check if user exists in users table
  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authUser.id)
    .maybeSingle()
  
  if (existingUser) {
    console.log("✅ Usuario ya existe en la tabla users")
    return
  }
  
  // Get agencies
  let { data: agencies } = await supabase
    .from("agencies")
    .select("*")
  
  if (!agencies || agencies.length === 0) {
    console.log("❌ No hay agencias. Ejecutando seed completo...")
    // Run full seed
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
    
    agencies = [agency1, agency2].filter(Boolean) as any[]
    console.log("✅ Agencias creadas")
  }
  
  // Create user in users table
  const { data: newUser, error: userError } = await supabase
    .from("users")
    .insert({
      auth_id: authUser.id,
      name: "Maxi",
      email: "maxi@erplozada.com",
      role: "SUPER_ADMIN",
      is_active: true,
    })
    .select()
    .single()
  
  if (userError) {
    console.error("❌ Error creando usuario:", userError)
    return
  }
  
  console.log("✅ Usuario creado en tabla users:", newUser?.id)
  
  // Link user to agencies
  if (newUser && agencies && agencies.length > 0) {
    const links = agencies.map(agency => ({
      user_id: newUser.id,
      agency_id: agency.id,
    }))
    
    const { error: linkError } = await supabase
      .from("user_agencies")
      .insert(links)
    
    if (linkError) {
      console.error("⚠️  Error vinculando agencias:", linkError.message)
    } else {
      console.log("✅ Usuario vinculado a agencias")
    }
  }
  
  console.log("🎉 Seed arreglado!")
}

fixSeed().catch(console.error)
