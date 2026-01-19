import { redirect } from "next/navigation"

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>
}) {
  const params = await searchParams
  const leadId = params.lead

  // Si hay un leadId, redirigir a /sales/leads con leadId
  if (leadId) {
    redirect(`/sales/leads?leadId=${leadId}`)
  }

  // Si no hay leadId, redirigir a la página de leads
  redirect("/sales/leads")
}
