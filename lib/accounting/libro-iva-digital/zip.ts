/**
 * Bundle de los 4 archivos REGINFO en un único ZIP descargable.
 *
 * Naming AFIP: cada archivo lleva el período en el nombre.
 *   REGINFO_CV_VENTAS_CBTE.txt
 *   REGINFO_CV_VENTAS_ALICUOTAS.txt
 *   REGINFO_CV_COMPRAS_CBTE.txt
 *   REGINFO_CV_COMPRAS_ALICUOTAS.txt
 *
 * El nombre del ZIP usa formato: libro-iva-digital-YYYY-MM.zip
 */

import JSZip from "jszip"
import {
  generateVentasCbteFile,
  type VentaInput,
} from "./ventas-cbte"
import {
  generateVentasAlicuotasFile,
  type VentaAlicuotaInput,
} from "./ventas-alicuotas"
import {
  generateComprasCbteFile,
  type CompraInput,
} from "./compras-cbte"
import {
  generateComprasAlicuotasFile,
  type CompraAlicuotaInput,
} from "./compras-alicuotas"

export interface LibroIvaDigitalInput {
  ventas: VentaInput[]
  ventas_alicuotas: VentaAlicuotaInput[]
  compras: CompraInput[]
  compras_alicuotas: CompraAlicuotaInput[]
  year: number
  month: number
}

export interface LibroIvaDigitalBundle {
  /** Buffer del ZIP listo para descargar */
  zipBuffer: Uint8Array
  /** Nombre sugerido para el archivo de descarga */
  filename: string
  /** Conteo de líneas por archivo (para diagnóstico) */
  counts: {
    ventas_cbte: number
    ventas_alicuotas: number
    compras_cbte: number
    compras_alicuotas: number
  }
}

export async function bundleLibroIvaDigital(
  input: LibroIvaDigitalInput
): Promise<LibroIvaDigitalBundle> {
  const ventasCbte = generateVentasCbteFile(input.ventas)
  const ventasAlicuotas = generateVentasAlicuotasFile(input.ventas_alicuotas)
  const comprasCbte = generateComprasCbteFile(input.compras)
  const comprasAlicuotas = generateComprasAlicuotasFile(input.compras_alicuotas)

  const zip = new JSZip()
  zip.file("REGINFO_CV_VENTAS_CBTE.txt", ventasCbte)
  zip.file("REGINFO_CV_VENTAS_ALICUOTAS.txt", ventasAlicuotas)
  zip.file("REGINFO_CV_COMPRAS_CBTE.txt", comprasCbte)
  zip.file("REGINFO_CV_COMPRAS_ALICUOTAS.txt", comprasAlicuotas)

  const zipBuffer = await zip.generateAsync({ type: "uint8array" })

  const filename = `libro-iva-digital-${input.year}-${String(input.month).padStart(2, "0")}.zip`

  return {
    zipBuffer,
    filename,
    counts: {
      ventas_cbte: input.ventas.length,
      ventas_alicuotas: ventasAlicuotas ? ventasAlicuotas.split("\r\n").filter(Boolean).length : 0,
      compras_cbte: input.compras.length,
      compras_alicuotas: comprasAlicuotas ? comprasAlicuotas.split("\r\n").filter(Boolean).length : 0,
    },
  }
}
