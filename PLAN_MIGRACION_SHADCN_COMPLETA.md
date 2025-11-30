# 📋 PLAN COMPLETO DE MIGRACIÓN A SHADCN/UI

**Fecha de creación:** 2024  
**Objetivo:** Migrar todos los elementos HTML nativos a componentes shadcn/ui, implementar modo oscuro completo y asegurar 100% responsividad.

---

## 🎯 OBJETIVOS PRINCIPALES

1. ✅ Reemplazar TODOS los elementos HTML nativos por componentes shadcn/ui
2. ✅ Implementar modo oscuro completo con toggle funcional
3. ✅ Garantizar 100% responsividad en todos los componentes
4. ✅ Mantener consistencia visual en toda la aplicación

---

## 🔍 ANÁLISIS ACTUAL DEL PROYECTO

### ✅ Componentes shadcn/ui YA Instalados (39 componentes)
- accordion, alert, alert-dialog, avatar, badge, breadcrumb, button
- calendar, card, checkbox, collapsible, command, context-menu
- data-table, dialog, drawer, dropdown-menu, field, form
- hover-card, input, label, menubar, navigation-menu
- popover, progress, radio-group, scroll-area, select
- separator, sheet, sidebar, skeleton, slider
- switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip

### ❌ Elementos que FALTAN implementar:
- **Theme Provider** (next-themes) - YA instalado pero NO implementado
- **Pagination** - Componente no instalado pero necesario para tablas
- **Carousel** - Opcional, pero útil para dashboards
- **Resizable** - Opcional para paneles

---

## 🔄 REEMPLAZOS DE ELEMENTOS HTML NATIVOS

### 1. CHECKBOXES NATIVOS → Switch de shadcn/ui

#### Archivos a modificar:

**📍 `components/tariffs/new-tariff-dialog.tsx` (Línea 394-400)**
```tsx
// ❌ ACTUAL (HTML nativo):
<input
  type="checkbox"
  checked={field.value}
  onChange={(e) => field.onChange(e.target.checked)}
  className="rounded border-gray-300"
/>

// ✅ NUEVO (shadcn Switch):
<Switch
  checked={field.value}
  onCheckedChange={field.onChange}
/>
```

**📍 `components/tariffs/tariff-detail-dialog.tsx` (Línea 530-536)**
```tsx
// Mismo reemplazo que arriba
```

**📍 `components/tariffs/tariffs-page-client.tsx` (Línea 249-255)**
```tsx
// ❌ ACTUAL:
<input
  type="checkbox"
  id="show-active-only"
  checked={showActiveOnly}
  onChange={(e) => setShowActiveOnly(e.target.checked)}
  className="rounded border-gray-300"
/>

// ✅ NUEVO:
<Switch
  id="show-active-only"
  checked={showActiveOnly}
  onCheckedChange={setShowActiveOnly}
/>
```

**📍 `components/quotas/new-quota-dialog.tsx` (Línea 336-341)**
```tsx
// Mismo reemplazo
```

**📍 `components/quotas/quotas-page-client.tsx` (Línea 182-188)**
```tsx
// Mismo reemplazo
```

**📍 `components/sales/new-lead-dialog.tsx` (Línea 401)**
```tsx
// Mismo reemplazo
```

**Total:** 6 archivos a modificar

---

### 2. CHECKBOXES EN FORMS → Checkbox de shadcn/ui (cuando sea apropiado)

Algunos checkboxes podrían mantenerse como Checkbox si tienen múltiples opciones, pero los toggles de activo/inactivo deben ser Switch.

---

## 🌙 IMPLEMENTACIÓN DE MODO OSCURO

### Estado Actual:
- ✅ `darkMode: ["class"]` configurado en `tailwind.config.js`
- ✅ Variables CSS para modo oscuro definidas en `globals.css`
- ✅ `next-themes` instalado en `package.json`
- ❌ **FALTA:** ThemeProvider implementado en el layout

### Cambios Necesarios:

#### 1. Crear componente ThemeProvider wrapper

**📍 Nuevo archivo: `components/theme-provider.tsx`**
```tsx
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

#### 2. Crear componente ThemeToggle

**📍 Nuevo archivo: `components/theme-toggle.tsx`**
```tsx
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Cambiar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Oscuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

#### 3. Modificar `app/layout.tsx`

**📍 `app/layout.tsx`**
```tsx
// Agregar imports:
import { ThemeProvider } from "@/components/theme-provider"

// Envolver children con ThemeProvider:
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {children}
</ThemeProvider>
```

#### 4. Agregar ThemeToggle al SiteHeader

**📍 `components/site-header.tsx`**
```tsx
// Agregar import:
import { ThemeToggle } from "@/components/theme-toggle"

// Agregar en el header (junto al título):
<div className="ml-auto flex items-center gap-2">
  <ThemeToggle />
</div>
```

---

## 📱 MEJORAS DE RESPONSIVIDAD

### Análisis de Componentes que Necesitan Mejoras:

#### 1. Filtros en todas las páginas

**Patrón a aplicar:**
```tsx
// ❌ ACTUAL (puede romperse en móvil):
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">

// ✅ MEJORADO:
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
```

**Archivos a modificar:**
- `components/tariffs/tariffs-page-client.tsx` (Línea 118)
- `components/quotas/quotas-page-client.tsx` (Línea 111)
- `components/dashboard/dashboard-filters.tsx`
- `components/operations/operations-filters.tsx`
- `components/cash/cash-filters.tsx`
- `components/alerts/alerts-filters.tsx`
- `components/accounting/ledger-filters.tsx`
- `components/sales/leads-filters.tsx`

#### 2. Headers de páginas

**Patrón a aplicar:**
```tsx
// ✅ Mejorar estructura responsive:
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div className="space-y-1">
    <h1 className="text-2xl font-bold sm:text-3xl">Título</h1>
    <p className="text-sm text-muted-foreground sm:text-base">Descripción</p>
  </div>
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
    {/* Botones */}
  </div>
</div>
```

#### 3. Tablas - Ya están usando DataTable (✅ bien)

#### 4. Diálogos - Asegurar que sean responsivos

**Patrón a aplicar:**
```tsx
<DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
```

**Archivos a revisar:**
- Todos los diálogos de creación/edición
- Diálogos de detalle

#### 5. KPIs Cards en Dashboard

**Ya tienen responsive, pero verificar:**
- `components/dashboard/dashboard-page-client.tsx` (Línea 105-109)

#### 6. Charts

**Ya tienen responsive, pero verificar:**
- Todos los componentes de gráficos usan `h-[250px] sm:h-[300px]` ✅

---

## 🎨 COMPONENTES ADICIONALES A INSTALAR

### 1. Pagination (Para tablas con muchas páginas)

```bash
npx shadcn@latest add pagination
```

**Uso:** Reemplazar paginación custom en DataTable si existe.

### 2. Carousel (Opcional - para dashboards con múltiples gráficos)

```bash
npx shadcn@latest add carousel
```

**Uso:** Dashboard principal si se quiere mostrar gráficos en carrusel en móvil.

---

## 🔧 MEJORAS ESPECÍFICAS POR MÓDULO

### 📊 Dashboard

1. ✅ KPIs ya responsive
2. ✅ Charts ya responsive
3. ⚠️ Verificar espaciado en móvil
4. ⚠️ Agregar ThemeToggle

### 📝 Leads

1. ✅ Kanban ya responsive (usando ScrollArea)
2. ✅ Tabla usando DataTable
3. ⚠️ Verificar filtros responsive

### 💰 Cotizaciones

1. ✅ Tabla usando DataTable
2. ⚠️ Verificar diálogos responsive
3. ⚠️ Verificar filtros

### 🎫 Tarifarios

1. ⚠️ **Reemplazar checkbox nativo por Switch** (prioridad alta)
2. ⚠️ Verificar filtros responsive
3. ⚠️ Verificar diálogos responsive

### 🎟️ Cupos

1. ⚠️ **Reemplazar checkbox nativo por Switch** (prioridad alta)
2. ⚠️ Verificar filtros responsive
3. ⚠️ Verificar diálogos responsive

### ✈️ Operaciones

1. ✅ Tabla usando DataTable
2. ⚠️ Verificar filtros responsive
3. ⚠️ Verificar diálogos responsive

### 👥 Clientes

1. ✅ Tabla usando DataTable
2. ⚠️ Verificar filtros responsive

### 🏢 Operadores

1. ✅ Tabla usando DataTable

### 💵 Caja

1. ✅ KPIs responsive
2. ✅ Tablas usando DataTable
3. ⚠️ Verificar filtros responsive

### 📚 Contabilidad

1. ✅ Tablas usando DataTable
2. ⚠️ Verificar filtros responsive

### ⚠️ Alertas

1. ✅ Tabla usando DataTable
2. ⚠️ Verificar filtros responsive

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### Fase 1: Modo Oscuro (Prioridad ALTA)
- [ ] Crear `components/theme-provider.tsx`
- [ ] Crear `components/theme-toggle.tsx`
- [ ] Modificar `app/layout.tsx` para incluir ThemeProvider
- [ ] Agregar ThemeToggle a `components/site-header.tsx`
- [ ] Probar modo oscuro en todas las páginas
- [ ] Verificar que todos los componentes se vean bien en modo oscuro

### Fase 2: Reemplazo de Checkboxes (Prioridad ALTA)
- [ ] Reemplazar checkbox en `tariffs/new-tariff-dialog.tsx`
- [ ] Reemplazar checkbox en `tariffs/tariff-detail-dialog.tsx`
- [ ] Reemplazar checkbox en `tariffs/tariffs-page-client.tsx`
- [ ] Reemplazar checkbox en `quotas/new-quota-dialog.tsx`
- [ ] Reemplazar checkbox en `quotas/quotas-page-client.tsx`
- [ ] Reemplazar checkbox en `sales/new-lead-dialog.tsx`
- [ ] Probar todos los formularios

### Fase 3: Responsividad (Prioridad MEDIA)
- [ ] Mejorar filtros en `tariffs/tariffs-page-client.tsx`
- [ ] Mejorar filtros en `quotas/quotas-page-client.tsx`
- [ ] Revisar y mejorar filtros en dashboard
- [ ] Revisar y mejorar filtros en operaciones
- [ ] Revisar y mejorar filtros en caja
- [ ] Revisar y mejorar filtros en contabilidad
- [ ] Revisar y mejorar filtros en alertas
- [ ] Revisar y mejorar filtros en leads
- [ ] Verificar todos los diálogos en móvil
- [ ] Probar en diferentes tamaños de pantalla (320px, 375px, 768px, 1024px, 1440px)

### Fase 4: Componentes Opcionales (Prioridad BAJA)
- [ ] Instalar y configurar Pagination
- [ ] Considerar Carousel para dashboard (opcional)

### Fase 5: Testing Final
- [ ] Probar modo claro
- [ ] Probar modo oscuro
- [ ] Probar modo sistema (auto)
- [ ] Probar en móvil (320px - 767px)
- [ ] Probar en tablet (768px - 1023px)
- [ ] Probar en desktop (1024px+)
- [ ] Verificar accesibilidad (navegación por teclado)
- [ ] Verificar que todos los formularios funcionen correctamente

---

## 🎯 RESUMEN DE CAMBIOS

### Archivos a Modificar: **~25 archivos**

1. **Nuevos archivos (2):**
   - `components/theme-provider.tsx`
   - `components/theme-toggle.tsx`

2. **Archivos a modificar (23):**
   - `app/layout.tsx` - Agregar ThemeProvider
   - `components/site-header.tsx` - Agregar ThemeToggle
   - `components/tariffs/new-tariff-dialog.tsx` - Switch
   - `components/tariffs/tariff-detail-dialog.tsx` - Switch
   - `components/tariffs/tariffs-page-client.tsx` - Switch + Responsive
   - `components/quotas/new-quota-dialog.tsx` - Switch
   - `components/quotas/quotas-page-client.tsx` - Switch + Responsive
   - `components/sales/new-lead-dialog.tsx` - Switch
   - `components/dashboard/dashboard-filters.tsx` - Responsive
   - `components/operations/operations-filters.tsx` - Responsive
   - `components/cash/cash-filters.tsx` - Responsive
   - `components/alerts/alerts-filters.tsx` - Responsive
   - `components/accounting/ledger-filters.tsx` - Responsive
   - `components/sales/leads-filters.tsx` - Responsive
   - Todos los diálogos - Verificar responsive

3. **Componentes a instalar (opcional):**
   - Pagination
   - Carousel (opcional)

---

## ⚠️ NOTAS IMPORTANTES

1. **No romper funcionalidad existente:** Todos los cambios deben mantener la funcionalidad actual
2. **Testing exhaustivo:** Probar cada cambio antes de continuar
3. **Consistencia:** Usar siempre los mismos patrones de shadcn/ui
4. **Accesibilidad:** Verificar que los componentes sean accesibles
5. **Performance:** No agregar componentes innecesarios que afecten el rendimiento

---

## 🚀 ORDEN DE EJECUCIÓN RECOMENDADO

1. **Primero:** Implementar modo oscuro (Fase 1) - Más visible para el usuario
2. **Segundo:** Reemplazar checkboxes (Fase 2) - Mejora inmediata de UI
3. **Tercero:** Mejorar responsividad (Fase 3) - Asegurar funcionamiento en móvil
4. **Cuarto:** Componentes opcionales (Fase 4) - Mejoras adicionales
5. **Quinto:** Testing completo (Fase 5) - Validar todo

---

## 📝 DOCUMENTACIÓN DE REFERENCIA

- [shadcn/ui Components](https://ui.shadcn.com/)
- [next-themes Documentation](https://github.com/pacocoursey/next-themes)
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [shadcn/ui Blocks](https://ui.shadcn.com/blocks)

---

**¿Deseas que proceda con la implementación de estos cambios?**

