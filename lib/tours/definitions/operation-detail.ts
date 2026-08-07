// Guía de la pantalla de detalle de operación.
//
// Es la pantalla más densa del producto: 9 tabs, la mitad gateados por permisos.
// Los pasos de tabs financieros llevan requirePermission para que a un vendedor
// no le aparezca un paso apuntando a algo que no ve.

import type { TourDefinition } from "../types"

export const operationDetailTour: TourDefinition = {
  id: "operation-detail",
  title: "Detalle de operación",
  scope: "user",
  match: ["/operations/[id]"],
  // /operations/[id] también matchea estas rutas, que son pantallas distintas.
  exclude: [
    "/operations/new",
    "/operations/billing",
    "/operations/statistics",
    "/operations/check-ins",
    "/operations/settings",
  ],
  autoStart: true,
  // No hay ruta fija a la que mandar al usuario: cada operación tiene su URL.
  // Por eso esta guía no se abre desde el listado del menú.
  launchHint: "Abrí una operación para verla",
  steps: [
    {
      id: "header",
      target: "operation.header",
      title: "El encabezado de la operación",
      // CORREGIDO. Decía "acá ves el número de legajo": el #xxxxxxxx del título
      // son los primeros 8 caracteres del UUID, no el legajo.
      body: "Acá ves el destino y el estado actual. Desde la derecha podés editarla, facturarla o mandarle al cliente el detalle de su compra.",
      details: [
        "El #xxxxxxxx del título es un identificador corto, no el legajo. El legajo (OP-AAAAMMDD-XXXXXXXX) está en el tab Información, y es el que usás para buscarla o citarla ante el operador.",
        "“Enviar detalle” manda por mail un PDF con los servicios contratados, el importe total y la fecha máxima de pago. También podés descargarlo para mandarlo por WhatsApp.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-info",
      target: "operation.tab-info",
      title: "Información",
      body: "El resumen de la operación: datos básicos, fechas, legajo, vendedor y operador asignados, y el resumen financiero. Es la vista que más vas a usar.",
      placement: "bottom",
      align: "start",
      prepare: { click: "operation.tab-info" },
    },
    {
      id: "financial",
      target: "operation.financial",
      title: "El resumen financiero",
      body: "Venta total, costo del operador, ganancia y margen. Se recalcula solo a medida que cargás servicios y registrás cobros.",
      details: [
        "Estos totales incluyen la operación base más los servicios adicionales, por eso el margen puede no coincidir con el que ves en el listado (que es solo de la base).",
        "Ojo con las monedas: un servicio cargado en una moneda distinta a la de la operación se lista abajo pero no suma a estos totales.",
        "Si la venta está en una moneda y el costo del operador en otra, el margen se calcula igual como resta directa. Conviene revisarlo a mano en ese caso.",
      ],
      placement: "top",
      onMissing: "skip",
    },
    {
      id: "tab-customers",
      target: "operation.tab-customers",
      title: "Clientes y pasajeros",
      body: "Sumá los pasajeros que viajan y marcá cuál es el titular. Solo puede haber un titular por operación.",
      details: [
        "El titular es quien figura como responsable: es el que recibe por defecto el “Enviar detalle” y el que va en la factura.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-services",
      target: "operation.tab-services",
      title: "Servicios",
      body: "Cargá vuelos, hoteles, transfers, excursiones, asientos, equipaje, visas y asistencias. Cada servicio lleva su precio de venta y su costo de operador: de ahí sale la ganancia.",
      details: [
        "Los cobros y pagos de los servicios se registran acá, no en el tab “Pagos Operación” — ese muestra solo los de la operación base.",
        "El flag “Comisiona” no cambia el margen: define si ese servicio entra en el cálculo de la comisión del vendedor. Asiento, equipaje y visa vienen sin comisionar por defecto.",
        "El margen de un servicio solo se calcula si la venta y el costo están en la misma moneda.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-payments",
      target: "operation.tab-payments",
      title: "Pagos de la operación",
      body: "Los cobros del cliente y los pagos al operador de la operación base. Cada cobro registrado impacta en la caja y baja el saldo pendiente.",
      details: [
        "Arriba tenés dos saldos independientes: lo que te debe el cliente y lo que le debés al operador.",
        "“Saldos por Pasajero” te deja repartir un cobro entre varios pasajeros cuando cada uno paga su parte.",
      ],
      placement: "bottom",
      align: "start",
      requirePermission: { module: "cash", permission: "read" },
      onMissing: "skip",
    },
    {
      id: "tab-itinerary",
      target: "operation.tab-itinerary",
      title: "Detalle de Compra: el documento para el pasajero",
      body: "A pesar del nombre, acá no hay costos. Es el itinerario que le armás al cliente —vuelos, hoteles, traslados, notas y fotos— para descargarlo en PDF y mandárselo.",
      details: [
        "Las compras a proveedores están en otro lado: en el card “Resumen de Compra”, dentro del tab Información. Los nombres se parecen mucho y son cosas opuestas.",
        "Los bloques se reordenan con las flechas y cada uno admite una imagen.",
      ],
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
    {
      id: "tab-documents",
      target: "operation.tab-documents",
      title: "Documentos",
      body: "Subí vouchers, pasaportes, seguros y comprobantes. Quedan asociados a la operación para que el equipo los encuentre.",
      placement: "bottom",
      align: "start",
    },
    {
      id: "tab-accounting",
      target: "operation.tab-accounting",
      title: "Contabilidad y Métricas",
      body: "Contabilidad tiene las facturas reales: las de compra a operadores y las de venta autorizadas por AFIP, con su IVA. Métricas muestra rentabilidad, ROI y posición de IVA.",
      details: [
        "Métricas es orientativo, no contable: si la operación todavía no tiene comisión calculada asume un 10%, y estima el IVA con una fórmula fija del 21% en vez de leer las facturas.",
        "Los números fiscales reales están en Contabilidad y en el card “Detalle Fiscal” de Métricas.",
      ],
      placement: "bottom",
      align: "start",
      requirePermission: { module: "accounting", permission: "read" },
      onMissing: "skip",
    },
    {
      id: "tab-alerts",
      target: "operation.tab-alerts",
      title: "Alertas",
      body: "Avisos automáticos de vencimientos, saldos impagos y documentación faltante. Revisalos antes de dar la operación por cerrada.",
      placement: "bottom",
      align: "start",
    },
  ],
}
