/**
 * VIB-135 — Mapeo fiscal AFIP centralizado.
 *
 * Estos tests fijan que el módulo reproduce EXACTAMENTE lo que hacía la lógica
 * inline de la pantalla de Nueva Factura: mismos cbte_tipo, mismos DocTipo y
 * mismos fallbacks. Si alguno cambia, se emiten comprobantes con la letra o el
 * documento equivocados y AFIP los rechaza (o peor, los acepta mal).
 */

import {
  AFIP_CBTE_TIPO,
  AFIP_DOC_TIPO,
  CONDICION_IVA_RECEPTOR,
  CONDICION_IVA_OPTIONS,
  getCbteTipoForCondicion,
  getCondicionForCbteTipo,
  getCustomerAfipDocType,
  getReceptorDefaults,
  inferDocTipoFromDocNumber,
  resolveDocTipoForCondicion,
  requiresReceptorCuit,
  getFacturaLabel,
} from "../afip-fiscal-mapping"

describe("getCbteTipoForCondicion — condición IVA → letra de factura", () => {
  it("Responsable Inscripto emite Factura A", () => {
    expect(getCbteTipoForCondicion(CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO)).toBe(
      AFIP_CBTE_TIPO.FACTURA_A
    )
  })

  it.each([
    ["Consumidor Final", CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL],
    ["Sujeto Exento", CONDICION_IVA_RECEPTOR.SUJETO_EXENTO],
    ["Monotributista", CONDICION_IVA_RECEPTOR.MONOTRIBUTO],
  ])("%s emite Factura B", (_label, condicion) => {
    expect(getCbteTipoForCondicion(condicion)).toBe(AFIP_CBTE_TIPO.FACTURA_B)
  })
})

describe("getCondicionForCbteTipo — mapeo inverso", () => {
  it("Factura A implica Responsable Inscripto", () => {
    expect(getCondicionForCbteTipo(AFIP_CBTE_TIPO.FACTURA_A, 5)).toBe(
      CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO
    )
  })

  it("al pasar de A a B, RI se mueve a Consumidor Final", () => {
    expect(
      getCondicionForCbteTipo(
        AFIP_CBTE_TIPO.FACTURA_B,
        CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO
      )
    ).toBe(CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL)
  })

  it("al pasar a B respeta una condición que ya era de Factura B", () => {
    expect(
      getCondicionForCbteTipo(AFIP_CBTE_TIPO.FACTURA_B, CONDICION_IVA_RECEPTOR.MONOTRIBUTO)
    ).toBe(CONDICION_IVA_RECEPTOR.MONOTRIBUTO)
    expect(
      getCondicionForCbteTipo(AFIP_CBTE_TIPO.FACTURA_B, CONDICION_IVA_RECEPTOR.SUJETO_EXENTO)
    ).toBe(CONDICION_IVA_RECEPTOR.SUJETO_EXENTO)
  })
})

describe("getCustomerAfipDocType", () => {
  it.each([
    ["CUIT", AFIP_DOC_TIPO.CUIT],
    ["CUIL", AFIP_DOC_TIPO.CUIL],
    ["DNI", AFIP_DOC_TIPO.DNI],
  ])("%s → DocTipo %i", (docType, expected) => {
    expect(getCustomerAfipDocType({ document_type: docType, document_number: "20123456789" })).toBe(
      expected
    )
  })

  it("es case-insensitive con el tipo de documento", () => {
    expect(getCustomerAfipDocType({ document_type: "cuit", document_number: "20123456789" })).toBe(
      AFIP_DOC_TIPO.CUIT
    )
  })

  it("sin número de documento devuelve sin identificar (99), aunque tenga tipo", () => {
    expect(getCustomerAfipDocType({ document_type: "CUIT", document_number: "" })).toBe(
      AFIP_DOC_TIPO.SIN_IDENTIFICAR
    )
    expect(getCustomerAfipDocType({})).toBe(AFIP_DOC_TIPO.SIN_IDENTIFICAR)
  })

  it("un tipo desconocido cae en sin identificar", () => {
    expect(getCustomerAfipDocType({ document_type: "PASAPORTE", document_number: "X123" })).toBe(
      AFIP_DOC_TIPO.SIN_IDENTIFICAR
    )
  })
})

describe("getReceptorDefaults — defaults por documento del cliente", () => {
  it("CUIT → Factura A, DocTipo 80, Responsable Inscripto", () => {
    expect(getReceptorDefaults({ document_type: "CUIT", document_number: "20123456789" })).toEqual({
      cbte_tipo: AFIP_CBTE_TIPO.FACTURA_A,
      receptor_doc_tipo: AFIP_DOC_TIPO.CUIT,
      receptor_doc_nro: "20123456789",
      receptor_condicion_iva: CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
    })
  })

  it("CUIL → Factura B, DocTipo 86, Consumidor Final", () => {
    expect(getReceptorDefaults({ document_type: "CUIL", document_number: "27123456784" })).toEqual({
      cbte_tipo: AFIP_CBTE_TIPO.FACTURA_B,
      receptor_doc_tipo: AFIP_DOC_TIPO.CUIL,
      receptor_doc_nro: "27123456784",
      receptor_condicion_iva: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    })
  })

  it("DNI → Factura B, DocTipo 96, Consumidor Final", () => {
    expect(getReceptorDefaults({ document_type: "DNI", document_number: "30123456" })).toEqual({
      cbte_tipo: AFIP_CBTE_TIPO.FACTURA_B,
      receptor_doc_tipo: AFIP_DOC_TIPO.DNI,
      receptor_doc_nro: "30123456",
      receptor_condicion_iva: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    })
  })

  it("sin documento → Factura B, DocTipo 99 y DocNro '0'", () => {
    expect(getReceptorDefaults({})).toEqual({
      cbte_tipo: AFIP_CBTE_TIPO.FACTURA_B,
      receptor_doc_tipo: AFIP_DOC_TIPO.SIN_IDENTIFICAR,
      receptor_doc_nro: "0",
      receptor_condicion_iva: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    })
  })
})

describe("inferDocTipoFromDocNumber — mientras se tipea el documento", () => {
  const CF = CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL

  it("11 dígitos → CUIT", () => {
    expect(
      inferDocTipoFromDocNumber({ docNro: "20123456789", condicion: CF, currentDocTipo: 96 })
    ).toBe(AFIP_DOC_TIPO.CUIT)
  })

  it.each([["7 dígitos", "1234567"], ["8 dígitos", "30123456"]])(
    "%s → DNI",
    (_label, docNro) => {
      expect(inferDocTipoFromDocNumber({ docNro, condicion: CF, currentDocTipo: 99 })).toBe(
        AFIP_DOC_TIPO.DNI
      )
    }
  )

  it("vacío → sin identificar", () => {
    expect(inferDocTipoFromDocNumber({ docNro: "", condicion: CF, currentDocTipo: 96 })).toBe(
      AFIP_DOC_TIPO.SIN_IDENTIFICAR
    )
  })

  it("ignora separadores al contar dígitos", () => {
    expect(
      inferDocTipoFromDocNumber({ docNro: "20-12345678-9", condicion: CF, currentDocTipo: 96 })
    ).toBe(AFIP_DOC_TIPO.CUIT)
  })

  it("con Responsable Inscripto fuerza CUIT aunque el número esté incompleto (evita AFIP 10013)", () => {
    expect(
      inferDocTipoFromDocNumber({
        docNro: "201",
        condicion: CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
        currentDocTipo: 96,
      })
    ).toBe(AFIP_DOC_TIPO.CUIT)
  })

  it("una cantidad de dígitos que no encaja conserva el DocTipo actual", () => {
    expect(
      inferDocTipoFromDocNumber({ docNro: "12345", condicion: CF, currentDocTipo: 86 })
    ).toBe(86)
  })
})

describe("resolveDocTipoForCondicion — al cambiar la condición IVA", () => {
  it("Responsable Inscripto siempre fuerza CUIT", () => {
    expect(
      resolveDocTipoForCondicion({
        condicion: CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
        customer: { document_type: "DNI", document_number: "30123456" },
        currentDocTipo: AFIP_DOC_TIPO.DNI,
        currentDocNro: "30123456",
      })
    ).toBe(AFIP_DOC_TIPO.CUIT)
  })

  it("vuelve al documento del cliente seleccionado", () => {
    expect(
      resolveDocTipoForCondicion({
        condicion: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
        customer: { document_type: "DNI", document_number: "30123456" },
        currentDocTipo: AFIP_DOC_TIPO.CUIT,
        currentDocNro: "30123456",
      })
    ).toBe(AFIP_DOC_TIPO.DNI)
  })

  it("sin número cargado queda sin identificar", () => {
    expect(
      resolveDocTipoForCondicion({
        condicion: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
        customer: { document_type: "DNI", document_number: "30123456" },
        currentDocTipo: AFIP_DOC_TIPO.DNI,
        currentDocNro: "0",
      })
    ).toBe(AFIP_DOC_TIPO.SIN_IDENTIFICAR)
  })

  it("sin cliente seleccionado conserva el DocTipo actual si es válido", () => {
    expect(
      resolveDocTipoForCondicion({
        condicion: CONDICION_IVA_RECEPTOR.MONOTRIBUTO,
        customer: null,
        currentDocTipo: AFIP_DOC_TIPO.CUIL,
        currentDocNro: "27123456784",
      })
    ).toBe(AFIP_DOC_TIPO.CUIL)
  })

  it("sin cliente y con un DocTipo inválido cae en DNI", () => {
    expect(
      resolveDocTipoForCondicion({
        condicion: CONDICION_IVA_RECEPTOR.MONOTRIBUTO,
        customer: null,
        currentDocTipo: AFIP_DOC_TIPO.SIN_IDENTIFICAR,
        currentDocNro: "30123456",
      })
    ).toBe(AFIP_DOC_TIPO.DNI)
  })
})

describe("helpers de presentación", () => {
  it("solo la Factura A exige CUIT del receptor", () => {
    expect(requiresReceptorCuit(AFIP_CBTE_TIPO.FACTURA_A)).toBe(true)
    expect(requiresReceptorCuit(AFIP_CBTE_TIPO.FACTURA_B)).toBe(false)
  })

  it("etiqueta el comprobante", () => {
    expect(getFacturaLabel(AFIP_CBTE_TIPO.FACTURA_A)).toBe("Factura A")
    expect(getFacturaLabel(AFIP_CBTE_TIPO.FACTURA_B)).toBe("Factura B")
  })

  it("cada opción del selector declara la letra que realmente produce", () => {
    for (const opt of CONDICION_IVA_OPTIONS) {
      const expected = getCbteTipoForCondicion(opt.id) === AFIP_CBTE_TIPO.FACTURA_A ? "A" : "B"
      expect(opt.letra).toBe(expected)
    }
  })
})
