-- ============================================================
-- Knowledge Base para Centro de Ayuda de Vibook
-- Tablas: kb_categories, kb_articles
-- RPC: search_kb_articles
-- Seed: ~25 artículos con contenido real
-- ============================================================

-- ─── Tablas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT 'BookOpen',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES kb_categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL,
  summary text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Índices ─────────────────────────────────────────────────

CREATE INDEX idx_kb_articles_category ON kb_articles(category_id);
CREATE INDEX idx_kb_articles_slug ON kb_articles(slug);
CREATE INDEX idx_kb_articles_published ON kb_articles(published) WHERE published = true;
CREATE INDEX idx_kb_articles_fts ON kb_articles
  USING gin(to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(content,'')));

-- ─── Trigger updated_at ─────────────────────────────────────

CREATE OR REPLACE FUNCTION update_kb_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kb_articles_updated_at
  BEFORE UPDATE ON kb_articles
  FOR EACH ROW EXECUTE FUNCTION update_kb_articles_updated_at();

-- ─── RPC de búsqueda FTS ────────────────────────────────────

CREATE OR REPLACE FUNCTION search_kb_articles(search_query text)
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  summary text,
  category_name text,
  category_slug text,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.slug,
    a.summary,
    c.name AS category_name,
    c.slug AS category_slug,
    ts_rank(
      to_tsvector('spanish', coalesce(a.title,'') || ' ' || coalesce(a.content,'')),
      plainto_tsquery('spanish', search_query)
    ) AS rank
  FROM kb_articles a
  JOIN kb_categories c ON c.id = a.category_id
  WHERE a.published = true
    AND to_tsvector('spanish', coalesce(a.title,'') || ' ' || coalesce(a.content,''))
        @@ plainto_tsquery('spanish', search_query)
  ORDER BY rank DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── RLS ─────────────────────────────────────────────────────
-- Artículos son globales (visibles para todos los autenticados).
-- No se necesita RLS per-tenant todavía.

ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_categories_read" ON kb_categories
  FOR SELECT USING (true);

CREATE POLICY "kb_articles_read" ON kb_articles
  FOR SELECT USING (published = true);

-- Solo SUPER_ADMIN puede escribir (futuro CMS)
CREATE POLICY "kb_categories_admin_write" ON kb_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'SUPER_ADMIN')
  );

CREATE POLICY "kb_articles_admin_write" ON kb_articles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'SUPER_ADMIN')
  );

-- ═════════════════════════════════════════════════════════════
-- SEED: Categorías + Artículos
-- ═════════════════════════════════════════════════════════════

-- ─── Categorías ──────────────────────────────────────────────

INSERT INTO kb_categories (id, name, slug, icon, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Operaciones', 'operaciones', 'Plane', 1),
  ('a0000000-0000-0000-0000-000000000002', 'Pagos y Cobranzas', 'pagos', 'DollarSign', 2),
  ('a0000000-0000-0000-0000-000000000003', 'Clientes', 'clientes', 'Users', 3),
  ('a0000000-0000-0000-0000-000000000004', 'CRM y Ventas', 'crm-ventas', 'ShoppingCart', 4),
  ('a0000000-0000-0000-0000-000000000005', 'Finanzas y Caja', 'finanzas', 'Calculator', 5),
  ('a0000000-0000-0000-0000-000000000006', 'Contabilidad', 'contabilidad', 'BarChart3', 6),
  ('a0000000-0000-0000-0000-000000000007', 'Configuración', 'configuracion', 'Settings', 7),
  ('a0000000-0000-0000-0000-000000000008', 'Alertas y Notificaciones', 'alertas', 'Bell', 8);

-- ─── Artículos ───────────────────────────────────────────────

-- == OPERACIONES ==

INSERT INTO kb_articles (category_id, title, slug, summary, sort_order, content) VALUES

('a0000000-0000-0000-0000-000000000001',
 'Crear una operación',
 'crear-operacion',
 'Paso a paso para crear una nueva operación de viaje en el sistema.',
 1,
 '## Crear una operación

Una operación (también llamada "file") es el registro central de un viaje vendido. Desde acá se cargan los servicios, pagos, y toda la gestión.

### Pasos

1. Andá a **Operaciones** en el menú lateral.
2. Hacé click en el botón **+ Nueva operación** arriba a la derecha.
3. Completá los datos requeridos:
   - **Cliente**: buscá por nombre o DNI. Si no existe, podés crearlo desde ahí.
   - **Destino**: seleccioná el destino del viaje.
   - **Operador/Proveedor**: el operador mayorista que provee el servicio.
   - **Fechas de salida y regreso**.
   - **Monto de venta**: el precio total que le cobrás al cliente (en la moneda que corresponda).
   - **Costo operador**: lo que te cobra el mayorista.
4. Hacé click en **Guardar**.

### Importante

- El **margen** se calcula automáticamente (venta - costo).
- Si hay un vendedor secundario, asignalo en el campo correspondiente para que se repartan las comisiones.
- La operación se crea en estado **PENDIENTE**. Cambiá el estado a medida que avanza el proceso.
'),

('a0000000-0000-0000-0000-000000000001',
 'Estados de una operación',
 'estados-operacion',
 'Qué significa cada estado y cuándo cambiarlo.',
 2,
 '## Estados de una operación

Cada operación pasa por distintos estados que reflejan su progreso:

| Estado | Significado |
|--------|-------------|
| **PENDIENTE** | Recién creada, sin confirmar |
| **CONFIRMADA** | El viaje fue confirmado con el operador |
| **EN CURSO** | El pasajero ya está viajando |
| **CERRADA** | Viaje completado, todo liquidado |
| **CANCELADA** | Se canceló la operación |

### Cómo cambiar el estado

1. Abrí la operación haciendo click en ella.
2. En la parte superior vas a ver el estado actual con un dropdown.
3. Seleccioná el nuevo estado.
4. El sistema te va a pedir confirmación si el cambio tiene impacto financiero (ej: cerrar calcula comisiones).

### Notas

- Al pasar a **CONFIRMADA** se habilita el cálculo de comisiones.
- Al **CERRAR** la operación se generan automáticamente los registros de comisiones.
- Una operación **CANCELADA** no se puede reabrir.
'),

('a0000000-0000-0000-0000-000000000001',
 'Agregar servicios a una operación',
 'agregar-servicios-operacion',
 'Cómo cargar vuelos, hoteles, y otros servicios dentro de una operación.',
 3,
 '## Agregar servicios a una operación

Dentro de cada operación podés detallar los servicios incluidos (vuelos, hoteles, traslados, seguros, etc.).

### Pasos

1. Abrí la operación.
2. Buscá la sección **Servicios**.
3. Hacé click en **+ Agregar servicio**.
4. Completá:
   - **Tipo de servicio**: aéreo, hotel, traslado, seguro, excursión, otro.
   - **Descripción**: detalle libre (ej: "Buenos Aires - Cancún ida y vuelta").
   - **Fechas**: desde/hasta del servicio.
   - **Monto**: costo del servicio individual.
5. Guardá.

### Tips

- Los servicios son informativos — el monto total de la operación se maneja a nivel operación, no como suma de servicios.
- Podés agregar tantos servicios como necesites.
- Cada servicio se puede editar o eliminar individualmente.
'),

('a0000000-0000-0000-0000-000000000001',
 'Buscar y filtrar operaciones',
 'buscar-filtrar-operaciones',
 'Cómo encontrar operaciones usando los filtros y la búsqueda.',
 4,
 '## Buscar y filtrar operaciones

La lista de operaciones tiene herramientas para encontrar rápidamente lo que buscás.

### Búsqueda rápida

Usá la barra de búsqueda en la parte superior para buscar por:
- Número de file
- Nombre del cliente
- Destino

### Filtros disponibles

- **Estado**: Pendiente, Confirmada, En Curso, Cerrada, Cancelada.
- **Fecha**: elegí el tipo de fecha (creación, salida, regreso) y el rango Desde/Hasta.
- **Vendedor**: filtrá por el vendedor asignado.
- **Operador**: filtrá por proveedor.
- **Agencia**: si hay múltiples agencias, filtrá por agencia.

### Ordenamiento

Hacé click en el encabezado de cualquier columna para ordenar ascendente o descendente.
'),

-- == PAGOS Y COBRANZAS ==

('a0000000-0000-0000-0000-000000000002',
 'Registrar un cobro al cliente',
 'registrar-cobro',
 'Cómo registrar que un cliente pagó parcial o totalmente.',
 1,
 '## Registrar un cobro al cliente

Cuando un cliente te paga (transferencia, efectivo, tarjeta, etc.), registralo así:

### Pasos

1. Abrí la operación del cliente.
2. Andá a la pestaña **Pagos**.
3. Hacé click en **+ Nuevo cobro**.
4. Completá:
   - **Monto**: cuánto pagó.
   - **Moneda**: ARS o USD.
   - **Forma de pago**: efectivo, transferencia, tarjeta de crédito, cheque, etc.
   - **Cuenta financiera**: a qué cuenta ingresa el dinero (ej: "Banco Galicia", "Caja efectivo").
   - **Fecha de cobro**: cuándo se recibió el pago.
   - **Notas** (opcional): cualquier detalle relevante.
5. Hacé click en **Guardar**.

### Qué pasa después

- El pago aparece en la lista de cobros de la operación.
- Se actualiza el **saldo pendiente** del cliente.
- Se genera automáticamente un **movimiento de caja** en la cuenta seleccionada.
- Se crea un **asiento contable** en el libro mayor.
'),

('a0000000-0000-0000-0000-000000000002',
 'Asignar un pago a una operación',
 'asignar-pago-operacion',
 'Cómo vincular un pago que ya existe con una operación.',
 2,
 '## Asignar un pago a una operación

Si recibiste un pago que todavía no está vinculado a una operación (por ejemplo, un anticipo o un pago genérico), podés asignarlo.

### Pasos

1. Andá a **Finanzas > Caja y Bancos**.
2. Buscá el movimiento de pago que querés asignar.
3. Hacé click en los tres puntos (**...**) a la derecha y seleccioná **Asignar a operación**.
4. Buscá la operación por número de file o nombre del cliente.
5. Confirmá la asignación.

### También desde la operación

1. Abrí la operación.
2. En la pestaña **Pagos**, hacé click en **Vincular pago existente**.
3. Se muestran los pagos sin asignar. Seleccioná el que corresponda.

### Nota

Un pago solo puede estar asignado a una operación a la vez.
'),

('a0000000-0000-0000-0000-000000000002',
 'Registrar un pago al operador',
 'pago-operador',
 'Cómo registrar los pagos que le hacés al proveedor/operador.',
 3,
 '## Registrar un pago al operador

Cuando le pagás a un operador/mayorista por una operación:

### Pasos

1. Abrí la operación.
2. Andá a la pestaña **Pagos al operador**.
3. Hacé click en **+ Nuevo pago**.
4. Completá:
   - **Monto**: cuánto pagaste.
   - **Moneda**: ARS o USD.
   - **Forma de pago**: transferencia, efectivo, etc.
   - **Cuenta financiera**: de qué cuenta salió el dinero.
   - **Fecha de pago**.
   - **Número de factura** (opcional): referencia de la factura del operador.
5. Guardá.

### Importante

- Los pagos al operador descuentan del **saldo con el operador**.
- Se genera el movimiento de caja y asiento contable correspondiente.
- Podés ver el estado de cuenta con cada operador en **Operadores > [nombre] > Estado de cuenta**.
'),

-- == CLIENTES ==

('a0000000-0000-0000-0000-000000000003',
 'Crear un cliente',
 'crear-cliente',
 'Cómo dar de alta un nuevo cliente en el sistema.',
 1,
 '## Crear un cliente

### Pasos

1. Andá a **Clientes** en el menú lateral.
2. Hacé click en **+ Nuevo cliente**.
3. Completá los datos:
   - **Nombre y Apellido** (obligatorio).
   - **DNI/Pasaporte**: tipo de documento y número.
   - **Teléfono**: con código de área.
   - **Email**.
   - **Fecha de nacimiento**.
   - **Nacionalidad**.
   - **Instagram** (opcional): útil para identificar leads del CRM.
4. Hacé click en **Guardar**.

### Tips

- Si el cliente ya existe (mismo DNI), el sistema te avisa para no duplicar.
- Podés crear un cliente también desde el formulario de nueva operación — no necesitás ir a Clientes primero.
- Los datos del cliente se pueden editar en cualquier momento.
'),

('a0000000-0000-0000-0000-000000000003',
 'Buscar un cliente',
 'buscar-cliente',
 'Cómo encontrar un cliente por nombre, DNI, o teléfono.',
 2,
 '## Buscar un cliente

### Búsqueda rápida (Cmd+K)

Desde cualquier pantalla, presioná **Cmd+K** (o Ctrl+K en Windows) para abrir la búsqueda global. Escribí el nombre del cliente y te aparece directo.

### Desde la lista de Clientes

1. Andá a **Clientes**.
2. Usá la barra de búsqueda arriba.
3. Podés buscar por:
   - Nombre o apellido
   - Número de DNI/pasaporte
   - Teléfono
   - Email

### Desde una operación

Cuando estás creando o editando una operación, el campo de cliente tiene un buscador integrado que busca mientras escribís.
'),

('a0000000-0000-0000-0000-000000000003',
 'Subir documentos de un cliente',
 'subir-documentos-cliente',
 'Cómo cargar pasaporte, DNI, o visa de un cliente y usar el OCR automático.',
 3,
 '## Subir documentos de un cliente

Vibook puede escanear automáticamente pasaportes y DNIs para extraer los datos del cliente.

### Pasos

1. Abrí la ficha del cliente.
2. Andá a la sección **Documentos**.
3. Hacé click en **Subir documento**.
4. Seleccioná la foto o scan del documento (JPG, PNG, PDF).
5. El sistema procesa el documento con **OCR automático** y extrae:
   - Nombre completo
   - Número de documento
   - Fecha de nacimiento
   - Fecha de vencimiento
   - Nacionalidad
6. Revisá los datos extraídos y confirmá.

### Importante

- La calidad de la foto afecta la precisión del OCR. Usá fotos nítidas y bien iluminadas.
- Siempre revisá los datos extraídos antes de confirmar — el OCR no es perfecto.
- Los documentos quedan almacenados en la ficha del cliente.
'),

-- == CRM Y VENTAS ==

('a0000000-0000-0000-0000-000000000004',
 'Gestionar leads en el CRM',
 'gestionar-leads-crm',
 'Cómo usar el tablero Kanban para gestionar consultas de clientes potenciales.',
 1,
 '## Gestionar leads en el CRM

El CRM de Vibook muestra todas las consultas en un tablero tipo Kanban.

### Cómo funciona

- Cada **tarjeta** es un lead (consulta de un potencial cliente).
- Las **columnas** representan estados: Nuevo, En Proceso, Cotizado, Ganado, Perdido.
- Arrastrá las tarjetas de una columna a otra para cambiar el estado.

### Información de cada lead

- Nombre del contacto
- Teléfono y email
- Destino de interés
- Fuente (Instagram, WhatsApp, Meta Ads, etc.)
- Vendedor asignado
- Notas

### Acciones rápidas

- **Click en la tarjeta**: abre el detalle del lead.
- **Convertir a operación**: cuando el lead se confirma, convertilo directamente en operación. Los datos se transfieren automáticamente.

### Filtros

Podés filtrar leads por vendedor, destino, fuente, y fecha.
'),

('a0000000-0000-0000-0000-000000000004',
 'Convertir un lead en operación',
 'convertir-lead-operacion',
 'Cómo transformar una consulta ganada en una operación de viaje.',
 2,
 '## Convertir un lead en operación

Cuando un lead confirma el viaje, convertilo en operación para arrancar la gestión.

### Pasos

1. Abrí el lead desde el CRM.
2. Hacé click en **Convertir a operación**.
3. El sistema pre-llena los datos con la información del lead:
   - Datos del cliente (si ya existía, lo vincula; si no, lo crea).
   - Destino.
   - Vendedor asignado.
4. Completá los datos faltantes (operador, montos, fechas).
5. Confirmá.

### Qué pasa después

- El lead pasa automáticamente a estado **GANADO**.
- Se crea la operación nueva con los datos del lead.
- Si el lead tenía un depósito/seña, el movimiento se transfiere a la operación.
'),

-- == FINANZAS ==

('a0000000-0000-0000-0000-000000000005',
 'Ver el estado de caja',
 'estado-caja',
 'Cómo consultar el saldo actual de cada cuenta y los movimientos recientes.',
 1,
 '## Ver el estado de caja

### Pasos

1. Andá a **Finanzas > Caja y Bancos** en el menú lateral.
2. Arriba vas a ver los **saldos de cada cuenta financiera** (bancos, caja efectivo, etc.).
3. Abajo está la lista de **movimientos recientes**.

### Filtros

- **Cuenta**: filtrá por cuenta específica.
- **Tipo de fecha**: elegí si filtrás por fecha de creación, de cobro, de pago, etc.
- **Rango de fechas**: Desde/Hasta.
- **Tipo de movimiento**: ingreso o egreso.

### Exportar

Podés exportar los movimientos a Excel desde el botón de descarga.

### Importante

- Los saldos se actualizan en tiempo real cuando se registran pagos.
- Los movimientos se crean automáticamente al registrar cobros o pagos. No necesitás cargarlos manualmente.
'),

('a0000000-0000-0000-0000-000000000005',
 'Crear una cuenta financiera',
 'crear-cuenta-financiera',
 'Cómo agregar una nueva cuenta bancaria, caja, o billetera virtual.',
 2,
 '## Crear una cuenta financiera

Las cuentas financieras representan dónde guardás el dinero: bancos, caja efectivo, Mercado Pago, etc.

### Pasos

1. Andá a **Finanzas > Configuración**.
2. Hacé click en **+ Nueva cuenta**.
3. Completá:
   - **Nombre**: un nombre descriptivo (ej: "Banco Galicia CTA CTE", "Caja USD").
   - **Tipo**: Banco, Efectivo, Billetera virtual.
   - **Moneda**: ARS o USD.
   - **Saldo inicial** (opcional): si la cuenta ya tiene saldo al empezar a usar Vibook.
4. Guardá.

### Tips

- Creá cuentas separadas por moneda (ej: "Caja ARS" y "Caja USD").
- El nombre es libre — ponele algo que tu equipo identifique fácil.
- Las cuentas se pueden desactivar pero no eliminar (para no perder historial).
'),

('a0000000-0000-0000-0000-000000000005',
 'Registrar un movimiento de caja manual',
 'movimiento-caja-manual',
 'Cómo cargar un ingreso o egreso que no está vinculado a una operación.',
 3,
 '## Registrar un movimiento de caja manual

Para gastos operativos, retiros, transferencias entre cuentas, u otros movimientos que no corresponden a una operación.

### Pasos

1. Andá a **Finanzas > Caja y Bancos**.
2. Hacé click en **+ Nuevo movimiento**.
3. Completá:
   - **Tipo**: Ingreso o Egreso.
   - **Cuenta**: a cuál cuenta afecta.
   - **Monto y moneda**.
   - **Concepto**: descripción del movimiento (ej: "Alquiler oficina", "Retiro socio").
   - **Fecha**.
4. Guardá.

### Nota

Los movimientos manuales también generan asientos contables automáticos.
'),

-- == CONTABILIDAD ==

('a0000000-0000-0000-0000-000000000006',
 'Ver el libro mayor',
 'libro-mayor',
 'Cómo consultar los asientos contables del sistema.',
 1,
 '## Ver el libro mayor

El libro mayor registra todos los asientos contables del sistema con partida doble.

### Pasos

1. Andá a **Finanzas > Contabilidad**.
2. Vas a ver la lista de **asientos contables** (movimientos del libro).
3. Cada asiento tiene:
   - Fecha
   - Descripción
   - Cuenta deudora y acreedora
   - Monto

### Filtros

- **Rango de fechas**.
- **Cuenta contable**: filtrá por cuenta específica del plan de cuentas.
- **Tipo de movimiento**.

### Importante

- Los asientos se crean **automáticamente** cuando registrás cobros, pagos, o movimientos de caja.
- No necesitás crear asientos manualmente para la operatoria normal.
- El sistema garantiza que siempre hay un débito y un crédito por cada movimiento.
'),

('a0000000-0000-0000-0000-000000000006',
 'Generar el Libro IVA Digital',
 'libro-iva-digital',
 'Cómo generar los archivos TXT para presentar el Libro IVA Digital en AFIP.',
 2,
 '## Generar el Libro IVA Digital

Vibook genera los archivos TXT en el formato oficial de AFIP (RG 4597) para el Libro IVA Digital.

### Pasos

1. Andá a **Finanzas > Impuestos**.
2. Seleccioná el **período** (mes y año).
3. Revisá los comprobantes del período:
   - IVA Ventas: facturas emitidas.
   - IVA Compras: facturas de proveedores cargadas.
4. Hacé click en **Generar TXT**.
5. Se descargan los archivos en el formato que AFIP requiere.

### Importante

- Revisá que todos los comprobantes del período estén cargados antes de generar.
- Los archivos generados se pueden subir directamente al sitio de AFIP.
- Si necesitás corregir algo, editá los comprobantes y volvé a generar.
'),

-- == CONFIGURACION ==

('a0000000-0000-0000-0000-000000000007',
 'Gestionar usuarios y roles',
 'usuarios-roles',
 'Cómo agregar usuarios al sistema y asignarles permisos.',
 1,
 '## Gestionar usuarios y roles

### Roles disponibles

| Rol | Acceso |
|-----|--------|
| **Super Admin** | Todo el sistema, configuración, y administración |
| **Admin** | Operaciones, finanzas, y gestión diaria |
| **Contable** | Contabilidad, IVA, reportes financieros |
| **Vendedor** | Solo sus propios leads, operaciones, y comisiones |
| **Viewer** | Solo lectura en todo el sistema |

### Invitar un nuevo usuario

1. Andá a **Configuración > Usuarios**.
2. Hacé click en **Invitar usuario**.
3. Ingresá el **email** de la persona.
4. Seleccioná el **rol**.
5. Seleccioná la **agencia** a la que pertenece.
6. Enviá la invitación.

El usuario recibe un email con un link para crear su contraseña y acceder.

### Cambiar el rol de un usuario

1. En la lista de usuarios, hacé click en el usuario.
2. Cambiá el rol desde el dropdown.
3. Los cambios se aplican inmediatamente.
'),

('a0000000-0000-0000-0000-000000000007',
 'Configurar la integración con Trello',
 'configurar-trello',
 'Cómo conectar Vibook con Trello para sincronizar leads automáticamente.',
 2,
 '## Configurar la integración con Trello

Vibook puede sincronizar leads bidireccionalmente con un tablero de Trello.

### Pasos de configuración

1. Andá a **Configuración > Integraciones > Trello**.
2. Hacé click en **Conectar con Trello**.
3. Autorizá a Vibook a acceder a tu cuenta de Trello.
4. Seleccioná el **tablero** que querés sincronizar.
5. Mapeá las **listas de Trello** con los estados de lead en Vibook:
   - Ej: Lista "Nuevos" → Estado "Nuevo"
   - Ej: Lista "Cotizados" → Estado "Cotizado"
6. Guardá la configuración.

### Cómo funciona la sincronización

- Cuando se crea una tarjeta nueva en Trello → se crea un lead en Vibook.
- Cuando se mueve una tarjeta entre listas en Trello → se actualiza el estado del lead.
- Cuando se cambia un lead en Vibook → se actualiza la tarjeta en Trello.
- La sincronización es en **tiempo real** via webhooks.
'),

('a0000000-0000-0000-0000-000000000007',
 'Personalizar la marca (logo y nombre)',
 'personalizar-marca',
 'Cómo cambiar el logo y nombre de tu agencia en el sistema.',
 3,
 '## Personalizar la marca

Podés personalizar Vibook con el logo y nombre de tu agencia.

### Pasos

1. Andá a **Configuración > Organización**.
2. Subí tu **logo** (recomendado: PNG o SVG, fondo transparente).
3. Editá el **nombre de la empresa** que aparece en la barra lateral.
4. Guardá.

### Dónde se refleja

- Barra lateral del sistema.
- Cotizaciones y documentos que se generan.
- Emails que se envían a clientes.
'),

-- == ALERTAS ==

('a0000000-0000-0000-0000-000000000008',
 'Entender las alertas automáticas',
 'alertas-automaticas',
 'Qué alertas genera el sistema automáticamente y cómo gestionarlas.',
 1,
 '## Alertas automáticas

Vibook genera alertas automáticas para que no se te pase nada importante.

### Tipos de alertas

| Alerta | Cuándo se genera |
|--------|-----------------|
| **Cobro pendiente** | Cuando un cliente tiene saldo por pagar y se acerca la fecha de viaje |
| **Pago a operador** | Cuando hay pagos pendientes al proveedor |
| **Viaje próximo** | 48-72 horas antes de la fecha de salida |
| **Documentación faltante** | Si un pasajero no tiene DNI/pasaporte cargado |
| **Vencimiento IVA** | Cuando se acerca la fecha de presentación del IVA |

### Ver las alertas

1. Hacé click en la **campanita** arriba a la derecha.
2. Se muestra la lista de alertas pendientes.
3. Hacé click en cualquier alerta para ir directamente al item relacionado.

### Marcar como resuelta

- Hacé click en la **X** o en **Resolver** para descartar la alerta.
- Las alertas resueltas no vuelven a aparecer para el mismo item.
'),

('a0000000-0000-0000-0000-000000000008',
 'Configurar notificaciones push',
 'notificaciones-push',
 'Cómo activar las notificaciones del navegador para recibir alertas en tiempo real.',
 2,
 '## Configurar notificaciones push

Podés recibir notificaciones del navegador para alertas importantes.

### Activar

1. Cuando entres a Vibook, el navegador te va a preguntar si querés permitir notificaciones.
2. Hacé click en **Permitir**.
3. Listo — vas a recibir notificaciones aunque tengas otra pestaña abierta.

### Si no te aparece el pedido de permiso

1. Hacé click en el candado o icono de info en la barra de direcciones del navegador.
2. Buscá **Notificaciones** y cambialo a **Permitir**.
3. Recargá la página.

### Qué notificaciones se envían

- Nuevos leads asignados a vos.
- Pagos recibidos.
- Alertas de vencimiento.
- Tareas asignadas.
'),

-- Artículo bonus: Atajos de teclado

('a0000000-0000-0000-0000-000000000007',
 'Atajos de teclado',
 'atajos-teclado',
 'Los atajos de teclado más útiles para trabajar más rápido en Vibook.',
 10,
 '## Atajos de teclado

Vibook tiene atajos de teclado para las acciones más comunes.

| Atajo | Acción |
|-------|--------|
| **Cmd+K** (Mac) / **Ctrl+K** (Windows) | Búsqueda global — buscá clientes, operaciones, operadores |
| **Esc** | Cerrar diálogos y paneles |

### Búsqueda global (Cmd+K)

La búsqueda global es la forma más rápida de encontrar cualquier cosa:
1. Presioná **Cmd+K**.
2. Escribí lo que buscás (nombre de cliente, número de file, operador).
3. Seleccioná el resultado con las flechas del teclado y **Enter**.
4. Te lleva directo a la ficha.

### Tip

Acostumbrate a usar Cmd+K — es mucho más rápido que navegar por los menús.
'),

-- Artículo bonus: Comisiones

('a0000000-0000-0000-0000-000000000005',
 'Cómo funcionan las comisiones',
 'comisiones',
 'Cómo se calculan y liquidan las comisiones de los vendedores.',
 10,
 '## Cómo funcionan las comisiones

Las comisiones se calculan automáticamente cuando una operación pasa a estado CONFIRMADA o CERRADA.

### Fórmula

```
Margen = Monto de venta - Costo del operador
Comisión = Margen × Porcentaje de comisión del vendedor
```

### Porcentaje de comisión

- Cada vendedor tiene un porcentaje de comisión configurado en su perfil.
- El porcentaje se puede modificar en **Configuración > Usuarios > [vendedor]**.

### Vendedor secundario

Si una operación tiene dos vendedores, la comisión se reparte según los porcentajes configurados.

### Ver las comisiones

- **Vendedores**: cada vendedor puede ver sus comisiones en **Mi cuenta > Comisiones**.
- **Admins**: pueden ver todas las comisiones en **Finanzas > Comisiones**.

### Liquidar comisiones

1. Andá a **Finanzas > Comisiones**.
2. Seleccioná las comisiones a liquidar.
3. Hacé click en **Liquidar**.
4. Se genera el pago y el asiento contable correspondiente.
');
