import { redirect } from "next/navigation"

/**
 * Pagos a Operadores — redirección a su pestaña.
 *
 * Esta pantalla existía dos veces: como ruta suelta y como pestaña de
 * Contabilidad, con el mismo componente y las mismas props. Dos fuentes para lo
 * mismo significa que un arreglo puede aplicarse a una sola.
 *
 * La ruta no se borra porque hay links internos que apuntan acá (el semáforo de
 * pagos del dashboard, el diálogo de distribución de ganancias, el reporte
 * societario). Redirigir los mantiene funcionando y deja una sola pantalla real.
 */
export default function Page() {
  redirect("/accounting/ledger?tab=operators")
}
