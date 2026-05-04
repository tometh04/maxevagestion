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
    <div className="rounded-lg border border-accent-coral/40 bg-accent-coral/10 p-4 text-accent-coral">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-accent-coral" />
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium text-accent-coral">
            {list.length} org{list.length === 1 ? "" : "s"} Enterprise sin precio configurado
          </div>
          <p className="text-xs text-accent-coral/80">
            Estos clientes están en estado pagador pero no aparecen en el MRR. Cargá un MRR override o un custom plan en cada org.
          </p>
          <ul className="space-y-1 text-sm">
            {list.slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orgs/${o.id}`}
                  className="text-accent-coral underline hover:text-accent-coral"
                >
                  {o.name}
                </Link>
                <span className="text-accent-coral/60"> — Configurar →</span>
              </li>
            ))}
            {list.length > 8 && (
              <li className="text-xs text-accent-coral/60 italic">
                + {list.length - 8} más
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
