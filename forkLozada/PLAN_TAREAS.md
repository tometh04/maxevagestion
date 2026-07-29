# Fork Lozada — Plan de tareas: Finanzas, Facturación y Contabilidad

## De qué se trata este documento

Lozada nos acercó dos documentos con los ajustes y funcionalidades que necesita en el sistema:

1. **Informe Unificado de Evaluación y Requerimientos** — el relevamiento de problemas y necesidades detectadas usando el sistema.
2. **Nuevos Ajustes y Features (V2.0)** — la especificación ya ordenada por prioridad, con una propuesta de 4 entregas (releases).

Se va a desarrollar una **versión del sistema exclusiva para Lozada**. Este documento traduce esos dos pedidos en un listado de tareas concretas: qué resuelve cada una, cómo está hoy el sistema, de qué punto de los documentos originales surge (**Referencia**) y cuántas horas de desarrollo estimamos. Las tareas se agrupan en las **4 entregas** que propone el documento V2.

### Cómo leer los cuadros
- **Prioridad:** **P0** = crítico (afecta integridad de datos, saldos o documentos) · **P1** = alta (necesario para operar profesionalmente) · **P2** = evolutiva (mejora de eficiencia o automatización avanzada).
- **File:** es el número de operación / legajo del pasajero.
- **Referencia:** de dónde sale la tarea en los documentos originales. **"Informe"** = Informe Unificado de Evaluación · **"V2"** = documento Nuevos Ajustes y Features V2.0. Entre paréntesis, la prioridad.
- **Situación hoy:** *No existe* (hay que construirlo) · *Parcial* (existe algo, falta completarlo) · *Ya funciona* (solo requiere ajustes) · *A corregir* (hay un error).
- **Horas:** trabajo estimado de desarrollo (ver bases al final).

### Resumen: qué ya está y qué falta
- **Ya resuelto (solo ajustes menores):** transferencias entre cuentas propias, anulación de movimientos con contra-asiento, asientos con partida doble, notas de crédito/débito, percepciones automáticas.
- **A medio camino (falta completar o cambiar un valor por defecto):** validación por DNI, facturación a varios clientes de un mismo file, listado de pendientes de facturar, mostrar varios proveedores, cobro por pasajero.
- **A construir desde cero (las más grandes):** cuenta corriente real del cliente, saldos a favor, un recibo aplicado a varios files, matriz impositiva configurable, IIBB sobre rentabilidad, cierre de períodos fiscales, conciliaciones con AFIP y banco, flujo de fondos proyectado, protección de cuentas.

---

## Etapa 0 — Preparación de la versión Lozada

| Tarea | Qué resuelve | Referencia | Horas |
|-------|--------------|------------|------:|
| **0.1 · Puesta en marcha del sistema propio** | Crear el ambiente exclusivo de Lozada: base de datos separada, publicación en producción y su dominio. Definir cómo se incorporan a futuro las mejoras y correcciones generales del producto. | Interno | 16 |
| **0.2 · Marca y configuración inicial** | Personalización de marca, carga de datos fiscales de Lozada (AFIP) y del plan de cuentas inicial. | Interno | 8 |
| **Subtotal Etapa 0** | | | **24** |

---

## Entrega 1 — Integridad y estabilización (P0)

> Objetivo: dejar sólidos la contabilidad, los saldos, los documentos y su trazabilidad antes de sumar funcionalidades encima.

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R1.1 · Asientos contables siempre balanceados** | Garantizar que todo asiento cumpla la partida doble (el Debe siempre igual al Haber). Se impide guardar asientos incompletos, se detectan y corrigen los históricos desbalanceados y se agrega un control que alerta inconsistencias. | Parcial: se valida al crear, pero conviven registros viejos incompletos. | Informe 5.1 · V2 7.1 (P0) | 60 |
| **R1.2 · Anulación correcta de movimientos de caja** | Que anular un recibo genere siempre el contra-movimiento en la misma cuenta y no lo mande por error a "gastos generales". Se bloquea el borrado definitivo y queda el vínculo entre el movimiento original y su anulación. | A corregir: el contra-asiento existe pero falla el caso reportado. | Informe 3.2 · V2 5.2 (P0) | 24 |
| **R1.3 · Protección de cuentas con historial** | Impedir eliminar una cuenta (ej. Banco Galicia) que tuvo movimientos o saldos. Se podrá "inactivar" una cuenta sin perder su historial, dejando registro de quién cambia nombres o configuración. | A corregir: hoy se borra libremente y se pierde el historial. | Informe 3.3 · V2 5.3 (P0) | 20 |
| **R1.4 · Mostrar todos los proveedores del file** | Cuando una operación tiene más de un proveedor, que se vean todos (no solo el primero) en el listado y en todos los reportes derivados. Unifica lo cargado desde "Información" y desde "Servicios" e identifica proveedor principal y secundarios. | Parcial: el listado muestra varios, falta unificarlo con Servicios y con los reportes. | Informe 2.2 · V2 4.2 (P0) | 20 |
| **R1.5 · Recibos definitivos y sin modificaciones** | Recibo con formato comercial y legal claro (concepto, importe, moneda, medios de pago). Una vez emitido no se pueden cambiar montos ni cuentas: toda corrección se hace por reversión. No muestra saldo cuando el file todavía no tiene cargados todos los servicios. | A corregir: hoy se puede editar un recibo ya entregado y muestra saldos que confunden. | Informe 4.1 · V2 6.1 (P0) | 30 |
| **R1.6 · Saldos a favor visibles** | Que los saldos a favor de los clientes dejen de quedar ocultos (caso Diego Martínez): se muestran en la ficha, la cuenta corriente y los reportes; se pueden aplicar a viajes futuros o devolver por un circuito formal. Se corrigen los casos actuales. | No existe: hoy un pago de más se pierde y no figura como crédito. | Informe 1.3 · V2 3.4 (P0) | 36 |
| **Subtotal Entrega 1** | | | | **190** |

---

## Entrega 2 — Finanzas V2 (P1)

> Objetivo: cuenta corriente real, cobros aplicados a varias operaciones, control diario de caja, tipo de cambio y separación de permisos. Incluye los ajustes del módulo Clientes y del listado de Operaciones.

### Clientes y cuentas corrientes

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R2.1 · Cuenta corriente real del cliente** | Reemplazar la vista fija de "Venta / Pagado / Saldo" por una cuenta corriente de verdad: muestra cada factura, recibo, nota de crédito, devolución y ajuste, y qué pago cancela cada comprobante. Saldos por moneda e historial completo. Es la base de la que dependen los saldos a favor, los recibos a varios files y las conciliaciones. | No existe: hoy solo hay un resumen fijo, sin detalle de qué se cancela con qué. | Informe 1.3 · V2 3.4 (P0) | 80 |
| **R2.2 · Cobro a cada pasajero de un mismo file** | Poder cobrarle y emitir recibo a cualquier pasajero del file (no solo al principal), dejando registrado quién pagó qué, sin alterar la composición del file. | Parcial: falta completar la pantalla y el recibo por pasajero. | Informe 1.2 · V2 3.3 (P1) | 24 |
| **R2.3 · Un recibo aplicado a varios files (cuentas corporativas)** | Al cobrar a un cliente corporativo o multi-viaje, ver todos sus files con saldo y repartir un solo cobro entre varias operaciones a la vez (total o parcial). Si sobra dinero, queda como saldo a favor. Mismo modelo que "Pago Múltiple a Proveedores". | No existe: hoy un cobro se aplica a un solo file. | Informe 1.2 · V2 3.3 (P1) | 40 |
| **R2.4 · Vista enriquecida al buscar un cliente** | Al buscar un cliente, ver por cada file: número, destino, fecha de salida, moneda y saldo financiero, con acceso directo a abrir la operación (modelo Pitágoras). | Parcial: falta el detalle financiero por file en la búsqueda. | Informe 1.2 · V2 3.2 (P1) | 16 |
| **R2.5 · Validación de clientes por DNI** | Usar el DNI/documento como dato único de identificación en lugar del e-mail (que varios clientes pueden compartir). Aviso claro cuando ya existe un cliente con el mismo documento y tratamiento para extranjeros sin DNI argentino. | Parcial: la opción existe pero por defecto sigue validando por e-mail. | Informe 1.1 · V2 3.1 (P1) | 14 |
| **R2.6 · Pasaporte y número de trámite** | Definir en qué pantallas y documentos se muestra el pasaporte (hoy se carga pero no se ve) y resolver si el "número de trámite" es obligatorio, opcional o se elimina, según tipo de documento y nacionalidad. | Parcial: el campo de trámite existe; el pasaporte no se visualiza. | Informe 1.1 · V2 3.1 (P1) | 10 |

### Operaciones y proveedores

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R2.7 · Nuevos filtros y fechas en el listado** | Filtrar por producto y por vendedor, y aclarar el filtro de vencimiento (hoy ambiguo). Agregar filtro por fecha de viaje (Fecha In), manteniendo separada la fecha de alta de la operación. | Parcial: hay filtros por estado/vendedor/agencia/fecha; falta producto y aclarar vencimiento. | Informe 2.1 · V2 4.1 (P1) | 16 |
| **R2.8 · Número de file simple y ordenado** | Un número de file comercial limpio (numérico o alfanumérico simple), fácil de comunicar, manteniendo internamente un identificador técnico. Se puede buscar por cualquiera de los dos. | A corregir: hoy el número mezcla fecha y códigos internos. | Informe 2.2 · V2 4.2 (P1) | 20 |
| **R2.9 · Servicio base vs. adicionales + vencimiento por servicio** | Definir claramente qué es el "servicio base" y mostrar de forma consistente todos los servicios cargados, se hayan cargado desde donde se hayan cargado. Agregar la fecha de vencimiento al cargar cada servicio. | Parcial: los servicios existen pero sin fecha de vencimiento y no siempre se ven todos. | Informe 4.2 · V2 4.2 (P1) | 20 |

### Caja, cuentas y tipo de cambio

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R2.10 · Parte diario de caja por cuenta + Excel** | Reporte diario por cada cuenta valor con saldo inicial, ingresos, egresos y saldo final; consulta por día o rango; con exportación directa a Excel. | No existe: hay resúmenes históricos, pero no un parte diario por cuenta ni exportación a Excel en Caja. | Informe 3.2 · V2 5.2 (P1) | 24 |
| **R2.11 · Pases de fondos entre cuentas propias** | Registrar transferencias entre cuentas propias (banco a banco, efectivo al banco, envío a inversión) sin que se cuenten como ingresos o gastos operativos ni distorsionen la rentabilidad. Contempla diferencias por comisión bancaria o tipo de cambio. | Ya funciona: la transferencia existe; falta excluirla de los reportes operativos. | Informe 3.3 · V2 5.3 (P1) | 10 |
| **R2.12 · Tipo de cambio visible y editable + cobranza más simple** | Mostrar el tipo de cambio del día en las pantallas y permitir elegirlo o modificarlo al hacer un recibo o una orden de pago. Simplificar la cobranza: quitar campos confusos ("fecha de vencimiento" y "marcar como pagado") e imputar el dinero cobrado directamente al file. | Parcial: el tipo de cambio solo se edita cuando difieren las monedas; falta gestión visible de cotizaciones. | Informe 5.4 · V2 7.4 (P1) | 28 |

### Seguridad

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R2.13 · Separar Finanzas de Contabilidad (permisos)** | Mover "Cobro a clientes" y "Pago a proveedores" fuera de Contabilidad (donde hay información sensible de socios), hacia Finanzas/Operaciones. Permisos por rol y acción, ocultando cuentas y movimientos sensibles y registrando accesos. | Parcial: hoy conviven bajo el mismo módulo y los permisos no están del todo separados. | Informe 5.2 · V2 7.2 (P1) | 28 |
| **R2.14 · Moneda visible en reportes de deuda** | Mostrar la moneda en el estado de deuda de clientes (hoy solo lo hace el de proveedores), separando saldos por moneda para no mezclar pesos y dólares. | A corregir: el reporte de deuda de clientes no indica la moneda. | Informe 5.3 · V2 7.3 (P1) | 6 |
| **Subtotal Entrega 2** | | | | **336** |

---

## Entrega 3 — Facturación e impuestos (P1, con matriz impositiva P0)

> Objetivo: matriz impositiva configurable, carga masiva de facturas, pendientes de facturar, IVA/IIBB correctos, cierres y exportaciones. Incluye el circuito de cancelaciones/devoluciones y la comisión neta (que generan ajustes contables y notas de crédito).

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R3.1 · Matriz impositiva configurable** | Definir de forma clara y auditable qué conceptos son gravados, exentos o no gravados y con qué alícuota de IVA (21%, 10,5%, etc.), mediante reglas configurables por tipo de servicio, proveedor, jurisdicción y agencia. Muestra el criterio antes de emitir y guarda el historial. | No existe: hoy las alícuotas y el tratamiento están fijos y se eligen a mano en cada comprobante. | Informe 4.1 · V2 6.1 (P0) | 60 |
| **R3.2 · Facturar a distintos clientes del mismo file** | Elegir qué cliente se factura por cada importe, dividir una operación en varios comprobantes y reasignar la carga impositiva, manteniendo el total facturado igual al total de la operación. | Parcial: se puede facturar parcial; falta el manejo controlado de la carga impositiva. | Informe 4.1 · V2 6.1 (P1) | 24 |
| **R3.3 · Regímenes, percepciones y consumidor final** | Aplicar y discriminar correctamente percepciones y regímenes, imputarlos contablemente, detectar automáticamente cuándo corresponde facturar a consumidor final y conciliarlo con la cuenta corriente del cliente. | Parcial: las percepciones se calculan en cobros; falta la lógica de consumidor final y su parametrización. | Informe 4.1 · V2 6.1 (P1) | 30 |
| **R3.4 · Listado de operaciones pendientes de facturar** | Ver qué files ya están cobrados (total o parcial) y todavía no se facturaron, con cliente, importe cobrado, facturado y diferencia, filtros y acceso directo para facturar. Evita que queden operaciones sin comprobante. | Parcial: existe una versión básica; falta desglose por cliente, diferencias y filtros. | Informe 4.1 · V2 6.1 (P1) | 16 |
| **R3.5 · Carga masiva de facturas de proveedores** | Elegir un proveedor y ver todos sus files pendientes con costo estimado, imputado y saldo; aplicar una factura total o parcialmente a uno o varios files, validando que la suma coincida con el comprobante. Evita entrar file por file. | No existe: hoy hay que cargar la factura entrando a cada file por separado. | Informe 4.2 · V2 6.2 (P1) | 36 |
| **R3.6 · Ingresos Brutos sobre la rentabilidad** | Corregir el cálculo de IIBB para que (cuando corresponda) se aplique sobre la rentabilidad/utilidad y no sobre el total de ventas, configurable por jurisdicción y actividad, mostrando la fórmula y los datos usados. | A corregir: hoy IIBB se calcula sobre el total facturado, no sobre el margen. | Informe 4.3 · V2 6.3 (P0) | 24 |
| **R3.7 · Libro IVA Compras por cuenta de gasto** | Que el Libro IVA Compras muestre, por cada factura, a qué cuenta de gasto o costo de venta se imputó, con filtros y conciliación contra los asientos. | Parcial: hoy agrupa por proveedor sin indicar la cuenta de gasto. | Informe 4.3 · V2 6.3 (P1) | 20 |
| **R3.8 · Cierre de períodos fiscales** | Poder cerrar un período de IVA y que quede bloqueado (sin altas, ediciones ni bajas retroactivas). Reapertura solo con permisos especiales, registrando usuario, fecha y motivo. | No existe: hoy se puede modificar hacia atrás. | Informe 4.3 · V2 6.3 (P1) | 30 |
| **R3.9 · Exportaciones fiscales (AFIP)** | Exportar los libros de IVA en formato de texto compatible con los aplicativos de AFIP (RG 3685 / Libro IVA Digital), validando estructura y campos, con reporte de errores previo a la descarga. | Parcial: la exportación existe; falta validación, reporte de errores y versionado. | Informe 4.3 · V2 6.3 (P1) | 16 |
| **R3.10 · Circuito de cancelaciones y devoluciones** | Cargar cancelaciones y devoluciones (totales o parciales) dentro del file, registrando penalidad, devolución, crédito y motivo, generando automáticamente los ajustes contables y financieros, sin borrar la operación original y diferenciando cancelación del proveedor vs. del cliente. | No existe: solo se puede marcar la operación como cancelada, sin penalidad/devolución/crédito. | Informe 2.3 · V2 4.3 (P1) | 40 |
| **R3.11 · Comisión neta del vendedor con ajustes** | Recalcular automáticamente la comisión neta ante cancelaciones y devoluciones, generando ajustes (positivos o negativos) sin sobrescribir la comisión original, con motivo, fecha y usuario, y reportes por vendedor/período/operación. | Parcial: el cálculo existe; falta el ajuste atado a una cancelación puntual. | Informe 2.3 · V2 4.3 (P1) | 28 |
| **R3.12 · Criterio del Estado de Situación Patrimonial** | Definir y documentar con qué criterio se arma el balance (operativo, contable o fiscal), relacionar cada rubro con sus cuentas y poder abrir el detalle que compone cada saldo, sin mezclar gestión con información fiscal. | Parcial: el balance existe; falta documentar el criterio y el detalle por rubro. | Informe 5.3 · V2 7.3 (P1) | 20 |
| **Subtotal Entrega 3** | | | | **344** |

---

## Entrega 4 — Inteligencia financiera (P2)

> Objetivo: proyección de caja y conciliaciones automáticas. Se cierra con las mejoras evolutivas restantes de Clientes y Operaciones.

| Tarea | Qué resuelve | Situación hoy | Referencia | Horas |
|-------|--------------|---------------|------------|------:|
| **R4.1 · Flujo de fondos proyectado (Cash Flow)** | Panel de flujo de fondos con proyección semanal, quincenal y mensual: junta ingresos por vencimientos de clientes, egresos turísticos por vencimientos de proveedores, gastos fijos/estructura y toma como saldo inicial las cuentas valor vigentes. Filtro por moneda y distinción entre confirmado, estimado, vencido y pendiente. | No existe: hoy hay histórico y una lista de vencimientos, pero no una proyección consolidada. | Informe 3.1 · V2 5.1 (P2) | 50 |
| **R4.2 · Conciliación con "Mis Comprobantes" de AFIP** | Importar "Mis Comprobantes Recibidos" de AFIP y cruzarlos con el Libro IVA Compras por CUIT, tipo, punto de venta, número e importe, listando faltantes y diferencias, y permitiendo crear o vincular la factura desde la misma pantalla. | No existe. | Informe 4.4 · V2 6.4 (P2) | 36 |
| **R4.3 · Conciliación bancaria asistida** | Importar los extractos bancarios y sugerir automáticamente coincidencias con los movimientos del sistema por fecha, importe y referencia, permitiendo confirmar, rechazar o dividir, y detectando movimientos sin registrar. | No existe (la "reconciliación" actual es solo un control interno de integridad). | Informe 4.4 · V2 6.4 (P2) | 50 |
| **R4.4 · CUIL al inicio con precarga de datos** | Mover el CUIL al inicio del formulario y, al ingresarlo, precargar automáticamente los datos del cliente desde una fuente autorizada, con opción de carga manual si el servicio no está disponible. | Parcial: se puede generar el CUIL desde el DNI, pero no precargar los datos. | Informe 1.1 · V2 3.1 (P2) | 20 |
| **R4.5 · Mejora visual del listado de operaciones** | Reducir la altura de las filas, dejar fijo el encabezado de la tabla al hacer scroll y que la exportación respete las columnas visibles. | A corregir: hoy las filas ocupan mucho y el encabezado no queda fijo. | Informe 2.1 · V2 4.1 (P2) | 12 |
| **Subtotal Entrega 4** | | | | **168** |

---

## Resumen de esfuerzo

| Entrega | Foco | Prioridad | Horas |
|---------|------|-----------|------:|
| Etapa 0 | Preparación de la versión Lozada | — | 24 |
| Entrega 1 | Integridad y estabilización | P0 | 190 |
| Entrega 2 | Finanzas V2 | P1 | 336 |
| Entrega 3 | Facturación e impuestos | P1 (matriz P0) | 344 |
| Entrega 4 | Inteligencia financiera | P2 | 168 |
| **Total desarrollo** | | | **1.062** |
| **Con contingencia +25 % (pruebas / gestión / imprevistos)** | | | **≈ 1.328** |

> Como referencia: ~1.062 h ≈ **27 semanas** con 1 desarrollador (40 h/semana) o **~13–14 semanas** con 2 en paralelo. Con la contingencia, ~33 semanas de un desarrollador.

### Bases de la estimación
- **Unidad:** horas de desarrollo de un desarrollador senior ya familiarizado con el sistema.
- **Incluye:** desarrollo + pruebas básicas + cambios de base de datos cuando aplica.
- **No incluye:** ciclo completo de control de calidad, gestión de proyecto ni la revisión del cliente. Por eso se sugiere **+20–30 % de contingencia**.
- Las tareas más grandes (cuenta corriente real, matriz impositiva y conciliaciones) son las de mayor riesgo de que la estimación se quede corta.

## Reglas que se respetan en todas las tareas (documento V2, punto 8)
- Ningún documento emitido se elimina físicamente: las correcciones se hacen por reversión o documento de ajuste.
- Todo movimiento financiero indica moneda, cuenta, fecha, usuario, origen y documento relacionado.
- Las operaciones en varias monedas conservan el tipo de cambio usado en cada transacción.
- Los cambios sobre información contable o financiera quedan auditables.
- Los reportes permiten ir desde el total hasta el movimiento que lo originó.
- Las funciones fiscales son configurables por agencia, jurisdicción y período.
- Toda función nueva incluye permisos, exportación y reversión desde el primer día.

## Definiciones a cerrar con Lozada antes de las Entregas 3 y 4
Fuente oficial para la precarga de datos por CUIL · tratamiento de clientes extranjeros · reglas fiscales definitivas por tipo de servicio y jurisdicción · criterio de devengamiento · momento exacto en que nace una cuenta por cobrar o pagar · política de tipo de cambio y moneda base por agencia · tratamiento de diferencias de cambio · fórmula y momento de liquidación de comisiones · formatos bancarios de la primera versión · alcance inicial de las exportaciones fiscales.

## Próximos pasos
1. Validar con Lozada este listado y las definiciones pendientes (sobre todo las que condicionan las Entregas 3 y 4).
2. Confirmar o ajustar las estimaciones con el equipo que hará el desarrollo.
3. Cargar las tareas en la herramienta de seguimiento (ej. Linear) para el control del avance.
