import type { TourDefinition } from "../types"

export const operationsListTour: TourDefinition = {
  id: "operations-list",
  title: "Operaciones",
  scope: "user",
  match: ["/operations"],
  autoStart: true,
  steps: [
    {
      id: "new",
      target: "operations.new-button",
      // El route del primer paso es lo que permite abrir la guía desde el menú
      // estando en otra pantalla: el motor navega y después ilumina.
      route: "/operations",
      title: "Crear una operación",
      body: "Una operación es un viaje vendido: agrupa a los pasajeros, los servicios contratados, los cobros del cliente y lo que le pagás al operador.",
      details: [
        "Cada operación recibe un legajo automático con formato OP-AAAAMMDD-XXXXXXXX. Es lo que vas a buscar acá y lo que citás cuando hablás con el operador.",
        "Los estados van Reservado → Confirmado → En viaje → Viajado, más Cancelado. Tu agencia también puede definir estados propios desde Operaciones → Configuración.",
      ],
      placement: "bottom",
      align: "end",
    },
    {
      id: "filters",
      target: "operations.filters",
      title: "Filtros",
      // CORREGIDO. Decía "podés filtrar por fecha de carga, de salida o de
      // vencimiento de pago". No existe filtro por fecha de carga, y los dos
      // rangos de fecha son independientes entre sí.
      body: "Acotá por estado, vendedor y agencia. Hay dos rangos de fecha distintos: “Viaje desde/hasta” filtra por cuándo viaja el pasajero, y el selector “Fecha de…” filtra por cuándo pasó otra cosa.",
      details: [
        "El selector “Fecha de…” tiene cuatro opciones: Fecha de Venta (cuándo se vendió), Cobro (cuándo entró plata del cliente), Pago (cuándo se le pagó al operador) y Vencimiento (cuándo vence una cuota).",
        "La confusión más común: “Fecha de Venta” es cuándo se vendió; “Viaje desde/hasta” es cuándo viaja. Son cosas distintas y se pueden combinar.",
        "Si cargás los dos rangos a la vez se aplican los dos juntos, así que es fácil terminar sin resultados. Empezá por uno.",
        "Los filtros no se aplican solos: hay que apretar “Aplicar Filtros”. El buscador de abajo, en cambio, busca mientras escribís.",
      ],
      placement: "bottom",
      align: "start",
    },
    {
      id: "search",
      target: "operations.search",
      title: "Buscar una operación puntual",
      body: "Buscá por legajo, destino, aerolínea, hotel o nombre del cliente. Busca en todas tus operaciones, no solo en la página que estás viendo.",
      details: [
        "Funciona con palabras sueltas del nombre: escribir “Bianco” encuentra a “Lo Bianco”.",
        "Necesita al menos 2 letras y busca solo, sin apretar nada.",
      ],
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
    {
      id: "totals",
      target: "operations.totals",
      title: "Totales de la página",
      body: "Venta, cobrado, a cobrar y margen, separados por moneda. Sirve para tener una lectura rápida de lo que estás mirando.",
      details: [
        "Suma solo las filas de la página actual, no todo el resultado del filtro. Si filtraste 1.200 operaciones y estás viendo 50, el total es de esas 50.",
        "Para el total real de un período conviene exportar el CSV y sumar ahí.",
      ],
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
    {
      id: "table",
      target: "operations.table",
      title: "El listado",
      body: "Cada fila es una operación. “A cobrar” es lo que todavía te debe el cliente y “A pagar” es lo que le debés al operador: son dos saldos independientes. Hacé click en cualquier fila para abrir su detalle.",
      // El listado es alto: el hueco se recorta y la tarjeta va debajo, donde
      // siempre queda lugar.
      placement: "bottom",
      align: "start",
      details: [
        "El margen de este listado es solo de la operación base. El del detalle incluye además los servicios adicionales, así que los dos números pueden no coincidir para la misma operación.",
        "Las columnas de plata y las de vendedor, operador y facturación no se pueden ordenar: se calculan después de traer los datos.",
        "Con el botón “Vista” elegís qué columnas mostrar, y tu elección queda guardada para la próxima.",
      ],
    },
    {
      id: "export",
      target: "operations.export",
      tone: "warning",
      title: "El CSV no exporta lo que estás viendo",
      body: "“Exportar CSV” baja muchas más columnas que la tabla, pero no respeta todo lo que tenés en pantalla. Revisá qué te llevaste antes de mandárselo a alguien.",
      details: [
        "No viajan al archivo: el texto del buscador, el orden de las columnas ni el selector “Fecha de…”. Sí viajan estado, vendedor, agencia y el rango de fechas.",
        "Y ese rango cambia de significado: en la tabla filtra por fecha de viaje, en el CSV filtra por fecha de venta. Con las mismas fechas podés obtener operaciones distintas.",
        "El export corta en 10.000 filas y el único aviso es el nombre del archivo, que termina en “-TRUNCADO-10000”.",
      ],
      placement: "bottom",
      align: "end",
      onMissing: "skip",
    },
  ],
}
