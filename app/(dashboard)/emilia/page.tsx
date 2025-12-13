import { getCurrentUser } from "@/lib/auth"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import { EmiliaPageClient } from "@/components/emilia/emilia-page-client"
import { Sparkles } from "lucide-react"

export default async function EmiliaPage() {
  const { user } = await getCurrentUser()

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Emilia</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200 dark:shadow-amber-900/30">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Emilia</h1>
          <p className="text-sm text-muted-foreground">
            Asistente de búsqueda de viajes
          </p>
        </div>
      </div>

      <EmiliaPageClient userId={user.id} userName={user.name} />
    </div>
  )
}
