// Guía de emisión de una factura electrónica.
//
// Es la única guía de formulario que auto-dispara, y es a propósito: emitir es
// el único acto irreversible del producto. Una vez que AFIP devuelve el CAE la
// factura existe y solo se corrige con una nota de crédito. Acá no hay un paso
// intermedio de "revisar antes de confirmar": un click crea el borrador Y pide
// el CAE.
//
// No repetir lo que ya dice la guía del listado (billing-afip): A vs B según el
// documento, el tope de facturación, qué es el CAE y cómo se hace una nota de
// crédito. Esta guía cubre el formulario.

import type { TourDefinition } from "../types"

export const billingNewTour: TourDefinition = {
  id: "billing-new",
  title: "Emitir una factura",
  scope: "user",
  // Ruta propia de tres segmentos: no compite con billing-afip, que matchea
  // /operations/billing y se queda con el listado.
  match: ["/operations/billing/new"],
  autoStart: true,
  steps: [
    {
      id: "intro",
      tone: "warning",
      title: "Esto no se deshace",
      body: "Cuando toques el botón del final, la factura se crea y se autoriza en AFIP en un solo paso. No hay una pantalla de confirmación intermedia.",
      details: [
        "Una vez que AFIP devuelve el CAE, la factura existe para siempre. El único arreglo es emitir una nota de crédito que la anule.",
        "Si AFIP la rechaza, en cambio, no pasa nada grave: queda como borrador y podés corregir y reintentar.",
        "Tomate el minuto de revisar el resumen de la derecha antes de emitir.",
      ],
      route: "/operations/billing/new",
    },
    {
      id: "tipo-comprobante",
      target: "billing-new.tipo-comprobante",
      title: "Tipo de comprobante",
      body: "No lo elegís vos: lo determina la condición fiscal de quien recibe la factura. Se completa solo cuando elegís el cliente.",
      details: [
        "Si más abajo tocás la condición de IVA del receptor, este campo se recalcula y pisa lo que hayas puesto acá. Por eso conviene dejarlo para el final, o directamente no tocarlo.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "punto-venta",
      target: "billing-new.punto-venta",
      title: "Punto de venta",
      body: "Es la numeración que te asignó AFIP. Si tenés más de una agencia, elegí la que emite esta factura.",
      details: [
        "Tiene que ser un punto de venta de tipo web service. Los de talonario o factura en línea no sirven acá y no aparecen en la lista.",
        "El que uses queda guardado como preferido para la próxima vez.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "pv-faltante",
      target: "billing-new.pv-faltante",
      tone: "warning",
      title: "Si no tenés punto de venta",
      body: "Cuando aparece este cartel rojo es porque ninguna de tus agencias tiene un punto de venta habilitado para facturación electrónica. Sin eso no se puede emitir.",
      details: [
        "El cartel te lista los pasos para crearlo en el sitio de ARCA. Es un trámite de una vez, en su web, no acá.",
        "Después de crearlo puede tardar un rato en aparecer. Si no lo ves, volvé a entrar a esta pantalla.",
      ],
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
    {
      id: "cliente",
      target: "billing-new.cliente",
      title: "A quién le facturás",
      body: "Elegir el cliente completa solo el nombre, el documento y la condición de IVA, y con eso el tipo de comprobante.",
      details: [
        "Si no elegís ninguno, la factura sale igual a “Consumidor Final” sin documento. Es válido, pero no sirve si el cliente necesita descargarla.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "operacion",
      target: "billing-new.operacion",
      title: "Operación asociada",
      body: "Es lo que arma los renglones de la factura solo. Elegila salvo que estés facturando algo que no está cargado como operación.",
      details: [
        "Si la operación ya tiene facturas emitidas, los importes vienen ajustados a lo que falta facturar, no al total de la venta. Por eso pueden no coincidir con lo que esperabas.",
        "Queda deshabilitada hasta que elijas un cliente.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "receptor",
      target: "billing-new.receptor",
      title: "Nombre y documento",
      body: "Vienen del cliente, pero son editables. Verificá que el CUIT sea el correcto: AFIP no controla que el nombre coincida con el número.",
      details: [
        "Para factura A el CUIT es obligatorio y tiene que tener 11 dígitos.",
        "Se puede emitir con un nombre que no corresponde al CUIT y AFIP igual la aprueba. El error queda para siempre en el comprobante.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "condicion-iva",
      target: "billing-new.condicion-iva",
      tone: "warning",
      title: "El campo más delicado",
      body: "Cambiar la condición de IVA reescribe el significado de los importes que ya cargaste, sin avisarte.",
      details: [
        "Con “Consumidor Final” los importes se entienden con IVA incluido. Si pasás a Monotributista o Responsable Inscripto, esos mismos números pasan a ser netos y el total salta alrededor de un 21%.",
        "Por eso: definí la condición ANTES de cargar los importes. Si la cambiaste después, volvé a revisar el resumen de la derecha.",
        "Este campo también fuerza el tipo de comprobante de arriba.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "fechas-servicio",
      target: "billing-new.fechas-servicio",
      title: "Fechas del servicio",
      body: "El período que estás facturando. Vienen con la fecha de hoy y en general está bien dejarlas así.",
      details: [
        "AFIP las exige porque estas facturas se emiten como servicios, no como venta de productos. Si quedan vacías o inconsistentes, la rechaza.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "moneda",
      target: "billing-new.moneda",
      title: "Moneda de la factura",
      body: "Este bloque aparece solo si la operación está vendida en dólares. Podés facturar en pesos igual, convirtiendo.",
      details: [
        "Si no ves este bloque es porque la operación es en pesos y la factura sale en pesos. No falta nada.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "tipo-cambio",
      target: "billing-new.tipo-cambio",
      tone: "warning",
      title: "La cotización la controla AFIP",
      body: "Viene cargado con la cotización oficial del día hábil anterior. AFIP no acepta un valor que se aleje más del 2% de ese número.",
      details: [
        "Si lo modificás mucho, el sistema te frena antes de mandar y te sugiere el valor correcto.",
        "Si elegís facturar directamente en dólares, este campo desaparece y la cotización la resuelve el sistema solo.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "servicio",
      target: "billing-new.servicio",
      title: "Facturar por partes",
      body: "Aparece cuando la operación tiene varios operadores. Te deja emitir una factura por cada parte en vez de una sola por todo.",
      details: [
        "Sirve para facturar primero el vuelo y después el hotel, por ejemplo. Cada emisión descuenta del total y el resto queda disponible.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "items",
      target: "billing-new.items",
      title: "Por qué hay dos renglones",
      body: "El sistema parte el importe en dos: lo que le pagás al operador va como no gravado, y solo tu diferencia va gravada al 10,5%.",
      details: [
        "Es el régimen de intermediación de las agencias de viaje: pagás IVA sobre tu comisión, no sobre el total del paquete.",
        "Podés editar las descripciones y los importes, pero si tocás los números revisá que la suma siga cerrando con lo vendido.",
        "Este formulario no emite percepciones ni retenciones. Si la operación las necesita, se cargan por otro lado.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
    },
    {
      id: "resumen",
      target: "billing-new.resumen",
      title: "Revisá acá antes de emitir",
      body: "El resumen te dice el tipo de comprobante, la condición del receptor, el punto de venta y el total final. Es tu última oportunidad de detectar un error.",
      details: [
        "En factura B a consumidor final no vas a ver el desglose de IVA: solo el total. Es correcto, así se emiten.",
      ],
      placement: "left",
      interactive: true,
    },
    {
      id: "emitir",
      target: "billing-new.emitir",
      tone: "warning",
      title: "Emitir",
      body: "Un click crea la factura y le pide el CAE a AFIP. A partir de ahí es un documento fiscal y no se borra.",
      details: [
        "Si AFIP la rechaza, vas a ver una explicación de por qué en castellano y qué hacer. La factura queda en borrador y podés reintentar desde el listado.",
        "Si la aprueba, el CAE aparece en el aviso de confirmación junto con su fecha de vencimiento, que es el plazo para entregársela al cliente.",
        "Los errores más comunes son de configuración, no de esta pantalla: certificado vencido, punto de venta dado de baja o CUIT mal cargado.",
      ],
      placement: "left",
      interactive: true,
    },
  ],
}
