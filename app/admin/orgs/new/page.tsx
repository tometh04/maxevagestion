import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"
import { NewOrgWizard } from "@/components/admin/new-org-wizard"

export const dynamic = "force-dynamic"

export default function NewOrgPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva organización"
        description="Crea una agencia Enterprise custom y enviá invite al admin."
        actions={
          <Link
            href="/admin/orgs"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        }
      />
      <NewOrgWizard />
    </div>
  )
}
