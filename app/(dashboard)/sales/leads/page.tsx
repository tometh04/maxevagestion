import { redirect } from "next/navigation"

/**
 * Legacy route /sales/leads → redirect a /sales/crm-manychat (CRM Ventas).
 *
 * Bug 2026-05-06: el botón "Ver" en la tabla de CRM Ventas (leads-table.tsx)
 * y el link "Ventas" en stats (sales-statistics-page-client.tsx) apuntaban
 * a /sales/leads que ya NO existe (removido en el rebrand a CRM Manychat).
 * Resultado: 404 al hacer click.
 *
 * Esta page redirige a la nueva URL preservando el query string (incluido
 * leadId si lo viene), para que cuando implementemos el modal de detalle
 * de lead vía ?leadId=, ya esté en la URL correcta.
 */
export default async function LegacyLeadsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value)
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
  }
  const search = qs.toString()
  redirect(`/sales/crm-manychat${search ? `?${search}` : ""}`)
}
