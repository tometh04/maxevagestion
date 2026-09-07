import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/**
 * La pantalla de complementos se mudó a /addons, en el primer nivel.
 *
 * Esta ruta queda como redirect y no se borra porque es la `back_url` que
 * viajó a Mercado Pago en los preapprovals ya creados: cuando un cliente vuelve
 * de autorizar el importe nuevo, MP lo trae acá con `?reauth=1`. Se preservan
 * los query params para no perder ese contexto.
 */
export default async function AddonsLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(await searchParams)) {
    if (typeof valor === "string") params.set(clave, valor)
    else if (Array.isArray(valor)) valor.forEach((v) => params.append(clave, v))
  }
  const query = params.toString()
  redirect(query ? `/addons?${query}` : "/addons")
}
