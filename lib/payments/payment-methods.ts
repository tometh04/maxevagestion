/**
 * Catálogo único de formas de pago (VIB-107).
 *
 * Antes esta lista estaba repetida a mano en 5 componentes y ya había divergido:
 * los diálogos de ALTA (`components/operations/new-payment-dialog.tsx` y
 * `components/accounting/manual-payment-dialog.tsx`) tenían "Cheque" pero no
 * "PayPal" ni "Otro"; los de EDICIÓN y el de servicios tenían al revés.
 *
 * El bug concreto que eso causaba: un cobro cargado como **Cheque** y editado
 * después desde la operación caía en un selector que no incluía "Cheque", así que
 * el campo aparecía vacío y al guardar se le cambiaba el método sin que nadie lo
 * pidiera. Mismo patrón que [[collection-replace-hazard]]: la UI pisa con lo que
 * no supo mostrar.
 *
 * Regla: este archivo es la ÚNICA fuente. Para agregar una forma de pago se
 * agrega acá y aparece en todas las pantallas a la vez.
 */

export interface PaymentMethodOption {
  /** Lo que se guarda en `payments.method`. No cambiar: hay datos históricos. */
  value: string
  /** Lo que ve el usuario. */
  label: string
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: "Transferencia", label: "Transferencia Bancaria" },
  { value: "Depósito Bancario", label: "Depósito Bancario" },
  { value: "Efectivo", label: "Efectivo" },
  { value: "Tarjeta Crédito", label: "Tarjeta de Crédito" },
  { value: "Tarjeta Débito", label: "Tarjeta de Débito" },
  { value: "Cheque", label: "Cheque" },
  { value: "E-cheque", label: "E-cheque" },
  { value: "MercadoPago", label: "MercadoPago" },
  // Genérica a propósito, en vez de una entrada por marca.
  //
  // MODO, Ualá, Personal Pay, Cuenta DNI y Naranja X aparecen y desaparecen, y
  // una por una convertirían este desplegable en una lista larga que hay que
  // mantener. Cuál fue va en el campo de referencia del cobro, que es donde el
  // dato sirve para conciliar.
  //
  // MercadoPago queda aparte porque ya tenía su propia entrada y su propia
  // cuenta en el plan.
  { value: "Billetera virtual", label: "Billetera virtual" },
  { value: "PayPal", label: "PayPal" },
  { value: "Otro", label: "Otro" },
]

export const PAYMENT_METHOD_VALUES: string[] = PAYMENT_METHODS.map((m) => m.value)

/** Etiqueta legible. Un valor desconocido (histórico) se muestra tal cual. */
export function paymentMethodLabel(value?: string | null): string {
  const raw = (value ?? "").trim()
  if (!raw) return ""
  return PAYMENT_METHODS.find((m) => m.value === raw)?.label ?? raw
}

/**
 * Opciones a mostrar en un Select que edita un pago YA guardado.
 *
 * Si el método guardado no está en el catálogo —un valor histórico, o
 * "Tarjeta de Crédito" con "de" que escribe `cc-settle-operator-debt.ts`— se
 * agrega al final en vez de dejarlo afuera. Sin esto el Select no puede
 * representar el valor actual y al guardar lo pisa.
 */
export function paymentMethodOptionsFor(currentValue?: string | null): PaymentMethodOption[] {
  const raw = (currentValue ?? "").trim()
  if (!raw || PAYMENT_METHOD_VALUES.includes(raw)) return PAYMENT_METHODS
  return [...PAYMENT_METHODS, { value: raw, label: raw }]
}
