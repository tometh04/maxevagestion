# 📋 Guía Completa: Configuración y Uso de AFIP SDK

Esta guía te explica paso a paso cómo configurar AFIP SDK y crear facturas electrónicas.

---

## 🚀 CONFIGURACIÓN SIMPLIFICADA (NUEVO)

Ahora puedes configurar AFIP directamente desde la interfaz, sin necesidad de variables de entorno. Solo necesitas tu **CUIT** y **Clave Fiscal**.

---

## 🔧 PASO 1: Configurar AFIP desde la Interfaz

### 1.1. Acceder a Configuración de Integraciones

1. Inicia sesión en la aplicación
2. Ve a **Configuración** → **Integraciones** (o directamente a `/settings/integrations`)
3. Verás la lista de integraciones disponibles

### 1.2. Configurar AFIP

1. Haz clic en **"Nueva Integración"**
2. Selecciona el tipo **"AFIP"**
3. Se abrirá un formulario especial con los siguientes campos:

#### **Campos Requeridos:**

- **Agencia**: Selecciona la agencia para la cual configurarás AFIP
- **CUIT**: Ingresa tu CUIT sin guiones (ej: `20123456789`)
- **Clave Fiscal**: Ingresa tu clave fiscal de AFIP (la misma que usas para ingresar a AFIP)
- **Punto de Venta**: Número de punto de venta habilitado en AFIP (por defecto: `1`)
- **Ambiente**: 
  - **Sandbox (Pruebas)**: Para probar sin facturar reales
  - **Producción**: Para facturar reales

### 1.3. Autorizar Servicio en AFIP (IMPORTANTE)

**⚠️ ANTES de configurar en la aplicación, debes autorizar el servicio en AFIP:**

1. Ingresa a [AFIP Clave Fiscal](https://www.afip.gob.ar/claveFiscal/)
2. Ve a **"Administrador de Relaciones"**
3. Busca el servicio **"WebServices"** → **"Facturación Electrónica"**
4. Autoriza el servicio para tu CUIT
5. Si usas AFIP SDK, también debes autorizar el servicio para el CUIT de AFIP SDK

**📝 Nota:** Este paso es necesario para que el sistema pueda facturar en tu nombre.

### 1.4. Guardar Configuración

1. Completa todos los campos del formulario
2. Haz clic en **"Configurar AFIP"**
3. El sistema automáticamente:
   - Creará el certificado digital
   - Autorizará el servicio
   - Obtendrá el token de acceso
   - Guardará toda la configuración

4. Si todo está correcto, verás el mensaje: **"AFIP configurado correctamente. Ya puedes comenzar a facturar."**

### 1.5. Verificar Configuración

1. En la lista de integraciones, busca tu integración de AFIP
2. Haz clic en el botón de **"Probar"** (icono de play)
3. Si la conexión es exitosa, verás un mensaje de confirmación
4. El estado de la integración cambiará a **"Activo"**

---

## 📝 PASO 2: Crear una Factura Electrónica

### 2.1. Acceder a la Página de Facturación

1. Inicia sesión en la aplicación
2. Ve a **Operaciones** → **Facturación** (o directamente a `/operations/billing`)
3. Verás la lista de facturas existentes

### 2.2. Crear Nueva Factura

1. Haz clic en el botón **"Nueva Factura"** (esquina superior derecha)
2. Serás redirigido a `/operations/billing/new`

### 2.3. Completar el Formulario

#### **Sección 1: Tipo de Comprobante**

- **Tipo de Comprobante**: Selecciona el tipo de factura:
  - **Factura A**: Para Responsables Inscriptos
  - **Factura B**: Para Consumidores Finales / Monotributistas
  - **Factura C**: Para Monotributistas (emisor)
- **Punto de Venta**: Número de punto de venta (se usa el configurado en la integración)

#### **Sección 2: Datos del Cliente**

- **Seleccionar Cliente**: Busca y selecciona un cliente de la lista
  - Si el cliente tiene CUIT, se auto-completa
  - Si tiene DNI, también se auto-completa
- **Operación Asociada** (opcional): Vincula la factura a una operación específica
- **Nombre/Razón Social**: Se auto-completa al seleccionar cliente (puedes editarlo)
- **CUIT/DNI**: Se auto-completa al seleccionar cliente (puedes editarlo)
- **Fecha Desde/Hasta (Servicio)**: Fechas del período de servicio

#### **Sección 3: Conceptos / Items**

Agrega los items a facturar:

1. **Descripción**: Descripción del servicio/producto
2. **Cantidad**: Cantidad (por defecto: 1)
3. **Precio Unitario**: Precio por unidad
4. **IVA %**: Porcentaje de IVA:
   - 0% (Exento)
   - 10.5%
   - 21% (por defecto)
   - 27%

**Agregar más items:**
- Haz clic en **"Agregar Item"** para agregar más conceptos
- Puedes eliminar items con el botón de basura (si hay más de uno)

#### **Sección 4: Resumen**

En el panel derecho verás:
- **Subtotal**: Suma de todos los items sin IVA
- **IVA**: Total de IVA
- **Total**: Monto total a facturar
- **Tipo de Comprobante**: Confirmación del tipo seleccionado
- **Punto de Venta**: Confirmación del punto de venta

### 2.4. Guardar Factura (Borrador)

1. Revisa todos los datos
2. Haz clic en **"Crear Factura (Borrador)"**
3. La factura se guardará con estado **"Borrador"**
4. Serás redirigido a la lista de facturas

---

## ✅ PASO 3: Autorizar Factura con AFIP

### 3.1. Encontrar la Factura

1. Ve a la lista de facturas (`/operations/billing`)
2. Busca la factura que acabas de crear (estado: **"Borrador"**)

### 3.2. Autorizar

1. Haz clic en el botón **"Autorizar"** de la factura
2. El sistema enviará la factura a AFIP usando la configuración de tu agencia
3. Espera la respuesta (puede tardar unos segundos)

### 3.3. Resultados Posibles

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
- **Enviada**: Factura enviada a AFIP
- **Autorizada**: Factura aprobada por AFIP (tiene CAE)
- **Rechazada**: Factura rechazada por AFIP (revisar errores)
- **Anulada**: Factura cancelada

---

## ⚠️ Errores Comunes y Soluciones

### Error: "AFIP no está configurado para esta agencia"
**Solución**: 
1. Ve a **Configuración** → **Integraciones**
2. Configura AFIP para tu agencia (ver Paso 1)
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

**Solución**: 
1. Revisa los errores en el detalle de la factura
2. Verifica que hayas autorizado el servicio en AFIP Clave Fiscal
3. Corrige los datos y vuelve a intentar

### Error: "No se puede autorizar una factura en estado X"
**Solución**: Solo puedes autorizar facturas en estado "Borrador" o "Pendiente"

### Error: "Error al configurar AFIP"
**Posibles causas:**
- CUIT o Clave Fiscal incorrectos
- Servicio no autorizado en AFIP
- Problemas de conexión con AFIP SDK

**Solución**:
1. Verifica que tu CUIT y Clave Fiscal sean correctos
2. Asegúrate de haber autorizado el servicio en AFIP Clave Fiscal
3. Intenta nuevamente después de unos minutos

---

## 🧪 Testing en Sandbox

Para probar sin afectar producción:

1. Al configurar AFIP, selecciona **"Sandbox (Pruebas)"** en el campo Ambiente
2. Las facturas en sandbox no son válidas fiscalmente
3. Una vez probado, puedes cambiar a **"Producción"** editando la integración

---

## 🔄 Configuración Multi-Agencia

Cada agencia puede tener su propia configuración de AFIP:

1. Al crear una integración de AFIP, selecciona la agencia correspondiente
2. Cada agencia puede tener diferentes:
   - CUIT
   - Punto de Venta
   - Ambiente (Sandbox/Producción)
3. Al crear una factura, se usa automáticamente la configuración de la agencia de la factura

---

## 📚 Recursos Adicionales

- **Documentación AFIP SDK**: [https://afipsdk.com/docs](https://afipsdk.com/docs)
- **AFIP Clave Fiscal**: [https://www.afip.gob.ar/claveFiscal/](https://www.afip.gob.ar/claveFiscal/)
- **Tipos de Comprobante**: Ver `lib/afip/types.ts`
- **Código del Cliente**: Ver `lib/afip/afip-client.ts`

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs en Vercel (Functions → Logs)
2. Verifica que hayas autorizado el servicio en AFIP Clave Fiscal
3. Prueba la conexión desde **Configuración** → **Integraciones** → **Probar**
4. Consulta la documentación de AFIP SDK
5. Contacta al equipo de desarrollo

---

## 🔐 Seguridad

- Tu Clave Fiscal se almacena de forma segura en la base de datos
- Los certificados y tokens se generan automáticamente y se guardan encriptados
- Cada agencia tiene su propia configuración aislada
- Solo usuarios con permisos de ADMIN pueden configurar integraciones

---

**Última actualización**: 19/01/26
