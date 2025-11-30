# 🎨 UI/UX Decisions - Travel Agency Management Platform

Este documento registra todas las decisiones de diseño y componentes de shadcn/ui que usaremos en el proyecto.

**Fuente**: https://ui.shadcn.com/

---

## 📚 COMPONENTES BASE DE shadcn/ui

### Componentes Fundamentales (Ya Instalados/Necesarios)

#### Layout & Navigation
- ✅ **Sheet** - Para sidebar móvil y paneles laterales (AI Copilot)
- ✅ **ScrollArea** - Para listas largas y contenido scrolleable
- ✅ **Separator** - Divisores visuales
- ✅ **Tabs** - Navegación por pestañas (Settings, Leads views)

#### Forms & Inputs
- ✅ **Form** - Formularios con react-hook-form
- ✅ **Input** - Campos de texto
- ✅ **Textarea** - Campos de texto multilínea
- ✅ **Select** - Selectores dropdown
- ✅ **Label** - Etiquetas de formulario
- ✅ **Checkbox** - Casillas de verificación
- ✅ **Radio Group** - Grupos de opciones
- ✅ **Switch** - Toggles on/off
- ✅ **Slider** - Deslizadores (para filtros de rango)

#### Data Display
- ✅ **Table** - Tablas de datos
- ✅ **Card** - Tarjetas contenedoras
- ✅ **Badge** - Etiquetas de estado (status, region)
- ✅ **Avatar** - Avatares de usuarios
- ✅ **Progress** - Barras de progreso
- ✅ **Skeleton** - Placeholders de carga

#### Feedback
- ✅ **Alert** - Alertas y mensajes
- ✅ **Toast** - Notificaciones toast
- ✅ **Dialog** - Modales y diálogos
- ✅ **Alert Dialog** - Diálogos de confirmación

#### Overlays
- ✅ **Dropdown Menu** - Menús desplegables
- ✅ **Popover** - Popovers informativos
- ✅ **Tooltip** - Tooltips
- ✅ **Command** - Búsqueda con comandos (⌘K)

#### Navigation
- ✅ **Button** - Botones
- ✅ **Link** - Enlaces
- ✅ **Breadcrumb** - Migas de pan

---

## 🧩 BLOQUES DE shadcn/ui A UTILIZAR

### Authentication
- **Login Block**: `login-01` ✅ (Ya implementado)
  - Usa: Card, Form, Input, Button, Alert
  - Ubicación: `/app/(auth)/login/page.tsx`

### Dashboard
- **Dashboard Block**: `dashboard-01` o `dashboard-02`
  - KPIs con Card
  - Charts integrados
  - Filtros con Select y Date Picker
  - Ubicación: `/app/(dashboard)/dashboard/page.tsx`

### Data Tables
- **Table Block**: `table-01` o `table-02`
  - Tabla con paginación
  - Filtros integrados
  - Acciones por fila
  - Usar en: Leads, Operations, Customers, Operators, Payments

### Kanban Board
- **Kanban Block**: Crear custom usando:
  - ScrollArea para columnas
  - Card para cada lead
  - Drag & drop con `@dnd-kit/core`
  - Ubicación: `/components/sales/leads-kanban.tsx`

### Settings Pages
- **Settings Block**: `settings-01`
  - Tabs para diferentes secciones
  - Formularios organizados
  - Ubicación: `/app/(dashboard)/settings/page.tsx`

---

## 📊 CHARTS Y VISUALIZACIONES

### Librería Recomendada
- **Recharts** (ya instalado) - Compatible con React Server Components
- Alternativa: **Chart.js** con `react-chartjs-2` si necesitamos más opciones

### Charts Necesarios (Dashboard)

1. **Sales by Seller (Bar Chart)**
   - Componente: Recharts `<BarChart>`
   - Datos: Ventas agrupadas por vendedor
   - Ubicación: Dashboard principal

2. **Sales by Destination (Pie/Bar Chart)**
   - Componente: Recharts `<PieChart>` o `<BarChart>`
   - Datos: Ventas agrupadas por destino
   - Ubicación: Dashboard principal

3. **Cash Flow Over Time (Line Chart)**
   - Componente: Recharts `<LineChart>`
   - Datos: Flujo de caja por fecha
   - Ubicación: Dashboard principal

4. **Top 5 Destinations (Bar Chart)**
   - Componente: Recharts `<BarChart>`
   - Datos: Top 5 destinos más vendidos
   - Ubicación: Dashboard principal

### Estilo de Charts
- Usar tema de shadcn/ui (colores slate)
- Envolver en `Card` de shadcn
- Títulos con `CardHeader` y `CardTitle`

---

## 🎯 ESTRUCTURA DE UI POR MÓDULO

### 1. Layout Principal (`app/(dashboard)/layout.tsx`)

#### Sidebar
- **Componente Base**: `Sheet` (móvil) + `div` (desktop)
- **Navegación**: 
  - `ScrollArea` para el contenido
  - `Button` con variant="ghost" para items
  - `Separator` entre secciones
  - `Badge` para contadores (opcional)
- **Logo/Header**: `Card` o simple `div` con logo

#### Navbar
- **Componente Base**: `div` con flex
- **Agency Selector**: `Select` de shadcn
- **User Menu**: `DropdownMenu` con `Avatar`
- **AI Copilot Button**: `Button` con icono
- **Notifications**: `Button` con `Badge` para contador

---

### 2. Dashboard (`/dashboard`)

#### Estructura
- **Container**: `div` con grid layout
- **KPIs**: `Card` con `CardHeader`, `CardTitle`, `CardContent`
- **Charts**: `Card` con `CardHeader` y Recharts dentro
- **Filtros**: `Card` con `Select`, `DatePicker` (custom o shadcn)

#### Componentes shadcn/ui
- `Card` (múltiples)
- `Select` (filtros)
- `Button` (acciones)
- `Badge` (estados)
- `Separator` (divisores)

---

### 3. Sales - Leads (`/sales/leads`)

#### Vista Kanban
- **Container**: `div` con flex horizontal
- **Columnas**: `ScrollArea` con `Card` dentro
- **Lead Cards**: `Card` con:
  - `Badge` para status y region
  - `Avatar` para seller
  - `Button` con icono para Trello link
- **Drag & Drop**: `@dnd-kit/core` (librería externa)

#### Vista Table
- **Componente**: `Table` de shadcn
- **Filtros**: `Card` con `Select`, `Input`, `Button`
- **Acciones**: `DropdownMenu` por fila
- **Paginación**: Custom con `Button`

#### Componentes shadcn/ui
- `Tabs` (Kanban/Table switch)
- `Table`
- `Card`
- `Badge`
- `Avatar`
- `Select`
- `Input`
- `Button`
- `DropdownMenu`
- `ScrollArea`

---

### 4. Operations (`/operations`)

#### Lista de Operaciones
- **Componente**: `Table` de shadcn
- **Filtros**: Similar a Leads
- **Acciones**: Ver detalle, editar, cancelar

#### Detalle de Operación
- **Layout**: `Tabs` para diferentes secciones:
  - Tab 1: Información básica (`Card`)
  - Tab 2: Clientes (`Table`)
  - Tab 3: Documentos (`Card` con lista + `Button` upload)
  - Tab 4: Pagos (`Table`)
  - Tab 5: Alertas (`Card` con timeline)

#### Componentes shadcn/ui
- `Table`
- `Tabs`
- `Card`
- `Button`
- `Dialog` (para upload de documentos)
- `Badge` (para status)
- `Alert` (para alertas)

---

### 5. Customers (`/customers`)

#### Lista de Clientes
- **Componente**: `Table` de shadcn
- **Búsqueda**: `Input` con icono de búsqueda
- **Filtros**: `Select` y `Input`

#### Detalle de Cliente
- **Layout**: Similar a Operations
- **Tabs**: Info, Operaciones, Pagos, Documentos

#### Componentes shadcn/ui
- `Table`
- `Input` (búsqueda)
- `Select` (filtros)
- `Tabs`
- `Card`
- `Avatar` (foto de perfil opcional)

---

### 6. Documents & OCR (`/operations/[id]` o `/customers/[id]`)

#### Upload Dialog
- **Componente**: `Dialog` de shadcn
- **Formulario**: `Form` con:
  - `Input` type="file"
  - `Select` para tipo de documento
  - `Button` para submit

#### Resultados OCR
- **Componente**: `Alert` o `Card` con `Table`
- **Campos detectados**: Mostrar en `Table` o lista
- **Acciones**: `Button` para confirmar/editar

#### Componentes shadcn/ui
- `Dialog`
- `Form`
- `Input`
- `Select`
- `Button`
- `Alert`
- `Table` (resultados)
- `Card`

---

### 7. Cash & Finances (`/cash`)

#### Página Principal
- **KPIs**: `Card` con métricas
- **Filtros**: `Card` con `Select`, `DatePicker`
- **Resumen**: `Card` con información

#### Tabla de Pagos
- **Componente**: `Table` de shadcn
- **Acciones**: `Button` "Mark as paid" → abre `Dialog`
- **Filtros**: `Select`, `Input`, `Button`

#### Dialog "Mark as Paid"
- **Componente**: `Dialog` con `Form`
- **Campos**: `Input` (date_paid), `Input` (reference)
- **Botones**: `Button` (confirmar/cancelar)

#### Componentes shadcn/ui
- `Card` (KPIs)
- `Table`
- `Dialog`
- `Form`
- `Input`
- `Select`
- `Button`
- `Badge` (para status de pago)

---

### 8. Operators (`/operators`)

#### Lista de Operadores
- **Componente**: `Table` de shadcn
- **Columnas**: Nombre, operaciones, total, pagado, balance, próximo pago
- **Acciones**: Ver detalle

#### Detalle de Operador
- **Layout**: Similar a Operations
- **Tabs**: Info, Operaciones, Pagos, Alertas

#### Componentes shadcn/ui
- `Table`
- `Tabs`
- `Card`
- `Badge` (para balance positivo/negativo)
- `Progress` (opcional, para visualizar pagos)

---

### 9. Commissions (`/my/commissions`)

#### Tabla de Comisiones
- **Componente**: `Table` de shadcn
- **Agrupación**: Por mes (usar `Card` para cada mes)
- **Resumen**: `Card` con totales

#### Componentes shadcn/ui
- `Table`
- `Card`
- `Badge` (PENDING/PAID)
- `Progress` (opcional)

---

### 10. Alerts (`/alerts`)

#### Lista de Alertas
- **Componente**: `Card` con lista o `Table`
- **Filtros**: `Select`, `Input`, `Button`
- **Acciones**: `Button` para marcar como DONE/IGNORED

#### Componentes shadcn/ui
- `Card` (cada alerta)
- `Table` (vista alternativa)
- `Badge` (tipo de alerta, status)
- `Alert` (estilo de alerta)
- `Select` (filtros)
- `Button` (acciones)

---

### 11. Settings (`/settings`)

#### Estructura General
- **Container**: `Tabs` para diferentes secciones
- **Cada Tab**: `Card` con formularios

#### Tab Users
- **Lista**: `Table` de usuarios
- **Formulario Invitación**: `Dialog` con `Form`
- **Acciones**: `DropdownMenu` por usuario

#### Tab Agencies
- **Lista**: `Card` o `Table`
- **Formulario**: `Form` con `Input`, `Select`

#### Tab Trello
- **Sub-tabs**: Credentials, Status Mapping, Region Mapping, Sync
- **Formularios**: `Form` con `Input`, `Select`
- **Tabla de Mapeo**: `Table` con `Select` por fila
- **Botón Sync**: `Button` con loading state

#### Tab Commissions
- **Lista de Reglas**: `Table` o `Card`
- **Formulario**: `Dialog` con `Form`

#### Tab AI
- **Toggle**: `Switch` para activar/desactivar
- **Select**: `Select` para roles permitidos

#### Componentes shadcn/ui
- `Tabs`
- `Table`
- `Card`
- `Dialog`
- `Form`
- `Input`
- `Select`
- `Switch`
- `Button`
- `Badge`

---

### 12. AI Copilot

#### Panel Lateral
- **Componente**: `Sheet` de shadcn (lado derecho)
- **Header**: `CardHeader` con título
- **Chat History**: `ScrollArea` con `Card` para cada mensaje
- **Input**: `Textarea` o `Input` con `Button` "Send"

#### Mensajes
- **Usuario**: `Card` con alineación derecha
- **AI**: `Card` con alineación izquierda
- **Links**: `Button` variant="link" para navegación

#### Componentes shadcn/ui
- `Sheet`
- `ScrollArea`
- `Card`
- `Textarea`
- `Button`
- `Badge` (opcional, para indicar que hay datos)

---

## 🎨 TEMA Y ESTILOS

### Tema Base
- **Base Color**: Slate (ya configurado)
- **Modo**: Light/Dark (usar `next-themes` con shadcn)

### Colores por Estado
- **Success**: Verde (pagos completados, operaciones confirmadas)
- **Warning**: Amarillo (pagos próximos a vencer, alertas)
- **Error**: Rojo (pagos vencidos, operaciones canceladas)
- **Info**: Azul (información general)

### Tipografía
- **Font**: Inter (default de shadcn)
- **Tamaños**: Usar sistema de shadcn (text-sm, text-base, etc.)

---

## 📦 COMPONENTES PERSONALIZADOS A CREAR

### Componentes de Negocio (usando shadcn primitives)

1. **StatusBadge** - Badge con colores según status
   - Usa: `Badge` de shadcn
   - Props: status (NEW, IN_PROGRESS, etc.)

2. **RegionBadge** - Badge para regiones
   - Usa: `Badge` de shadcn
   - Props: region

3. **PaymentStatusBadge** - Badge para estado de pago
   - Usa: `Badge` de shadcn
   - Props: status (PENDING, PAID, OVERDUE)

4. **KPICard** - Card para métricas
   - Usa: `Card` de shadcn
   - Props: title, value, change, icon

5. **DataTable** - Tabla con filtros y paginación
   - Usa: `Table` de shadcn
   - Props: data, columns, filters

6. **FilterBar** - Barra de filtros
   - Usa: `Card` con `Select`, `Input`, `Button`
   - Props: filters, onFilterChange

---

## 🔧 LIBRERÍAS ADICIONALES

### Drag & Drop
- **@dnd-kit/core** - Para Kanban board
- **@dnd-kit/sortable** - Para ordenamiento

### Date Picker
- **react-day-picker** - Compatible con shadcn
- Componente: `Calendar` de shadcn/ui

### Icons
- **lucide-react** - Ya instalado, usado por shadcn

### Charts
- **recharts** - Ya instalado

---

## 📋 CHECKLIST DE COMPONENTES shadcn/ui A INSTALAR

### Prioridad Alta (Fase 1-2)
- [x] Card
- [x] Button
- [x] Input
- [x] Form
- [x] Table
- [x] Tabs
- [x] Dialog
- [x] Sheet
- [x] Select
- [x] Badge
- [x] Avatar
- [x] DropdownMenu
- [x] ScrollArea
- [x] Separator
- [x] Alert
- [x] Label

### Prioridad Media (Fase 3-6)
- [x] Textarea
- [x] Checkbox
- [x] Radio Group
- [x] Switch
- [x] Toast
- [x] Popover
- [x] Tooltip
- [x] Progress
- [x] Skeleton
- [x] Command (⌘K search)

### Prioridad Baja (Fase 7+)
- [x] Slider
- [x] Calendar (Date Picker)
- [x] Accordion
- [x] Collapsible
- [x] Menubar
- [x] Navigation Menu
- [x] Context Menu
- [x] Hover Card
- [x] Toggle
- [x] Toggle Group
- [x] Alert Dialog
- [x] Breadcrumb

---

## 🎯 DECISIONES DE UX

### Navegación
- **Sidebar**: Siempre visible en desktop, `Sheet` en móvil
- **Breadcrumbs**: En páginas de detalle
- **Búsqueda Global**: `Command` (⌘K) para búsqueda rápida (futuro)

### Feedback Visual
- **Loading States**: `Skeleton` para tablas, `Progress` para procesos
- **Success**: `Toast` para acciones exitosas
- **Errors**: `Alert` para errores importantes, `Toast` para menores

### Modales y Diálogos
- **Confirmaciones**: `AlertDialog` para acciones destructivas
- **Formularios**: `Dialog` para crear/editar
- **Información**: `Sheet` para paneles laterales (AI Copilot)

### Responsive
- **Mobile First**: Todos los componentes deben funcionar en móvil
- **Breakpoints**: Usar sistema de Tailwind (sm, md, lg, xl)

---

## 📝 NOTAS DE IMPLEMENTACIÓN

### Orden de Instalación de Componentes
1. Instalar componentes base primero (Card, Button, Input, etc.)
2. Instalar componentes de layout (Sheet, Tabs, ScrollArea)
3. Instalar componentes de datos (Table, Badge, Avatar)
4. Instalar componentes de feedback (Alert, Toast, Dialog)
5. Instalar componentes avanzados según necesidad

### Comandos de Instalación
```bash
# Ejemplo de instalación
npx shadcn-ui@latest add card
npx shadcn-ui@latest add button
npx shadcn-ui@latest add table
# etc.
```

### Customización
- Todos los componentes se pueden customizar en `components/ui/`
- Usar variables CSS de shadcn para temas
- Mantener consistencia con el sistema de diseño

---

## 🔄 ACTUALIZACIONES

Este documento se actualizará conforme avancemos en el desarrollo y descubramos necesidades adicionales de UI/UX.

**Última actualización**: 2025-11-25
**Estado**: ✅ **TODOS LOS COMPONENTES INSTALADOS** (38 componentes)
**Componentes críticos**: ✅ form, ✅ alert-dialog, ✅ calendar, ✅ command
**Próximo paso**: Comenzar Fase 1 del roadmap - Layout y Navegación

---

## ✅ COMPONENTES INSTALADOS (38 total)

1. accordion
2. alert
3. alert-dialog ✅
4. avatar
5. badge
6. breadcrumb
7. button
8. calendar ✅
9. card
10. checkbox
11. collapsible
12. command ✅
13. context-menu
14. dialog
15. dropdown-menu
16. form ✅
17. hover-card
18. input
19. label
20. menubar
21. navigation-menu
22. popover
23. progress
24. radio-group
25. scroll-area
26. select
27. separator
28. sheet
29. skeleton
30. slider
31. switch
32. table
33. tabs
34. textarea
35. toast
36. toaster
37. toggle
38. tooltip

