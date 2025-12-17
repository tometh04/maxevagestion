# Plan de Testing Completo - MAXEVA GESTION

## Objetivo
Probar exhaustivamente todas y cada una de las funcionalidades del sistema para identificar bugs, inconsistencias, código obsoleto y funcionalidades faltantes.

**Fecha de creación:** 2025-01-16
**Estado:** En progreso

---

## FASE 1: AUTENTICACIÓN Y PERMISOS

### 1.1 Autenticación
- [ ] Login con credenciales válidas
- [ ] Login con credenciales inválidas
- [ ] Logout
- [ ] Recuperación de contraseña (si existe)
- [ ] Sesión expirada
- [ ] Navegación sin autenticación (debe redirigir a login)

### 1.2 Roles y Permisos
Probar con cada rol: SUPER_ADMIN, ADMIN, CONTABLE, SELLER, VIEWER

- [ ] SUPER_ADMIN: Acceso total a todos los módulos
- [ ] ADMIN: Acceso a módulos excepto configuración completa
- [ ] CONTABLE: Solo contabilidad, caja, operadores, reportes financieros
- [ ] SELLER: Solo sus propios datos (leads, operaciones, clientes, comisiones)
- [ ] VIEWER: Solo lectura en todos los módulos

Para cada rol, verificar:
- [ ] Sidebar muestra solo módulos permitidos
- [ ] Rutas protegidas redirigen si no tiene permiso
- [ ] Botones de acción (crear/editar/eliminar) se ocultan según permisos
- [ ] Filtros de datos funcionan correctamente (ownDataOnly)

---

## FASE 2: DASHBOARD

### 2.1 Dashboard Principal (`/dashboard`)
- [ ] Carga correctamente
- [ ] Muestra métricas principales (KPIs)
- [ ] Gráficos se renderizan correctamente
- [ ] Filtros por fecha funcionan
- [ ] Filtros por agencia funcionan (si aplica)
- [ ] Datos se actualizan al cambiar filtros
- [ ] Enlaces a otras secciones funcionan
- [ ] Responsive en móvil/tablet

### 2.2 Métricas a Verificar
- [ ] Total de operaciones
- [ ] Total de ventas
- [ ] Operaciones pendientes
- [ ] Alertas activas
- [ ] Pagos pendientes
- [ ] Comisiones pendientes

---

## FASE 3: LEADS

### 3.1 Leads de Trello (`/sales/leads`)
- [ ] Lista de leads carga correctamente
- [ ] Filtros por estado funcionan
- [ ] Filtros por vendedor funcionan
- [ ] Filtros por agencia funcionan
- [ ] Búsqueda por texto funciona
- [ ] Ordenamiento por columnas funciona
- [ ] Paginación funciona
- [ ] Vista Kanban funciona (si existe)
- [ ] Vista Tabla funciona

### 3.2 Crear Lead
- [ ] Formulario de creación carga
- [ ] Validación de campos requeridos
- [ ] Creación exitosa
- [ ] Redirección después de crear
- [ ] Lead aparece en la lista

### 3.3 Editar Lead
- [ ] Abrir formulario de edición
- [ ] Campos se cargan correctamente
- [ ] Para leads de Trello: Solo campos permitidos son editables
- [ ] Para leads de Manychat: Todos los campos son editables
- [ ] Guardar cambios funciona
- [ ] Cambios se reflejan en la lista

### 3.4 Asignar Lead (Claim)
- [ ] Botón "Agarrar" funciona
- [ ] Para leads de Trello: Sincroniza con Trello
- [ ] Para leads de Manychat: Solo actualiza en DB (sin Trello)
- [ ] Lead se asigna al vendedor actual
- [ ] Notificación/confirmación se muestra

### 3.5 Convertir Lead a Operación
- [ ] Botón "Convertir a Operación" funciona
- [ ] Formulario de conversión carga
- [ ] Datos del lead se pre-llenan
- [ ] Creación de operación exitosa
- [ ] Lead cambia a estado "WON"
- [ ] Cliente se crea automáticamente
- [ ] Documentos del lead se transfieren al cliente
- [ ] Movimientos contables se crean
- [ ] Alertas se generan
- [ ] Mensajes de WhatsApp se generan

### 3.6 Documentos en Leads
- [ ] Subir documento funciona
- [ ] Lista de documentos se muestra
- [ ] Ver documento funciona
- [ ] Eliminar documento funciona
- [ ] OCR funciona para DNI/Pasaporte

### 3.7 Comentarios en Leads
- [ ] Agregar comentario funciona
- [ ] Lista de comentarios se muestra
- [ ] Fecha y usuario se muestran correctamente

### 3.8 CRM Manychat (`/sales/crm-manychat`)
- [ ] Lista de leads de Manychat carga
- [ ] Vista Kanban funciona
- [ ] Filtros funcionan
- [ ] Edición completa de campos (independiente de Trello)
- [ ] Asignación funciona (sin Trello)
- [ ] Conversión a operación funciona
- [ ] Orden de listas se respeta

---

## FASE 4: OPERACIONES

### 4.1 Lista de Operaciones (`/operations`)
- [ ] Lista carga correctamente
- [ ] Filtros por estado funcionan
- [ ] Filtros por vendedor funcionan
- [ ] Filtros por agencia funcionan
- [ ] Filtros por operador funcionan
- [ ] Búsqueda funciona (incluye destino, cliente, URL Trello)
- [ ] Ordenamiento funciona
- [ ] Paginación funciona
- [ ] Columna "Destino" es visible y muestra datos
- [ ] Exportar funciona (si existe)

### 4.2 Crear Operación
- [ ] Desde lead: Formulario pre-llenado
- [ ] Manual: Formulario vacío
- [ ] Validación de campos requeridos
- [ ] Selección de cliente funciona
- [ ] Selección de operador funciona
- [ ] Cálculo de márgenes funciona
- [ ] Creación exitosa
- [ ] Cliente se asocia correctamente
- [ ] Documentos se transfieren
- [ ] Movimientos contables se crean
- [ ] Alertas se generan
- [ ] Mensajes de WhatsApp se generan

### 4.3 Detalle de Operación (`/operations/[id]`)
- [ ] Página carga correctamente
- [ ] Tabs funcionan: Información, Clientes, Documentos, Pagos, Contabilidad, Alertas
- [ ] Datos se muestran correctamente
- [ ] Editar operación funciona
- [ ] Cambios se guardan correctamente

### 4.4 Clientes en Operación
- [ ] Agregar cliente funciona
- [ ] Lista de clientes se muestra
- [ ] Rol MAIN/COMPANION funciona
- [ ] Eliminar cliente funciona
- [ ] Cambiar rol funciona

### 4.5 Documentos en Operación
- [ ] Subir documento funciona
- [ ] Documento se asocia automáticamente al cliente principal
- [ ] Lista de documentos se muestra
- [ ] Ver documento funciona
- [ ] Eliminar documento funciona
- [ ] OCR funciona

### 4.6 Pagos en Operación
- [ ] Lista de pagos se muestra
- [ ] Crear pago funciona
- [ ] Marcar como pagado funciona
- [ ] Movimientos contables se crean al marcar como pagado
- [ ] Eliminar pago funciona

### 4.7 Contabilidad en Operación
- [ ] Movimientos contables se muestran
- [ ] IVA se muestra correctamente
- [ ] Comisiones se muestran
- [ ] Pagos a operadores se muestran

### 4.8 Alertas en Operación
- [ ] Lista de alertas se muestra
- [ ] Marcar como resuelta funciona
- [ ] Ignorar alerta funciona

### 4.9 Voucher
- [ ] Generar voucher funciona
- [ ] PDF se descarga correctamente
- [ ] Datos del voucher son correctos

---

## FASE 5: CLIENTES

### 5.1 Lista de Clientes (`/customers`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan
- [ ] Búsqueda funciona (nombre, email, teléfono)
- [ ] Ordenamiento funciona
- [ ] Paginación funciona
- [ ] Columna "Nombre" muestra nombre extraído inteligentemente
- [ ] Columna "Teléfono" muestra teléfono normalizado (no fechas)
- [ ] Exportar funciona (si existe)

### 5.2 Detalle de Cliente (`/customers/[id]`)
- [ ] Página carga correctamente
- [ ] Tabs funcionan: Información, Operaciones, Pagos, Documentos, Mensajes
- [ ] Datos del cliente se muestran
- [ ] Editar cliente funciona

### 5.3 Operaciones del Cliente
- [ ] Lista de operaciones se muestra
- [ ] Enlaces a operaciones funcionan
- [ ] Datos de operaciones son correctos

### 5.4 Pagos del Cliente
- [ ] Lista de pagos se muestra (de todas sus operaciones)
- [ ] Datos de pagos son correctos
- [ ] Filtros funcionan

### 5.5 Documentos del Cliente
- [ ] Lista de documentos se muestra (del cliente Y de sus operaciones)
- [ ] Documentos de operaciones aparecen correctamente
- [ ] Subir documento funciona
- [ ] Ver documento funciona
- [ ] Eliminar documento funciona

### 5.6 Mensajes del Cliente
- [ ] Lista de mensajes se muestra (del cliente Y de sus operaciones)
- [ ] Enviar mensaje funciona
- [ ] Historial se muestra correctamente

---

## FASE 6: OPERADORES

### 6.1 Lista de Operadores (`/operators`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan
- [ ] Búsqueda funciona
- [ ] Ordenamiento funciona
- [ ] Paginación funciona

### 6.2 Crear Operador
- [ ] Formulario de creación funciona
- [ ] Validación funciona
- [ ] Creación exitosa

### 6.3 Detalle de Operador (`/operators/[id]`)
- [ ] Página carga correctamente
- [ ] Datos se muestran
- [ ] Editar funciona
- [ ] Operaciones asociadas se muestran
- [ ] Pagos se muestran

---

## FASE 7: CAJA

### 7.1 Dashboard de Caja (`/cash`)
- [ ] Dashboard carga correctamente
- [ ] Saldos por moneda se muestran
- [ ] Gráficos se renderizan
- [ ] Filtros funcionan

### 7.2 Movimientos de Caja (`/cash/movements`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan
- [ ] Crear movimiento funciona
- [ ] Editar movimiento funciona
- [ ] Eliminar movimiento funciona
- [ ] Exportar funciona

### 7.3 Pagos (`/cash/payments`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan
- [ ] Marcar como pagado funciona
- [ ] Movimientos contables se crean

### 7.4 Transferencias entre Cajas
- [ ] Transferir entre cajas funciona
- [ ] Movimientos se registran correctamente

---

## FASE 8: CONTABILIDAD

### 8.1 Libro Mayor (`/accounting/ledger`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan (fecha, cuenta, tipo)
- [ ] Búsqueda funciona
- [ ] Ordenamiento funciona
- [ ] Saldos se calculan correctamente
- [ ] Exportar funciona

### 8.2 IVA (`/accounting/iva`)
- [ ] Lista carga correctamente
- [ ] IVA de ventas se muestra
- [ ] IVA de compras se muestra
- [ ] Cálculos son correctos
- [ ] Filtros funcionan

### 8.3 Cuentas Financieras (`/accounting/financial-accounts`)
- [ ] Lista carga correctamente
- [ ] Crear cuenta funciona
- [ ] Editar cuenta funciona
- [ ] Eliminar cuenta funciona
- [ ] Saldos se muestran correctamente
- [ ] Limpiar cuenta funciona

### 8.4 Posición Mensual (`/accounting/monthly-position`)
- [ ] Reporte carga correctamente
- [ ] Datos son correctos
- [ ] Filtros funcionan
- [ ] Exportar funciona

### 8.5 Pagos a Operadores (`/accounting/operator-payments`)
- [ ] Lista carga correctamente
- [ ] Pagos pendientes se muestran
- [ ] Marcar como pagado funciona
- [ ] Movimientos contables se crean

### 8.6 Pagos Recurrentes (`/accounting/recurring-payments`)
- [ ] Lista carga correctamente
- [ ] Crear pago recurrente funciona
- [ ] Editar funciona
- [ ] Eliminar funciona
- [ ] Generar pagos funciona

### 8.7 Cuentas de Socios (`/accounting/partner-accounts`)
- [ ] Lista carga correctamente
- [ ] Crear cuenta funciona
- [ ] Retiros funcionan
- [ ] Saldos se calculan correctamente

---

## FASE 9: MENSAJES (WHATSAPP)

### 9.1 Lista de Mensajes (`/messages`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan (estado, cliente, operación)
- [ ] Búsqueda funciona
- [ ] Paginación funciona

### 9.2 Enviar Mensaje
- [ ] Enviar mensaje manual funciona
- [ ] Selección de plantilla funciona
- [ ] Envío exitoso
- [ ] Estado se actualiza

### 9.3 Plantillas de WhatsApp
- [ ] Lista de plantillas carga
- [ ] Crear plantilla funciona
- [ ] Editar plantilla funciona
- [ ] Eliminar plantilla funciona
- [ ] Variables se reemplazan correctamente

### 9.4 Mensajes Automáticos
- [ ] Mensajes se generan al crear alertas
- [ ] Mensajes se generan al crear operación
- [ ] Mensajes se generan al recibir pago
- [ ] Mensajes se programan correctamente

---

## FASE 10: ALERTAS

### 10.1 Lista de Alertas (`/alerts`)
- [ ] Lista carga correctamente
- [ ] Filtros funcionan (tipo, estado, prioridad)
- [ ] Búsqueda funciona
- [ ] Ordenamiento funciona

### 10.2 Tipos de Alertas
- [ ] Alertas de documentos faltantes
- [ ] Alertas de pagos vencidos
- [ ] Alertas de viajes próximos
- [ ] Alertas de requisitos de destino
- [ ] Alertas contables

### 10.3 Acciones en Alertas
- [ ] Marcar como resuelta funciona
- [ ] Ignorar alerta funciona
- [ ] Eliminar alerta funciona
- [ ] Enlaces a operaciones/clientes funcionan

### 10.4 Generación Automática
- [ ] Alertas se generan al crear operación
- [ ] Alertas se generan al cambiar fechas
- [ ] Alertas se generan por CRON
- [ ] Alertas se actualizan correctamente

---

## FASE 11: CALENDARIO

### 11.1 Vista de Calendario (`/calendar`)
- [ ] Calendario carga correctamente
- [ ] Eventos se muestran correctamente
- [ ] Navegación entre meses funciona
- [ ] Vista mensual/semanal/diaria funciona

### 11.2 Eventos
- [ ] Crear evento funciona
- [ ] Editar evento funciona
- [ ] Eliminar evento funciona
- [ ] Eventos de operaciones se muestran
- [ ] Eventos de pagos se muestran

---

## FASE 12: REPORTES

### 12.1 Reportes Generales (`/reports`)
- [ ] Página carga correctamente
- [ ] Lista de reportes se muestra
- [ ] Filtros funcionan

### 12.2 Tipos de Reportes
- [ ] Reporte de ventas
- [ ] Reporte de flujo de caja
- [ ] Reporte de márgenes
- [ ] Reporte de comisiones
- [ ] Reporte de operadores
- [ ] Reporte de destinos

### 12.3 Exportación
- [ ] Exportar a Excel funciona
- [ ] Exportar a PDF funciona
- [ ] Datos exportados son correctos

---

## FASE 13: MI BALANCE / MIS COMISIONES (VENDEDORES)

### 13.1 Mi Balance (`/my/balance`)
- [ ] Página carga correctamente (solo para SELLER)
- [ ] Saldo se muestra correctamente
- [ ] Movimientos se muestran
- [ ] Filtros funcionan

### 13.2 Mis Comisiones (`/my/commissions`)
- [ ] Página carga correctamente (solo para SELLER)
- [ ] Comisiones se muestran
- [ ] Estado de pagos se muestra
- [ ] Filtros funcionan

---

## FASE 14: EMILIA (AI COMPANION)

### 14.1 Chat con Emilia (`/emilia`)
- [ ] Página carga correctamente
- [ ] Chat funciona
- [ ] Respuestas son relevantes
- [ ] Contexto de operaciones se usa correctamente
- [ ] Generación de documentos funciona
- [ ] Historial de conversaciones funciona

### 14.2 Funcionalidades de Emilia
- [ ] Consultas sobre operaciones
- [ ] Consultas sobre clientes
- [ ] Consultas sobre pagos
- [ ] Consultas sobre contabilidad
- [ ] Generación de reportes
- [ ] Análisis de datos

---

## FASE 15: CONFIGURACIÓN

### 15.1 Usuarios (`/settings` - tab Usuarios)
- [ ] Lista de usuarios carga
- [ ] Crear usuario funciona
- [ ] Editar usuario funciona
- [ ] Eliminar usuario funciona
- [ ] Invitar usuario funciona
- [ ] Reenviar invitación funciona
- [ ] Cambiar rol funciona

### 15.2 Agencias (`/settings` - tab Agencias)
- [ ] Lista de agencias carga
- [ ] Crear agencia funciona
- [ ] Editar agencia funciona
- [ ] Eliminar agencia funciona

### 15.3 Trello (`/settings` - tab Trello)
- [ ] Configuración carga
- [ ] Conectar con Trello funciona
- [ ] Test de conexión funciona
- [ ] Sincronización manual funciona
- [ ] Webhooks se registran correctamente

### 15.4 Comisiones (`/settings` - tab Comisiones)
- [ ] Lista de reglas de comisión carga
- [ ] Crear regla funciona
- [ ] Editar regla funciona
- [ ] Eliminar regla funciona

### 15.5 AI (`/settings` - tab AI)
- [ ] Configuración de OpenAI carga
- [ ] Guardar configuración funciona
- [ ] Test de conexión funciona

### 15.6 Requisitos de Destino (`/settings` - tab Requirements)
- [ ] Lista de requisitos carga
- [ ] Crear requisito funciona
- [ ] Editar requisito funciona
- [ ] Eliminar requisito funciona
- [ ] Matching con operaciones funciona

### 15.7 Importar Datos (`/settings` - tab Import)
- [ ] Importar operaciones funciona
- [ ] Importar clientes funciona
- [ ] Importar pagos funciona
- [ ] Importar movimientos de caja funciona
- [ ] Validación de datos funciona
- [ ] Errores se muestran correctamente

### 15.8 Seed Data (SUPER_ADMIN)
- [ ] Generar datos de prueba funciona
- [ ] Migrar datos históricos funciona

---

## FASE 16: INTEGRACIONES

### 16.1 Trello
- [ ] Sincronización de leads funciona
- [ ] Webhooks reciben eventos
- [ ] Actualización bidireccional funciona
- [ ] Mover tarjeta en Trello actualiza lead
- [ ] Cambiar lead en sistema actualiza Trello

### 16.2 Manychat
- [ ] Webhook recibe leads
- [ ] Leads se crean correctamente
- [ ] Sincronización funciona
- [ ] Independencia de Trello se mantiene

### 16.3 WhatsApp
- [ ] Envío de mensajes funciona
- [ ] Recepción de mensajes funciona (si está implementado)
- [ ] Plantillas funcionan
- [ ] Programación de mensajes funciona

---

## FASE 17: CRON JOBS / TAREAS AUTOMÁTICAS

### 17.1 Verificar Tareas Programadas
- [ ] Generación de alertas automáticas
- [ ] Recordatorios de pagos
- [ ] Generación de pagos recurrentes
- [ ] Limpieza de datos temporales
- [ ] Sincronización automática con Trello

---

## FASE 18: PERFORMANCE Y UX

### 18.1 Performance
- [ ] Páginas cargan en < 3 segundos
- [ ] Tablas con muchos datos no bloquean UI
- [ ] Paginación funciona correctamente
- [ ] Búsquedas son rápidas
- [ ] No hay queries N+1

### 18.2 UX
- [ ] Mensajes de error son claros
- [ ] Mensajes de éxito se muestran
- [ ] Loading states se muestran
- [ ] Validaciones son claras
- [ ] Navegación es intuitiva
- [ ] Responsive funciona en móvil/tablet

### 18.3 Accesibilidad
- [ ] Navegación por teclado funciona
- [ ] Contraste de colores es adecuado
- [ ] Textos alternativos en imágenes
- [ ] Labels en formularios

---

## ANÁLISIS DE CÓDIGO OBSOLETO/FALTANTE

### Código Obsoleto Identificado

1. **Funciones Deprecadas**
   - `lib/alerts/generate.ts`: `generatePaymentAlerts()` marcada como @deprecated

2. **Páginas/Componentes No Implementados**
   - `/quotations` - Migración existe pero no hay página
   - `/tariffs` - Migración existe pero no hay página
   - `/quotas` - Migración existe pero no hay página

3. **Scripts Obsoletos (ya eliminados según .cursor/cleanup-summary.md)**
   - Ya se limpiaron 25+ scripts obsoletos

4. **Componentes Potencialmente No Usados**
   - `components/sales/leads-kanban.tsx` - Verificar si se usa (parece que solo se usa `leads-kanban-trello.tsx` y `leads-kanban-manychat.tsx`)

5. **API Routes Potencialmente No Usadas**
   - `/api/trello/test-connection/route.ts` - Verificar uso
   - `/api/trello/webhooks/route.ts` - Verificar uso
   - `/api/trello/webhooks/register/route.ts` - Verificar uso

6. **TODOs en Código**
   - `components/emilia/emilia-chat.tsx`: TODO para generación de PDF
   - `components/emilia/emilia-chat.tsx`: TODO para retry con escalas

### Funcionalidades Faltantes

1. **Sistema de Cotizaciones**
   - Migración existe (`014_create_quotations.sql`) pero no hay UI
   - Flujo: Lead → Cotización → Aprobación → Operación

2. **Sistema de Tarifarios**
   - Migración existe (`015_create_tariffs_and_quotas.sql`) pero no hay UI
   - Gestión de tarifarios de operadores
   - Control de cupos

3. **Sistema de Cupos**
   - Migración existe pero no hay UI
   - Reserva de cupos
   - Tracking de disponibilidad

4. **Funcionalidades Mencionadas en ROADMAP**
   - Búsqueda global (Cmd+K)
   - Modo oscuro completo
   - Exportación de leads/operaciones
   - Vista de timeline de operaciones
   - Historial persistente de conversaciones con Emilia
   - Reportes avanzados (Balance Sheet, P&L)

### Recomendaciones de Limpieza

1. **Eliminar o Implementar**
   - Decidir si implementar Quotations/Tariffs/Quotas o eliminar migraciones
   - Si no se van a usar, eliminar migraciones y tablas relacionadas

2. **Consolidar Componentes**
   - Revisar si `leads-kanban.tsx` se usa, si no, eliminarlo
   - Consolidar lógica duplicada entre componentes similares

3. **Documentar APIs No Usadas**
   - Documentar o eliminar rutas API no utilizadas
   - Agregar comentarios sobre propósito de cada ruta

4. **Completar TODOs**
   - Implementar generación de PDF en Emilia
   - Implementar retry con escalas en Emilia

---

## CHECKLIST FINAL

- [ ] Todas las funcionalidades probadas
- [ ] Todos los bugs documentados
- [ ] Todos los problemas de UX documentados
- [ ] Código obsoleto identificado
- [ ] Funcionalidades faltantes documentadas
- [ ] Recomendaciones de mejoras listadas
- [ ] Documento de fixes/bugs/updates/mejoras creado

---

## NOTAS DE TESTING

### Cómo usar este documento

1. **Por cada fase:**
   - Marca con [x] los items que funcionan correctamente
   - Anota bugs encontrados en la sección de bugs
   - Anota mejoras sugeridas en la sección de mejoras

2. **Documentar bugs:**
   - Descripción clara del problema
   - Pasos para reproducir
   - Comportamiento esperado vs actual
   - Screenshots si es necesario

3. **Priorizar:**
   - Bugs críticos (bloquean funcionalidad)
   - Bugs importantes (afectan UX significativamente)
   - Bugs menores (cosméticos o mejoras)

---

## REGISTRO DE BUGS ENCONTRADOS

### Bugs Críticos
_(Agregar aquí los bugs que bloquean funcionalidades)_

### Bugs Importantes
_(Agregar aquí los bugs que afectan significativamente la UX)_

### Bugs Menores
_(Agregar aquí los bugs cosméticos o mejoras menores)_

---

## REGISTRO DE MEJORAS SUGERIDAS

_(Agregar aquí las mejoras y optimizaciones sugeridas durante el testing)_

