# Plan de Integración: Afip SDK para Facturación Electrónica

## 📋 Resumen Ejecutivo

Este documento detalla el plan completo para integrar **Afip SDK** en el sistema Vibook Services, permitiendo facturar con un solo click toda la ganancia generada por las operaciones del negocio.

**Objetivo:** Crear un sistema de facturación electrónica integrado que permita facturar automáticamente la ganancia (margen) de las operaciones, cumpliendo con los requisitos de AFIP/ARCA.

---

## 🎯 Funcionalidad Objetivo

### 1. Sección "Facturación"
- **Ubicación:** `/facturacion` (nueva sección en el sidebar)
- **Funcionalidad:**
  - Lista de operaciones pendientes de facturar
  - Vista de operaciones con ganancia calculada
  - Botón "Facturar" con un solo click
  - Historial de facturas emitidas
  - Filtros por fecha, agencia, estado

### 2. Facturación Automática de Ganancia
- **Cálculo:** `Ganancia = sale_amount_total - operator_cost_total`
- **IVA:** 21% sobre la ganancia (según normativa argentina)
- **Facturación:** Un click genera la factura electrónica en AFIP
- **Asociación:** Cada factura queda vinculada a la operación

### 3. Sección de Configuración
- **Ubicación:** `/facturacion/configuracion`
- **Variables a configurar:**
  - CUIT del emisor
  - Punto de venta (PtoVta)
  - Certificado digital (archivos .crt y .key)
  - API Key de Afip SDK
  - Entorno (sandbox/producción)
  - Condición IVA del emisor
  - Configuración por agencia

---

## 🔍 Análisis de Afip SDK

### ¿Qué es Afip SDK?

**Afip SDK** es una plataforma que simplifica la integración con los Web Services de AFIP/ARCA para facturación electrónica en Argentina. Ofrece dos formas de integración:

1. **SDK Directo (Node.js):** Librería `@afipsdk/afip.js` que maneja certificados, SOAP, WSAA, etc.
2. **API REST:** Servicio intermediario que maneja toda la complejidad, solo necesitas API Key

### Opción Recomendada: API REST

**Ventajas:**
- ✅ No necesitas manejar certificados digitales directamente
- ✅ No necesitas configurar SOAP/WSAA
- ✅ Más simple de implementar y mantener
- ✅ Manejo automático de tokens y autenticación
- ✅ Soporte y actualizaciones automáticas

**Desventajas:**
- ⚠️ Dependencia de servicio externo
- ⚠️ Costo del servicio (verificar pricing)

### Requisitos Previos

1. **CUIT válido** registrado en AFIP
2. **Certificado digital** (.crt y .key) registrado en AFIP/ARCA
3. **Punto de venta (PtoVta)** habilitado en AFIP
4. **Cuenta en Afip SDK** con API Key
5. **Condición IVA** del emisor (Responsable Inscripto, Monotributo, etc.)

---

## 📐 Arquitectura de la Solución

### Flujo de Facturación

```
1. Usuario selecciona operación(es) a facturar
   ↓
2. Sistema calcula ganancia: sale_amount - operator_cost
   ↓
3. Sistema determina tipo de factura según condición IVA del cliente
   ↓
4. Sistema prepara datos de factura (montos, IVA, fechas)
   ↓
5. Llamada a Afip SDK API para crear factura
   ↓
6. AFIP responde con CAE (Código de Autorización Electrónico)
   ↓
7. Sistema guarda factura en BD con CAE y estado "authorized"
   ↓
8. Sistema genera PDF de la factura (opcional)
   ↓
9. Usuario puede descargar/enviar factura
```

### Componentes a Crear/Modificar

#### 1. Base de Datos
- ✅ Tabla `invoices` (ya existe)
- ✅ Tabla `invoice_items` (ya existe)
- ⚠️ Tabla `afip_settings` (nueva) - Configuración por agencia
- ⚠️ Tabla `invoice_operations` (nueva) - Relación many-to-many entre facturas y operaciones

#### 2. Backend (API Routes)
- ✅ `/api/invoices` (ya existe, necesita modificación)
- ⚠️ `/api/invoices/batch` (nueva) - Facturación masiva
- ⚠️ `/api/invoices/[id]/authorize` (existe, necesita integración con Afip SDK)
- ⚠️ `/api/facturacion/operations` (nueva) - Operaciones pendientes de facturar
- ⚠️ `/api/facturacion/settings` (nueva) - CRUD de configuración AFIP

#### 3. Frontend (Componentes)
- ⚠️ `/app/(dashboard)/facturacion/page.tsx` (nueva) - Página principal
- ⚠️ `/app/(dashboard)/facturacion/configuracion/page.tsx` (nueva) - Configuración
- ⚠️ `components/facturacion/facturacion-page-client.tsx` (nueva)
- ⚠️ `components/facturacion/operations-to-invoice-list.tsx` (nueva)
- ⚠️ `components/facturacion/invoice-batch-dialog.tsx` (nueva)
- ⚠️ `components/facturacion/afip-settings-form.tsx` (nueva)

#### 4. Librerías
- ⚠️ `lib/afip/afip-client.ts` (existe, necesita actualización)
- ⚠️ `lib/afip/invoice-calculator.ts` (nueva) - Cálculo de montos e IVA
- ⚠️ `lib/afip/invoice-generator.ts` (nueva) - Generación de facturas desde operaciones

---

## 📝 Plan de Implementación Paso a Paso

### FASE 1: Configuración y Setup (Día 1-2)

#### 1.1. Instalación y Configuración Inicial

**Tareas:**
1. Verificar/instalar dependencias de Afip SDK
2. Crear tabla `afip_settings` en base de datos
3. Crear tabla `invoice_operations` para relación many-to-many
4. Configurar variables de entorno

**Archivos a crear/modificar:**
- `supabase/migrations/004_afip_integration.sql`
- `.env.example` (agregar variables AFIP)

**Variables de entorno necesarias:**
```env
# Afip SDK API (REST)
AFIP_SDK_API_KEY=tu_api_key_aqui
AFIP_SDK_BASE_URL=https://app.afipsdk.com/api/v1
AFIP_SDK_ENVIRONMENT=sandbox  # o 'production'

# Configuración AFIP (por defecto, se puede sobrescribir por agencia)
AFIP_CUIT_DEFAULT=12345678901
AFIP_PTO_VTA_DEFAULT=1
AFIP_CONDICION_IVA_DEFAULT=1  # 1: Responsable Inscripto
```

**Código SQL para migración:**
```sql
-- Tabla de configuración AFIP por agencia
CREATE TABLE IF NOT EXISTS afip_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE UNIQUE,
  
  -- Credenciales Afip SDK
  api_key TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  
  -- Datos del emisor
  cuit TEXT NOT NULL,
  punto_venta INTEGER NOT NULL DEFAULT 1,
  condicion_iva INTEGER NOT NULL DEFAULT 1,
  
  -- Certificados (opcional si usamos API REST)
  certificado_crt TEXT,  -- Base64 del certificado
  certificado_key TEXT,  -- Base64 de la clave privada
  
  -- Configuración por defecto
  concepto_default INTEGER DEFAULT 2,  -- 1: Productos, 2: Servicios, 3: Ambos
  moneda_default TEXT DEFAULT 'PES',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de relación many-to-many: facturas <-> operaciones
CREATE TABLE IF NOT EXISTS invoice_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  ganancia_facturada NUMERIC(18,2) NOT NULL,  -- Ganancia de esta operación facturada
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(invoice_id, operation_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_afip_settings_agency ON afip_settings(agency_id);
CREATE INDEX IF NOT EXISTS idx_invoice_operations_invoice ON invoice_operations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_operations_operation ON invoice_operations(operation_id);
```

#### 1.2. Actualización de Librería Afip Client

**Archivo:** `lib/afip/afip-client.ts`

**Cambios necesarios:**
- Actualizar para usar API REST de Afip SDK (no SDK directo)
- Agregar métodos para:
  - Obtener puntos de venta
  - Consultar datos de contribuyente
  - Crear factura
  - Obtener último comprobante
  - Validar configuración

**Estructura de la API REST de Afip SDK:**
```
POST /api/v1/facturacion/crear
POST /api/v1/facturacion/ultimo-comprobante
GET  /api/v1/padron/contribuyente/{cuit}
POST /api/v1/facturacion/puntos-venta
```

---

### FASE 2: Cálculo de Ganancia y Facturación (Día 3-4)

#### 2.1. Cálculo de Ganancia por Operación

**Archivo:** `lib/afip/invoice-calculator.ts` (nuevo)

**Funcionalidad:**
```typescript
/**
 * Calcula los montos para facturar la ganancia de una operación
 */
export function calculateOperationProfitInvoice(
  operation: {
    sale_amount_total: number
    sale_currency: "ARS" | "USD"
    operator_cost: number
    operator_cost_currency: "ARS" | "USD"
    sale_exchange_rate?: number
    operator_exchange_rate?: number
  },
  ivaRate: number = 0.21
): {
  ganancia: number  // En ARS
  imp_neto: number  // Ganancia sin IVA
  imp_iva: number   // IVA sobre ganancia
  imp_total: number // Total a facturar
  moneda: "ARS"
  cotizacion: number
}
```

**Lógica:**
1. Convertir todo a ARS usando tipos de cambio
2. Calcular ganancia: `sale_amount_total (ARS) - operator_cost (ARS)`
3. Calcular IVA: `ganancia * 0.21`
4. Calcular neto: `ganancia - iva`
5. Total: `ganancia` (ya incluye IVA)

#### 2.2. Generador de Facturas desde Operaciones

**Archivo:** `lib/afip/invoice-generator.ts` (nuevo)

**Funcionalidad:**
```typescript
/**
 * Genera una factura electrónica desde una o más operaciones
 */
export async function generateInvoiceFromOperations(
  operationIds: string[],
  customerId: string,
  afipSettings: AfipSettings
): Promise<{
  success: boolean
  invoiceId?: string
  cae?: string
  error?: string
}>
```

**Flujo:**
1. Obtener operaciones de la BD
2. Calcular ganancia total de todas las operaciones
3. Obtener datos del cliente (CUIT, condición IVA)
4. Determinar tipo de factura según condición IVA
5. Preparar request para Afip SDK
6. Llamar a API de Afip SDK
7. Guardar factura en BD con CAE
8. Crear relaciones `invoice_operations`

---

### FASE 3: API Routes (Día 5-6)

#### 3.1. API: Operaciones Pendientes de Facturar

**Archivo:** `app/api/facturacion/operations/route.ts` (nuevo)

**Endpoint:** `GET /api/facturacion/operations`

**Funcionalidad:**
- Lista operaciones que tienen ganancia y no están facturadas
- Filtros: agencia, fecha, estado de operación
- Calcula ganancia pendiente de facturar

**Response:**
```json
{
  "operations": [
    {
      "id": "uuid",
      "file_code": "OP-001",
      "destination": "Cancún",
      "customer": { "id": "uuid", "name": "Juan Pérez" },
      "sale_amount_total": 2000,
      "operator_cost": 1800,
      "ganancia": 200,
      "ganancia_ars": 200000,  // Si estaba en USD, convertido
      "fecha_operacion": "2024-01-15",
      "ya_facturada": false
    }
  ],
  "total_ganancia_pendiente": 500000
}
```

#### 3.2. API: Facturación Masiva

**Archivo:** `app/api/facturacion/batch/route.ts` (nuevo)

**Endpoint:** `POST /api/facturacion/batch`

**Request:**
```json
{
  "operation_ids": ["uuid1", "uuid2", "uuid3"],
  "customer_id": "uuid",
  "concepto": 2,  // 1: Productos, 2: Servicios, 3: Ambos
  "fch_serv_desde": "20240101",
  "fch_serv_hasta": "20240131",
  "fecha_vto_pago": "20240215"
}
```

**Response:**
```json
{
  "success": true,
  "invoice": {
    "id": "uuid",
    "cae": "12345678901234",
    "cae_fch_vto": "20240215",
    "cbte_nro": 1234,
    "imp_total": 242000
  },
  "operations_invoiced": 3
}
```

#### 3.3. API: Configuración AFIP

**Archivo:** `app/api/facturacion/settings/route.ts` (nuevo)

**Endpoints:**
- `GET /api/facturacion/settings` - Obtener configuración por agencia
- `POST /api/facturacion/settings` - Crear/actualizar configuración
- `POST /api/facturacion/settings/test` - Probar conexión con AFIP

---

### FASE 4: Frontend - Página de Facturación (Día 7-8)

#### 4.1. Página Principal de Facturación

**Archivo:** `app/(dashboard)/facturacion/page.tsx`

**Componentes:**
- `FacturacionPageClient` - Componente principal
- `OperationsToInvoiceList` - Lista de operaciones pendientes
- `InvoiceBatchDialog` - Diálogo para facturar múltiples operaciones
- `InvoicesHistory` - Historial de facturas emitidas

**Funcionalidades:**
1. **Vista de Operaciones Pendientes:**
   - Tabla con operaciones que tienen ganancia
   - Checkbox para seleccionar múltiples
   - Filtros: fecha, agencia, cliente
   - Resumen: total de ganancia pendiente

2. **Botón "Facturar":**
   - Si hay selección: factura las operaciones seleccionadas
   - Si no hay selección: muestra mensaje
   - Muestra diálogo de confirmación con resumen

3. **Historial de Facturas:**
   - Lista de facturas emitidas
   - Estado: draft, pending, authorized, rejected
   - Filtros y búsqueda
   - Acción: descargar PDF, reenviar, anular

#### 4.2. Diálogo de Facturación

**Archivo:** `components/facturacion/invoice-batch-dialog.tsx`

**Campos:**
- Cliente (pre-seleccionado si todas las operaciones son del mismo)
- Concepto (Productos/Servicios/Ambos)
- Fechas de servicio (desde/hasta)
- Fecha de vencimiento de pago
- Resumen de montos:
  - Ganancia total
  - IVA (21%)
  - Total a facturar

**Validaciones:**
- Cliente debe tener CUIT/DNI válido
- Condición IVA del cliente debe estar definida
- Monto total > 0
- Fechas válidas

---

### FASE 5: Frontend - Configuración (Día 9)

#### 5.1. Página de Configuración AFIP

**Archivo:** `app/(dashboard)/facturacion/configuracion/page.tsx`

**Componentes:**
- `AfipSettingsForm` - Formulario de configuración
- `AfipConnectionTest` - Botón para probar conexión

**Campos del formulario:**
1. **Credenciales Afip SDK:**
   - API Key (input tipo password)
   - Entorno (sandbox/producción)

2. **Datos del Emisor:**
   - CUIT (con validación)
   - Punto de Venta (dropdown con opciones desde API)
   - Condición IVA (dropdown)

3. **Configuración por Defecto:**
   - Concepto por defecto
   - Moneda por defecto

4. **Certificados (Opcional si usamos API REST):**
   - Upload de certificado .crt
   - Upload de clave privada .key
   - Nota: Si usamos API REST, estos pueden no ser necesarios

**Validaciones:**
- CUIT válido (11 dígitos)
- API Key no vacía
- Punto de venta válido
- Botón "Probar Conexión" que valida con AFIP

---

### FASE 6: Integración con Operaciones Existentes (Día 10)

#### 6.1. Modificar Vista de Operación

**Archivo:** `components/operations/operation-accounting-section.tsx`

**Agregar:**
- Botón "Facturar Ganancia" si:
  - La operación tiene ganancia > 0
  - No está ya facturada
  - El cliente tiene CUIT/DNI válido
- Indicador visual si ya está facturada
- Link a la factura asociada

#### 6.2. Agregar al Sidebar

**Archivo:** `components/app-sidebar.tsx`

**Agregar sección:**
```typescript
{
  title: "Facturación",
  items: [
    {
      title: "Facturar",
      url: "/facturacion",
      icon: FileText,
    },
    {
      title: "Configuración",
      url: "/facturacion/configuracion",
      icon: Settings,
    },
  ],
}
```

---

## 🔧 Detalles Técnicos

### Cálculo de Ganancia para Facturación

**Fórmula:**
```
1. Convertir montos a ARS:
   - sale_amount_ars = sale_amount_total * (sale_exchange_rate || 1)
   - operator_cost_ars = operator_cost * (operator_exchange_rate || 1)

2. Calcular ganancia:
   - ganancia = sale_amount_ars - operator_cost_ars

3. Calcular IVA (21%):
   - imp_iva = ganancia * 0.21

4. Calcular neto:
   - imp_neto = ganancia - imp_iva

5. Total a facturar:
   - imp_total = ganancia (ya incluye IVA)
```

**Ejemplo:**
- Venta: $2000 USD (tipo cambio: 1000 ARS/USD) = 2,000,000 ARS
- Costo: $1800 USD (tipo cambio: 1000 ARS/USD) = 1,800,000 ARS
- Ganancia: 200,000 ARS
- IVA (21%): 42,000 ARS
- Neto: 158,000 ARS
- **Total a facturar: 200,000 ARS**

### Determinación del Tipo de Factura

**Lógica:**
```typescript
function determineInvoiceType(
  emisorCondicionIVA: CondicionIVA,
  receptorCondicionIVA: CondicionIVA
): TipoComprobante {
  // Si emisor es Responsable Inscripto
  if (emisorCondicionIVA === 1) {
    // Si receptor es Responsable Inscripto → Factura A
    if (receptorCondicionIVA === 1) return 1
    // Si receptor es Consumidor Final/Monotributo → Factura B
    return 6
  }
  
  // Si emisor es Monotributo → Factura C
  if (emisorCondicionIVA === 6 || emisorCondicionIVA === 11) {
    return 11
  }
  
  // Default: Factura B
  return 6
}
```

### Estructura de Request a Afip SDK API

```typescript
{
  environment: "sandbox" | "production",
  cuit: "12345678901",
  pto_vta: 1,
  cbte_tipo: 6,  // Factura B
  cbte_nro: 1234,  // Obtenido de getLastVoucherNumber + 1
  concepto: 2,  // Servicios
  doc_tipo: 80,  // CUIT
  doc_nro: 20123456789,  // Sin guiones
  cbte_fch: "20240116",  // YYYYMMDD
  imp_total: 200000,
  imp_tot_conc: 0,
  imp_neto: 158000,
  imp_op_ex: 0,
  imp_iva: 42000,
  imp_trib: 0,
  fch_serv_desde: "20240101",
  fch_serv_hasta: "20240131",
  fch_vto_pago: "20240215",
  mon_id: "PES",
  mon_cotiz: 1,
  iva: [
    {
      Id: 5,  // 21%
      BaseImp: 200000,
      Importe: 42000
    }
  ]
}
```

---

## 📋 Checklist de Implementación

### Backend
- [ ] Crear migración de base de datos (`afip_settings`, `invoice_operations`)
- [ ] Actualizar `lib/afip/afip-client.ts` para API REST
- [ ] Crear `lib/afip/invoice-calculator.ts`
- [ ] Crear `lib/afip/invoice-generator.ts`
- [ ] Crear `app/api/facturacion/operations/route.ts`
- [ ] Crear `app/api/facturacion/batch/route.ts`
- [ ] Crear `app/api/facturacion/settings/route.ts`
- [ ] Actualizar `app/api/invoices/[id]/authorize/route.ts` para usar Afip SDK
- [ ] Agregar validaciones y manejo de errores

### Frontend
- [ ] Crear `app/(dashboard)/facturacion/page.tsx`
- [ ] Crear `app/(dashboard)/facturacion/configuracion/page.tsx`
- [ ] Crear `components/facturacion/facturacion-page-client.tsx`
- [ ] Crear `components/facturacion/operations-to-invoice-list.tsx`
- [ ] Crear `components/facturacion/invoice-batch-dialog.tsx`
- [ ] Crear `components/facturacion/afip-settings-form.tsx`
- [ ] Crear `components/facturacion/invoices-history.tsx`
- [ ] Agregar sección "Facturación" al sidebar
- [ ] Agregar botón "Facturar Ganancia" en vista de operación

### Testing
- [ ] Probar facturación en sandbox
- [ ] Validar cálculos de ganancia e IVA
- [ ] Probar facturación masiva
- [ ] Validar manejo de errores
- [ ] Probar configuración por agencia

---

## 🔐 Seguridad y Permisos

### Permisos Requeridos
- **Módulo:** `facturacion` (nuevo)
- **Roles con acceso:**
  - `ADMIN`: Acceso completo
  - `MANAGER`: Puede facturar y ver configuración
  - `SELLER`: Solo puede ver facturas (no facturar)

### Validaciones
1. **Antes de facturar:**
   - Verificar que la agencia tenga configuración AFIP
   - Verificar que el cliente tenga CUIT/DNI válido
   - Verificar que la operación tenga ganancia > 0
   - Verificar que la operación no esté ya facturada

2. **En la configuración:**
   - Solo ADMIN y MANAGER pueden modificar
   - Validar CUIT (11 dígitos)
   - Validar API Key con test de conexión
   - Encriptar certificados en BD (opcional)

---

## 📊 Estructura de Datos

### Tabla: `afip_settings`
```sql
- id (UUID)
- agency_id (UUID, UNIQUE)
- api_key (TEXT) -- Encriptado
- environment (TEXT: 'sandbox' | 'production')
- cuit (TEXT)
- punto_venta (INTEGER)
- condicion_iva (INTEGER)
- certificado_crt (TEXT, opcional)
- certificado_key (TEXT, opcional)
- concepto_default (INTEGER)
- moneda_default (TEXT)
- created_at, updated_at, created_by
```

### Tabla: `invoice_operations` (many-to-many)
```sql
- id (UUID)
- invoice_id (UUID, FK → invoices)
- operation_id (UUID, FK → operations)
- ganancia_facturada (NUMERIC) -- Ganancia de esta operación
- created_at
- UNIQUE(invoice_id, operation_id)
```

### Modificación a `invoices`
- Agregar campo `ganancia_total` (NUMERIC) - Ganancia total facturada
- Agregar campo `operations_count` (INTEGER) - Cantidad de operaciones facturadas

---

## 🚀 Pasos para Comenzar

### 1. Información Necesaria del Usuario

**Antes de comenzar, necesito:**

1. **Cuenta de Afip SDK:**
   - ¿Tienes cuenta en https://app.afipsdk.com?
   - ¿Tienes API Key?
   - ¿Prefieres usar API REST o SDK directo?

2. **Certificados Digitales:**
   - ¿Tienes certificado digital (.crt y .key) registrado en AFIP?
   - ¿O prefieres que Afip SDK maneje los certificados (API REST)?

3. **Configuración AFIP:**
   - CUIT del emisor
   - Punto de venta habilitado
   - Condición IVA del emisor (Responsable Inscripto, Monotributo, etc.)

4. **Entorno:**
   - ¿Comenzamos con sandbox (pruebas) o producción?
   - ¿Tienes acceso a ambiente de pruebas en AFIP?

### 2. Decisión: API REST vs SDK Directo

**Recomendación: API REST**

**Razones:**
- Más simple de implementar
- No necesitas manejar certificados directamente
- Menos código de mantenimiento
- Actualizaciones automáticas

**Si eliges SDK Directo:**
- Necesitarás instalar: `npm install @afipsdk/afip.js`
- Necesitarás manejar certificados en el servidor
- Más control pero más complejidad

### 3. Orden de Implementación Sugerido

1. **Fase 1:** Setup y configuración (migraciones, variables de entorno)
2. **Fase 2:** Cálculo de ganancia y lógica de facturación
3. **Fase 3:** APIs backend
4. **Fase 4:** Frontend - Página de facturación
5. **Fase 5:** Frontend - Configuración
6. **Fase 6:** Integración con operaciones existentes
7. **Fase 7:** Testing y ajustes

---

## ⚠️ Consideraciones Importantes

### 1. Facturación de Ganancia vs Venta Total

**IMPORTANTE:** Según normativa argentina, normalmente se factura el **servicio prestado**, no la ganancia. Sin embargo, si el negocio es de agencia de viajes, la ganancia (comisión) puede ser el servicio facturable.

**Recomendación:** 
- Facturar la **ganancia** como "Servicio de intermediación turística"
- Concepto: 2 (Servicios)
- Descripción: "Comisión por intermediación en operación turística"

### 2. IVA sobre Ganancia

**Cálculo correcto:**
- La ganancia es el **base imponible**
- IVA = ganancia × 21%
- Total facturado = ganancia (ya incluye IVA)

**Ejemplo:**
- Ganancia: 100,000 ARS
- IVA (21%): 21,000 ARS
- Neto: 79,000 ARS
- **Total a facturar: 100,000 ARS**

### 3. Múltiples Operaciones en una Factura

**Estrategia:**
- Agrupar operaciones del mismo cliente
- Sumar ganancias
- Una factura puede incluir múltiples operaciones
- Relación many-to-many: `invoice_operations`

### 4. Monedas Mixtas

**Manejo:**
- Convertir todo a ARS usando tipos de cambio
- Guardar tipo de cambio usado
- Facturar siempre en ARS (PES)

---

## 📚 Recursos y Documentación

### Documentación Oficial
- **Afip SDK Docs:** https://docs.afipsdk.com
- **API REST Reference:** https://docs.afipsdk.com/integracion/api
- **Web Services AFIP:** https://www.afip.gov.ar/fe/documentacion/manuales.asp

### Tipos de Comprobante
- **1:** Factura A (Responsable Inscripto → Responsable Inscripto)
- **6:** Factura B (Responsable Inscripto → Consumidor Final)
- **11:** Factura C (Monotributo)

### Conceptos
- **1:** Productos
- **2:** Servicios
- **3:** Productos y Servicios

---

## ✅ Checklist de Validación

Antes de comenzar, verificar:

- [ ] ¿Tienes cuenta en Afip SDK?
- [ ] ¿Tienes API Key?
- [ ] ¿Tienes certificado digital o usarás API REST?
- [ ] ¿Conoces tu CUIT y punto de venta?
- [ ] ¿Sabes tu condición IVA?
- [ ] ¿Tienes acceso a sandbox para pruebas?
- [ ] ¿Confirmas que facturaremos la ganancia (no la venta total)?

---

## 🎯 Resultado Esperado

Al finalizar la implementación:

1. **Usuario puede:**
   - Ver operaciones pendientes de facturar
   - Seleccionar una o más operaciones
   - Click en "Facturar" → Factura generada en AFIP
   - Ver facturas emitidas con CAE
   - Descargar PDF de facturas

2. **Sistema:**
   - Calcula automáticamente ganancia e IVA
   - Determina tipo de factura según condición IVA
   - Se conecta a AFIP y obtiene CAE
   - Guarda factura con todos los datos
   - Vincula factura con operaciones

3. **Configuración:**
   - Por agencia (cada agencia puede tener su propia configuración)
   - Validación de conexión con AFIP
   - Manejo seguro de credenciales

---

## 📞 Siguiente Paso

**Una vez que leas este documento y me des el OK, comenzaré con:**

1. Crear las migraciones de base de datos
2. Actualizar/crear las librerías de Afip SDK
3. Crear las APIs necesarias
4. Crear los componentes frontend
5. Integrar con el sistema existente

**¿Alguna pregunta o modificación antes de comenzar?**

---

*Documento creado: Diciembre 2024*
*Última actualización: Pendiente de aprobación*
