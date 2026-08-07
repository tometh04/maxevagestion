import type { TourDefinition } from "../types"

export const billingAfipTour: TourDefinition = {
  id: "billing-afip",
  title: "Facturación AFIP",
  scope: "user",
  match: ["/operations/billing"],
  autoStart: true,
  steps: [
    {
      id: "new-invoice",
      target: "billing.new-invoice",
      route: "/operations/billing",
      title: "Emitir una factura",
      body: "Elegís la operación, revisás los importes y Vibook le pide el CAE a AFIP. Necesitás tener la facturación electrónica configurada antes de emitir la primera.",
      details: [
        "El tipo de comprobante sale de los datos fiscales del cliente: con CUIT va Factura A, con CUIL o DNI va Factura B.",
        "La Factura A exige CUIT sí o sí. Si el cliente tiene cargado un DNI, AFIP la rechaza y hay que corregir el dato del cliente primero.",
        "En una Factura B a consumidor final el IVA no se muestra desglosado. No es que no lo tenga: el precio ya lo incluye.",
        "No se puede facturar por encima de lo vendido. Si la operación ya tiene facturas, el sistema ajusta el remanente solo.",
      ],
      placement: "bottom",
      align: "end",
    },
    {
      id: "cae",
      title: "El CAE es lo que hace válida a la factura",
      body: "El CAE es el código que devuelve AFIP cuando aprueba el comprobante. Sin CAE la factura no existe fiscalmente, por más que la veas cargada en el sistema.",
      details: [
        "Junto al CAE viene su fecha de vencimiento: es el plazo que tenés para entregarle el comprobante al cliente.",
        "Al crear una factura el sistema intenta autorizarla en el momento. Si AFIP la rechaza, queda en Borrador con el error explicado y podés reintentar desde el listado.",
        "El PDF que descargás incluye el QR de AFIP.",
      ],
      route: "/operations/billing",
    },
    {
      id: "filters",
      target: "billing.filters",
      title: "Buscar comprobantes",
      body: "Buscá por cliente, CUIT, número de comprobante o CAE, y filtrá por estado.",
      details: [
        "El filtro de estado consulta al servidor, pero el buscador filtra solo lo que ya está en pantalla. Si buscás un CAE y no aparece, sacá el filtro de estado primero.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "table",
      target: "billing.table",
      title: "Comprobantes emitidos",
      body: "Cada fila trae su CAE y su vencimiento. Desde acá descargás el PDF, se lo mandás al cliente por mail o emitís la nota de crédito.",
      details: [
        "Sobre las autorizadas puede aparecer un segundo estado de verificación contra AFIP. “Verificada” es lo esperable; “Discrepancia” significa que lo que tenemos guardado no coincide con lo que AFIP registró, y “No está en AFIP” es un problema serio que hay que revisar.",
        "“Sin verificar” es normal apenas emitís: se actualiza al re-sincronizar.",
      ],
      placement: "top",
    },
    {
      id: "credit-note",
      tone: "warning",
      title: "Una factura autorizada no se borra nunca",
      body: "Una vez que AFIP le dio el CAE, el comprobante es definitivo. Para anularlo o descontarlo hay que emitir una Nota de Crédito, no eliminarlo.",
      details: [
        "Solo se pueden eliminar borradores y facturas rechazadas que nunca llegaron a tener CAE.",
        "La nota de crédito se emite desde la factura original y queda asociada a ella. Viene precargada como anulación total; si querés anular una parte, editás los importes.",
        "La nota de crédito también necesita su propio CAE: no alcanza con crearla, hay que autorizarla.",
      ],
      route: "/operations/billing",
    },
    {
      id: "export",
      target: "billing.export",
      tone: "warning",
      title: "Descargar para el contador",
      body: "Bajás los comprobantes del período en un ZIP. Viene con el mes anterior completo por defecto, que es lo habitual para presentar el Libro IVA.",
      details: [
        "El ZIP respeta el filtro de estado que tengas puesto en la pantalla. Si quedó en “Borrador”, le vas a mandar al contador un paquete sin ninguna factura válida.",
        "Antes de exportar, poné el filtro de estado en “Todos” o en “Autorizada”.",
      ],
      placement: "bottom",
      align: "end",
      onMissing: "skip",
    },
  ],
}
