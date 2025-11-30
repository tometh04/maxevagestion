# ✅ Checklist de Validación Antes de Hacer Cambios

Este checklist debe seguirse ANTES de hacer cualquier cambio significativo para evitar romper la aplicación.

## 🔍 Pre-Cambio

1. **Verificar estado actual**
   - [ ] Ejecutar `npm run build` y verificar que compila sin errores
   - [ ] Verificar que el servidor está corriendo sin errores
   - [ ] Probar la funcionalidad en el navegador antes de cambiar

2. **Verificar dependencias**
   - [ ] Verificar que todos los imports existen
   - [ ] Verificar que los componentes de shadcn/ui están instalados
   - [ ] Verificar tipos de TypeScript

## 🛠️ Durante el Cambio

1. **Hacer cambios incrementales**
   - [ ] Hacer un cambio a la vez
   - [ ] Verificar compilación después de cada cambio grande
   - [ ] No mezclar múltiples funcionalidades en un solo commit

2. **Validar sintaxis**
   - [ ] Verificar que no hay JSX mal formado (fragmentos sin cerrar, divs duplicados)
   - [ ] Verificar que todos los imports son correctos
   - [ ] Verificar que los tipos TypeScript son correctos

## ✅ Post-Cambio

1. **Validación obligatoria**
   - [ ] Ejecutar `npm run build` y verificar que compila
   - [ ] Verificar que no hay errores en la consola del navegador
   - [ ] Probar la funcionalidad en el navegador
   - [ ] Verificar que no se rompió nada existente

2. **Si hay errores**
   - [ ] NO continuar con más cambios hasta arreglar
   - [ ] Limpiar caché: `rm -rf .next`
   - [ ] Reiniciar servidor
   - [ ] Verificar errores de TypeScript con `npx tsc --noEmit`

## 🚨 Errores Comunes a Evitar

1. **JSX mal formado**
   - Fragmentos `<>` sin cerrar `</>`
   - Divs duplicados
   - Tags sin cerrar

2. **Imports incorrectos**
   - Rutas incorrectas (`@/components` vs `./components`)
   - Componentes que no existen
   - Tipos que no existen

3. **Tipos TypeScript**
   - Usar `as any` solo cuando sea absolutamente necesario
   - Verificar tipos de Supabase después de cambios en schema
   - No usar `any` sin justificación

4. **Caché corrupto**
   - Siempre limpiar `.next` después de errores de compilación
   - Reiniciar servidor después de cambios grandes

## 📝 Proceso Recomendado

```bash
# 1. Antes de cambiar
npm run build  # Verificar que compila

# 2. Hacer cambios

# 3. Después de cambiar
npm run build  # Verificar que sigue compilando
rm -rf .next   # Limpiar caché si hay problemas
npm run dev    # Reiniciar servidor

# 4. Probar en navegador
# - Abrir http://localhost:3000
# - Verificar consola del navegador
# - Probar funcionalidad nueva
```

## 🎯 Regla de Oro

**NUNCA hacer múltiples cambios sin verificar que cada uno funciona correctamente.**

