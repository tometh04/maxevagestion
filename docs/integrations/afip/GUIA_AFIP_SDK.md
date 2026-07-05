# 📋 Guía Completa: Configuración y Uso de AFIP SDK

Esta guía explica cómo configurar AFIP SDK y crear facturas electrónicas usando la integración completa.

---

## ⚙️ CONFIGURACIÓN INICIAL (Solo una vez - para el administrador del sistema)

### 1.1. Obtener API Key de AFIP SDK

**IMPORTANTE:** Esta configuración la hace el **administrador del sistema**, no cada cliente.

1. Ve a [https://afipsdk.com](https://afipsdk.com)
2. Crea una cuenta o inicia sesión
3. Ve a tu dashboard y obtén tu **API Key** (access_token)
4. Revisa los planes disponibles:
   - **Plan Free**: 1 CUIT, 1,000 requests/mes (suficiente para desarrollo)
   - **Planes pagos**: Más CUITs, más requests, automatizaciones, etc.

### 1.2. Configurar API Key en Vercel

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com)
2. Ve a **Settings** → **Environment Variables**
3. Agrega la siguiente variable:

```
AFIP_SDK_API_KEY=tu_api_key_aqui
```

**⚠️ IMPORTANTE:**
- Esta API Key es **TUYA** (del sistema), no de cada cliente
- Se usa para todas las llamadas a AFIP SDK
- Los clientes NO necesitan tener su propia cuenta de AFIP SDK

### 1.3. Configurar en Local (.env.local)

Si estás desarrollando en local, crea un archivo `.env.local` en la raíz del proyecto:

```bash
# .env.local
AFIP_SDK_API_KEY=tu_api_key_aqui
```

**⚠️ IMPORTANTE:**
- El archivo `.env.local` NO debe subirse a Git (ya está en `.gitignore`)
- Reinicia el servidor de desarrollo después de agregar la variable

---

## 🚀 CONFIGURACIÓN POR CLIENTE (Desde la UI)

Cada cliente puede configurar su propia integración AFIP desde la interfaz, ingresando solo su CUIT y credenciales de ARCA.

### 2.1. Acceder a Configuración de Integraciones

1. Inicia sesión en la aplicación
2. Ve a **Configuración** → **Integraciones** (o directamente a `/settings/integrations`)
3. Verás la lista de integraciones disponibles

### 2.2. Configurar AFIP

1. Haz clic en **"Nueva Integración"**
2. Selecciona el tipo **"AFIP"**
3. Se abrirá un formulario especial con los siguientes campos:

#### **Campos Requeridos:**

- **Agencia**: Selecciona la agencia para la cual configurarás AFIP
- **CUIT**: Ingresa tu CUIT sin guiones (ej: `20123456789`)
- **Usuario de ARCA**: Usuario con el que ingresas a ARCA/AFIP (puede ser el mismo CUIT)
- **Clave Fiscal / Password**: La clave fiscal/password que usas para ingresar a AFIP
- **Punto de Venta**: Número de punto de venta habilitado en AFIP (por defecto: `1`)
- **Ambiente**: 
  - **Sandbox (Pruebas)**: Para probar sin facturar reales
  - **Producción**: Para facturar reales

### 2.3. Autorizar Servicio en AFIP (IMPORTANTE)

**⚠️ ANTES de configurar en la aplicación, el cliente debe autorizar el servicio en AFIP:**

1. Ingresa a [AFIP Clave Fiscal](https://www.afip.gob.ar/claveFiscal/)
2. Ve a **"Administrador de Relaciones"**
3. Busca el servicio **"WebServices"** → **"Facturación Electrónica"**
4. Autoriza el servicio para tu CUIT
5. Asegúrate de tener **Clave Fiscal de Nivel 4** si es necesario (algunos servicios lo requieren)

**📝 Nota:** Este paso es necesario para que el sistema pueda facturar en tu nombre.

### 2.4. Guardar Configuración

1. Completa todos los campos del formulario
2. Haz clic en **"Configurar AFIP"**
3. El sistema automáticamente:
   - Crea el certificado digital (desarrollo o producción según el ambiente)
   - Autoriza el servicio de Facturación Electrónica (WSFE)
   - Guarda toda la configuración de forma segura

4. Si todo está correcto, verás el mensaje: **"AFIP configurado correctamente. Ya puedes comenzar a facturar."**

### 2.5. Verificar Configuración

1. En la lista de integraciones, busca tu integración de AFIP
2. Haz clic en el botón de **"Probar"** (icono de play)
3. Si la conexión es exitosa, verás un mensaje de confirmación
4. El estado de la integración cambiará a **"Activo"**

---

## 📝 PASO 3: Crear una Factura Electrónica

### 3.1. Acceder a la Página de Facturación

1. Inicia sesión en la aplicación
2. Ve a **Operaciones** → **Facturación** (o directamente a `/operations/billing`)
3. Verás la lista de facturas existentes

### 3.2. Crear Nueva Factura

1. Haz clic en el botón **"Nueva Factura"** (esquina superior derecha)
2. Serás redirigido a `/operations/billing/new`

### 3.3. Completar el Formulario

#### **Sección 1: Tipo de Comprobante**

- **Tipo de Comprobante**: Selecciona el tipo de factura:
  - **Factura A**: Para Responsables Inscriptos
  - **Factura B**: Para Consumidores Finales / Monotributistas
  - **Factura C**: Para Monotributistas (emisor)
- **Punto de Venta**: Número de punto de venta (se usa el configurado en la integración)

#### **Sección 2: Datos del Cliente**

- **Seleccionar Cliente**: Busca y selecciona un cliente de la lista
- **Operación Asociada** (opcional): Vincula la factura a una operación específica
- **Nombre/Razón Social**: Se auto-completa al seleccionar cliente
- **CUIT/DNI**: Se auto-completa al seleccionar cliente
- **Fecha Desde/Hasta (Servicio)**: Fechas del período de servicio

#### **Sección 3: Conceptos / Items**

Agrega los items a facturar con descripción, cantidad, precio unitario e IVA.

#### **Sección 4: Moneda y Tipo de Cambio (si aplica)**

**⚠️ IMPORTANTE:** Si la operación asociada está en **dólares (USD)** pero quieres facturar en **pesos argentinos (ARS)**, el sistema automáticamente:

1. **Detecta la moneda de la operación** al seleccionarla
2. **Muestra un panel especial** con opciones de moneda de facturación:
   - **Pesos Argentinos (ARS)**: Convierte automáticamente desde USD usando tipo de cambio
   - **Dólares (USD)**: Factura directamente en dólares
3. **Carga automáticamente el tipo de cambio** del día hábil anterior (según normativa AFIP/ARCA)
4. **Convierte los precios** de los items automáticamente
5. **Permite editar el tipo de cambio** si necesitas usar uno diferente

**Normativa AFIP/ARCA:**
- Cuando se factura en pesos una operación pactada en dólares, se debe usar el **tipo de cambio vendedor del Banco Nación** al cierre del día hábil anterior a la emisión
- El sistema intenta obtener este TC automáticamente, pero puedes editarlo si es necesario
- La factura se emitirá con `MonId: 'PES'` y `MonCotiz: [tipo_cambio]` para cumplir con la normativa

**Ejemplo:**
- Operación en USD: $1,000 USD
- Tipo de cambio: 1,500 ARS/USD
- Factura en ARS: $1,500,000 ARS (con cotización 1,500)

### 3.4. Guardar Factura (Borrador)

1. Revisa todos los datos
2. Haz clic en **"Crear Factura (Borrador)"**
3. La factura se guardará con estado **"Borrador"**

---

## ✅ PASO 4: Autorizar Factura con AFIP

### 4.1. Encontrar la Factura

1. Ve a la lista de facturas (`/operations/billing`)
2. Busca la factura que acabas de crear (estado: **"Borrador"**)

### 4.2. Autorizar

1. Haz clic en el botón **"Autorizar"** de la factura
2. El sistema automáticamente:
   - Obtiene el Ticket de Acceso (TA) usando tu certificado
   - Envía la factura a AFIP usando el Web Service de Facturación Electrónica
   - Espera la respuesta de AFIP

3. Espera la respuesta (puede tardar unos segundos)

### 4.3. Resultados Posibles

#### ✅ **Autorizada (Success)**
- Estado cambia a **"Autorizada"**
- Se asigna un **CAE** (Código de Autorización Electrónico)
- Se asigna un **Número de Comprobante**
- La factura queda lista para usar

#### ❌ **Rechazada (Rejected)**
- Estado cambia a **"Rechazada"**
- Se muestra el error de AFIP
- Revisa los datos y corrige la factura
- Puedes editar la factura y volver a intentar

---

## 🔍 Ver Detalle de Factura

1. En la lista de facturas, haz clic en una factura
2. Verás:
   - **Datos del comprobante**: Tipo, número, CAE, fecha de vencimiento
   - **Datos del receptor**: Nombre, CUIT/DNI
   - **Items**: Lista completa de conceptos facturados
   - **Totales**: Desglose de subtotal, IVA y total
   - **Estado**: Estado actual de la factura
   - **Respuesta AFIP**: Detalles de la respuesta de AFIP (si fue autorizada)

---

## 📊 Estados de Factura

- **Borrador**: Factura creada pero no enviada a AFIP
- **Pendiente**: Factura enviada a AFIP, esperando respuesta
- **Autorizada**: Factura aprobada por AFIP (tiene CAE)
- **Rechazada**: Factura rechazada por AFIP (revisar errores)
- **Anulada**: Factura cancelada

---

## ⚠️ Errores Comunes y Soluciones

### Error: "API Key de AFIP SDK es requerida"
**Solución**: El administrador del sistema debe configurar `AFIP_SDK_API_KEY` en las variables de entorno de Vercel.

### Error: "AFIP no está configurado para esta agencia"
**Solución**: 
1. Ve a **Configuración** → **Integraciones**
2. Configura AFIP para tu agencia (ver Paso 2)
3. Asegúrate de haber autorizado el servicio en AFIP Clave Fiscal

### Error: "No tiene permiso para crear facturas"
**Solución**: Tu usuario necesita permisos de módulo "cash" (contacta al administrador)

### Error: "Factura rechazada por AFIP"
**Posibles causas:**
- CUIT del receptor inválido
- Datos incompletos o incorrectos
- Punto de venta no habilitado
- Tipo de comprobante incorrecto para la condición IVA
- Servicio no autorizado en AFIP
- Certificado no válido o expirado

**Solución**: 
1. Revisa los errores en el detalle de la factura
2. Verifica que hayas autorizado el servicio en AFIP Clave Fiscal
3. Corrige los datos y vuelve a intentar

### Error: "Error al crear certificado"
**Posibles causas:**
- Usuario o password incorrectos
- CUIT inválido
- Clave Fiscal sin nivel suficiente
- Servicio no autorizado en AFIP

**Solución**:
1. Verifica que tu usuario y password de ARCA sean correctos
2. Asegúrate de tener Clave Fiscal de nivel suficiente
3. Autoriza el servicio en AFIP Clave Fiscal antes de configurar

---

## 🧪 Testing en Sandbox

Para probar sin afectar producción:

1. Al configurar AFIP, selecciona **"Sandbox (Pruebas)"** en el campo Ambiente
2. Las facturas en sandbox no son válidas fiscalmente
3. Una vez probado, puedes cambiar a **"Producción"** editando la integración

**Nota:** En sandbox puedes usar el CUIT de prueba `20-40937847-2` sin necesidad de certificado propio.

---

## 🔄 Configuración Multi-Agencia

Cada agencia puede tener su propia configuración de AFIP:

1. Al crear una integración de AFIP, selecciona la agencia correspondiente
2. Cada agencia puede tener diferentes:
   - CUIT
   - Punto de Venta
   - Ambiente (Sandbox/Producción)
   - Certificado digital
3. Al crear una factura, se usa automáticamente la configuración de la agencia de la factura

---

## 🔐 Seguridad

- Tu Clave Fiscal se almacena de forma segura en la base de datos (encriptada)
- Los certificados y keys se generan automáticamente y se guardan encriptados
- Cada agencia tiene su propia configuración aislada
- Solo usuarios con permisos de ADMIN pueden configurar integraciones
- La API Key de AFIP SDK se configura solo en variables de entorno del servidor

---

## 📚 Recursos Adicionales

- **Documentación AFIP SDK**: [https://docs.afipsdk.com](https://docs.afipsdk.com)
- **AFIP Clave Fiscal**: [https://www.afip.gob.ar/claveFiscal/](https://www.afip.gob.ar/claveFiscal/)
- **Automatizaciones AFIP SDK**: [https://afipsdk.com/docs/automations/integrations/api](https://afipsdk.com/docs/automations/integrations/api)
- **Tipos de Comprobante**: Ver `lib/afip/types.ts`
- **Código del Cliente**: Ver `lib/afip/afip-client.ts`

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs en Vercel (Functions → Logs)
2. Verifica que el administrador haya configurado `AFIP_SDK_API_KEY`
3. Verifica que hayas autorizado el servicio en AFIP Clave Fiscal
4. Prueba la conexión desde **Configuración** → **Integraciones** → **Probar**
5. Consulta la documentación de AFIP SDK
6. Contacta al equipo de desarrollo

---

## 💰 Costos

- **AFIP SDK**: Tiene un plan gratuito (1 CUIT, 1,000 requests/mes) y planes pagos según uso
- **AFIP/ARCA**: Los Web Services oficiales no tienen costo adicional por factura emitida
- **Certificados Digitales**: Si usas certificados propios, pueden tener costo según el emisor

---

**Última actualización**: 19/01/26
