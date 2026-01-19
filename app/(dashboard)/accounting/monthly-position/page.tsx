import { Metadata } from "next"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { MonthlyPositionPageClient } from "@/components/accounting/monthly-position-page-client"

export const metadata: Metadata = {
  title: "Posición Contable Mensual | Contabilidad",
  description: "Balance General y Estado de Resultados",
}

export default async function MonthlyPositionPage() {
  const supabase = await createServerClient()
  const { user } = await getCurrentUser()

  // Obtener agencias
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  return (
    <MonthlyPositionPageClient 
      agencies={agencies || []} 
      userRole={user.role || "SELLER"}
    />
  )
}
