import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkUserData() {
  console.log("🔍 Verificando datos del usuario...")
  console.log("")
  
  // Check auth users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
  console.log("👤 Usuarios en Auth:")
  authUsers?.users?.forEach(u => {
    console.log(`   - ${u.email} (ID: ${u.id})`)
  })
  console.log("")
  
  // Check users table
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("*")
  
  console.log("👥 Usuarios en tabla 'users':")
  if (users && users.length > 0) {
    users.forEach(u => {
      console.log(`   - ${u.email} (ID: ${u.id}, Auth ID: ${u.auth_id}, Role: ${u.role}, Active: ${u.is_active})`)
    })
  } else {
    console.log("   ❌ No hay usuarios en la tabla")
  }
  
  if (usersError) {
    console.log("   ❌ Error:", usersError.message)
  }
  
  console.log("")
  
  // Check if auth_id matches
  if (authUsers?.users && users && users.length > 0) {
    const authUser = authUsers.users[0]
    const dbUser = users.find(u => u.auth_id === authUser.id)
    
    if (dbUser) {
      console.log("✅ Usuario encontrado correctamente:")
      console.log(`   Auth ID: ${authUser.id}`)
      console.log(`   DB Auth ID: ${dbUser.auth_id}`)
      console.log(`   Match: ${authUser.id === dbUser.auth_id ? '✅' : '❌'}`)
    } else {
      console.log("❌ No se encontró el usuario en la tabla 'users' con el auth_id correcto")
    }
  }
}

checkUserData().catch(console.error)
