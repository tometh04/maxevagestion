import { createClient } from "@supabase/supabase-js"
import * as readline from "readline"
import * as dotenv from "dotenv"

// Load .env.local
dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer)
    })
  })
}

async function createPlatformAdmin() {
  console.log("📝 Crear Platform Admin")
  console.log("====================\n")

  const name = await question("Nombre del usuario: ")
  const email = await question("Email del usuario: ")
  const password = await question("Contraseña (mín 6 caracteres): ")

  if (!name || !email || !password || password.length < 6) {
    console.error("❌ Datos incompletos o contraseña muy corta")
    rl.close()
    process.exit(1)
  }

  try {
    console.log("\n⏳ Creando usuario en autenticación...")

    // 1. Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authUser?.user) {
      throw new Error(`Auth error: ${authError?.message || "Unknown error"}`)
    }

    console.log("✅ Usuario de autenticación creado")

    // 2. Create user in database
    console.log("⏳ Creando usuario en base de datos...")

    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .insert({
        auth_id: authUser.user.id,
        name,
        email,
        role: "PLATFORM_ADMIN",
        is_active: true,
      })
      .select()
      .single()

    if (userError || !userRecord) {
      throw new Error(`User insert error: ${userError?.message || "Unknown error"}`)
    }

    console.log("✅ Usuario creado en base de datos")

    // 3. Get all agencies
    console.log("⏳ Asignando acceso a todas las agencias...")

    const { data: agencies, error: agenciesError } = await supabase.from("agencies").select("id")

    if (agenciesError) {
      throw new Error(`Agencies fetch error: ${agenciesError.message}`)
    }

    if (!agencies || agencies.length === 0) {
      console.warn("⚠️  No se encontraron agencias. El usuario está creado pero sin asignaciones.")
    } else {
      // 4. Assign to all agencies
      const agencyAssignments = agencies.map((agency) => ({
        user_id: userRecord.id,
        agency_id: agency.id,
      }))

      const { error: assignError } = await supabase.from("user_agencies").insert(agencyAssignments)

      if (assignError) {
        throw new Error(`User agencies insert error: ${assignError.message}`)
      }

      console.log(`✅ Usuario asignado a ${agencies.length} agencia(s)`)
    }

    console.log("\n🎉 ¡Platform Admin creado exitosamente!")
    console.log("\nDatos del usuario:")
    console.log(`  Email: ${email}`)
    console.log(`  Nombre: ${name}`)
    console.log(`  Rol: PLATFORM_ADMIN`)
    console.log(`  Acceso: Todas las agencias`)
  } catch (error: any) {
    console.error("❌ Error:", error.message)
    process.exit(1)
  } finally {
    rl.close()
  }
}

async function updatePlatformAdminRole() {
  console.log("📝 Actualizar Rol a Platform Admin")
  console.log("====================\n")

  const email = await question("Email del usuario: ")

  if (!email) {
    console.error("❌ Email no proporcionado")
    rl.close()
    process.exit(1)
  }

  try {
    console.log("\n⏳ Verificando usuario...")

    // 1. Fetch user by email
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single()

    if (fetchError || !user) {
      throw new Error(`Usuario no encontrado: ${fetchError?.message || "Unknown error"}`)
    }

    console.log("✅ Usuario encontrado")

    // 2. Check if user is already a platform admin
    const { data: platformAdmin, error: platformAdminError } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (platformAdmin) {
      console.log("⚠️ El usuario ya es Platform Admin")
    } else {
      console.log("⏳ Insertando usuario en platform_admins...")

      // 3. Insert user into platform_admins
      const { error: insertError } = await supabase
        .from("platform_admins")
        .insert({
          user_id: user.id,
          notes: "Asignado como Platform Admin desde script.",
        })

      if (insertError) {
        throw new Error(`Error al insertar en platform_admins: ${insertError.message}`)
      }

      console.log("✅ Usuario agregado como Platform Admin")
    }
  } catch (error) {
    console.error("❌ Error:", error.message)
    process.exit(1)
  } finally {
    rl.close()
  }
}

updatePlatformAdminRole()
