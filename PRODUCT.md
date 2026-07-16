# Product

## Register

product

## Users

Vibook lo usan dueños, administradores, vendedores, contables y equipos de postventa de agencias de viajes. Trabajan durante toda la jornada con información operacional, comercial y financiera, normalmente desde desktop y con cambios frecuentes de contexto entre agencias, clientes y operaciones.

El trabajo principal es resolver tareas con rapidez y confianza: vender, cotizar, operar viajes, cobrar, pagar, controlar márgenes y mantener la información de cada tenant correctamente aislada.

## Product Purpose

Vibook es el sistema operativo SaaS de una agencia de viajes. Reúne CRM, operaciones, pagos, contabilidad, documentos, automatizaciones e inteligencia artificial en un flujo coherente y multi-tenant.

El producto debe reducir trabajo manual y tiempos de respuesta sin ocultar el estado real de una operación ni sacrificar control financiero, permisos o trazabilidad. El éxito se reconoce cuando la interfaz desaparece dentro del trabajo y el usuario puede completar una tarea crítica sin dudas, recargas manuales ni navegación innecesaria.

## Brand Personality

Clara, confiable y resolutiva.

La voz es directa y profesional, cercana al español de equipos de agencias en Argentina. Evita tecnicismos internos, exageraciones de marketing y explicaciones que repiten lo que ya muestra la interfaz.

## Anti-references

- Dashboards de marketing cargados de gradientes, métricas decorativas y tarjetas idénticas.
- Interfaces que parecen demos de inteligencia artificial y no herramientas operacionales.
- Formularios largos sin agrupación, contexto de agencia o feedback de guardado.
- Acciones críticas escondidas, permisos resueltos solo ocultando botones o estados que requieren refrescar la página.
- Estética lúdica que reduzca la percepción de control sobre datos comerciales y financieros.

## Design Principles

1. Contexto antes que acción. El usuario siempre debe saber en qué organización, agencia y entidad está trabajando.
2. Densidad con jerarquía. Mostrar la información necesaria para decidir rápido, con estructura clara y sin decoración que compita con la tarea.
3. Familiaridad ganada. Reutilizar patrones y componentes del producto para que cada módulo nuevo se sienta parte de Vibook.
4. Estado explícito. Loading, vacío, error, guardado y acceso denegado deben ser visibles y recuperables sin requerir F5.
5. Confianza por diseño. Permisos, tenant scope e invariantes se protegen en servidor y base de datos, mientras la UI explica el resultado en lenguaje simple.

## Accessibility & Inclusion

Objetivo mínimo WCAG 2.1 AA en las superficies nuevas. Todos los flujos deben funcionar con teclado, foco visible, labels asociados, mensajes de error comprensibles y contraste suficiente en light y dark mode. El color nunca es el único indicador de estado. Se respeta `prefers-reduced-motion` y no se agrega movimiento decorativo.
