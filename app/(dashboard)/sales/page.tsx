import { redirect } from "next/navigation"

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>
}) {
  const params = await searchParams
  const leadId = params.lead

  // Si hay un leadId, redirigir a /sales/crm-manychat con leadId
  if (leadId) {
    redirect(`/sales/crm-manychat?leadId=${leadId}`)
  }

  redirect("/sales/crm-manychat")
}
