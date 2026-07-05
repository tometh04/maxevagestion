# 📋 Estado Actual y Pendientes

**Última actualización:** 2025-01-22

---

## ✅ LO QUE QUEDÓ HECHO (esta sesión / reciente)

### 1. Deploy y errores de build
- ✅ Corregidos errores ESLint (`react/no-unescaped-entities`) en debts-sales, operator-payments, cash-summary
- ✅ Corregido `useEffect` en pay-recurring-expense-dialog
- ✅ Corregida variable duplicada `expenseCurrency` y scope de `allPayments` en receipt-data

### 2. Guía de migración de datos
- ✅ **Guía completa:** `docs/GUIA_MIGRACION_DATOS.md` (paso a paso, orden, validaciones)
- ✅ **CSVs de ejemplo:** `docs/csv-ejemplos/` (operadores, clientes, tipos_cambio, cuentas_financieras, operaciones, operaciones_operadores, pagos)
- ✅ Orden de importación definido y documentado

### 3. Cerebro (función RPC)
- ✅ **Migración 061:** Ya la ejecutaste vos → función `execute_readonly_query` existe
- ✅ **Migración 091:** Creada para soportar queries multilínea (fix de validación)
- ✅ **Tests:** `scripts/test-cerebro-rpc-function.ts` — 15 tests, todos pasando
- ✅ **Docs:** `docs/CEREBRO_FIX_FUNCION_RPC.md`, `docs/CEREBRO_TESTING_RESULTS.md`

---

## 🔴 PENDIENTE DE TU LADO (acciones que tenés que hacer)

### 1. Migración 091 en producción (Cerebro)
- **Qué:** Ejecutar la migración que mejora `execute_readonly_query` para queries multilínea
- **Dónde:** Supabase Dashboard → SQL Editor
- **Archivo:** `supabase/migrations/091_fix_execute_readonly_query_multiline.sql`
- **Por qué:** Sin esto, Cerebro puede fallar con queries que tengan saltos de línea

### 2. Migración de datos (cuando quieras cargar histórico)
- **Qué:** Seguir la guía y cargar CSVs en el orden indicado
- **Dónde:** Configuración → Importar Datos + `docs/GUIA_MIGRACION_DATOS.md`
- **Orden:** Operadores → Clientes → (Tipos cambio) → Cuentas financieras → Operaciones → (Operaciones-Operadores) → Pagos

---

## 📌 PENDIENTES DEL SISTEMA (roadmap / backlog)

*(Del doc de mejoras – no urgente, según prioridad)*

### Pendientes de cliente
- [ ] Eliminar check-in/check-out de operaciones
- [ ] Corregir validación de fechas
- [ ] Revisar comportamiento del diálogo en algunas operaciones
- [ ] Verificar terminología en toda la aplicación

### Mejoras futuras sugeridas
- [ ] Carga integrada de cliente y operación
- [ ] Descarga de planillas a Excel (DS por ventas y cuentas por pagar)
- [ ] Forma de cargar pagos con tarjeta de crédito
- [ ] Búsqueda exhaustiva ARS/USD en dashboard, reportes, tablas

### Otros ítems que salieron en conversaciones anteriores
- [ ] Facturas: cliente sin operación, punto de venta por agencia, AFIP
- [ ] Crear nueva caja/cuenta financiera desde Caja → Resumen (hoy se hace desde otro lado)
- [ ] Comisiones visibles para vendedores que también son sellers
- [ ] Permisos e invitaciones de usuarios
- [ ] Múltiples clientes en una operación (OCR/grupos)
- [ ] Tooltips de ayuda (HelpCircle) en más secciones
- [ ] Gráficos de Gastos Recurrentes (diseño y datos)
- [ ] Optimización de imágenes (Fase 3 performance)

---

## 🎯 Resumen en una frase

**Hecho:** Deploy estable, guía de migración lista, Cerebro con función RPC y tests pasando.  
**Tu pendiente inmediato:** Ejecutar migración 091 en Supabase si querés que Cerebro maneje bien queries multilínea.  
**Después:** Cuando quieras, seguir la guía para migrar datos históricos; el resto es backlog según prioridad.
