-- ============================================================
-- Knowledge Base — Expansión masiva de artículos
-- 3 categorías nuevas + ~50 artículos cubriendo TODO el sistema
-- ============================================================

-- ─── Nuevas categorías ───────────────────────────────────────

INSERT INTO kb_categories (id, name, slug, icon, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000009', 'Reportes y Estadísticas', 'reportes', 'BarChart3', 9),
  ('a0000000-0000-0000-0000-000000000010', 'Herramientas', 'herramientas', 'Settings', 10),
  ('a0000000-0000-0000-0000-000000000011', 'Primeros Pasos', 'primeros-pasos', 'BookOpen', 0);


-- ═════════════════════════════════════════════════════════════
-- PRIMEROS PASOS
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000011',
 'Primeros pasos en Vibook',
 'primeros-pasos',
 'Guía rápida para empezar a usar el sistema desde cero.',
 1,
 '## Primeros pasos en Vibook

Bienvenido a Vibook, tu sistema de gestión para agencias de viajes.

### Qué hacer primero

1. **Personalizá tu marca** — Andá a **Configuración > Organización** y subí el logo de tu agencia.
2. **Invitá a tu equipo** — En **Configuración > Usuarios**, invitá a los vendedores y administrativos.
3. **Configurá tus cuentas financieras** — En **Finanzas > Configuración**, creá tus cuentas de banco y caja.
4. **Conectá Trello** (opcional) — Si usás Trello para leads, configurá la integración en **Configuración > Integraciones**.
5. **Cargá tus operadores** — En **Operadores**, agregá los mayoristas con los que trabajás.
6. **Empezá a cargar operaciones** — Ya estás listo para gestionar viajes.

### Estructura del sistema

- **CRM Ventas**: gestión de consultas y leads.
- **Operaciones**: viajes vendidos con pagos, servicios, y documentos.
- **Clientes**: base de datos de pasajeros.
- **Finanzas**: caja, pagos, contabilidad.
- **Reportes**: análisis de ventas, márgenes, y más.

### Tip

Usá **Cmd+K** (o Ctrl+K en Windows) para buscar cualquier cosa rápidamente desde cualquier pantalla.
'),

('a0000000-0000-0000-0000-000000000011',
 'Entender el dashboard',
 'entender-dashboard',
 'Qué muestra el panel principal y cómo leer los indicadores.',
 2,
 '## Entender el dashboard

El dashboard es la pantalla principal que ves al entrar a Vibook.

### Indicadores principales (KPIs)

- **Ventas**: monto total vendido en el período seleccionado.
- **Margen**: diferencia entre ventas y costos de operador.
- **Deudores**: cuánto te deben los clientes en total.
- **Deuda a Operadores**: cuánto le debés a los proveedores.

### Filtros del dashboard

Arriba del todo podés filtrar por:
- **Rango de fechas**: seleccioná desde/hasta.
- **Agencia**: si tenés múltiples agencias.
- **Vendedor**: para ver los números de un vendedor específico.

### Secciones adicionales

- **Cumpleaños hoy**: clientes que cumplen años (para saludar).
- **Mis tareas pendientes**: tus tareas con fecha de vencimiento.
- **Alertas vencidas**: pagos pendientes y alertas que requieren atención.
- **Próximas salidas**: viajes que salen pronto.
- **Ventas por vendedor**: gráfico comparativo del equipo.
- **Top destinos**: destinos más vendidos.

### Personalizar KPIs

Hacé click en **Editar KPIs** arriba a la derecha para elegir qué indicadores mostrar.
'),

('a0000000-0000-0000-0000-000000000011',
 'Navegación y búsqueda global',
 'navegacion-busqueda',
 'Cómo moverte por el sistema y encontrar lo que buscás rápidamente.',
 3,
 '## Navegación y búsqueda global

### Menú lateral

El menú de la izquierda tiene todas las secciones del sistema:
- Resumen (dashboard)
- CRM Ventas
- Clientes
- Operaciones
- Finanzas
- Herramientas
- Cerebro (IA)
- Ayuda

Hacé click en cada sección para expandir las sub-opciones.

### Búsqueda global (Cmd+K)

Desde cualquier pantalla, presioná **Cmd+K** (Mac) o **Ctrl+K** (Windows):
1. Se abre un buscador instantáneo.
2. Escribí lo que buscás: nombre de cliente, número de file, operador.
3. Los resultados aparecen al instante.
4. Seleccioná con las flechas y presioná **Enter**.

### Modo oscuro

Hacé click en **Tema** en la parte inferior de la barra lateral para cambiar entre modo claro y oscuro.
');

-- ═════════════════════════════════════════════════════════════
-- OPERACIONES — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000001',
 'Facturación electrónica (AFIP)',
 'facturacion-electronica',
 'Cómo emitir facturas electrónicas desde una operación usando la integración con AFIP.',
 5,
 '## Facturación electrónica (AFIP)

Vibook puede emitir facturas electrónicas directamente a AFIP (Factura A, B o C).

### Requisitos previos

Antes de facturar necesitás:
1. Tener configurada la integración AFIP en **Configuración > Facturación AFIP**.
2. Tener un **Punto de Venta** habilitado en AFIP para Factura Electrónica.
3. El CUIT de tu agencia cargado en la configuración.

### Cómo emitir una factura

1. Abrí la operación.
2. Andá a la pestaña **Facturación**.
3. Hacé click en **Emitir factura**.
4. Completá:
   - **Tipo de comprobante**: Factura A, B, o C según el cliente.
   - **Datos del receptor**: CUIT/DNI del cliente.
   - **Concepto**: Servicios, Productos, o ambos.
   - **Monto**: se pre-llena con el monto de la operación.
5. Hacé click en **Autorizar en AFIP**.
6. Si todo está bien, AFIP devuelve el **CAE** (Código de Autorización Electrónico).

### Ver facturas emitidas

Las facturas emitidas aparecen en:
- La pestaña **Facturación** dentro de cada operación.
- **Operaciones > Facturación** para ver todas las facturas.

### Descargar PDF

Cada factura autorizada tiene un botón para **descargar el PDF** con el formato oficial.

### Problemas comunes

- **"CUIT no autorizado"**: Verificá que el Punto de Venta esté habilitado en AFIP.
- **"Error de conexión"**: AFIP puede tener intermitencias. Intentá de nuevo en unos minutos.
- **"Datos inválidos"**: Revisá que el CUIT del cliente sea correcto.
'),

('a0000000-0000-0000-0000-000000000001',
 'Gestionar pasajeros de una operación',
 'pasajeros-operacion',
 'Cómo agregar, editar y gestionar los pasajeros de un viaje.',
 6,
 '## Gestionar pasajeros de una operación

Una operación puede tener múltiples pasajeros (clientes que viajan).

### Agregar pasajeros

1. Abrí la operación.
2. Andá a la pestaña **Pasajeros** o **Clientes**.
3. Hacé click en **+ Agregar pasajero**.
4. Buscá el cliente por nombre o DNI.
5. Si no existe, podés crearlo desde ahí.

### Información por pasajero

- Nombre completo
- Documento (DNI/Pasaporte)
- Saldo individual (cuánto pagó vs cuánto debe)
- Documentos asociados (pasaporte, visa)

### Pasajero principal

El primer pasajero agregado es el "titular" de la operación. Es el que aparece en los listados y reportes.

### Requerimientos de destino

Si el destino tiene requisitos especiales (visa, vacunas, seguro), el sistema muestra alertas en la pestaña **Requerimientos** para cada pasajero.
'),

('a0000000-0000-0000-0000-000000000001',
 'Armar el itinerario de un viaje',
 'itinerario-viaje',
 'Cómo crear el itinerario día por día para una operación.',
 7,
 '## Armar el itinerario de un viaje

El itinerario es el detalle día por día del viaje del pasajero.

### Pasos

1. Abrí la operación.
2. Andá a la pestaña **Itinerario**.
3. Hacé click en **+ Agregar día**.
4. Para cada día completá:
   - **Fecha**
   - **Título** (ej: "Llegada a Cancún")
   - **Descripción** de actividades
   - **Imagen** (opcional): podés subir fotos del destino
5. Repetí para cada día del viaje.

### Generar PDF del itinerario

Una vez armado, podés generar un **PDF del itinerario** para enviarle al cliente. Hacé click en **Descargar PDF** en la pestaña de itinerario.

### Tip

El itinerario es un diferencial para el cliente. Un itinerario bien armado con fotos da una imagen profesional de tu agencia.
'),

('a0000000-0000-0000-0000-000000000001',
 'Estadísticas de operaciones',
 'estadisticas-operaciones',
 'Cómo ver métricas y análisis del rendimiento de las operaciones.',
 8,
 '## Estadísticas de operaciones

### Acceder

Andá a **Operaciones > Estadísticas** en el menú lateral.

### Métricas disponibles

- **Total de operaciones** por período
- **Operaciones por estado** (pendientes, confirmadas, cerradas, canceladas)
- **Ventas totales** en USD y ARS
- **Margen promedio** por operación
- **Top destinos** más vendidos
- **Rendimiento por vendedor**
- **Costos de operador** acumulados

### Filtros

Podés filtrar por:
- Rango de fechas
- Vendedor
- Agencia
- Estado de la operación
');

-- ═════════════════════════════════════════════════════════════
-- CRM Y VENTAS — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000004',
 'Crear y enviar cotizaciones',
 'cotizaciones',
 'Cómo armar una cotización de viaje y enviársela al cliente.',
 3,
 '## Crear y enviar cotizaciones

Las cotizaciones te permiten armar una propuesta de viaje con precios para enviarle al cliente.

### Crear una cotización

1. Andá a **CRM Ventas > Cotizaciones** (o desde un lead, hacé click en **Cotizar**).
2. Hacé click en **+ Nueva cotización**.
3. Completá:
   - **Cliente**: a quién va dirigida.
   - **Destino y fechas**.
   - **Servicios incluidos**: vuelos, hotel, traslados, etc.
   - **Precio por pasajero**: adultos, menores, infantes.
   - **Moneda**: ARS o USD.
   - **Notas** para el cliente.
4. Guardá como **borrador** o directamente **enviá**.

### Enviar al cliente

1. Desde la cotización, hacé click en **Enviar**.
2. Se genera un **link público** que el cliente puede abrir sin loguearse.
3. El cliente ve la cotización con tu logo y branding.
4. También podés **descargar el PDF** y enviarlo por WhatsApp o email.

### Estados de una cotización

| Estado | Significado |
|--------|-------------|
| **Borrador** | En preparación, no enviada |
| **Enviada** | El cliente ya la recibió |
| **Aprobada** | El cliente aceptó |
| **Rechazada** | El cliente no la quiso |
| **Vencida** | Pasó la fecha de validez |

### Convertir cotización en operación

Cuando el cliente aprueba, hacé click en **Convertir a operación**. Los datos se transfieren automáticamente.
'),

('a0000000-0000-0000-0000-000000000004',
 'Estadísticas de ventas',
 'estadisticas-ventas',
 'Cómo ver métricas del equipo de ventas y rendimiento comercial.',
 4,
 '## Estadísticas de ventas

### Acceder

Andá a **CRM Ventas > Estadísticas**.

### Métricas disponibles

- **Leads totales** por período y por fuente (Instagram, WhatsApp, Meta Ads, etc.)
- **Tasa de conversión**: cuántos leads se convirtieron en operaciones.
- **Cotizaciones**: cantidad, tasa de aprobación, monto promedio.
- **Rendimiento por vendedor**: leads asignados, cotizaciones enviadas, operaciones cerradas.
- **Destinos más cotizados**.
- **Tendencias mensuales**.

### Filtros

- Rango de fechas
- Vendedor específico
- Agencia
'),

('a0000000-0000-0000-0000-000000000004',
 'Leads desde ManyChat e Instagram',
 'leads-manychat',
 'Cómo funcionan los leads automáticos desde ManyChat e Instagram.',
 5,
 '## Leads desde ManyChat e Instagram

Vibook puede recibir leads automáticamente desde ManyChat (chatbot de Instagram/Facebook).

### Cómo funciona

1. Un potencial cliente escribe por Instagram o Facebook.
2. ManyChat lo procesa y envía los datos a Vibook via webhook.
3. Se crea automáticamente un lead en tu CRM con:
   - Nombre del contacto
   - Teléfono e Instagram
   - Destino de interés (si lo proporcionó)
   - Fuente: "ManyChat"

### Configurar la integración

1. Andá a **Configuración > Integraciones**.
2. Buscá la integración **ManyChat**.
3. Copiá la URL del webhook que Vibook genera.
4. En ManyChat, configurá una acción que envíe datos a esa URL cuando un lead califica.

### Ver los leads

Los leads de ManyChat aparecen en **CRM Ventas** con el ícono de Instagram/ManyChat. Se gestionan igual que cualquier otro lead.
');

-- ═════════════════════════════════════════════════════════════
-- CLIENTES — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000003',
 'Ver el estado de cuenta de un cliente',
 'estado-cuenta-cliente',
 'Cómo consultar cuánto debe un cliente y su historial de pagos.',
 4,
 '## Ver el estado de cuenta de un cliente

### Pasos

1. Andá a **Clientes** y buscá al cliente.
2. Hacé click en el cliente para abrir su ficha.
3. En la sección **Pagos** o **Cuenta** vas a ver:
   - **Total facturado**: suma de todas sus operaciones.
   - **Total pagado**: suma de todos sus pagos.
   - **Saldo pendiente**: lo que todavía debe.
   - **Detalle por operación**: deuda desglosada por viaje.

### Enviar estado de cuenta

Podés enviarle al cliente un resumen de su cuenta por email:
1. En la ficha del cliente, buscá el botón **Enviar estado de cuenta**.
2. Se envía un email con el detalle de operaciones, pagos, y saldo.

### Desde el dashboard

Los clientes con deuda aparecen en el KPI **Deudores** del dashboard.
'),

('a0000000-0000-0000-0000-000000000003',
 'Estadísticas de clientes',
 'estadisticas-clientes',
 'Métricas sobre tu base de clientes: cantidad, recurrencia, y más.',
 5,
 '## Estadísticas de clientes

### Acceder

Andá a **Clientes > Estadísticas**.

### Métricas disponibles

- **Total de clientes** registrados
- **Clientes nuevos** en el período
- **Clientes recurrentes**: los que viajaron más de una vez
- **Destinos favoritos** por cliente
- **Segmentación por fuente** (cómo llegaron)

### Uso práctico

Estas estadísticas te ayudan a:
- Identificar clientes VIP (los que más viajan)
- Detectar tendencias de destinos
- Medir el crecimiento de tu cartera
');

-- ═════════════════════════════════════════════════════════════
-- PAGOS — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000002',
 'Aprobar pagos pendientes',
 'aprobar-pagos',
 'Cómo gestionar pagos que requieren aprobación antes de procesarse.',
 4,
 '## Aprobar pagos pendientes

Algunos pagos requieren aprobación de un admin antes de registrarse.

### Ver pagos pendientes

1. Andá a **Finanzas > Aprobaciones**.
2. Vas a ver la lista de pagos esperando aprobación.
3. Cada pago muestra: monto, tipo, operación vinculada, y quién lo cargó.

### Aprobar o rechazar

- Hacé click en **Aprobar** para confirmar el pago. Se genera el movimiento de caja y asiento contable.
- Hacé click en **Rechazar** si el pago no corresponde. Se notifica al usuario que lo cargó.

### Pagos de operador

Los pagos a operadores también pueden requerir aprobación. Se gestionan de la misma forma.
'),

('a0000000-0000-0000-0000-000000000002',
 'Cupones de pago',
 'cupones-pago',
 'Cómo generar cupones de pago para que los clientes paguen en cuotas.',
 5,
 '## Cupones de pago

Podés generar un plan de pagos con cupones para que el cliente pague en cuotas.

### Generar cupones

1. Abrí la operación.
2. En la pestaña **Pagos**, hacé click en **Generar plan de pagos**.
3. Definí:
   - **Cantidad de cuotas**
   - **Monto de cada cuota**
   - **Fechas de vencimiento**
4. Se crean automáticamente los cupones de pago.

### Marcar como pagado

Cuando el cliente paga una cuota, buscá el cupón y marcalo como **Pagado**. Se genera automáticamente el movimiento de caja.

### Seguimiento

Los cupones vencidos aparecen como alertas para que hagas seguimiento con el cliente.
');

-- ═════════════════════════════════════════════════════════════
-- FINANZAS — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000005',
 'Gestionar gastos',
 'gestionar-gastos',
 'Cómo registrar y categorizar los gastos operativos de la agencia.',
 4,
 '## Gestionar gastos

### Acceder

Andá a **Finanzas > Gastos** (o **Gastos** en el menú si está habilitado).

### Tipos de gastos

- **Gastos fijos**: alquiler, sueldos, servicios mensuales.
- **Gastos variables**: comisiones, publicidad, gastos puntuales.
- **Tarjeta de crédito**: pagos con tarjeta que se liquidan después.

### Registrar un gasto

1. Hacé click en **+ Nuevo gasto**.
2. Completá:
   - **Categoría**: alquiler, servicios, marketing, sueldos, etc.
   - **Monto y moneda**
   - **Fecha**
   - **Descripción**
   - **Comprobante** (opcional): subí la foto del ticket.
3. Guardá.

### Ver gastos del mes

La vista principal muestra los gastos del mes actual agrupados por categoría, con totales y comparación con meses anteriores.
'),

('a0000000-0000-0000-0000-000000000005',
 'Pagos recurrentes',
 'pagos-recurrentes',
 'Cómo configurar pagos que se repiten automáticamente (alquiler, servicios, etc.).',
 5,
 '## Pagos recurrentes

Para gastos que se repiten todos los meses (alquiler, sueldos, servicios), podés configurar pagos recurrentes.

### Configurar

1. Andá a **Finanzas > Contabilidad** y buscá la pestaña **Pagos recurrentes**.
2. Hacé click en **+ Nuevo pago recurrente**.
3. Completá:
   - **Proveedor/Concepto**: a quién o por qué.
   - **Monto y moneda**.
   - **Frecuencia**: semanal, quincenal, mensual, trimestral, anual.
   - **Fecha de inicio**.
   - **Fecha de fin** (opcional).
   - **Categoría**: alquiler, servicios, sueldos, etc.
4. Guardá.

### Cómo funciona

- El sistema genera automáticamente el movimiento de caja en cada período.
- Podés ejecutar un pago manualmente con el botón **Ejecutar ahora**.
- Los pagos recurrentes aparecen en tu libro mayor automáticamente.
'),

('a0000000-0000-0000-0000-000000000005',
 'Exportar movimientos de caja',
 'exportar-movimientos',
 'Cómo descargar los movimientos de caja a Excel.',
 6,
 '## Exportar movimientos de caja

### Pasos

1. Andá a **Finanzas > Caja y Bancos**.
2. Aplicá los filtros que necesites (cuenta, fechas, tipo).
3. Hacé click en el botón de **Descargar** o **Exportar** (ícono de descarga).
4. Se descarga un archivo Excel con todos los movimientos filtrados.

### Qué incluye el export

- Fecha del movimiento
- Tipo (ingreso/egreso)
- Monto y moneda
- Categoría
- Concepto/descripción
- Cuenta financiera
- Operación vinculada (si aplica)

### Uso

Es útil para enviarle al contador, hacer conciliaciones bancarias, o armar reportes personalizados.
'),

('a0000000-0000-0000-0000-000000000005',
 'Transferencias entre cuentas',
 'transferencias-cuentas',
 'Cómo registrar una transferencia de dinero entre cuentas financieras.',
 7,
 '## Transferencias entre cuentas

Cuando movés dinero de una cuenta a otra (ej: de caja a banco, o de cuenta ARS a cuenta USD).

### Pasos

1. Andá a **Finanzas > Caja y Bancos**.
2. Hacé click en **Transferir** o creá dos movimientos:
   - Un **egreso** de la cuenta origen.
   - Un **ingreso** en la cuenta destino.
3. Usá el mismo monto y fecha para ambos.

### Importante

- Si la transferencia es entre monedas distintas (ARS → USD), registrá el tipo de cambio usado.
- El sistema mantiene los saldos de cada cuenta sincronizados.
');

-- ═════════════════════════════════════════════════════════════
-- CONTABILIDAD — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000006',
 'Plan de cuentas',
 'plan-de-cuentas',
 'Cómo ver y gestionar el plan de cuentas contable del sistema.',
 3,
 '## Plan de cuentas

El plan de cuentas es la estructura contable de tu agencia.

### Ver el plan de cuentas

1. Andá a **Finanzas > Contabilidad**.
2. Buscá la pestaña **Cuentas financieras** o **Plan de cuentas**.
3. Vas a ver un árbol con las cuentas organizadas por tipo:
   - **Activo**: bancos, caja, cuentas a cobrar.
   - **Pasivo**: deudas con operadores, obligaciones.
   - **Patrimonio**: capital, resultados.
   - **Ingresos**: ventas, comisiones cobradas.
   - **Egresos**: costos, gastos operativos.

### Crear una cuenta contable

1. Hacé click en **+ Nueva cuenta**.
2. Completá:
   - **Nombre**: descriptivo (ej: "Banco Galicia CTA CTE").
   - **Tipo**: Activo, Pasivo, Patrimonio, Ingreso, Egreso.
   - **Moneda**: ARS o USD.
   - **Saldo inicial** (opcional).
3. Guardá.

### Importante

- Las cuentas se usan automáticamente cuando registrás pagos y movimientos de caja.
- No elimines cuentas que ya tienen movimientos — desactivalas.
'),

('a0000000-0000-0000-0000-000000000006',
 'Asientos contables manuales',
 'asientos-manuales',
 'Cómo crear asientos contables manualmente para ajustes.',
 4,
 '## Asientos contables manuales

La mayoría de los asientos se crean automáticamente. Pero a veces necesitás hacer ajustes manuales.

### Cuándo hacer un asiento manual

- Ajustes de apertura.
- Correcciones contables.
- Reclasificaciones de cuentas.
- Ajustes por diferencia de cambio.

### Cómo crearlo

1. Andá a **Finanzas > Contabilidad > Asientos**.
2. Hacé click en **+ Nuevo asiento**.
3. Completá:
   - **Fecha** del asiento.
   - **Descripción/Concepto**.
   - **Cuenta al debe** y monto.
   - **Cuenta al haber** y monto (debe ser igual al debe).
4. Guardá.

### Regla de oro

Siempre debe haber un **débito y un crédito** por el mismo monto. El sistema no te deja guardar si no balancea.
'),

('a0000000-0000-0000-0000-000000000006',
 'IVA Posición mensual',
 'iva-posicion',
 'Cómo ver la posición de IVA del mes: débito fiscal, crédito fiscal, y saldo.',
 5,
 '## IVA Posición mensual

### Acceder

Andá a **Finanzas > Impuestos** y seleccioná la pestaña **IVA Posición**.

### Qué muestra

- **Débito Fiscal**: IVA de las ventas (lo que cobraste de IVA a clientes).
- **Crédito Fiscal**: IVA de las compras (lo que pagaste de IVA a proveedores).
- **Percepciones**: IVA que te retuvieron.
- **Saldo**: si es positivo, debés pagar a AFIP. Si es negativo, tenés saldo a favor.

### Cálculo de IVA por tipo de servicio

| Tipo de servicio | Alícuota IVA |
|-----------------|-------------|
| Intermediación (Outgoing) | 21% |
| Paquete Nacional | 10.5% |
| Turismo Receptivo | 0% (exento) |

### Período

Seleccioná el mes y año para ver la posición de ese período.
'),

('a0000000-0000-0000-0000-000000000006',
 'Retenciones y percepciones',
 'retenciones-percepciones',
 'Cómo registrar retenciones y percepciones impositivas.',
 6,
 '## Retenciones y percepciones

### Qué son

- **Percepción**: impuesto que te cobran a vos cuando comprás (lo sumás como crédito fiscal).
- **Retención**: impuesto que te descuentan cuando te pagan (también es crédito fiscal).

### Registrar una retención/percepción

1. Andá a **Finanzas > Impuestos > Retenciones**.
2. Hacé click en **+ Nueva retención**.
3. Completá:
   - **Tipo**: Percepción IVA, Percepción IIBB, Retención Ganancias, Retención IVA, etc.
   - **Dirección**: Sufrida (a tu favor) o Practicada (que vos retuviste).
   - **CUIT de la contraparte**.
   - **Monto**.
   - **Fecha**.
4. Guardá.

### Dónde impactan

Las retenciones y percepciones sufridas se descuentan del IVA o IIBB a pagar. Las ves reflejadas en la posición mensual de cada impuesto.
'),

('a0000000-0000-0000-0000-000000000006',
 'IIBB (Ingresos Brutos)',
 'iibb',
 'Cómo ver y calcular el impuesto de Ingresos Brutos.',
 7,
 '## IIBB (Ingresos Brutos)

### Acceder

Andá a **Finanzas > Impuestos > IIBB**.

### Qué muestra

- **Base Imponible**: total facturado en ARS del período.
- **IIBB Bruto**: base × alícuota de tu jurisdicción.
- **Créditos a favor**: percepciones y retenciones sufridas.
- **IIBB Neto a pagar**: bruto menos créditos.

### Jurisdicciones soportadas

Santa Fe, Buenos Aires, CABA, Córdoba, Mendoza, Tucumán, Entre Ríos. Cada una tiene su alícuota.

### Seleccioná tu jurisdicción

Elegí la jurisdicción de tu agencia para que el cálculo use la alícuota correcta.
'),

('a0000000-0000-0000-0000-000000000006',
 'Deudores por ventas',
 'deudores-ventas',
 'Cómo ver cuánto te deben los clientes en total y por operación.',
 8,
 '## Deudores por ventas

### Acceder

Andá a **Finanzas > Contabilidad > Deudores por ventas**.

### Qué muestra

Lista de todas las operaciones con saldo pendiente de cobro:
- **Código de operación** y destino.
- **Cliente(s)**.
- **Monto total de venta**.
- **Monto cobrado**.
- **Saldo pendiente**.
- **Antigüedad** de la deuda (días).

### Filtros

- Por vendedor: para ver las deudas de los clientes de cada vendedor.
- Por moneda: ARS o USD.

### Exportar

Podés exportar el listado a CSV para análisis o para enviarle al equipo de cobranzas.
'),

('a0000000-0000-0000-0000-000000000006',
 'Posición mensual (Balance)',
 'posicion-mensual',
 'Cómo ver el balance general y estado de resultados del mes.',
 9,
 '## Posición mensual

### Acceder

Andá a **Finanzas > Contabilidad > Posición mensual**.

### Qué incluye

- **Balance General**: activos, pasivos, y patrimonio al cierre del mes.
- **Estado de Resultados**: ingresos menos gastos = resultado del período.
- Comparación con meses anteriores.
- Desglose por cuenta contable.

### Seleccionar período

Elegí el mes y año. El sistema calcula automáticamente los saldos de todas las cuentas al cierre de ese período.

### Uso

Ideal para revisión mensual con el contador, cierre contable, y análisis de rentabilidad.
'),

('a0000000-0000-0000-0000-000000000006',
 'Cuentas de socios',
 'cuentas-socios',
 'Cómo gestionar las cuentas de los socios y distribuir ganancias.',
 10,
 '## Cuentas de socios

Si la agencia tiene múltiples socios, podés gestionar sus cuentas y distribución de ganancias.

### Acceder

Andá a **Finanzas > Contabilidad > Cuentas de socios**.

### Funcionalidades

- **Ver saldos** de cada socio.
- **Registrar retiros**: cuando un socio saca dinero.
- **Distribuir ganancias**: repartir utilidades según los porcentajes acordados.

### Distribuir ganancias

1. Hacé click en **Distribuir ganancias**.
2. Ingresá el monto a distribuir.
3. El sistema calcula automáticamente la parte de cada socio.
4. Confirmá y se generan los asientos contables.

### Nota

Esta funcionalidad es solo para **SUPER_ADMIN** y **ADMIN**.
');

-- ═════════════════════════════════════════════════════════════
-- REPORTES Y ESTADÍSTICAS
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000009',
 'Reporte de ventas',
 'reporte-ventas',
 'Cómo generar un reporte de ventas por período, vendedor, y destino.',
 1,
 '## Reporte de ventas

### Acceder

Andá a **Finanzas > Reportes** y seleccioná la pestaña **Ventas**.

### Métricas del reporte

- **Cantidad de operaciones** en el período.
- **Ventas totales** en USD (agregado).
- **Valor promedio** por operación.
- **Desglose por destino**: top 10 destinos más vendidos.
- **Desglose por vendedor**: ranking del equipo.
- **Tendencia mensual**: gráfico de evolución de ventas.

### Filtros

- **Rango de fechas**: desde/hasta.
- **Vendedor**: específico o todos.
- **Agencia**: si tenés múltiples.

### Exportar

Hacé click en **Exportar** para descargar el reporte en Excel.
'),

('a0000000-0000-0000-0000-000000000009',
 'Reporte de márgenes',
 'reporte-margenes',
 'Cómo analizar la rentabilidad por operación, vendedor, y destino.',
 2,
 '## Reporte de márgenes

### Acceder

Andá a **Finanzas > Reportes** y seleccioná la pestaña **Márgenes**.

### Métricas del reporte

- **Margen total** y **porcentaje de margen promedio**.
- **Margen por destino**: qué destinos dan más ganancia.
- **Margen por vendedor**: quién genera más rentabilidad.
- **Top operaciones** por margen (las más rentables).
- **Operadores más costosos**: impacto de cada proveedor en el margen.
- **Impacto del IVA** en los márgenes.
- **Tendencia** de márgenes a lo largo del tiempo.

### Uso práctico

Este reporte te ayuda a:
- Identificar qué destinos y operadores son más rentables.
- Detectar operaciones con margen bajo o negativo.
- Optimizar la estrategia comercial.
'),

('a0000000-0000-0000-0000-000000000009',
 'Reporte de cash flow',
 'reporte-cashflow',
 'Cómo ver el flujo de caja: ingresos vs egresos por período.',
 3,
 '## Reporte de cash flow

### Acceder

Andá a **Finanzas > Reportes** y seleccioná la pestaña **Cash Flow**.

> Solo visible para roles ADMIN y CONTABLE.

### Métricas del reporte

- **Ingresos vs Egresos**: gráfico comparativo.
- **Flujo neto**: diferencia entre entrada y salida de dinero.
- **Desglose por tipo**: pagos operativos vs estratégicos.
- **Desglose por moneda**: ARS y USD por separado.
- **Tendencia**: evolución diaria, semanal, o mensual.
- **Pronóstico**: estimación basada en pagos programados.

### Filtros

- Período: diario, semanal, mensual.
- Cuenta financiera específica.
- Agencia.
'),

('a0000000-0000-0000-0000-000000000009',
 'Reporte de vencimientos',
 'reporte-vencimientos',
 'Cómo ver pagos próximos a vencer y deudas atrasadas.',
 4,
 '## Reporte de vencimientos

### Acceder

Andá a **Finanzas > Reportes** y seleccioná la pestaña **Vencimientos**.

### Qué muestra

- **Pagos vencidos**: deudas atrasadas de clientes.
- **Pagos próximos**: lo que vence en 7, 14, y 30 días.
- **Aging (antigüedad)**: deudas agrupadas por antigüedad:
  - Corriente (no vencido)
  - 1-30 días de atraso
  - 31-60 días de atraso
  - 60+ días de atraso
- **Clientes más morosos**: ranking por monto adeudado.

### Uso práctico

Usá este reporte para:
- Priorizar la cobranza (empezá por los montos más grandes).
- Detectar clientes problemáticos.
- Planificar el flujo de caja esperado.
'),

('a0000000-0000-0000-0000-000000000009',
 'Reporte de cierre mensual',
 'reporte-cierre',
 'Cómo generar el cierre contable del mes.',
 5,
 '## Reporte de cierre mensual

### Acceder

Andá a **Finanzas > Reportes** y seleccioná la pestaña **Cierre**.

> Solo visible para roles ADMIN y CONTABLE.

### Qué incluye

- **Resumen de todas las operaciones** del período por estado.
- **Reconocimiento de ingresos**: ventas del período.
- **Gastos devengados**: costos acumulados.
- **Estado de comisiones**: pendientes vs liquidadas.
- **Checklist de cierre**: verificaciones sugeridas antes de cerrar el mes.

### Uso

Compartí este reporte con tu contador para el cierre mensual. Exportá a Excel para archivo.
'),

('a0000000-0000-0000-0000-000000000009',
 'Reporte de conciliación',
 'reporte-conciliacion',
 'Cómo conciliar ventas con cobros y detectar diferencias.',
 6,
 '## Reporte de conciliación

### Acceder

Andá a **Finanzas > Reportes** y seleccioná la pestaña **Conciliación**.

> Solo visible para roles ADMIN y CONTABLE.

### Qué muestra

- **Ventas vs Cobros**: compara lo facturado contra lo efectivamente cobrado.
- **Diferencias de cambio**: impacto de las variaciones del dólar.
- **Cuentas por cobrar pendientes**: detalle de lo que falta cobrar.
- **Discrepancias detectadas**: el sistema marca automáticamente si hay inconsistencias.

### Uso práctico

Usá este reporte para:
- Verificar que todos los cobros están registrados.
- Detectar pagos sin asignar.
- Preparar la conciliación bancaria.
'),

('a0000000-0000-0000-0000-000000000009',
 'Exportar reportes a Excel',
 'exportar-reportes',
 'Cómo descargar cualquier reporte del sistema en formato Excel.',
 7,
 '## Exportar reportes a Excel

### Pasos

1. Andá al reporte que querés exportar (en **Finanzas > Reportes**).
2. Aplicá los filtros necesarios (fechas, vendedor, agencia).
3. Hacé click en el botón **Exportar** (ícono de descarga).
4. Se descarga un archivo Excel (.xlsx) con los datos del reporte.

### Reportes exportables

- Ventas
- Márgenes
- Cash Flow
- Vencimientos
- Cierre
- Conciliación
- Comisiones
- Movimientos de caja
- Libro IVA

### Tip

Los reportes exportados mantienen los filtros que aplicaste. Si querés el reporte completo, asegurate de limpiar los filtros antes de exportar.
');

-- ═════════════════════════════════════════════════════════════
-- HERRAMIENTAS
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000010',
 'Cerebro — Asistente con IA',
 'cerebro-ia',
 'Cómo usar el asistente de inteligencia artificial para consultar datos del sistema.',
 1,
 '## Cerebro — Asistente con IA

Cerebro es el copiloto de inteligencia artificial de Vibook. Podés hacerle preguntas sobre tus datos y te responde consultando la base de datos en tiempo real.

### Acceder

Hacé click en **Cerebro** en el menú lateral, o usá el botón **+** flotante y seleccioná **Cerebro IA**.

### Qué podés preguntar

- "¿Cuánto vendimos este mes?"
- "¿Qué viajes salen esta semana?"
- "¿Cuánto hay en caja?"
- "¿Cuántos leads nuevos tenemos?"
- "¿Qué pagos vencen esta semana?"
- "Dame un análisis completo del mes"

### Acciones rápidas

Al abrir Cerebro tenés botones de acceso rápido:
- Ventas del mes
- Próximos viajes
- Estado de caja
- Leads activos
- Pagos pendientes
- Análisis completo

### Importante

- Cerebro lee datos en tiempo real de tu sistema.
- Solo puede hacer consultas de lectura — no modifica datos.
- Las respuestas son específicas de tu agencia y período.
'),

('a0000000-0000-0000-0000-000000000010',
 'Gestionar tareas',
 'gestionar-tareas',
 'Cómo crear, asignar, y hacer seguimiento de tareas del equipo.',
 2,
 '## Gestionar tareas

### Acceder

Andá a **Herramientas > Tareas**, o usá el botón **+** flotante y seleccioná **Nueva tarea**.

### Crear una tarea

1. Hacé click en **+ Nueva tarea** (o presioná **Ctrl+Shift+T**).
2. Completá:
   - **Título**: qué hay que hacer.
   - **Descripción** (opcional): detalles.
   - **Asignar a**: quién la tiene que hacer.
   - **Fecha de vencimiento**.
   - **Prioridad**: alta, media, baja.
3. Guardá.

### Vista semanal

La pestaña **Semana** muestra las tareas organizadas por día de la semana. Ideal para planificar la semana del equipo.

### Marcar como completada

Hacé click en el checkbox al lado de la tarea para marcarla como hecha.

### Recordatorios

El sistema envía recordatorios automáticos para tareas que están por vencer o ya vencieron.

### Tarea por voz

Presioná **Ctrl+Shift+J** para crear una tarea dictando por voz. Vibook la transcribe y crea la tarea automáticamente.
'),

('a0000000-0000-0000-0000-000000000010',
 'WhatsApp Control',
 'whatsapp-control',
 'Cómo gestionar los dispositivos de WhatsApp y enviar mensajes a clientes.',
 3,
 '## WhatsApp Control

### Acceder

Andá a **Herramientas > WHA Control**.

> Solo para roles ADMIN y SUPER_ADMIN.

### Conectar un dispositivo

1. Hacé click en **+ Conectar dispositivo**.
2. Escaneá el código QR con tu WhatsApp Business.
3. El dispositivo queda vinculado a Vibook.

### Enviar mensajes

Podés enviar mensajes a clientes desde las operaciones:
- Confirmaciones de reserva
- Recordatorios de pago
- Comprobantes de pago

### Templates de mensajes

En **Mensajes > Templates** podés crear plantillas predefinidas para los mensajes más comunes. Los templates pueden incluir variables como nombre del cliente, destino, monto, etc.

### Métricas

El dashboard de WHA Control muestra:
- Mensajes enviados por día
- Tasa de entrega
- Dispositivos conectados
'),

('a0000000-0000-0000-0000-000000000010',
 'Calendario',
 'calendario',
 'Cómo usar el calendario para ver salidas, vencimientos, y eventos.',
 4,
 '## Calendario

### Acceder

Andá a **Herramientas > Calendario**.

### Eventos que se muestran

El calendario muestra automáticamente:
- **Salidas**: fechas de partida de operaciones confirmadas.
- **Check-ins**: fechas de ingreso a hoteles.
- **Vencimientos de pago**: cuándo vencen los pagos de clientes.
- **Vencimiento de cotizaciones**: cuándo expiran las cotizaciones enviadas.
- **Seguimientos**: recordatorios de follow-up con leads.
- **Recordatorios**: cualquier recordatorio que hayas creado.

### Colores

Cada tipo de evento tiene un color distinto para identificarlo rápidamente.

### Interacción

- Hacé click en un día para ver todos los eventos.
- Hacé click en un evento para ir directamente a la operación, pago, o cotización relacionada.
'),

('a0000000-0000-0000-0000-000000000010',
 'Emilia — Búsqueda de viajes',
 'emilia-busqueda',
 'Cómo usar Emilia para buscar vuelos y hoteles desde el sistema.',
 5,
 '## Emilia — Búsqueda de viajes

Emilia es el motor de búsqueda de viajes integrado en Vibook.

### Qué podés buscar

- **Vuelos**: origen, destino, fechas, pasajeros.
- **Hoteles**: destino, fechas, habitaciones.

### Cómo buscar

1. Abrí Emilia desde el menú o desde una operación.
2. Ingresá los criterios de búsqueda.
3. Emilia te muestra resultados con precios.
4. Seleccioná la opción que prefieras.

### Integración con operaciones

Los resultados de Emilia se pueden vincular directamente a una operación para cargar los costos y servicios automáticamente.

### Nota

Emilia usa datos de proveedores de viajes en tiempo real (Amadeus/API de Vibook). La disponibilidad y precios pueden variar.
'),

('a0000000-0000-0000-0000-000000000010',
 'Templates de mensajes y PDF',
 'templates',
 'Cómo crear y gestionar plantillas para mensajes y documentos.',
 6,
 '## Templates de mensajes y PDF

### Templates de mensajes (WhatsApp)

1. Andá a **Herramientas > Templates** (o **Recursos > Templates**).
2. Hacé click en **+ Nuevo template**.
3. Completá:
   - **Nombre del template**.
   - **Categoría**: confirmación, recordatorio, recibo, seguimiento.
   - **Contenido del mensaje**: podés usar variables como {nombre_cliente}, {destino}, {monto}.
4. Guardá.

### Templates de PDF

Los PDFs que genera el sistema (cotizaciones, itinerarios, comprobantes) usan templates configurables con tu branding.

### Usar un template

Cuando vayas a enviar un mensaje desde una operación, podés seleccionar un template predefinido. Las variables se completan automáticamente con los datos de la operación.
');

-- ═════════════════════════════════════════════════════════════
-- CONFIGURACIÓN — artículos nuevos
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000007',
 'Configurar AFIP (facturación electrónica)',
 'configurar-afip',
 'Paso a paso para vincular tu agencia con AFIP y emitir facturas electrónicas.',
 4,
 '## Configurar AFIP

### Requisitos previos

- Tener un CUIT activo en AFIP.
- Tener Clave Fiscal nivel 3 o superior.
- Tener un Punto de Venta habilitado para Factura Electrónica (WSFE).

### Pasos de configuración

1. Andá a **Configuración** y buscá la pestaña **Facturación AFIP**.
2. Seleccioná la **agencia** que querés configurar.
3. Ingresá:
   - **CUIT** de la agencia.
   - **Clave Fiscal**.
   - **Punto de Venta** (número 1-9999).
4. Hacé click en **Configurar**.
5. Vibook se conecta con AFIP automáticamente:
   - Crea el certificado digital.
   - Autoriza el Web Service de Factura Electrónica (WSFE).
   - Verifica el Punto de Venta.
6. Esperá unos minutos mientras AFIP procesa.

### Probar la conexión

Hacé click en **Testear conexión** para verificar que todo funcione.

### Problemas comunes

- **"PV no habilitado"**: tenés que habilitar el Punto de Venta en el sitio de AFIP primero.
- **"Clave fiscal inválida"**: verificá que la clave sea nivel 3+.
- **"Servicio no autorizado"**: autorizá WSFE en AFIP con tu clave fiscal.
'),

('a0000000-0000-0000-0000-000000000007',
 'Gestionar integraciones',
 'gestionar-integraciones',
 'Cómo conectar y administrar las integraciones externas del sistema.',
 5,
 '## Gestionar integraciones

### Acceder

Andá a **Configuración > Integraciones**.

### Integraciones disponibles

| Integración | Función |
|------------|---------|
| **Trello** | Sincronizar leads con tablero Trello |
| **ManyChat** | Recibir leads de Instagram/Facebook |
| **WhatsApp** | Enviar mensajes a clientes |
| **AFIP** | Facturación electrónica argentina |
| **Email** | Envío de emails (Resend) |
| **Calendario** | Sincronización de eventos |

### Configurar una integración

1. Hacé click en la integración que querés configurar.
2. Completá los datos de conexión (API key, token, etc.).
3. Hacé click en **Guardar**.
4. Usá el botón **Testear** para verificar que funcione.

### Estado de la integración

Cada integración muestra su estado:
- **Activa**: funcionando correctamente.
- **Inactiva**: deshabilitada.
- **Error**: hay un problema que necesita atención.

### Logs

Podés ver el historial de actividad de cada integración haciendo click en **Ver logs**.
'),

('a0000000-0000-0000-0000-000000000007',
 'Gestionar agencias',
 'gestionar-agencias',
 'Cómo crear y administrar múltiples sucursales o agencias.',
 6,
 '## Gestionar agencias

Si tu empresa tiene múltiples sucursales, cada una se gestiona como una "agencia" independiente.

### Acceder

Andá a **Configuración** y buscá la pestaña **Agencias**.

### Crear una agencia

1. Hacé click en **+ Nueva agencia**.
2. Completá:
   - **Nombre**: ej: "Lozada Rosario", "Lozada Madero".
   - **Ciudad**.
   - **Zona horaria**.
3. Guardá.

### Asignar usuarios

Cada usuario se asigna a una o más agencias. Un usuario solo ve los datos de las agencias a las que pertenece.

### Datos por agencia

- Operaciones, leads, y pagos se registran por agencia.
- Los reportes se pueden filtrar por agencia.
- Cada agencia puede tener su propia configuración de AFIP y Punto de Venta.
'),

('a0000000-0000-0000-0000-000000000007',
 'Importar datos desde CSV',
 'importar-csv',
 'Cómo importar operaciones, clientes, y pagos desde un archivo Excel/CSV.',
 7,
 '## Importar datos desde CSV

Si venís de otro sistema o tenés datos en Excel, podés importarlos masivamente.

### Acceder

Andá a **Herramientas > Importar CSV** (o **Configuración > Importar**).

### Pipelines de importación

| Pipeline | Qué importa |
|----------|-------------|
| **Operaciones Master** | Operaciones + clientes + operadores + pagos (todo junto) |
| **Clientes** | Solo clientes al catálogo |
| **Operadores** | Solo proveedores |
| **Pagos** | Pagos sueltos vinculados a operaciones existentes |
| **Movimientos de caja** | Movimientos históricos de caja |

### Pasos

1. Seleccioná el pipeline.
2. Descargá el **template CSV** haciendo click en el link.
3. Completá el template con tus datos.
4. Seleccioná la **agencia** destino.
5. Subí el archivo CSV.
6. Revisá la **vista previa** — el sistema muestra errores y advertencias.
7. Si todo está bien, hacé click en **Importar**.

### Modo prueba (Dry Run)

Activá el modo **Dry Run** para simular la importación sin guardar nada. Así podés verificar que todo esté correcto antes de importar de verdad.

### Tipo de cambio

Si tus datos tienen montos en USD, configurá el tipo de cambio:
- **Automático**: usa el tipo de cambio histórico del mes.
- **Manual**: ingresá un tipo de cambio fijo.
'),

('a0000000-0000-0000-0000-000000000007',
 'Suscripción y facturación de Vibook',
 'suscripcion',
 'Cómo gestionar tu plan, pago, y suscripción al sistema.',
 8,
 '## Suscripción y facturación de Vibook

### Ver tu suscripción

Andá a **Configuración > Suscripción**.

### Planes disponibles

| Plan | Precio | Incluye |
|------|--------|---------|
| **PRO** | Consultar precio actual | Todas las funcionalidades, hasta 999 usuarios |
| **Enterprise** | A medida | Funcionalidades personalizadas, soporte premium |

### Estado de la suscripción

- **Activa**: todo funcionando.
- **Trial**: en período de prueba (7 días).
- **Vencida**: la prueba terminó, necesitás activar el pago.
- **Suspendida**: el pago falló, el sistema tiene acceso limitado.

### Pagar

El pago se procesa por **MercadoPago** con débito automático mensual.

### Cambiar medio de pago

1. En **Configuración > Suscripción**, hacé click en **Actualizar medio de pago**.
2. Se abre MercadoPago para ingresar una nueva tarjeta.

### Cancelar

Podés cancelar en cualquier momento. El acceso continúa hasta el fin del período pagado.
'),

('a0000000-0000-0000-0000-000000000007',
 'Configurar requisitos de destino',
 'requisitos-destino',
 'Cómo definir requisitos de documentación por destino (visa, vacunas, seguro).',
 9,
 '## Configurar requisitos de destino

Podés definir qué documentación necesita cada destino para que el sistema alerte automáticamente.

### Acceder

Andá a **Configuración** y buscá la pestaña **Requisitos de destino**.

### Crear un requisito

1. Hacé click en **+ Nuevo requisito**.
2. Completá:
   - **Destino**: el código o nombre del destino.
   - **Tipo**: Vacuna, Visa, Seguro, Formulario, Documento, Otro.
   - **Nombre**: descripción específica (ej: "Visa ESTA para EEUU").
   - **Obligatorio**: sí o no.
   - **Días de anticipación**: cuántos días antes del viaje alertar (default: 30).
   - **URL de referencia** (opcional): link a la web oficial.
3. Guardá.

### Cómo se usa

Cuando creás una operación a ese destino, el sistema muestra automáticamente los requisitos en la pestaña **Requerimientos**. Si un pasajero no tiene el documento, se genera una alerta.
'),

('a0000000-0000-0000-0000-000000000007',
 'Reglas de comisiones',
 'reglas-comisiones',
 'Cómo configurar las reglas de cálculo de comisiones para los vendedores.',
 11,
 '## Reglas de comisiones

### Cómo se calculan

Por defecto, cada vendedor tiene un **porcentaje de comisión** en su perfil. La comisión se calcula así:

```
Margen = Venta total - Costo operador
Comisión = Margen × Porcentaje del vendedor
```

### Configurar el porcentaje de un vendedor

1. Andá a **Configuración > Usuarios**.
2. Hacé click en el vendedor.
3. Editá el campo **Porcentaje de comisión**.
4. Guardá.

### Reglas avanzadas

Podés crear reglas especiales que sobrescriban el porcentaje default:

1. Andá a la configuración de comisiones.
2. Hacé click en **+ Nueva regla**.
3. Definí:
   - **Tipo**: porcentaje fijo o monto fijo.
   - **Valor**: el porcentaje o monto.
   - **Destino** (opcional): aplicar solo a ciertos destinos.
   - **Agencia** (opcional): aplicar solo a cierta agencia.
   - **Vigencia**: desde/hasta.
4. Guardá.

### Prioridad

El sistema busca en este orden:
1. Regla específica para el vendedor + destino + fecha.
2. Porcentaje default del vendedor.
3. Regla genérica del tenant.
4. 0% si no encuentra nada (con advertencia).
');

-- ═════════════════════════════════════════════════════════════
-- ALERTAS — artículo nuevo
-- ═════════════════════════════════════════════════════════════

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000008',
 'Gestionar operadores y proveedores',
 'gestionar-operadores',
 'Cómo dar de alta operadores, ver su estado de cuenta, y registrar pagos.',
 3,
 '## Gestionar operadores y proveedores

Los operadores son los mayoristas y proveedores que te venden los servicios de viaje.

### Ver operadores

Andá a **Operadores** en el menú lateral. Ves la lista con:
- Nombre del operador
- Cantidad de operaciones
- Saldo pendiente por moneda (ARS/USD)

### Crear un operador

1. Hacé click en **+ Nuevo operador**.
2. Completá:
   - **Nombre** del operador.
   - **Contacto**: nombre, email, teléfono.
   - **Límite de crédito** (opcional).
3. Guardá.

### Estado de cuenta

Hacé click en un operador para ver:
- **Operaciones** vinculadas.
- **Pagos realizados** y pendientes.
- **Saldo por moneda**.
- **Historial de pagos**.

### Registrar un pago al operador

Podés hacerlo desde la ficha del operador o desde la operación. Consultá el artículo "Registrar un pago al operador" para el paso a paso.
');

-- ═════════════════════════════════════════════════════════════
-- FIN de la expansión
-- ═════════════════════════════════════════════════════════════
