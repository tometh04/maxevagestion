# 🗺️ ROADMAP POST-REUNIÓN - MAXEVA GESTION

**Fecha de reunión:** 3 de Diciembre, 2025  
**Participantes:** Maxi (Owner), Yamil (Contable), Vendedoras  
**Actualizado:** 5 de Diciembre, 2025

---

## 👥 ESTRUCTURA DE ROLES

| Rol | Persona | Acceso |
|-----|---------|--------|
| **SUPER_ADMIN** | Maxi (Owner) | Todo el sistema, configuración, reportes, multi-agencia |
| **CONTABLE** | Yamil | Contabilidad, Caja, Operadores, Pagos a Operadores, IVA |
| **SELLER** | Vendedoras | Solo sus propios leads, operaciones, comisiones y documentos |
| **ADMIN** | Gerentes | Acceso amplio sin configuración |

**Agencias:** 
- Rosario (Board Trello: `kZh4zJ0J`)
- Buenos Aires/Madero (Board Trello: `X4IFL8rx`)

---

## ✅ FUNCIONALIDADES YA CONFIRMADAS

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Dashboard con KPIs | ✅ | Ventas, operaciones, márgenes, costos |
| Filtros por agencia/vendedor/período | ✅ | |
| Sistema de alertas de pagos | ✅ | Vencidos y próximos a vencer |
| Integración Trello en tiempo real | ✅ | ~60s delay |
| OCR de pasaportes/documentos | ✅ | Con OpenAI Vision - **Igual en Leads y Operaciones** |
| Conversión Lead → Operación | ✅ | Dialog completo con operador, notas, origen/destino |
| Centro de mensajes WhatsApp | ✅ | Templates + operación manual |
| Caja separada por moneda (ARS/USD) | ✅ | |
| Generación de recibos | ✅ | Desde operaciones |
| Tipo de cambio con FX gains/losses | ✅ | |
| Gestión de operadores | ✅ | Con deudas pendientes |
| Alertas de pagos a operadores | ✅ | |
| Dos agencias con filtros | ✅ | Rosario + Madero |
| Calendario de eventos | ✅ | **Con enlaces a operaciones** |
| Alertas de pasaportes vencidos | ✅ | **Implementado 05/12** |
| Eliminación de documentos | ✅ | **Implementado 05/12** |

---

## ❌ MÓDULOS ELIMINADOS (No se usarán)

- ~~Cotizaciones~~ - ✅ Eliminado del sidebar y código
- ~~Tarifarios~~ - ✅ Eliminado del sidebar y código
- ~~Cupos~~ - ✅ Eliminado del sidebar y código

---

## 🚀 ROADMAP DE IMPLEMENTACIÓN

### FASE 1: Pre-Lanzamiento (Esta semana)
**Objetivo:** Tener el sistema listo para uso real

#### 1.1 Alertas de Pasaportes Vencidos ✅ COMPLETADO
- [x] Verificar fecha de vencimiento del pasaporte (desde `scanned_data` en documentos)
- [x] Generar alerta 6 meses antes del viaje si pasaporte vence antes/durante el viaje
- [x] UI: Badge con estado (Vigente, Vence pronto, Vencido) en documentos
- [x] OCR automático extrae `expiration_date` de pasaportes y DNI

**Estado:** ✅ Completado el 05/12/2025

#### 1.2 Revisar Formulario Conversión Lead → Operación ✅ COMPLETADO
- [x] Agregar selector de operador
- [x] Campo de notas
- [x] Combobox para origen/destino con ciudades populares
- [x] Fecha de operación (operation_date)
- [x] Limpiar datos inválidos de Trello
- [x] UI mejorada con alertas claras

**Estado:** ✅ Completado el 04/12/2025

#### 1.3 OCR en Operaciones ✅ COMPLETADO
- [x] Mismo funcionamiento que en leads/CRM
- [x] OCR automático al subir documento
- [x] Datos extraídos se muestran directamente en la lista
- [x] Botón de eliminar documento
- [x] Badge de vencimiento integrado

**Estado:** ✅ Completado el 05/12/2025

#### 1.4 Calendario con Enlaces ✅ COMPLETADO
- [x] Botón "Ver" para ir a cada operación
- [x] Enlaces a leads para seguimientos
- [x] Formateo correcto de montos

**Estado:** ✅ Completado el 05/12/2025

#### 1.5 Importación Inicial de Datos 🔴 PENDIENTE
- [ ] **Operaciones abiertas actuales** (obligatorio antes de lanzar)
- [ ] **Foto inicial de caja** (saldos en ARS y USD por cuenta)
- [ ] **Base de clientes** desde Excel/Trello
- [ ] Script o UI amigable para importar

**Estimación:** 4-8 horas (depende de la cantidad de datos)

#### 1.6 Configuración de Usuarios 🟡 EN PROGRESO
- [x] Crear usuario Maxi (SUPER_ADMIN) - maxi@erplozada.com
- [ ] Crear usuario Yamil (CONTABLE)
- [ ] Crear usuarios vendedoras (SELLER)
- [ ] Asignar agencias a cada usuario

**Estimación:** 1 hora

---

### FASE 2: Primeras 2 Semanas Post-Lanzamiento

#### 2.1 Sistema de Requisitos por Destino ✅ COMPLETADO
**Descripción:** Alertas automáticas sobre vacunas obligatorias, formularios de ingreso, etc.

**Tareas:**
- [x] Crear migración de base de datos (047_destination_requirements.sql)
- [x] API CRUD para requisitos (/api/destination-requirements)
- [x] UI en Settings para administrar requisitos (tab "Requisitos Destino")
- [x] Generar alertas automáticas al crear operación con destino
- [x] Mostrar requisitos en detalle de operación

**Destinos incluidos:** Brasil, Colombia, EEUU, Europa, México, Cuba, Rep. Dominicana, Tailandia, Australia, Egipto

**Estado:** ✅ Completado el 05/12/2025

#### 2.2 Cuentas Corrientes de Socios ✅ COMPLETADO
**Descripción:** Registro de retiros personales de los socios

**Estado:** ✅ Completado el 05/12/2025

```sql
-- Nueva tabla sugerida
CREATE TABLE partner_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_name TEXT NOT NULL, -- "Maxi", "Socio 2"
  user_id UUID REFERENCES users(id), -- Opcional, si tiene usuario
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE partner_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID REFERENCES partner_accounts(id) NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  withdrawal_date DATE NOT NULL,
  account_id UUID REFERENCES financial_accounts(id), -- De qué cuenta salió
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Tareas:**
- [ ] Crear migraciones
- [ ] Nuevo módulo `/accounting/partner-accounts`
- [ ] Lista de socios con balance actual
- [ ] Formulario para registrar retiros
- [ ] Historial de movimientos por socio
- [ ] Integración con ledger_movements

**Estimación:** 6-8 horas

#### 2.3 Módulo de Reportes - Fase 1 ✅ COMPLETADO
**Tareas:**
- [x] Reporte de ventas por período (mes, semana, custom)
- [x] Reporte de ventas por vendedor
- [x] Reporte de flujo de caja (ingresos vs egresos)
- [x] Exportación básica a Excel/CSV

**Estado:** ✅ Completado el 05/12/2025

---

### FASE 3: Semanas 3-6 (Iteración)

#### 3.1 Módulo de Reportes - Fase 2
- [ ] Reportes de márgenes por operación/vendedor/período
- [ ] Reportes de operadores (balances, pagos pendientes)
- [ ] Reportes de comisiones (por vendedor, por mes)
- [ ] Exportación a PDF con diseño profesional
- [ ] Comparación de períodos (este mes vs mes anterior)

**Estimación:** 12-16 horas

#### 3.2 Importación de Data Histórica
- [ ] UI para importar datos históricos por mes
- [ ] Solo ingresos/gastos/ganancias agregados (últimos 6 meses)
- [ ] Validación y conciliación
- [ ] Preview antes de importar

**Estimación:** 6-8 horas

#### 3.3 Mejoras de UX
- [ ] Breadcrumbs en páginas de detalle
- [ ] Confirmaciones para acciones destructivas (eliminar, cancelar)
- [ ] Loading states consistentes
- [ ] Mensajes de error más claros
- [ ] Búsqueda global (Cmd+K)

**Estimación:** 4-6 horas

---

### FASE 4: Post 2 Meses (Mejoras Futuras)

| Mejora | Prioridad | Esfuerzo |
|--------|-----------|----------|
| Comparación de períodos en Dashboard | Media | 4h |
| Notificaciones push/email | Media | 8h |
| Testing automatizado | Alta | 12h+ |
| Timeline de cambios en operaciones | Baja | 6h |
| Historial de comunicación con clientes | Baja | 6h |
| AI Copilot con sugerencias proactivas | Baja | 8h |
| App móvil | Baja | 40h+ |

---

## 📋 CHECKLIST PRE-LANZAMIENTO

### Datos
- [ ] Operaciones abiertas cargadas
- [ ] Saldos iniciales de caja configurados (ARS y USD)
- [ ] Base de clientes importada
- [ ] Operadores cargados con datos correctos

### Usuarios
- [x] Usuario Maxi creado (SUPER_ADMIN) - maxi@erplozada.com
- [ ] Usuario Yamil creado (CONTABLE)
- [ ] Usuarios vendedoras creados (SELLER)
- [ ] Todos los usuarios asignados a sus agencias

### Integraciones
- [x] Trello configurado para ambas agencias
- [ ] Webhooks de Trello apuntando a producción
- [ ] Templates de WhatsApp cargados

### Funcionalidades ✅
- [x] Alertas de pasaportes vencidos implementadas
- [x] Formulario de conversión revisado
- [x] OCR en operaciones igual que en leads
- [x] Calendario con enlaces a operaciones
- [x] Eliminación de módulos no usados

### Capacitación
- [ ] Sesión de capacitación con vendedoras (30 min)
- [ ] Sesión de capacitación con Yamil (15 min)
- [ ] Documentación básica disponible

---

## 🔧 CONFIGURACIÓN TÉCNICA

### Variables de Entorno (Vercel)
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
RESEND_API_KEY= (opcional, para emails)
```

### Cron Jobs (configurar en Vercel/servidor)
```bash
# Pagos Recurrentes - Diario a las 00:00
0 0 * * * curl -X POST https://[dominio]/api/recurring-payments/generate

# Recordatorios de Pagos - Diario a las 08:00
0 8 * * * curl -X POST https://[dominio]/api/alerts/generate-payment-reminders

# Generación de Alertas - Diario a las 09:00
0 9 * * * curl -X POST https://[dominio]/api/alerts/generate
```

### Webhooks de Trello
- Rosario: Apuntar a `https://[dominio]/api/trello/webhook`
- Madero: Apuntar a `https://[dominio]/api/trello/webhook`

---

## 💬 PREGUNTAS PENDIENTES

1. **Requisitos de destino:** ¿Tienen ya una lista de destinos con sus requisitos (vacunas, formularios)?
2. **Cuentas de socios:** ¿Cuántos socios hay? ¿Solo Maxi o hay más?
3. **Data histórica:** ¿Cuántas operaciones abiertas hay? ¿Tienen el Excel de clientes listo?
4. **Reportes:** ¿Cuáles son los 3 reportes más urgentes?
5. **Capacitación:** ¿Prefieren presencial o videollamada?

---

## 📅 TIMELINE ESTIMADO

| Semana | Actividades |
|--------|-------------|
| **Semana 1** | ✅ Fase 1 casi completa - Falta importación de datos y usuarios |
| **Semana 2** | Iteración sobre feedback, inicio Fase 2 |
| **Semana 3-4** | Sistema de requisitos + Cuentas de socios |
| **Semana 5-6** | Reportes Fase 1 + Data histórica |
| **Semana 7-8** | Reportes Fase 2 + Mejoras UX |

---

## 📞 SOPORTE POST-LANZAMIENTO

Durante las primeras 2 semanas:
- Canal de comunicación directo (WhatsApp/Slack)
- Respuesta a bugs críticos: mismo día
- Iteraciones según feedback: semanalmente

---

## 📊 PROGRESO ACTUAL

### Fase 1: Pre-Lanzamiento
```
[████████████░░░░░░░░] 60% Completado

✅ Alertas de pasaportes vencidos
✅ Formulario de conversión
✅ OCR en operaciones
✅ Calendario con enlaces
⏳ Importación de datos
✅ Usuario Maxi (SUPER_ADMIN)
⏳ Usuarios Yamil y vendedoras
```

### Fase 2: Post-Lanzamiento
```
[████████████████████] 100% Completado

✅ Sistema de requisitos por destino (vacunas, visas, etc.)
✅ Cuentas corrientes de socios
✅ Módulo de reportes Fase 1
```

---

**Última actualización:** 5 de Diciembre, 2025
