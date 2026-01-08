# 🧪 Testing Exhaustivo de Flujos - MAXEVA GESTION

## 📋 Metodología de Testing

Cada flujo se verifica con la pregunta: **"Si hago X, ¿dónde debería impactar Y?"**

---

## 🔄 FLUJOS A VERIFICAR

### MÓDULO 1: LEADS → OPERACIONES (Conversión)

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 1.1 | Crear Lead | Aparece en listado de Leads, estadísticas de Ventas | ⏳ |
| 1.2 | Convertir Lead a Operación | Crea Cliente + Crea Operación + Lead se marca como convertido | ⏳ |
| 1.3 | En conversión: Crear operador nuevo | Debe poder crear operador desde el desplegable | ❌ BUG |
| 1.4 | En conversión: Seleccionar operador existente | Lista operadores disponibles | ⏳ |
| 1.5 | Operación creada | Aparece en listado, estadísticas, puede facturarse | ⏳ |

### MÓDULO 2: CLIENTES

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 2.1 | Crear Cliente (manual) | Aparece en listado, estadísticas de clientes | ⏳ |
| 2.2 | Config: Requerir email | Al crear cliente sin email, debe dar error | ⏳ |
| 2.3 | Config: Campo personalizado | Campo aparece en formulario de cliente | ⏳ |
| 2.4 | Config: Detectar duplicados | Si existe email duplicado, alerta | ⏳ |
| 2.5 | Ver detalle cliente | Muestra operaciones, interacciones, notas vinculadas | ⏳ |
| 2.6 | Agregar interacción | Aparece en timeline del cliente | ⏳ |
| 2.7 | Cliente en segmento | Si cumple reglas, aparece en segmento automático | ⏳ |

### MÓDULO 3: OPERACIONES

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 3.1 | Crear Operación (manual) | Aparece en listado, file_code generado | ⏳ |
| 3.2 | Config: Requerir destino | Sin destino, error de validación | ⏳ |
| 3.3 | Config: Requerir operador | Sin operador, error de validación | ⏳ |
| 3.4 | Config: Estado personalizado | Estado aparece en selector | ⏳ |
| 3.5 | Agregar pago a operación | Actualiza saldo, aparece en movimientos | ⏳ |
| 3.6 | Cambiar estado operación | Se refleja en listado y estadísticas | ⏳ |
| 3.7 | Agregar operador múltiple | Calcula costo total correctamente | ⏳ |
| 3.8 | Facturar operación | Genera factura vinculada | ⏳ |

### MÓDULO 4: OPERADORES

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 4.1 | Crear Operador | Aparece en listado y selectores | ⏳ |
| 4.2 | Operador en operación | Se calcula en costos | ⏳ |
| 4.3 | Pago a operador | Registra pago, actualiza saldo operador | ⏳ |

### MÓDULO 5: FACTURACIÓN

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 5.1 | Nueva factura desde operación | Pre-carga datos de operación | ⏳ |
| 5.2 | Nueva factura manual | Seleccionar cliente y items | ⏳ |
| 5.3 | Autorizar factura AFIP | Obtiene CAE, cambia estado | ⏳ |
| 5.4 | Ver factura | Muestra detalles, permite PDF | ⏳ |

### MÓDULO 6: EQUIPOS Y USUARIOS

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 6.1 | Crear Equipo | Aparece en listado | ⏳ |
| 6.2 | Agregar miembros | Miembros vinculados al equipo | ⏳ |
| 6.3 | Asignar líder | Líder puede ver equipo completo | ⏳ |
| 6.4 | Crear meta de equipo | Meta aparece en dashboard | ⏳ |
| 6.5 | Ventas del equipo | Progreso de meta se actualiza | ⏳ |

### MÓDULO 7: NOTAS Y RECURSOS

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 7.1 | Crear nota general | Aparece en listado | ⏳ |
| 7.2 | Crear nota de operación | Aparece en listado y en detalle de operación | ⏳ |
| 7.3 | Crear nota de cliente | Aparece en listado y en detalle de cliente | ⏳ |
| 7.4 | Agregar comentario a nota | Comentario visible | ⏳ |
| 7.5 | Fijar nota | Aparece primero en listado | ⏳ |

### MÓDULO 8: TEMPLATES PDF

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 8.1 | Crear template | Aparece en listado | ⏳ |
| 8.2 | Usar variables en template | Se reemplazan al generar | ⏳ |
| 8.3 | Generar PDF desde operación | PDF generado con datos | ⏳ |

### MÓDULO 9: SEGMENTOS DE CLIENTES

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 9.1 | Crear segmento manual | Aparece en listado | ⏳ |
| 9.2 | Agregar clientes manual | Clientes aparecen en segmento | ⏳ |
| 9.3 | Crear segmento automático | Clientes que cumplen reglas se agregan | ⏳ |
| 9.4 | Cliente nuevo cumple regla | Se agrega automáticamente al segmento | ⏳ |

### MÓDULO 10: CONFIGURACIONES

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 10.1 | Config Operaciones: Estado por defecto | Nueva operación usa ese estado | ⏳ |
| 10.2 | Config Operaciones: Alertas | Se generan alertas según config | ⏳ |
| 10.3 | Config Clientes: Campos custom | Campos aparecen en formularios | ⏳ |
| 10.4 | Config Finanzas: Monedas | Monedas disponibles en selectores | ⏳ |
| 10.5 | Config Herramientas: Emilia | Configuración de AI aplicada | ⏳ |

### MÓDULO 11: INTEGRACIONES

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 11.1 | Configurar integración | Se guarda config | ⏳ |
| 11.2 | Probar conexión | Test exitoso/fallido | ⏳ |
| 11.3 | Ver logs | Historial de actividad | ⏳ |

### MÓDULO 12: ESTADÍSTICAS

| # | Acción | Impacto Esperado | Estado |
|---|--------|------------------|--------|
| 12.1 | Dashboard | Muestra métricas actualizadas | ⏳ |
| 12.2 | Estadísticas clientes | Total, nuevos, inactivos | ⏳ |
| 12.3 | Estadísticas operaciones | Por estado, destino, tendencias | ⏳ |
| 12.4 | Estadísticas ventas | Pipeline, conversión, por vendedor | ⏳ |

---

## 🔗 CONEXIONES CRÍTICAS

1. **Lead → Cliente + Operación**: La conversión debe crear ambos
2. **Operación → Factura**: Una operación puede generar facturas
3. **Cliente → Notas/Interacciones/Operaciones**: Todo vinculado
4. **Equipo → Usuarios → Metas → Ventas**: Cadena de seguimiento
5. **Config → Formularios → Validaciones**: Settings aplicados
6. **Operador → Operación → Pagos**: Flujo financiero

---

## 🐛 BUGS ENCONTRADOS

| # | Bug | Módulo | Prioridad | Estado |
|---|-----|--------|-----------|--------|
| B1 | No se puede crear operador desde conversión de lead | Leads/Operadores | ALTA | ⏳ |

---

## 📝 NOTAS DE TESTING

_Documentar hallazgos aquí_

