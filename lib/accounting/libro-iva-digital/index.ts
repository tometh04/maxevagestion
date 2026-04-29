/**
 * Libro IVA Digital — RG 4597 (formato AFIP actual).
 *
 * Reemplaza el viejo CITI RG 3683. Los archivos REGINFO son TXT fixed-width
 * que se importan en "Mis Aplicaciones Web → Libro IVA Digital".
 *
 * Multi-tenant: el endpoint /api/accounting/libro-iva consume datos de
 * tablas con RLS (invoices, purchase_invoices, etc.), así que cada org
 * genera el suyo solo con sus comprobantes.
 */

export { generateVentasCbteRow, generateVentasCbteFile } from "./ventas-cbte"
export { generateVentasAlicuotasRows, generateVentasAlicuotasFile } from "./ventas-alicuotas"
export { generateComprasCbteRow, generateComprasCbteFile } from "./compras-cbte"
export { generateComprasAlicuotasRows, generateComprasAlicuotasFile } from "./compras-alicuotas"
export { bundleLibroIvaDigital } from "./zip"

export type { VentaInput } from "./ventas-cbte"
export type { VentaAlicuotaInput } from "./ventas-alicuotas"
export type { CompraInput } from "./compras-cbte"
export type { CompraAlicuotaInput } from "./compras-alicuotas"
export type { LibroIvaDigitalInput, LibroIvaDigitalBundle } from "./zip"
