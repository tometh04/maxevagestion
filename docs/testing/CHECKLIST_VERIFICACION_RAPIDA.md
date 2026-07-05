# ✅ CHECKLIST DE VERIFICACIÓN RÁPIDA - POST DEPLOY

**Fecha:** 2025-01-17  
**Objetivo:** Verificación rápida de que las correcciones están funcionando

---

## 🔴 CRÍTICO - Verificar PRIMERO

### 1. Error de SelectItem (Gastos Recurrentes)
**Acción:**
1. Ir a: Finanzas → Contabilidad → Gastos Recurrentes
2. Abrir la consola del navegador (F12 → Console)
3. Verificar que NO aparece el error: `"A <Select.Item /> must have a value prop that is not an empty string"`

**✅ Esperado:** La página carga sin errores en consola

---

### 2. Error 500 en TC Mensual (Posición Contable Mensual)
**Acción:**
1. Ir a: Finanzas → Contabilidad → Posición Mensual
2. Seleccionar mes/año actual
3. En el campo "Tipo de Cambio USD/ARS", ingresar: `1500`
4. Hacer clic en el botón "Guardar" (icono de guardar)
5. Verificar que NO aparece error 500

**✅ Esperado:** Aparece mensaje "Tipo de cambio guardado correctamente" y muestra "Actual: 1500.0000"

**❌ Si falla con error 500:**
- Verificar en Vercel logs si el error es `foreign key constraint`
- Si es así, ejecutar manualmente en Supabase SQL Editor:
```sql
-- Si la tabla ya existe con la constraint incorrecta
ALTER TABLE monthly_exchange_rates 
DROP CONSTRAINT IF EXISTS monthly_exchange_rates_created_by_fkey;

ALTER TABLE monthly_exchange_rates
ADD CONSTRAINT monthly_exchange_rates_created_by_fkey
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

---

## 🟡 VERIFICACIONES RÁPIDAS

### 3. Gastos Recurrentes - Filtros Funcionan
**Acción:**
1. En Gastos Recurrentes, cambiar el filtro de "Mes" a "ALL"
2. Verificar que NO se rompe la página
3. Cambiar el filtro de "Año" a "ALL"
4. Verificar que NO se rompe

**✅ Esperado:** Los filtros funcionan correctamente

---

### 4. Posición Mensual - Distribución de Ganancias
**Acción:**
1. En Posición Mensual, después de guardar un TC
2. Scroll hacia abajo hasta "Distribución de Ganancias del Mes"
3. Verificar que aparecen 3 columnas:
   - Comisiones (con montos ARS/USD)
   - Gastos Operativos (con montos ARS/USD)
   - Participaciones Societarias (con montos ARS/USD)

**✅ Esperado:** La sección aparece y muestra valores (pueden ser 0 si no hay datos del mes)

---

### 5. Búsqueda Global
**Acción:**
1. Presionar `⌘K` o `Ctrl+K` o hacer clic en la lupa
2. Escribir el nombre de un cliente
3. Verificar que aparece en resultados
4. Cerrar y volver a abrir la búsqueda
5. Escribir código de reserva (si existe alguna operación con código)

**✅ Esperado:** La búsqueda funciona sin quedarse en "cargando"

---

## 📊 VERIFICACIONES DE DATOS

### 6. Deudas por Ventas - Cálculos Correctos
**Acción:**
1. Ir a: Finanzas → Contabilidad → Deudores por Ventas
2. Verificar que las deudas están en USD
3. Si hay una operación con venta en ARS, verificar que la deuda está convertida a USD (no que muestre ARS como USD)

**✅ Esperado:** Todas las deudas en USD, conversiones correctas

---

### 7. Pagos en Operaciones - Campo TC
**Acción:**
1. Abrir una operación
2. Ir a sección "Pagos"
3. Hacer clic en "Registrar Cobro"
4. Seleccionar moneda "ARS"
5. Verificar que aparece campo "Tipo de Cambio"

**✅ Esperado:** El campo TC aparece cuando seleccionas ARS

---

## 🎨 VERIFICACIONES DE UI

### 8. Sidebar - Textos No Truncados
**Acción:**
1. Verificar que el sidebar tiene ancho suficiente
2. Expandir "Finanzas → Contabilidad"
3. Verificar que textos como "Deudores por Ventas", "Cuentas Financieras" se ven completos

**✅ Esperado:** Textos completos, sin truncamiento

---

## ✅ RESUMEN DE VERIFICACIÓN

**Marca lo que verificaste:**

- [ ] **CRÍTICO 1:** No hay error SelectItem en Gastos Recurrentes
- [ ] **CRÍTICO 2:** TC Mensual se guarda sin error 500
- [ ] Filtros de Gastos Recurrentes funcionan
- [ ] Distribución de Ganancias aparece en Posición Mensual
- [ ] Búsqueda global funciona
- [ ] Deudas por Ventas calcula en USD
- [ ] Campo TC aparece en pagos ARS
- [ ] Sidebar muestra textos completos

---

## 🐛 SI ALGO FALLA

**Error de SelectItem:**
- Verificar que `recurring-payments-page-client.tsx` usa `value="ALL"` (no `value=""`)

**Error 500 en TC:**
- Verificar que la migración 087 fue ejecutada con `users(id)` (no `auth.users(id)`)
- Si no, ejecutar el SQL manual de corrección arriba

**Otros errores:**
- Revisar consola del navegador (F12)
- Revisar logs de Vercel
- Comparar con el código en el repositorio
