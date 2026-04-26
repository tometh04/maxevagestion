import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"

export async function EnterpriseWithoutPriceAlert() {
  const admin = createAdminClient() as any
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name")
    .eq("plan", "ENTERPRISE")
    .in("subscription_status", ["ACTIVE", "PAST_DUE", "TRIALING"])
    .is("custom_plan_id", null)
    .or("manual_mrr_override_ars.is.null,manual_mrr_override_ars.eq.0")
    .limit(50)

  const list = (orgs ?? []) as Array<{ id: string; name: string }>

  if (list.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-300" />
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium text-amber-200">
            {list.length} org{list.length === 1 ? "" : "s"} Enterprise sin precio configurado
          </div>
          <p className="text-xs text-amber-300/80">
            Estos clientes están en estado pagador pero no aparecen en el MRR. Cargá un MRR override o un custom plan en cada org.
          </p>
          <ul className="space-y-1 text-sm">
            {list.slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orgs/${o.id}`}
                  className="text-amber-200 underline hover:text-amber-100"
                >
                  {o.name}
                </Link>
                <span className="text-amber-300/60"> — Configurar →</span>
              </li>
            ))}
            {list.length > 8 && (
              <li className="text-xs text-amber-300/60 italic">
                + {list.length - 8} más
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
