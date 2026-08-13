// Guía de carga del alta de operación.
//
// kind "form": sus anclas viven dentro del diálogo, que puede estar cerrado.
// Nunca auto-dispara ni compite por ser "la guía de esta pantalla" — se llega
// encadenada desde la guía de Operaciones o eligiéndola en el menú.
//
// El orden NO es el orden visual del formulario: sigue las dependencias reales.
// La agencia define qué campos son obligatorios; el vendedor principal acota la
// lista del secundario; el secundario monta los inputs de comisión; el checkbox
// de múltiples operadores decide qué campos existen; y la moneda de venta pisa
// la de costo. Llenarlo en el orden visual obliga a volver atrás.

import type { TourDefinition } from "../types"

export const operationNewTour: TourDefinition = {
  id: "operation-new",
  title: "Cargar una operación",
  kind: "form",
  scope: "user",
  match: ["/operations"],
  autoStart: false,
  launchHint: "Entrá a Operaciones y tocá Nueva Operación",
  steps: [
    {
      id: "intro",
      title: "Antes de empezar",
      body: "Vas a cargar la venta: quién compró, qué viaje, a qué operador se lo comprás y por cuánta plata. Lleva un par de minutos.",
      details: [
        "Tres cosas que NO se cargan acá, para que no las busques: los nombres de los pasajeros, el itinerario con vuelos y hoteles, y la seña. Todo eso va después, en el detalle de la operación.",
        "Podés guardar con lo mínimo y completar el resto más tarde. Lo que sí conviene dejar bien de entrada son los montos y las monedas.",
      ],
    },
    {
      id: "agencia",
      target: "op-new.agencia",
      title: "Agencia",
      body: "Empezá por acá. De la agencia depende qué campos te va a exigir el sistema al guardar, porque cada una tiene su propia configuración.",
      // Este es el paso que abre el formulario. Sin esto la guía arranca con el
      // diálogo cerrado, no encuentra ninguna de sus anclas y se saltea entera.
      // El diálogo es lazy y dispara dos fetch al abrir, así que el ancla puede
      // tardar; el motor espera hasta 10s antes de darla por perdida.
      prepare: { click: "operations.new-button", settleMs: 300 },
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "vendedor-principal",
      target: "op-new.vendedor-principal",
      title: "Vendedor principal",
      body: "Es el dueño de la venta: a él se le imputa la operación y la comisión.",
      details: [
        "Si el campo está gris es porque tu usuario solo puede cargar operaciones a nombre propio. Es un permiso que se habilita en Configuración → Usuarios.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "vendedor-secundario",
      target: "op-new.vendedor-secundario",
      title: "Vendedor secundario (opcional)",
      body: "Solo si la venta se comparte con otro vendedor. Dejalo vacío si la venta es de una sola persona.",
      details: [
        "El secundario NO es “el que ayudó”: es alguien que se lleva parte de la comisión. Si no cobra, no lo pongas.",
        "Ojo con el tope: entre los dos no pueden superar el porcentaje más alto de ambos, no la suma. Poner un secundario le recorta la comisión al principal.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "comision-split",
      target: "op-new.vendedor-secundario",
      tone: "warning",
      title: "Los porcentajes: mejor no tocarlos",
      body: "Al elegir un secundario aparecen dos campos de porcentaje ya calculados. Si los dejás como vienen, el sistema reparte solo según el perfil de cada vendedor.",
      details: [
        "En cuanto tocás uno, la operación queda en reparto manual para siempre y deja de actualizarse sola si mañana cambia el porcentaje de alguno.",
        "Si un vendedor no tiene porcentaje cargado en Configuración → Usuarios, el guardado va a fallar con su nombre en el mensaje.",
        "Además, solo un admin o contable puede editarlos: a un vendedor le aparecen grises.",
      ],
      placement: "bottom",
      align: "start",
      onMissing: "skip",
    },
    {
      id: "cliente",
      target: "op-new.cliente",
      title: "Pasajero principal",
      body: "Es el titular: una sola persona, la que contrata y paga. Justo abajo podés sumar los acompañantes que viajan con él.",
      details: [
        "Escribí dos letras y esperá; busca en toda tu cartera. Si el cliente no existe todavía, crealo con el botón + y queda seleccionado solo.",
        "Los acompañantes se habilitan recién cuando elegiste el titular. Si preferís, podés sumarlos más tarde desde el detalle de la operación.",
        "El campo arranca deshabilitado un segundo mientras carga la lista. Es normal.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "multi-operador",
      target: "op-new.multi-operador",
      tone: "warning",
      title: "“Múltiples operadores” no es “varios tramos”",
      body: "Marcalo solo si esta venta se la comprás a más de un mayorista: el aéreo a uno y el hotel a otro, por ejemplo. Cada línea es un costo, no un tramo del viaje.",
      details: [
        "Si el viaje tiene ida y vuelta pero se lo comprás a un solo operador, NO lo marques. El itinerario se carga después, en el detalle.",
        "Al marcarlo desaparecen los campos Operador, Tipo y Costo de Operador, y en su lugar cargás una lista.",
        "Y acá está la trampa: aunque el campo Tipo desaparezca de la pantalla, la operación se guarda igual como “Paquete”. Si necesitás que quede como Vuelo o Crucero, elegí el Tipo ANTES de marcar el checkbox.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "operador",
      target: "op-new.operador",
      title: "Operador",
      body: "El mayorista al que le comprás el viaje: Ola, Julià, Despegar. No es la aerolínea ni el hotel — eso va más abajo, en Códigos de reserva.",
      details: [
        "Si el operador no está en la lista, lo creás con el botón + sin salir de acá.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "tipo",
      target: "op-new.tipo",
      title: "Tipo de operación",
      body: "Qué le vendiste: paquete, vuelo, hotel, crucero, asistencia. Sirve para filtrar y para los reportes.",
      details: [
        "Si elegís Asistencia al Viajero, los campos de fecha cambian de nombre a “Inicio” y “Fin de Cobertura”.",
        "Evitá los tipos personalizados que haya creado tu agencia: hoy el guardado los rechaza con un error en inglés. Está reportado.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "ruta",
      target: "op-new.ruta",
      title: "Origen y destino",
      body: "Escribí la ciudad y elegila de la lista. Necesita al menos dos letras.",
      details: [
        "No estás obligado a elegir un aeropuerto: la primera opción siempre es usar tal cual lo que escribiste.",
        "El origen viene con “Buenos Aires” por defecto; cambialo si sale de otro lado.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "fecha-venta",
      target: "op-new.fecha-venta",
      title: "Fecha de venta",
      body: "Cuándo cerraste la venta, no cuándo viaja el pasajero. Si la dejás vacía se usa hoy.",
      details: [
        "No puede ser futura. Sirve para cargar ventas de días o meses anteriores.",
        "Es la fecha por la que después vas a filtrar el listado con la opción “Fecha de Venta”.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "fechas-viaje",
      target: "op-new.fechas-viaje",
      title: "Salida y regreso",
      body: "Cuándo viaja el pasajero. La salida no puede ser anterior a la fecha de venta, y el regreso no puede ser anterior a la salida.",
      details: [
        "Cargalas en orden —salida primero, regreso después— porque el calendario del regreso se limita con la salida.",
        "Estas son las fechas que usa el listado en el filtro “Viaje desde/hasta”, y las que disparan las alertas de viaje próximo.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
    },
    {
      id: "pago-limite",
      target: "op-new.pago-limite",
      title: "Fecha máxima de pago",
      body: "Hasta cuándo tiene el pasajero para terminar de pagar. Suele ser alrededor de un mes antes de la salida.",
      details: [
        "Sale impresa en el PDF de detalle que le mandás al cliente, así que conviene ponerla.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "pasajeros",
      target: "op-new.pasajeros",
      title: "Pasajeros: solo cuántos",
      body: "Acá van las cantidades: dos adultos, un niño. Los nombres salen de quienes cargaste arriba como titular y acompañantes.",
      details: [
        "Son dos cosas independientes: nadie valida que las cantidades coincidan con las personas cargadas. Si no coinciden, el PDF que recibe el pasajero va a decir una cosa en las cantidades y listar otra en los nombres.",
        "Los documentos y pasaportes se completan después, en el detalle de la operación.",
        "Tiene que haber al menos un adulto.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
    },
    {
      id: "monedas",
      target: "op-new.monedas",
      tone: "warning",
      title: "Monedas: el orden importa",
      body: "Podés vender en una moneda y comprarle al operador en otra. Pero elegí primero la Moneda Venta y después la Moneda Costo, nunca al revés.",
      details: [
        "Tocar Moneda Venta pisa automáticamente la Moneda Costo. Si las cargás al revés, perdés lo que pusiste.",
        "La tercera, “Moneda (Compatibilidad)”, es un campo viejo que pisa las otras dos. No la toques.",
        "Si el monto y la moneda no pegan (por ejemplo 3.500 en pesos), antes de guardar te va a saltar un aviso preguntando si no debería ser la otra moneda. Leelo, no lo pases de largo.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
    },
    {
      id: "montos",
      target: "op-new.montos",
      title: "Venta y costo",
      body: "Monto de Venta es lo que le cobrás al pasajero. Costo de Operador es lo que vos le pagás al mayorista. La diferencia es tu ganancia, y se calcula sola.",
      details: [
        "El error más común de quien arranca: poner el neto del operador en “Monto de Venta”. La operación queda con ganancia cero y sin comisión para el vendedor.",
        "Con múltiples operadores el costo no se escribe: se suma solo y aparece en gris.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
    },
    {
      id: "codigos",
      target: "op-new.codigos",
      title: "Códigos de reserva",
      body: "Los localizadores que te dio el operador, más la aerolínea y el hotel. Todo opcional, pero es lo que después buscás cuando el pasajero llama.",
      details: [
        "Los dos campos se llaman igual, “Código de Reserva”: el de la tarjeta de la izquierda es el aéreo y el de la derecha el del hotel.",
        "Las dos tarjetas aparecen siempre, aunque la operación sea solo de hotel. Llená la que corresponda.",
      ],
      placement: "top",
      align: "start",
      interactive: true,
      onMissing: "skip",
    },
    {
      id: "guardar",
      target: "op-new.guardar",
      tone: "warning",
      title: "Crear la operación",
      body: "Al guardar se crea la operación y ya podés entrar a cargarle pasajeros, servicios y cobros.",
      details: [
        "Si tocás el botón y no pasa absolutamente nada, sin mensaje ni error: es una validación que falló sobre un campo que está oculto. Revisá el checkbox de múltiples operadores y el campo Tipo, que son los que se esconden.",
        "Si el error aparece en rojo arriba de todo, el formulario se corre hacia abajo; subí a leerlo.",
        "“Cancelar” cierra sin avisar y perdés lo cargado. La X de arriba sí te pregunta antes.",
      ],
      placement: "top",
      align: "end",
      interactive: true,
    },
  ],
}
