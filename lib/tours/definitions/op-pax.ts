// Guía de carga de pasajeros de una operación.
//
// Cierra un cabo suelto que la guía del alta deja abierto a propósito: ahí se
// cargan CANTIDADES y se promete que los nombres van "después, en el detalle".
// Esto es ese después.
//
// El dato que ordena todo el contenido: un pasajero no es una entidad propia,
// es un cliente vinculado a la operación (`operation_customers`). De ahí salen
// las dos confusiones que la guía ataca — que la lista nunca arranca vacía, y
// que las cantidades del alta y los pasajeros cargados son dos números
// independientes que nadie concilia.

import type { TourDefinition } from "../types"

export const opPaxTour: TourDefinition = {
  id: "op-pax",
  title: "Agregar un pasajero",
  kind: "form",
  scope: "user",
  match: ["/operations/[id]"],
  // Mismo exclude que la guía de la pantalla: /operations/[id] también matchea
  // estas rutas, que son pantallas distintas.
  exclude: [
    "/operations/new",
    "/operations/billing",
    "/operations/statistics",
    "/operations/check-ins",
    "/operations/settings",
  ],
  autoStart: false,
  launchHint: "Abrí una operación y entrá al tab Clientes",
  steps: [
    {
      id: "intro",
      title: "Cargar los pasajeros",
      body: "Acá van los nombres y documentos de quienes viajan. En el alta de la operación cargaste cuántos son; esto es quiénes son.",
      details: [
        "Un pasajero es un cliente de la agencia vinculado a esta operación. No hay fichas de pasajero sueltas: si la persona ya te compró alguna vez, ya está en tu base y la buscás.",
        "La lista nunca arranca vacía: el cliente que elegiste al crear la operación ya entró como titular.",
      ],
    },
    {
      id: "contador",
      target: "op-pax.contador",
      tone: "warning",
      title: "Este número no se controla solo",
      body: "Nadie valida que los pasajeros cargados coincidan con los adultos, niños e infantes que pusiste en el alta. Son dos números independientes.",
      details: [
        "Si la operación dice 3 adultos y cargaste 1 pasajero, el PDF que recibe el cliente va a decir “3 pasajeros” en las cantidades y va a listar un solo nombre en los huéspedes.",
        "Peor: en Saldos por Pasajero la venta se reparte entre los pasajeros cargados. Con 1 de 3, esa única persona figura debiendo el 100% de la operación.",
        "La regla práctica: cargá tantos pasajeros como personas viajan, siempre.",
      ],
      // El tab tiene que estar activo para que exista el resto de las anclas.
      prepare: { click: "operation.tab-customers", settleMs: 300 },
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
    {
      id: "buscar",
      target: "op-pax.buscar",
      title: "Buscá al pasajero",
      body: "Escribí nombre, email o teléfono. Busca en toda tu cartera de clientes, no solo en esta operación.",
      details: [
        "Pide al menos 2 letras y trae como máximo 10 resultados. Con un apellido común (Pérez, González) el que buscás puede quedar afuera de esos 10: agregá el nombre para achicar.",
      ],
      // Abre el diálogo. Sin esto la guía arranca con el formulario cerrado y
      // no encuentra ninguna de las anclas que siguen.
      prepare: { click: "op-pax.agregar", settleMs: 300 },
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "resultados",
      target: "op-pax.resultados",
      title: "Elegí de la lista",
      body: "Tocá el que corresponda y queda seleccionado. Los que ya están en esta operación no aparecen: el sistema los filtra para que no los cargues dos veces.",
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "crear-cliente",
      target: "op-pax.crear-cliente",
      title: "Si el pasajero es nuevo",
      body: "“Crear Cliente Nuevo (OCR)” abre otro formulario donde podés sacarle una foto al DNI o al pasaporte y que los datos se completen solos.",
      details: [
        "Ojo con el orden: si el tipo de documento es Pasaporte, elegilo ANTES de subir la foto. Si no, el lector asume DNI y saca mal los datos.",
        "Si ya habías seleccionado a alguien de la lista y encima creás uno nuevo por acá, el cliente se crea pero puede quedar afuera de la operación. Hacé una cosa a la vez.",
      ],
      placement: "left",
      onMissing: "skip",
    },
    {
      id: "rol",
      target: "op-pax.rol",
      tone: "warning",
      title: "Principal o acompañante",
      body: "El principal es el titular: el responsable del pago y a quien le llega todo. Los demás son acompañantes.",
      details: [
        "Titular hay uno solo. Si ya existe, la opción aparece deshabilitada.",
        "No se puede cambiar después desde la pantalla: para cambiar de titular hay que quitar al actual y volver a agregarlo con el otro rol.",
        "Todo lo que sale hacia el cliente va al titular: el detalle de cuenta por mail, la factura y los mensajes de WhatsApp. Si el titular no tiene mail ni teléfono cargados, no sale nada.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "guardar",
      target: "op-pax.guardar",
      title: "Agregar",
      body: "Queda vinculado a la operación al instante. Repetí la búsqueda por cada persona que viaja.",
      placement: "top",
      align: "end",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "cierre",
      title: "Dos cosas que se destraban al cargarlos",
      body: "Con los pasajeros cargados aparecen funciones que sin ellos no existen.",
      details: [
        "Saldos por Pasajero, que reparte lo cobrado entre las personas, solo se muestra a partir de 2 pasajeros.",
        "Facturar por pasajero, en vez de una sola factura por la operación entera, también necesita 2 o más.",
        "Y algo para más adelante: sin número de documento cargado, a esa persona solo le podés emitir factura B a consumidor final. La A necesita CUIT.",
      ],
    },
  ],
}
