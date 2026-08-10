// Guía de carga del alta de lead.
//
// Solo existe en el CRM en modo legacy: el modo "advanced" no tiene botón de
// alta manual (los leads entran únicamente por integración). Por eso el paso
// que abre el diálogo vive en la guía del CRM con onMissing "skip".

import type { TourDefinition } from "../types"

export const leadNewTour: TourDefinition = {
  id: "lead-new",
  title: "Cargar un lead",
  kind: "form",
  scope: "user",
  match: ["/sales/crm-manychat"],
  autoStart: false,
  launchHint: "Entrá a CRM Ventas y tocá Nuevo Lead",
  steps: [
    {
      id: "intro",
      title: "Cargar un lead a mano",
      body: "Los leads entran solos desde WhatsApp e Instagram. Este formulario es para cuando la consulta te llegó por otro lado: un conocido, una llamada, alguien que pasó por el local.",
      details: [
        "Un lead es una consulta, todavía no una venta. Cuando el cliente confirma, desde el mismo lead creás la operación con los datos ya cargados.",
      ],
    },
    {
      id: "contacto",
      target: "lead-new.contacto",
      title: "Contacto",
      body: "Nombre y teléfono son obligatorios. El email y el Instagram son opcionales pero ayudan después para encontrar a la persona.",
      // Abre el formulario. Sin esto la guía no encuentra ninguna de sus anclas.
      prepare: { click: "crm.new-lead-button", settleMs: 300 },
      details: [
        "El teléfono es lo que usa el sistema para detectar duplicados: si esa persona ya te escribió por WhatsApp, no se crea un lead repetido.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "viaje",
      target: "lead-new.viaje",
      title: "Destino y región",
      body: "Escribí el destino que consultó. Al elegirlo, la región se completa sola.",
      details: [
        "La región no es un dato decorativo: define de qué color se ve la tarjeta en el tablero y propone en qué lista del CRM va a caer el lead.",
        "Si todavía no sabés el destino, poné algo aproximado y corregilo después: es más útil tener el lead cargado que perfecto.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "asignacion",
      target: "lead-new.asignacion",
      tone: "warning",
      title: "Asignación: mirá bien la agencia",
      body: "Acá decidís de quién es el lead y en qué agencia se crea. El vendedor se puede dejar vacío y agarrarlo después desde el tablero.",
      details: [
        "Revisá la agencia antes de guardar. El formulario recuerda la última que usaste, y si trabajás con varias sucursales es fácil cargar el lead en la equivocada sin darte cuenta.",
        "Un lead en la agencia equivocada lo ve el equipo que no corresponde, y moverlo después no es directo.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "lista",
      target: "lead-new.lista",
      title: "Lista del CRM",
      body: "Es la columna del tablero donde va a aparecer. Viene propuesta según la región, y podés cambiarla.",
      details: [
        "Si la lista que elegís tiene un vendedor dueño, el lead pasa a ser de esa persona automáticamente.",
        "Ojo: la columna del tablero y el campo Estado son cosas distintas. La columna dice en qué parte de tu circuito está; el Estado es un dato aparte.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "origen",
      target: "lead-new.origen",
      title: "Origen",
      body: "Por dónde llegó la consulta. Viene en “Otro” a propósito para las cargas manuales.",
      details: [
        "No lo pongas en ManyChat si lo estás cargando a mano: ensucia las estadísticas de rendimiento por canal, que es justo lo que se mira para decidir dónde invertir en publicidad.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
    },
    {
      id: "senia",
      target: "lead-new.senia",
      title: "Precio cotizado y seña",
      body: "Si ya le pasaste un precio, cargalo acá. Y si te dejó una seña, marcá el switch y completá monto, moneda y fecha.",
      details: [
        "Estos datos se transfieren solos a la operación cuando el lead se convierte en venta: no los vas a tener que volver a cargar.",
        "Si todavía no cotizaste nada, dejalo vacío.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
    },
    {
      id: "guardar",
      target: "lead-new.guardar",
      title: "Crear el lead",
      body: "Al guardar aparece como tarjeta en la columna que elegiste. Desde ahí lo cotizás, le hacés seguimiento y lo convertís en operación cuando cierra.",
      placement: "top",
      align: "end",
      interactive: true,
    },
  ],
}
