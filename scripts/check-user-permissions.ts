/**
 * Diagnóstico: por qué un usuario no ve un módulo.
 *
 * Nace del reporte de Lozada "Maxi es admin y no lo deja ver el reporte de
 * comisiones". Los permisos salen de dos capas (defaults por rol en
 * `lib/permissions.ts` + overrides por agencia en `agency_role_permissions`) y
 * mirar solo una de las dos no alcanza para saber quién bloquea.
 *
 * Imprime, para un email: roles, agencias, los overrides que le aplican y la
 * matriz efectiva, marcando qué módulos quedan cerrados y por qué capa.
 *
 * Uso:
 *   npx tsx scripts/check-user-permissions.ts <email> [modulo ...]
 *   npx tsx scripts/check-user-permissions.ts maxi@lozada.com reports commissions
 *
 * Solo lectura: no escribe nada.
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"
import { buildDefaultMatrixMulti } from "@/lib/permissions/resolved"
import type { UserRole } from "@/lib/permissions"

config({ path: path.join(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FULL_ACCESS_ROLES = ["SUPER_ADMIN", "ORG_OWNER"]

async function main() {
  const [email, ...modules] = process.argv.slice(2)
  if (!email) {
    console.error("Falta el email.\n  npx tsx scripts/check-user-permissions.ts <email> [modulo ...]")
    process.exit(1)
  }
  const askedModules = modules.length > 0 ? modules : ["reports", "commissions"]

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, role, additional_roles, org_id, is_active, is_independent_advisor")
    .ilike("email", email)
    .maybeSingle()

  if (error) throw error
  if (!user) {
    console.error(`No hay ningún usuario con el email ${email}.`)
    process.exit(1)
  }

  const u = user as any
  const roles = [u.role, ...((u.additional_roles as string[]) ?? [])].filter(Boolean) as UserRole[]

  console.log("\n=== Usuario ===")
  console.table([
    {
      nombre: u.name,
      email: u.email,
      rol_principal: u.role,
      roles_adicionales: (u.additional_roles ?? []).join(", ") || "-",
      activo: u.is_active,
      asesor_independiente: u.is_independent_advisor === true,
      org_id: u.org_id,
    },
  ])

  if (!u.org_id) {
    console.log("\n⚠️  El usuario no tiene organización asociada: las APIs cortan con 400 antes de mirar permisos.")
    return
  }

  if (u.is_independent_advisor === true) {
    console.log(
      "\n⚠️  Es asesor de viajes independiente (VIB-69): sus permisos tienen un techo propio\n" +
        "   (INDEPENDENT_ADVISOR_PERMS) que ningún rol ni override puede ampliar."
    )
  }

  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id, agencies:agency_id(name)")
    .eq("user_id", u.id)

  const agencyIds = (userAgencies ?? []).map((a: any) => a.agency_id)
  console.log("\n=== Agencias asignadas ===")
  if (agencyIds.length === 0) {
    console.log("(ninguna) → no le aplica ningún override por agencia; manda el default del rol.")
  } else {
    console.table(
      (userAgencies ?? []).map((a: any) => ({ agency_id: a.agency_id, nombre: a.agencies?.name }))
    )
  }

  if (roles.some((r) => FULL_ACCESS_ROLES.includes(r))) {
    console.log(
      `\n✅ Tiene rol ${roles.find((r) => FULL_ACCESS_ROLES.includes(r))}: acceso total sin pasar por la DB.\n` +
        "   Si igual no ve algo, el problema no son los permisos."
    )
    return
  }

  // Overrides que le aplican: mismo criterio que resolveUserPermissions (OR
  // entre agencias y roles; un módulo sin fila cae al default del rol).
  const { data: rows } = agencyIds.length
    ? await supabase
        .from("agency_role_permissions")
        .select("agency_id, role, module, can_read, can_write, can_delete, can_export, own_data_only")
        .in("agency_id", agencyIds)
        .in("role", roles as string[])
    : { data: [] as any[] }

  const overrides = (rows ?? []) as any[]
  const defaults = buildDefaultMatrixMulti(roles)

  console.log("\n=== Módulos consultados ===")
  const report = askedModules.map((mod) => {
    const modRows = overrides.filter((r) => r.module === mod)
    const porDefault = defaults[mod]?.read === true
    const efectivo = modRows.length > 0 ? modRows.some((r) => r.can_read === true) : porDefault
    return {
      modulo: mod,
      "lectura efectiva": efectivo ? "SÍ" : "NO",
      "default del rol": porDefault ? "SÍ" : "NO",
      overrides: modRows.length === 0 ? "(sin filas)" : modRows.map((r) => `${r.role}@${r.agency_id.slice(0, 8)}=${r.can_read ? "sí" : "NO"}`).join(" | "),
      quien_decide: modRows.length > 0 ? "agency_role_permissions" : "default del rol",
    }
  })
  console.table(report)

  for (const row of report) {
    if (row["lectura efectiva"] === "NO") {
      console.log(
        `\n❌ ${row.modulo}: bloqueado por ${row.quien_decide}.` +
          (row.quien_decide === "agency_role_permissions"
            ? "\n   Se destraba desde Configuración → Permisos, tildando lectura del módulo para ese rol y esa oficina."
            : `\n   El rol ${roles.join("+")} no incluye ese módulo por defecto. Hay que darle el rol correcto o un override.`)
      )
    }
  }

  console.log(
    "\nNota: el reporte de comisiones exige lectura de `commissions`; el ítem\n" +
      "\"Reportes\" del menú exige lectura de `reports`. Son permisos distintos."
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
