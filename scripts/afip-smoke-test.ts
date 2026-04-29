/**
 * Smoke test contra AFIP homologación.
 * NO corre en CI. Para uso manual antes de deploy.
 *
 * Uso:
 *   AFIP_SDK_API_KEY=... npx tsx scripts/afip-smoke-test.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const Afip = require("@afipsdk/afip.js")

async function main() {
  const apiKey = process.env.AFIP_SDK_API_KEY
  if (!apiKey) {
    console.error("AFIP_SDK_API_KEY not set")
    process.exit(1)
  }

  const afip = new Afip({
    CUIT: 20409378472, // CUIT test compartido de AFIP homologación
    production: false,
    access_token: apiKey,
  })

  console.log("1. Healthcheck GetServiceTA('wsfe')...")
  await afip.GetServiceTA("wsfe")
  console.log("   OK")

  console.log("2. getSalesPoints...")
  const pvs = await afip.ElectronicBilling.getSalesPoints()
  console.log("   OK, got:", Array.isArray(pvs) ? pvs.length : "single PV")

  console.log("3. getLastVoucher(1, 6)...")
  const last = await afip.ElectronicBilling.getLastVoucher(1, 6)
  console.log("   OK, last voucher:", last)

  console.log("4. createNextVoucher (Factura B $100)...")
  const next = await afip.ElectronicBilling.createNextVoucher({
    CantReg: 1,
    PtoVta: 1,
    CbteTipo: 6,
    Concepto: 2,
    DocTipo: 99,
    DocNro: 0,
    CbteFch: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    ImpTotal: 100,
    ImpTotConc: 0,
    ImpNeto: 82.64,
    ImpOpEx: 0,
    ImpIVA: 17.36,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: 5,
    FchServDesde: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    FchServHasta: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    FchVtoPago: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    Iva: [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }],
  })
  console.log("   OK, CAE:", next.CAE, "nro:", next.voucherNumber)

  console.log("5. getVoucherInfo read-back...")
  const info = await afip.ElectronicBilling.getVoucherInfo(next.voucherNumber, 1, 6)
  if (!info) {
    console.error("   FAIL: getVoucherInfo returned null right after creation")
    process.exit(1)
  }
  console.log("   OK, info.CodAutorizacion:", info.CodAutorizacion)

  if (info.CodAutorizacion === next.CAE || info.CAE === next.CAE) {
    console.log("\n✅ SMOKE TEST PASSED")
  } else {
    console.error("\n❌ CAE mismatch: created", next.CAE, "but getVoucherInfo returned", info)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("SMOKE TEST ERROR:", err)
  process.exit(1)
})
