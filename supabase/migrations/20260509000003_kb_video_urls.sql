-- ============================================================
-- Knowledge Base — Agregar video_url + mapear tutoriales de video
-- Agrega columna video_url, linkea tutoriales existentes, y crea
-- artículos faltantes que solo tenían video.
-- ============================================================

-- ─── 1. Agregar columna video_url ───────────────────────────
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS video_url text;

-- ─── 2. Mapear videos a artículos existentes por slug ───────

-- Primeros Pasos
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/01-login.mp4'
  WHERE slug = 'primeros-pasos';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/02-dashboard-tour.mp4'
  WHERE slug = 'entender-dashboard';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/03-crm-clientes.mp4'
  WHERE slug = 'navegacion-busqueda';

-- Operaciones
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/08-operaciones.mp4'
  WHERE slug = 'crear-operacion';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/22-operacion-crear-e2e.mp4'
  WHERE slug = 'estados-operacion';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/09-operaciones-facturacion.mp4'
  WHERE slug = 'facturacion-electronica';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/10-operaciones-estadisticas.mp4'
  WHERE slug = 'estadisticas-operaciones';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/04-crm-operadores.mp4'
  WHERE slug = 'gestionar-operadores';

-- Pasajeros / Itinerario (sin video directo, pero el de crear operación cubre)

-- Clientes
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/20-crm-cliente-crear.mp4'
  WHERE slug = 'crear-cliente';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/05-crm-estadisticas.mp4'
  WHERE slug = 'estadisticas-clientes';

-- CRM y Ventas
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/06-leads-kanban.mp4'
  WHERE slug = 'gestionar-leads';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/07-leads-estadisticas.mp4'
  WHERE slug = 'estadisticas-ventas';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/06-leads-kanban.mp4'
  WHERE slug = 'leads-manychat';

-- Pagos
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/14-contabilidad-deudas.mp4'
  WHERE slug = 'registrar-pago-cliente';

-- Finanzas
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/13-caja-resumen.mp4'
  WHERE slug = 'movimientos-caja';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/12-contabilidad-cuentas.mp4'
  WHERE slug = 'cuentas-financieras';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/13-caja-resumen.mp4'
  WHERE slug = 'exportar-movimientos';

-- Contabilidad
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/11-contabilidad-mayor.mp4'
  WHERE slug = 'libro-mayor';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/15-impuestos-iva.mp4'
  WHERE slug = 'iva-posicion';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/26-iva-descargar.mp4'
  WHERE slug = 'libro-iva-digital';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/14-contabilidad-deudas.mp4'
  WHERE slug = 'deudores-ventas';

-- Reportes
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/16-reportes.mp4'
  WHERE slug = 'reporte-ventas';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/16-reportes.mp4'
  WHERE slug = 'reporte-margenes';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/16-reportes.mp4'
  WHERE slug = 'reporte-cashflow';

-- Herramientas
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/17-herramientas-cerebro.mp4'
  WHERE slug = 'cerebro-ia';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/18-herramientas-tareas.mp4'
  WHERE slug = 'gestionar-tareas';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/19-herramientas-calendario.mp4'
  WHERE slug = 'calendario';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/18-herramientas-tareas.mp4'
  WHERE slug = 'whatsapp-control';

-- Configuración
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/30-settings-integraciones.mp4'
  WHERE slug = 'configurar-afip';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/30-settings-integraciones.mp4'
  WHERE slug = 'gestionar-integraciones';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/29-settings-usuarios.mp4'
  WHERE slug = 'gestionar-usuarios';
UPDATE kb_articles SET video_url = 'https://tutoriales.vibook.ai/videos/31-importar-excel.mp4'
  WHERE slug = 'importar-csv';

-- ─── 3. Artículos nuevos (tutoriales que no tenían artículo) ─

-- Conciliar caja del día (Finanzas)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000005',
 'Conciliar la caja del día',
 'conciliar-caja',
 'Cómo hacer la conciliación diaria de caja: ingresos, egresos y movimientos.',
 8,
 'https://tutoriales.vibook.ai/videos/25-caja-conciliar.mp4',
 '## Conciliar la caja del día

La conciliación de caja es el proceso de verificar que los movimientos registrados coincidan con el dinero real.

### Pasos

1. Andá a **Finanzas > Caja y Bancos**.
2. Seleccioná la cuenta que querés conciliar (ej: "Caja chica").
3. Filtrá por la fecha de hoy.
4. Revisá cada movimiento:
   - **Ingresos**: pagos de clientes, depósitos.
   - **Egresos**: pagos a operadores, gastos.
5. Compará el saldo del sistema con el dinero físico o saldo bancario.

### Pestañas de caja

- **Resumen**: vista general con KPIs y saldos por cuenta.
- **Ingresos**: todos los movimientos de entrada.
- **Egresos**: todos los movimientos de salida.
- **Movimientos**: listado completo cronológico.
- **Pagos**: pagos asociados a operaciones.

### Discrepancias

Si encontrás diferencias entre el sistema y la realidad:
1. Verificá si falta registrar algún movimiento.
2. Revisá si hay pagos duplicados.
3. Creá un ajuste manual si es necesario.

### Frecuencia

Recomendamos hacer la conciliación al cierre de cada día laboral.
');

-- Cargar comprobante de compra (Contabilidad)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000006',
 'Cargar un comprobante de compra',
 'comprobante-compra',
 'Cómo registrar facturas de operadores y cómo se reflejan en el libro mayor.',
 11,
 'https://tutoriales.vibook.ai/videos/24-comprobante-compra-cargar.mp4',
 '## Cargar un comprobante de compra

Los comprobantes de compra son las facturas que te envían los operadores y proveedores.

### Pasos

1. Andá a **Finanzas > Contabilidad** o a la pestaña de **Comprobantes de compra**.
2. Hacé click en **+ Nuevo comprobante**.
3. Completá:
   - **Operador/Proveedor**: seleccioná de la lista.
   - **Tipo de comprobante**: Factura A, B, C, Nota de Crédito, etc.
   - **Número de comprobante**: el número que figura en la factura.
   - **Fecha de emisión**.
   - **Monto neto** y **IVA**.
   - **Operación vinculada** (opcional): si el gasto es de una operación específica.
4. Guardá.

### Impacto contable

Al cargar un comprobante de compra:
- Se genera un asiento en el **Libro Mayor** (débito a la cuenta de gastos, crédito al proveedor).
- El **IVA Crédito Fiscal** se acumula para la posición mensual.
- El saldo del operador se actualiza.

### Ver comprobantes cargados

Los comprobantes aparecen en la pestaña de compras dentro de Contabilidad, y también en la ficha del operador.
');

-- Gestionar pagos a operadores (Contabilidad)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000006',
 'Gestionar pagos a operadores',
 'pagos-operadores',
 'Cómo ver pagos pendientes a proveedores y registrar el pago.',
 12,
 'https://tutoriales.vibook.ai/videos/27-pagos-operadores.mp4',
 '## Gestionar pagos a operadores

### Acceder

Andá a **Operaciones > Pagos a Operadores** o desde la ficha del operador.

### Ver pagos pendientes

La vista muestra:
- **Operador**: nombre del proveedor.
- **Operaciones vinculadas**: qué viajes generaron la deuda.
- **Monto total adeudado** por moneda (ARS/USD).
- **Fecha de vencimiento**: cuándo hay que pagar.
- **Días de atraso**: si ya venció.

### Registrar un pago

1. Seleccioná el operador o la deuda específica.
2. Hacé click en **Registrar pago**.
3. Completá:
   - **Monto a pagar**.
   - **Forma de pago**: transferencia, cheque, efectivo.
   - **Cuenta financiera** desde donde sale el dinero.
   - **Fecha del pago**.
   - **Comprobante** (opcional).
4. Confirmá.

### Impacto

Al registrar el pago:
- Se descuenta del saldo del operador.
- Se genera un egreso en caja.
- Se crea el asiento contable correspondiente.

### Tip

Priorizá los pagos por fecha de vencimiento para evitar recargos con los operadores.
');

-- Comisiones de vendedores (Contabilidad)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000006',
 'Comisiones de vendedores',
 'comisiones-vendedores',
 'Cómo Vibook calcula y trackea las comisiones de cada vendedor.',
 13,
 'https://tutoriales.vibook.ai/videos/28-comisiones-vendedores.mp4',
 '## Comisiones de vendedores

### Acceder

Andá a **Finanzas > Comisiones**.

### Cómo se calculan

Para cada operación confirmada o cerrada:

```
Margen = Venta total - Costo operador
Comisión = Margen × Porcentaje del vendedor
```

### Vista de comisiones

La pantalla muestra:
- **Por vendedor**: listado con total devengado, pagado, y pendiente.
- **Por operación**: detalle de cada comisión generada.
- **Liquidaciones**: historial de pagos de comisiones.

### Liquidar comisiones

1. Seleccioná las comisiones pendientes de un vendedor.
2. Hacé click en **Liquidar**.
3. El sistema genera el pago y actualiza los saldos.

### Mis comisiones (vista vendedor)

Si sos vendedor, andá a **Mis comisiones** en el menú lateral para ver:
- Tus operaciones con comisión.
- Cuánto tenés devengado.
- Cuánto te pagaron.
- Cuánto te deben.

### Reglas de comisión

Podés configurar reglas especiales por destino, agencia, o período. Consultá el artículo "Reglas de comisiones" para más detalle.
');

-- Emitir comprobante de venta (Operaciones — complementa facturación)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000001',
 'Emitir un comprobante de venta paso a paso',
 'emitir-comprobante-venta',
 'Tutorial detallado para emitir una factura electrónica con validación AFIP y CAE.',
 9,
 'https://tutoriales.vibook.ai/videos/23-operacion-comprobante-venta.mp4',
 '## Emitir un comprobante de venta paso a paso

Este tutorial te guía paso a paso por el proceso completo de emisión.

### Antes de empezar

Verificá que:
- La integración AFIP esté configurada (ver "Configurar AFIP").
- El cliente tenga CUIT/DNI cargado.
- La operación tenga montos definidos.

### Paso a paso

1. Abrí la operación desde **Operaciones**.
2. Andá a la pestaña **Facturación**.
3. Hacé click en **Emitir comprobante**.
4. Seleccioná el **tipo de comprobante**:
   - **Factura A**: para clientes con CUIT (responsables inscriptos).
   - **Factura B**: para consumidores finales o monotributistas.
   - **Factura C**: si tu agencia es monotributista.
5. Verificá los **datos del receptor** (CUIT/DNI, razón social).
6. Revisá el **monto** y los **conceptos**.
7. Hacé click en **Autorizar en AFIP**.
8. Esperá la respuesta de AFIP (puede tardar unos segundos).
9. Si es exitoso, se muestra el **CAE** y la fecha de vencimiento.
10. Ya podés **descargar el PDF** o **enviar por email/WhatsApp**.

### Estados del comprobante

| Estado | Significado |
|--------|-------------|
| **Borrador** | Creado pero no enviado a AFIP |
| **Autorizado** | AFIP lo aprobó con CAE |
| **Rechazado** | AFIP lo rechazó (ver motivo) |
| **Anulado** | Se emitió nota de crédito |

### Si AFIP rechaza

Revisá el mensaje de error. Los más comunes son:
- CUIT inválido del receptor.
- Punto de Venta no habilitado.
- Error de conexión (reintentar).
');

-- Crear operación de viaje E2E (Operaciones)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000001',
 'Crear una operación de viaje completa',
 'crear-operacion-completa',
 'Recorrido completo del formulario: agencia, vendedor, cliente, operador, destinos, fechas y montos.',
 10,
 'https://tutoriales.vibook.ai/videos/22-operacion-crear-e2e.mp4',
 '## Crear una operación de viaje completa

Este tutorial cubre el formulario completo de creación de operación, campo por campo.

### Datos básicos

1. Andá a **Operaciones** y hacé click en **+ Nueva operación**.
2. Completá:
   - **Agencia**: si tenés múltiples, seleccioná cuál gestiona este viaje.
   - **Vendedor principal**: quién cerró la venta.
   - **Vendedor secundario** (opcional): si la venta fue compartida.

### Cliente

3. Buscá al **cliente titular** por nombre o DNI.
4. Si no existe, crealo desde el botón **+ Nuevo cliente**.
5. Agregá pasajeros adicionales si viajan más personas.

### Operador y costos

6. Seleccioná el **operador** (mayorista/proveedor).
7. Ingresá el **costo del operador** (lo que le pagás al proveedor).
8. Ingresá el **precio de venta** (lo que le cobrás al cliente).
9. El sistema calcula automáticamente el **margen**.

### Destino y fechas

10. Ingresá el **destino**.
11. Seleccioná **fecha de salida** y **fecha de regreso**.
12. El sistema calcula la duración automáticamente.

### Guardar

13. Revisá todos los datos.
14. Hacé click en **Guardar**.
15. La operación se crea en estado **Pendiente**.

### Después de crear

- Agregá servicios en la pestaña **Servicios**.
- Cargá el itinerario día por día.
- Registrá los pagos del cliente.
- Emití la factura cuando corresponda.
');

-- Crear operador nuevo (Alertas — lo ponemos en la categoría que tiene operadores)
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, video_url, content) VALUES
('a0000000-0000-0000-0000-000000000008',
 'Crear un operador nuevo',
 'crear-operador',
 'Paso a paso para dar de alta un operador o proveedor con datos de contacto.',
 4,
 'https://tutoriales.vibook.ai/videos/21-crm-operador-crear.mp4',
 '## Crear un operador nuevo

### Pasos

1. Andá a **Operadores** en el menú lateral.
2. Hacé click en **+ Nuevo operador**.
3. Completá los datos:
   - **Nombre**: razón social o nombre comercial del operador.
   - **CUIT** (opcional): para facturación.
   - **Contacto principal**: nombre de la persona de contacto.
   - **Email**: para comunicaciones.
   - **Teléfono**.
   - **Dirección** (opcional).
   - **Condición de pago**: días de plazo que te dan para pagar.
   - **Límite de crédito** (opcional): monto máximo que te fían.
4. Hacé click en **Guardar**.

### Después de crear

El operador ya está disponible para:
- Vincularlo a nuevas operaciones.
- Registrar pagos.
- Ver su estado de cuenta.
- Cargar comprobantes de compra.

### Tip

Mantené actualizados los datos de contacto de tus operadores para agilizar la gestión diaria.
');

-- ─── FIN ─────────────────────────────────────────────────────
