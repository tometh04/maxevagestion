// Guía de configuración inicial de la agencia.
//
// Migración del onboarding viejo (lib/onboarding/steps.ts). Los títulos y
// descripciones se conservan casi textuales para no regresionar el copy.
//
// Es la única guía con scope "org": los cuatro pasos son hechos de la agencia,
// no de la persona. Si un admin ya cargó los datos de empresa, el siguiente no
// tiene que rehacerlo. `completesSetupKey` es lo que alimenta el checklist del
// dashboard.
//
// Ojo con los tabs: SettingsPageClient usa <Tabs defaultValue>, o sea que
// navegar a /settings?tab=afip NO cambia el tab si el componente ya está
// montado. Por eso cada paso clickea su TabsTrigger en el prepare.

import type { TourDefinition } from "../types"

export const setupCuentaTour: TourDefinition = {
  id: "setup-cuenta",
  title: "Configuración inicial",
  scope: "org",
  match: ["/settings"],
  autoStart: true,
  requireRoles: ["SUPER_ADMIN", "ORG_OWNER", "ADMIN"],
  steps: [
    {
      id: "bienvenida",
      title: "Bienvenido a Vibook",
      body: "Te guiamos paso a paso para dejar tu agencia lista para operar: datos de la empresa, tu equipo, una cuenta financiera y la facturación electrónica. Son unos minutos.",
      route: "/settings",
    },
    {
      id: "empresa",
      target: "settings.company-form",
      title: "Completar datos de empresa",
      // Sin mencionar el logo: la carga del logo está más abajo en la pantalla
      // y tiene su propio paso. Nombrarlo acá mandaba a buscarlo en un
      // formulario donde no está.
      body: "Cargá razón social, CUIT, dirección y datos de contacto. Esta info aparece en facturas y presupuestos. Completá los campos y hacé click en Guardar Datos.",
      details: [
        "Estos datos van al encabezado de todos los documentos que genera el sistema: facturas, cotizaciones, recibos, itinerarios y reportes.",
        "El CUIT de acá es solo el que se imprime en los documentos. El que usa la facturación electrónica se configura aparte, en el tab de AFIP.",
        "“Legajo” es tu número de licencia de agencia de viajes, y sale impreso en las cotizaciones y los recibos.",
        "Se guardan a nivel organización: los ve y los usa todo el equipo, no solo vos.",
      ],
      // Abajo y no al costado: el formulario ocupa todo el ancho, así que a la
      // derecha o a la izquierda la tarjeta se sale de la pantalla.
      placement: "bottom",
      align: "start",
      interactive: true,
      route: "/settings",
      prepare: { click: "settings.tab-interface", settleMs: 120 },
      completesSetupKey: "empresa",
    },
    {
      id: "logo",
      target: "settings.company-logo",
      title: "Subir el logo",
      body: "Arrastrá tu logo o hacé click para elegirlo. Aparece en las facturas, los presupuestos y los comprobantes que le mandás al cliente. PNG o SVG con fondo transparente es lo que mejor queda.",
      details: [
        "Acepta PNG, SVG o WEBP de hasta 2 MB.",
        "La vista previa de acá tiene fondo oscuro, así que un logo con letras negras se va a ver mal en la previa aunque quede perfecto en los PDF. Mirá cómo sale en una cotización antes de cambiarlo.",
        "Más abajo, en esta misma pantalla, podés elegir el color principal de la aplicación. Se aplica solo, sin guardar, y lo ven todos los usuarios.",
      ],
      placement: "left",
      align: "start",
      interactive: true,
      route: "/settings",
      prepare: { click: "settings.tab-interface", settleMs: 120 },
    },
    {
      id: "usuarios",
      target: "settings.invite-user-button",
      title: "Invitar a tu equipo",
      body: "Sumá vendedores, contadores o administradores. Cada rol ve solo lo que le corresponde. Usá el botón Invitar Usuario.",
      details: [
        "Un Vendedor ve sus operaciones y sus comisiones; un Contable ve caja y contabilidad pero no leads; Post-venta ve todas las operaciones de la agencia para cargar vouchers y documentos, sin acceso a la plata.",
        "El “Asesor independiente” es un vendedor freelance: carga y gestiona solo sus propias ventas y no accede al CRM ni a la cartera de la agencia. Es el único rol que no admite roles adicionales.",
        "Las agencias que le asignes definen todo lo que va a ver. Hay que elegir al menos una.",
        "El porcentaje de comisión que cargues es el que se propone por defecto para sus ventas; se puede ajustar después por operación.",
        "El usuario recibe un mail para crear su contraseña. Hasta que lo haga aparece como “Email pendiente”, y podés reenviarle la invitación desde el menú de su fila.",
      ],
      placement: "bottom",
      align: "end",
      interactive: true,
      route: "/settings",
      prepare: { click: "settings.tab-users", settleMs: 120 },
      completesSetupKey: "usuarios",
    },
    {
      id: "cuenta",
      target: "accounts.new-button",
      title: "Crear una cuenta financiera",
      body: "Necesitás al menos una cuenta (caja, banco, billetera) para registrar cobros y pagos. Usá el botón Nueva Cuenta.",
      details: [
        "El tipo de cuenta define la moneda. Para la primera lo habitual es “Caja efectivo ARS” —la caja física del mostrador— o la caja de ahorro del banco.",
        "La cuenta pertenece a una agencia, no a la organización: si tenés varias sucursales, cada una necesita las suyas.",
        "Poné un nombre que diga banco y moneda (“Banco Galicia USD”): es lo que va a ver todo el equipo al registrar un cobro.",
        "El saldo inicial podés dejarlo en 0 y ajustarlo después. El ajuste genera un asiento contable con el motivo que escribas, no pisa el número en silencio.",
      ],
      placement: "bottom",
      align: "end",
      interactive: true,
      route: "/accounting/financial-accounts",
      completesSetupKey: "cuenta",
    },
    {
      id: "afip",
      target: "settings.afip-panel",
      tone: "warning",
      title: "Conectar AFIP",
      body: "Habilitá la facturación electrónica para emitir facturas A, B y C. Es opcional para arrancar: sin AFIP podés cargar ventas, cobrar y cotizar; lo único que no vas a poder es emitir facturas.",
      details: [
        "Se configura por agencia, no por organización. Si tenés varias sucursales, cada una necesita su propio certificado.",
        "El punto de venta tiene que estar habilitado en AFIP para Web Services. Un punto de venta común no sirve, y es el error más frecuente.",
        "Revisá el entorno antes de emitir: en Sandbox las facturas son de prueba y no tienen validez fiscal, y está en el mismo selector que Producción.",
        "Si AFIP te rechaza diciendo que el CUIT es incorrecto, casi siempre el problema es la Clave Fiscal. Necesita Nivel 2 o superior y distingue mayúsculas de minúsculas.",
      ],
      placement: "bottom",
      align: "start",
      interactive: true,
      route: "/settings",
      prepare: { click: "settings.tab-afip", settleMs: 120 },
      completesSetupKey: "afip",
    },
  ],
}
