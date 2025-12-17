import { redirect } from "next/navigation"

/**
 * Redirige /cash a /cash/summary para mantener compatibilidad
 * La nueva estructura es:
 * - /cash/summary - Resumen de caja
 * - /cash/income - Ingresos
 * - /cash/expenses - Egresos
 */
export default async function CashPage() {
  redirect("/cash/summary")
}
