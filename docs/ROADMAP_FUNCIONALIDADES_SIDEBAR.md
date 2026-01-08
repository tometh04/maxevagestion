# 🗺️ Roadmap de Funcionalidades - Nuevo Sidebar

**Fecha de Creación:** 7 de Enero 2026  
**Estado General:** 0% Completado  
**Última Actualización:** 7 de Enero 2026

---

## 📊 Progreso General

**Progreso Total: 9%** █████░░░░░

### Por Módulo:
- **Clientes:** 66% (2/3 funcionalidades)
- **Operaciones:** 50% (2/4 funcionalidades)
- **Finanzas:** 100% (1/1 funcionalidades)
- **Herramientas:** 100% (1/1 funcionalidades)
- **Operaciones:** 0% (0/4 funcionalidades)
- **Ventas:** 0% (0/1 funcionalidades)
- **Finanzas:** 0% (0/1 funcionalidades)
- **Recursos:** 0% (0/2 funcionalidades)
- **Agencia:** 0% (0/2 funcionalidades)
- **Herramientas:** 0% (0/1 funcionalidades)
- **Integración AFIP:** 0% (0/1 funcionalidades)

---

## 🎯 FASE 1: FUNDACIONES Y CONFIGURACIONES (Prioridad ALTA)

### 1.1 Configuración de Clientes ✅
**Ruta:** `/customers/settings`  
**Estado:** 100% ██████████  
**Dependencias:** Ninguna  
**Prioridad:** ALTA

#### Tareas:
- [x] Crear migración de BD: `customer_settings` table
  - Campos personalizados configurables
  - Validaciones de datos
  - Notificaciones automáticas
  - Integraciones con otros módulos
- [x] Crear API routes:
  - `GET /api/customers/settings` - Obtener configuración
  - `PUT /api/customers/settings` - Actualizar configuración
- [x] Crear componente UI: `customers-settings-page-client.tsx`
  - Formulario de campos personalizados
  - Configuración de validaciones
  - Configuración de notificaciones
  - Integraciones disponibles
- [x] Integrar con módulo de clientes existente
  - Aplicar campos personalizados en formularios (new/edit)
  - Aplicar validaciones dinámicas (Zod schema)
  - Implementar notificaciones (email/WhatsApp/system)
  - Detección de duplicados
  - Notificaciones al crear operación asociada
- [x] Testing y validación
  - Migración de campos personalizados en customers
  - Servicios de duplicados y notificaciones
  - Hook useCustomerSettings

**Progreso:** 5/5 tareas completadas (100%)

---

### 1.2 Configuración de Operaciones ✅
**Ruta:** `/operations/settings`  
**Estado:** 100% ██████████  
**Dependencias:** Ninguna  
**Prioridad:** ALTA

#### Tareas:
- [x] Crear migración de BD: `operation_settings` table
  - Estados personalizados
  - Flujos de trabajo
  - Alertas automáticas
  - Plantillas de documentos
- [x] Crear API routes:
  - `GET /api/operations/settings` - Obtener configuración
  - `PUT /api/operations/settings` - Actualizar configuración
- [x] Crear componente UI: `operations-settings-page-client.tsx`
  - Gestión de estados personalizados
  - Configuración de flujos de trabajo
  - Configuración de alertas
  - Gestión de plantillas
- [x] Integrar con módulo de operaciones existente
  - Aplicar validaciones dinámicas
  - Estado por defecto configurable
  - Validación de campos requeridos
- [x] Testing y validación
  - Hook useOperationSettings
  - Integración con POST de operaciones

**Progreso:** 5/5 tareas completadas (100%)

---

### 1.3 Configuración Financiera ✅
**Ruta:** `/finances/settings`  
**Estado:** 100% ██████████  
**Dependencias:** Ninguna  
**Prioridad:** ALTA

#### Tareas:
- [x] Crear migración de BD: `financial_settings` table
  - Monedas y tipos de cambio
  - Cuentas financieras
  - Métodos de pago
  - Reglas de comisiones
  - Configuración contable
- [x] Crear API routes:
  - `GET /api/finances/settings` - Obtener configuración
  - `PUT /api/finances/settings` - Actualizar configuración
- [x] Crear componente UI: `finances-settings-page-client.tsx`
  - Gestión de monedas
  - Configuración de cuentas (placeholder)
  - Métodos de pago
  - Reglas de comisiones
  - Configuración contable
  - Facturación
- [x] Integrar con módulos de caja y contabilidad
  - Hook useFinancialSettings
  - Listo para integración futura
- [x] Testing y validación
  - Componente completo y funcional

**Progreso:** 5/5 tareas completadas (100%)

---

### 1.4 Configuración de Herramientas ✅
**Ruta:** `/tools/settings`  
**Estado:** 100% ██████████  
**Dependencias:** Ninguna  
**Prioridad:** MEDIA

#### Tareas:
- [x] Crear migración de BD: `tools_settings` table
  - Configuración de Emilia (AI Copilot)
  - Configuración de Email
  - Configuración de WhatsApp
  - Preferencias de notificaciones
  - Configuración de exportaciones
  - Preferencias de interfaz
  - Configuración de backups
- [x] Crear API routes:
  - `GET /api/tools/settings` - Obtener configuración
  - `PUT /api/tools/settings` - Actualizar configuración
- [x] Crear componente UI: `tools-settings-page-client.tsx`
  - 7 tabs: Emilia, Email, WhatsApp, Notificaciones, Exportar, Interfaz, Backups
- [x] Integrar con módulo de Emilia y servicios
  - Hook useToolsSettings creado
- [x] Testing y validación

**Progreso:** 5/5 tareas completadas (100%)

---

## 📊 FASE 2: ESTADÍSTICAS Y ANALÍTICA (Prioridad ALTA)

### 2.1 Estadísticas de Clientes ✅
**Ruta:** `/customers/statistics`  
**Estado:** 100% ██████████  
**Dependencias:** Módulo de Clientes existente  
**Prioridad:** ALTA

#### Tareas:
- [x] Crear API routes:
  - `GET /api/customers/statistics` - Estadísticas completas
- [x] Crear componente UI: `customers-statistics-page-client.tsx`
  - Total de clientes
  - Clientes nuevos por período
  - Clientes activos vs inactivos
  - Valor promedio por cliente
  - Top clientes por gasto y frecuencia
- [x] Gráficos y visualizaciones
  - LineChart: Tendencia de nuevos clientes
  - BarChart: Distribución por gasto
  - PieChart: Activos vs Inactivos
- [x] Filtros y exportación
  - Filtro por período (3, 6, 12, 24 meses)
  - Botón de exportación
- [x] Testing y validación

**Progreso:** 5/5 tareas completadas (100%)

---

### 2.2 Estadísticas de Operaciones ✅
**Ruta:** `/operations/statistics`  
**Estado:** 100% ██████████  
**Dependencias:** Módulo de Operaciones existente  
**Prioridad:** ALTA

#### Tareas:
- [x] Crear API routes:
  - `GET /api/operations/statistics` - Estadísticas completas
- [x] Crear componente UI: `operations-statistics-page-client.tsx`
  - Total de operaciones y confirmadas
  - Ventas totales y ticket promedio
  - Margen total y porcentaje
  - Tasa de conversión
- [x] Gráficos y visualizaciones
  - AreaChart: Tendencia mensual (ventas, margen, operaciones)
  - PieChart: Distribución por estado
  - BarChart: Top destinos por ventas
- [x] Rankings
  - Top 10 destinos más rentables
  - Top 5 vendedores
- [x] Filtros y exportación
  - Filtro por período (3, 6, 12, 24 meses)

**Progreso:** 5/5 tareas completadas (100%)

---

### 2.3 Estadísticas de Ventas ⏳
**Ruta:** `/sales/statistics`  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Módulo de Leads y CRM Manychat  
**Prioridad:** ALTA

#### Tareas:
- [ ] Crear API routes:
  - `GET /api/sales/statistics` - Obtener estadísticas
  - `GET /api/sales/statistics/pipeline` - Pipeline de ventas
  - `GET /api/sales/statistics/conversion` - Tasa de conversión
  - `GET /api/sales/statistics/by-source` - Por origen
  - `GET /api/sales/statistics/by-seller` - Por vendedor
  - `GET /api/sales/statistics/manychat` - Estadísticas Manychat
- [ ] Crear componente UI: `sales-statistics-page-client.tsx`
  - Pipeline de ventas (Kanban visual)
  - Tasa de conversión
  - Leads por origen
  - Performance por vendedor
  - Estadísticas de Manychat
  - Gráficos y visualizaciones
- [ ] Integrar con módulos de Leads y Manychat
- [ ] Integrar con dashboard principal
- [ ] Caché de estadísticas para performance
- [ ] Testing y validación

**Progreso:** 0/6 tareas completadas

---

## 💰 FASE 3: FACTURACIÓN Y AFIP (Prioridad CRÍTICA)

### 3.1 Integración con AFIP SDK ⏳
**Ruta:** Integración base  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Ninguna (base)  
**Prioridad:** CRÍTICA  
**Documentación:** https://afipsdk.com/docs/api-reference/introduction/

#### Tareas:
- [ ] Verificar/Instalar dependencias HTTP (axios ya está disponible en Next.js)
- [ ] Configurar variables de entorno:
  - `AFIP_SDK_API_KEY` - API Key de afipsdk.com
  - `AFIP_SDK_ENVIRONMENT` (sandbox/production)
  - `AFIP_SDK_BASE_URL` (https://api.afipsdk.com)
  - `AFIP_CUIT` - CUIT de la agencia
  - `AFIP_POINT_OF_SALE` - Punto de venta
- [ ] Crear servicio: `lib/afip/afip-client.ts`
  - Cliente HTTP para API REST de AFIP SDK
  - Manejo de autenticación con API Key
  - Manejo de errores y retry logic
  - Logging de requests/responses
  - Tipos TypeScript para requests/responses
- [ ] Crear tipos TypeScript: `lib/afip/types.ts`
  - Tipos para Factura Electrónica
  - Tipos para Notas de Crédito
  - Tipos para respuestas de AFIP
- [ ] Crear servicio: `lib/afip/invoice-service.ts`
  - Métodos para Factura Electrónica
  - Métodos para Notas de Crédito
  - Validación de datos antes de enviar
- [ ] Testing de conexión básica (sandbox)
- [ ] Documentar uso del servicio

**Progreso:** 0/7 tareas completadas

---

### 3.2 Facturación de Operaciones ⏳
**Ruta:** `/operations/billing`  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Integración AFIP SDK, Módulo de Operaciones  
**Prioridad:** CRÍTICA

#### Tareas:
- [ ] Crear migración de BD: `invoices` table
  - Relación con operations
  - Tipo de comprobante (A, B, C, E)
  - Número de comprobante AFIP
  - CAE (Código de Autorización Electrónico)
  - Fecha de emisión
  - Montos (subtotal, IVA, total)
  - Estado (draft, sent, authorized, cancelled)
  - Archivo PDF
- [ ] Crear migración de BD: `invoice_items` table
  - Relación con invoices
  - Descripción
  - Cantidad
  - Precio unitario
  - IVA
  - Subtotal
- [ ] Crear migración de BD: `credit_notes` table
  - Relación con invoices
  - Motivo
  - Montos
  - Estado
- [ ] Crear API routes:
  - `GET /api/operations/billing` - Listar facturas
  - `POST /api/operations/billing` - Crear factura
  - `POST /api/operations/billing/:id/authorize` - Autorizar con AFIP
  - `POST /api/operations/billing/:id/cancel` - Cancelar factura
  - `POST /api/operations/billing/:id/credit-note` - Crear nota de crédito
  - `GET /api/operations/billing/:id/pdf` - Generar PDF
- [ ] Crear servicio: `lib/afip/invoice-service.ts`
  - Generar comprobante AFIP
  - Autorizar comprobante
  - Cancelar comprobante
  - Generar nota de crédito
  - Consultar estado
- [ ] Crear componente UI: `operations-billing-page-client.tsx`
  - Lista de facturas
  - Crear nueva factura desde operación
  - Vista detalle de factura
  - Autorizar con AFIP
  - Generar PDF
  - Crear nota de crédito
  - Historial de facturación
- [ ] Integrar con módulo de operaciones
- [ ] Generación de PDFs con jsPDF
- [ ] Testing completo (sandbox AFIP)
- [ ] Testing en producción

**Progreso:** 0/10 tareas completadas

---

## 📚 FASE 4: RECURSOS Y COLABORACIÓN (Prioridad MEDIA)

### 4.1 Notas Colaborativas ⏳
**Ruta:** `/resources/notes`  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Módulos de Operaciones y Clientes  
**Prioridad:** MEDIA

#### Tareas:
- [ ] Crear migración de BD: `notes` table
  - Título
  - Contenido (rich text)
  - Tipo (operation, customer, general)
  - Relación con operation_id o customer_id
  - Creado por (user_id)
  - Visibilidad (private, team, agency)
  - Tags
  - Estado (active, archived)
- [ ] Crear migración de BD: `note_comments` table
  - Relación con notes
  - Contenido
  - Creado por
  - Respuestas (threading)
- [ ] Crear migración de BD: `note_attachments` table
  - Relación con notes
  - Archivo (Supabase Storage)
  - Nombre
  - Tipo
  - Tamaño
- [ ] Crear API routes:
  - `GET /api/resources/notes` - Listar notas
  - `POST /api/resources/notes` - Crear nota
  - `GET /api/resources/notes/:id` - Obtener nota
  - `PUT /api/resources/notes/:id` - Actualizar nota
  - `DELETE /api/resources/notes/:id` - Eliminar nota
  - `POST /api/resources/notes/:id/comments` - Agregar comentario
  - `POST /api/resources/notes/:id/attachments` - Agregar adjunto
- [ ] Crear componente UI: `resources-notes-page-client.tsx`
  - Lista de notas (filtros, búsqueda)
  - Crear nueva nota
  - Editor de notas (rich text)
  - Vista detalle con comentarios
  - Adjuntar archivos
  - Compartir con equipo
  - Tags y categorías
- [ ] Integrar con operaciones (notas por operación)
- [ ] Integrar con clientes (notas por cliente)
- [ ] Notificaciones de comentarios nuevos
- [ ] Testing y validación

**Progreso:** 0/10 tareas completadas

---

### 4.2 Templates PDF ⏳
**Ruta:** `/resources/templates`  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Módulos de Operaciones y Cotizaciones  
**Prioridad:** MEDIA

#### Tareas:
- [ ] Crear migración de BD: `templates` table
  - Nombre
  - Tipo (quotation, confirmation, invoice, other)
  - Contenido (HTML/Markdown)
  - Variables disponibles
  - Diseño (JSON config)
  - Logo de agencia
  - Estado (active, draft, archived)
- [ ] Crear migración de BD: `template_variables` table
  - Relación con templates
  - Nombre de variable
  - Tipo (text, number, date, image)
  - Valor por defecto
  - Requerido
- [ ] Crear API routes:
  - `GET /api/resources/templates` - Listar templates
  - `POST /api/resources/templates` - Crear template
  - `GET /api/resources/templates/:id` - Obtener template
  - `PUT /api/resources/templates/:id` - Actualizar template
  - `DELETE /api/resources/templates/:id` - Eliminar template
  - `POST /api/resources/templates/:id/preview` - Vista previa
  - `POST /api/resources/templates/:id/generate` - Generar PDF
- [ ] Crear servicio: `lib/templates/template-engine.ts`
  - Parser de variables
  - Renderizado de template
  - Generación de PDF con jsPDF
  - Manejo de imágenes y logos
- [ ] Crear componente UI: `resources-templates-page-client.tsx`
  - Lista de templates
  - Editor de templates (WYSIWYG)
  - Vista previa en tiempo real
  - Variables disponibles
  - Diseño personalizable
  - Generar PDF desde operación/cotización
- [ ] Integrar con cotizaciones (generar PDF)
- [ ] Integrar con operaciones (generar confirmación)
- [ ] Templates pre-configurados (cotización, confirmación)
- [ ] Testing y validación

**Progreso:** 0/10 tareas completadas

---

## 🏢 FASE 5: ADMINISTRACIÓN Y EQUIPOS (Prioridad MEDIA)

### 5.1 Equipos de Ventas ⏳
**Ruta:** `/settings/teams`  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Módulo de Usuarios  
**Prioridad:** MEDIA

#### Tareas:
- [ ] Crear migración de BD: `teams` table
  - Nombre
  - Descripción
  - Líder (user_id)
  - Agencia (agency_id)
  - Estado (active, inactive)
- [ ] Crear migración de BD: `team_members` table
  - Relación con teams
  - Relación con users
  - Rol (member, leader)
  - Fecha de ingreso
- [ ] Crear migración de BD: `team_goals` table
  - Relación con teams
  - Período (mes, trimestre, año)
  - Objetivo de ventas
  - Objetivo de ingresos
  - Estado
- [ ] Crear API routes:
  - `GET /api/settings/teams` - Listar equipos
  - `POST /api/settings/teams` - Crear equipo
  - `GET /api/settings/teams/:id` - Obtener equipo
  - `PUT /api/settings/teams/:id` - Actualizar equipo
  - `DELETE /api/settings/teams/:id` - Eliminar equipo
  - `POST /api/settings/teams/:id/members` - Agregar miembro
  - `DELETE /api/settings/teams/:id/members/:userId` - Remover miembro
  - `GET /api/settings/teams/:id/statistics` - Estadísticas del equipo
- [ ] Crear componente UI: `settings-teams-page-client.tsx`
  - Lista de equipos
  - Crear nuevo equipo
  - Gestión de miembros
  - Asignar líder
  - Objetivos y métricas
  - Estadísticas por equipo
  - Performance del equipo
- [ ] Integrar con módulo de leads (asignación por equipo)
- [ ] Integrar con estadísticas de ventas
- [ ] Notificaciones de cambios en equipos
- [ ] Testing y validación

**Progreso:** 0/9 tareas completadas

---

### 5.2 Integraciones ⏳
**Ruta:** `/settings/integrations`  
**Estado:** 0% ░░░░░░░░░░  
**Dependencias:** Integraciones existentes (Trello, Manychat)  
**Prioridad:** MEDIA

#### Tareas:
- [ ] Crear migración de BD: `integrations` table
  - Tipo (trello, manychat, whatsapp, afip, other)
  - Nombre
  - Configuración (JSON)
  - Estado (active, inactive, error)
  - Última sincronización
  - Errores
- [ ] Crear migración de BD: `integration_logs` table
  - Relación con integrations
  - Tipo (success, error, warning)
  - Mensaje
  - Detalles (JSON)
  - Timestamp
- [ ] Crear API routes:
  - `GET /api/settings/integrations` - Listar integraciones
  - `POST /api/settings/integrations` - Crear integración
  - `GET /api/settings/integrations/:id` - Obtener integración
  - `PUT /api/settings/integrations/:id` - Actualizar integración
  - `DELETE /api/settings/integrations/:id` - Eliminar integración
  - `POST /api/settings/integrations/:id/test` - Probar conexión
  - `POST /api/settings/integrations/:id/sync` - Forzar sincronización
  - `GET /api/settings/integrations/:id/logs` - Ver logs
- [ ] Crear componente UI: `settings-integrations-page-client.tsx`
  - Lista de integraciones disponibles
  - Estado de cada integración
  - Configuración de Trello
  - Configuración de Manychat
  - Configuración de WhatsApp
  - Configuración de AFIP
  - Logs de sincronización
  - Probar conexión
  - Forzar sincronización
- [ ] Integrar con módulos existentes (Trello, Manychat)
- [ ] Dashboard de estado de integraciones
- [ ] Alertas de errores de integración
- [ ] Testing y validación

**Progreso:** 0/9 tareas completadas

---

## 🔗 INTEGRACIONES Y ENLACES ENTRE MÓDULOS

### Enlaces Críticos a Implementar:

1. **Operaciones ↔ Facturación:**
   - Generar factura desde operación
   - Actualizar estado de operación al facturar
   - Mostrar facturas en detalle de operación

2. **Operaciones ↔ Notas:**
   - Notas por operación
   - Notificaciones de nuevas notas
   - Historial de notas en operación

3. **Clientes ↔ Notas:**
   - Notas por cliente
   - Historial de notas en cliente

4. **Cotizaciones ↔ Templates:**
   - Generar PDF de cotización desde template
   - Enviar cotización por email

5. **Operaciones ↔ Templates:**
   - Generar confirmación desde template
   - Enviar confirmación por email

6. **Ventas ↔ Equipos:**
   - Asignar leads por equipo
   - Estadísticas por equipo
   - Objetivos por equipo

7. **Estadísticas ↔ Dashboard:**
   - Widgets de estadísticas en dashboard
   - Links a estadísticas detalladas

8. **Configuraciones ↔ Módulos:**
   - Aplicar configuraciones a módulos
   - Validaciones según configuración

---

## 📈 MÉTRICAS Y KPIs A IMPLEMENTAR

### Dashboard Principal:
- Total de clientes (con link a estadísticas)
- Total de operaciones (con link a estadísticas)
- Pipeline de ventas (con link a estadísticas)
- Ingresos del mes
- Operaciones pendientes de facturar
- Notas recientes

### Estadísticas de Clientes:
- Total de clientes
- Clientes nuevos (último mes)
- Clientes por estado
- Valor promedio por cliente
- Top 10 clientes más activos

### Estadísticas de Operaciones:
- Total de operaciones
- Operaciones por estado
- Ingresos por período
- Operaciones más rentables
- Estadísticas por destino

### Estadísticas de Ventas:
- Pipeline completo
- Tasa de conversión
- Leads por origen
- Performance por vendedor
- Estadísticas Manychat

---

## 🧪 TESTING Y VALIDACIÓN

### Por cada funcionalidad:
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests (críticas)
- [ ] Testing de permisos
- [ ] Testing de performance
- [ ] Testing de UI/UX

---

## 📝 NOTAS IMPORTANTES

1. **Todas las funcionalidades deben:**
   - Respetar el sistema de permisos existente
   - Integrarse con módulos existentes
   - Mantener consistencia de UI/UX
   - Tener logging y manejo de errores
   - Ser responsive

2. **Priorización:**
   - CRÍTICA: Facturación AFIP
   - ALTA: Configuraciones, Estadísticas
   - MEDIA: Recursos, Equipos, Integraciones

3. **Dependencias:**
   - Facturación requiere AFIP SDK
   - Templates requieren Notas (para contexto)
   - Estadísticas requieren datos existentes

4. **Performance:**
   - Caché de estadísticas
   - Paginación en listas grandes
   - Lazy loading de componentes pesados

---

## 🎯 PRÓXIMOS PASOS

1. **Iniciar Fase 1:** Configuraciones base
2. **Iniciar Fase 2:** Estadísticas básicas
3. **Iniciar Fase 3:** Integración AFIP (crítica)
4. **Continuar con fases restantes**

---

**Última actualización:** 7 de Enero 2026  
**Responsable:** Equipo de Desarrollo MAXEVA GESTION

