// Ojo: /sales/crm-manychat renderiza DOS árboles distintos según
// organizations.crm_mode. El modo "advanced" no tiene botón de nuevo lead ni
// toggle Kanban/Tabla, así que esos pasos van con onMissing "skip" y la guía
// queda igual de coherente en ambos modos.

import type { TourDefinition } from "../types"

export const crmKanbanTour: TourDefinition = {
  id: "crm-kanban",
  title: "CRM Ventas",
  scope: "user",
  match: ["/sales/crm-manychat"],
  autoStart: true,
  steps: [
    {
      id: "board",
      target: "crm.kanban-board",
      route: "/sales/crm-manychat",
      title: "El tablero de leads",
      body: "Un lead es alguien que consultó por un viaje y todavía no compró. Entran solos desde WhatsApp e Instagram, y avanzan arrastrándolos de una columna a otra.",
      details: [
        "Por defecto el tablero muestra solo los leads de los últimos 90 días. Para ver los viejos tenés que tocar “Ver todo el historial”.",
        "El número que ves en el encabezado de cada columna es el total real, no la cantidad de tarjetas cargadas. Por eso podés ver “420” con 30 tarjetas: el resto se trae con “Cargar más”.",
        "Si arrastrás un lead a una columna que tiene un vendedor dueño, el lead pasa a ser de ese vendedor. Y al moverlo salta al tope de su columna, porque el orden es por última modificación.",
      ],
      placement: "top",
    },
    {
      id: "lista-vs-estado",
      title: "La columna y el estado son dos cosas distintas",
      body: "La columna del tablero indica en qué parte de tu circuito está el lead. El campo “Estado” (Nuevo, En Progreso, Cotizado, Ganado, Perdido) es un dato aparte que se edita desde el detalle.",
      details: [
        "Un lead puede estar en la columna “Caribe” y tener estado “Cotizado” al mismo tiempo. No se pisan.",
        "Mover la tarjeta de columna no cambia el estado, salvo que tu agencia tenga activada esa sincronización.",
      ],
      route: "/sales/crm-manychat",
    },
    {
      id: "new-lead",
      target: "crm.new-lead-button",
      title: "Cargar un lead a mano",
      body: "Los leads entran solos desde las integraciones, pero también podés cargar uno si te llegó por otro lado.",
      nextTour: "lead-new",
      interactive: true,
      details: [
        "Prestá atención a la agencia que figura arriba del formulario: es donde se va a crear el lead.",
        "Elegir el destino completa la región sola, y la región propone la lista del CRM.",
      ],
      placement: "bottom",
      align: "end",
      onMissing: "skip",
    },
    {
      id: "cotizar-con-emilia",
      title: "Cotizá con Emilia desde el lead",
      body: "Abrí un lead y elegí “Más → Cotizar”. Si Emilia está habilitada para tu agencia, busca opciones reales y convierte lo que selecciones en una cotización.",
      requirePermission: { module: "leads", permission: "write" },
    },
    {
      id: "lead-a-operacion",
      title: "De lead a venta",
      body: "Abrí el lead y desde “Más → Cotizar” armás la cotización. Cuando el cliente acepta, el botón “Crear operación” abre el alta ya precargada con sus datos.",
      details: [
        "El formulario viene con el contacto, el destino, la agencia, el vendedor, el precio cotizado y la seña ya cargados. Al guardar te lleva directo a la operación.",
        "Marcar un lead como “Ganado” no crea la operación. Si ves el aviso “Venta sin operación”, es justamente eso: se vendió pero falta cargarla.",
        "Archivar no es lo mismo que perder ni que descartar: el lead sale del tablero pero se puede restaurar.",
      ],
      route: "/sales/crm-manychat",
    },
    {
      id: "view-toggle",
      target: "crm.view-toggle",
      title: "Kanban o tabla",
      body: "El kanban sirve para trabajar el día a día. La vista de tabla te deja ordenar por cualquier columna y ver todos los leads paginados.",
      details: [
        "La tabla arma su propia búsqueda: los filtros del kanban no se le aplican, y no muestra los archivados.",
      ],
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
  ],
}
