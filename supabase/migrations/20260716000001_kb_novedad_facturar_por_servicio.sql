-- =====================================================
-- Novedad KB: Facturar por servicio + eliminar borradores
-- Crea la categoría "Novedades" (si no existe) y publica el anuncio.
-- El KB es global (sin org_id): visible para todas las agencias.
-- Idempotente: ON CONFLICT (slug) DO NOTHING.
-- =====================================================

-- Categoría "Novedades" (sort_order 0 = arriba de todo)
INSERT INTO kb_categories (id, name, slug, icon, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000009', 'Novedades', 'novedades', 'Sparkles', 0)
ON CONFLICT (slug) DO NOTHING;

-- Artículo: facturar por servicio
INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES
('a0000000-0000-0000-0000-000000000009',
 'Nuevo: Facturá por servicio (vuelo y hotel por separado)',
 'novedad-facturar-por-servicio',
 'Ahora podés emitir la factura de cada servicio de una operación por separado — por ejemplo, primero el vuelo y después el hotel.',
 1,
 '## Nuevo: Facturá por servicio 🧾

*Julio 2026*

Escuchamos un pedido muy común de las agencias que facturan un viaje **en varios momentos** (por ejemplo, primero el vuelo y después el hotel). ¡Ya está disponible!

### Qué cambia

Cuando vas a **Nueva Factura** y elegís una operación que tiene **varios servicios** (vuelo, hotel, etc.), ahora aparece un selector **"Servicio a facturar"**. Podés elegir:

- **Venta completa** — factura el total de la operación (como hasta ahora).
- **Un servicio puntual** — por ejemplo *Aéreo* o *Hotel*, para facturar solo esa parte.

Así podés emitir la factura del vuelo hoy y la del hotel más adelante, sin tener que facturar todo junto.

### Cómo usarlo

1. Andá a **Operaciones > Facturación > Nueva Factura**.
2. Seleccioná el cliente y la operación.
3. En la sección de conceptos, usá el selector **"Servicio a facturar"** y elegí el servicio que querés facturar.
4. Revisá el importe, ajustalo si hace falta y **Autorizá**.

> **Importante:** como la venta se carga a nivel operación (un total), al elegir un servicio el importe que se propone es un **estimado editable** (reparte la venta según el costo de cada servicio). Si no coincide con lo que cobraste por esa parte, simplemente ajustá el monto antes de autorizar.

### Además: ahora podés eliminar borradores 🗑️

En la lista de **Facturación Electrónica**, las facturas en estado **Borrador** tienen un botón para eliminarlas. Las facturas ya **autorizadas** (con CAE) no se pueden borrar — esas son comprobantes legales y se revierten con una Nota de Crédito.
')
ON CONFLICT (slug) DO NOTHING;
