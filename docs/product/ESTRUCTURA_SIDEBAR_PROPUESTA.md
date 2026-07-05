# 🎨 Estructura Visual del Sidebar Propuesto

## 📐 Vista Visual del Sidebar

### Estado Colapsado (Solo Iconos)
```
┌─────────────────────┐
│  MAXEVA GESTION     │
├─────────────────────┤
│ 📊                   │ Dashboard
│ 👥                   │ Clientes
│ 📋                   │ Operaciones
│ 🛒                   │ Ventas
│ 💰                   │ Finanzas
│ 📚                   │ Recursos
│ 📄                   │ Documentos
│ 🏢                   │ Agencia
│ 🤖                   │ Herramientas
└─────────────────────┘
```

### Estado Expandido (Con Submenús)

#### Vista Completa (Todo Expandido)
```
┌─────────────────────────────────────┐
│  MAXEVA GESTION                     │
├─────────────────────────────────────┤
│                                     │
│ 📊 Dashboard                        │ ← Link directo (NO colapsable)
│                                     │
│ ▼ 👥 Clientes                       │ ← Colapsable (expandido)
│   ├─ Clientes                       │
│   ├─ Estadísticas                   │
│   └─ Configuración                  │
│                                     │
│ ▼ 📋 Operaciones                   │ ← Colapsable (expandido)
│   ├─ Operaciones                    │
│   ├─ Estadísticas                   │
│   ├─ Facturación                    │
│   └─ Configuración                  │
│                                     │
│ ▼ 🛒 Ventas                         │ ← Colapsable (expandido)
│   ├─ Leads                          │
│   ├─ CRM Manychat                   │
│   └─ Estadísticas                   │
│                                     │
│ ▼ 💰 Finanzas                      │ ← Colapsable (expandido)
│   ├─ ▼ Caja                         │ ← Submenú colapsable
│   │  ├─ Resumen                     │
│   │  ├─ Ingresos                    │
│   │  └─ Egresos                     │
│   ├─ ▼ Contabilidad                 │ ← Submenú colapsable
│   │  ├─ Libro Mayor                 │
│   │  ├─ IVA                         │
│   │  ├─ Cuentas Financieras         │
│   │  ├─ Posición Mensual            │
│   │  ├─ Pagos a Operadores          │
│   │  ├─ Pagos Recurrentes           │
│   │  └─ Cuentas de Socios            │
│   ├─ 💵 Mi Balance                  │
│   ├─ 💵 Mis Comisiones              │
│   └─ ⚙️ Configuración               │
│                                     │
│ ▼ 📚 Recursos                       │ ← Colapsable (expandido)
│   ├─ Notas                          │
│   ├─ Calendario                     │
│   └─ Templates                      │
│                                     │
│ ▼ 📄 Documentos                     │ ← Colapsable (expandido)
│   ├─ Reportes                       │
│   ├─ Mensajes                       │
│   └─ Alertas                        │
│                                     │
│ ▼ 🏢 Agencia                        │ ← Colapsable (expandido)
│   ├─ Configuración                  │
│   ├─ Operadores                     │
│   ├─ Usuarios                       │
│   ├─ Equipos                        │
│   └─ Integraciones                  │
│                                     │
│ ▼ 🤖 Herramientas                   │ ← Colapsable (expandido)
│   ├─ Emilia (AI Copilot)            │
│   └─ Configuración                  │
│                                     │
└─────────────────────────────────────┘
```

#### Vista Normal (Algunos Colapsados)
```
┌─────────────────────────────────────┐
│  MAXEVA GESTION                     │
├─────────────────────────────────────┤
│                                     │
│ 📊 Dashboard                        │
│                                     │
│ ▼ 👥 Clientes                       │ ← Expandido
│   ├─ Clientes                       │
│   ├─ Estadísticas                   │
│   └─ Configuración                  │
│                                     │
│ ▶ 📋 Operaciones                   │ ← Colapsado (solo muestra título)
│                                     │
│ ▶ 🛒 Ventas                        │ ← Colapsado
│                                     │
│ ▼ 💰 Finanzas                      │ ← Expandido
│   ├─ ▼ Caja                         │ ← Submenú expandido
│   │  ├─ Resumen                     │
│   │  ├─ Ingresos                    │
│   │  └─ Egresos                     │
│   ├─ ▶ Contabilidad                 │ ← Submenú colapsado
│   ├─ 💵 Mi Balance                  │
│   ├─ 💵 Mis Comisiones              │
│   └─ ⚙️ Configuración               │
│                                     │
│ ▶ 📚 Recursos                      │ ← Colapsado
│                                     │
│ ▶ 📄 Documentos                    │ ← Colapsado
│                                     │
│ ▶ 🏢 Agencia                       │ ← Colapsado
│                                     │
│ ▶ 🤖 Herramientas                  │ ← Colapsado
│                                     │
└─────────────────────────────────────┘
```

## 📊 Comparación: Antes vs Después

### ANTES (Actual) - 16 Items
```
📊 Dashboard
🛒 Leads
💬 CRM Manychat
✈️ Operaciones
👥 Clientes
🏢 Operadores
💰 Caja
   ├─ Resumen
   ├─ Ingresos
   └─ Egresos
🧮 Contabilidad
   ├─ Libro Mayor
   ├─ IVA
   └─ ... (7 items más)
💬 Mensajes
⚠️ Alertas
📅 Calendario
📄 Reportes
💰 Mi Balance
💰 Mis Comisiones
❤️ Emilia
⚙️ Configuración
```

### DESPUÉS (Propuesto) - 8 Items Principales
```
📊 Dashboard (directo)

👥 Clientes (colapsable)
📋 Operaciones (colapsable)
🛒 Ventas (colapsable)
💰 Finanzas (colapsable)
📚 Recursos (colapsable)
📄 Documentos (colapsable)
🏢 Agencia (colapsable)
🤖 Herramientas (colapsable)
```

**Reducción:** De 16 items a 8 items principales (50% menos)

## 🎯 Estructura de Niveles

### Nivel 1: Items Principales (8 items)
Todos colapsables excepto Dashboard

### Nivel 2: Submenús (dentro de cada item principal)
- Clientes: 3 subitems
- Operaciones: 4 subitems
- Ventas: 3 subitems
- Finanzas: 5 subitems (incluyendo 2 submenús anidados)
- Recursos: 3 subitems
- Documentos: 3 subitems
- Agencia: 5 subitems
- Herramientas: 2 subitems

### Nivel 3: Sub-submenús (solo en Finanzas)
- Caja: 3 subitems
- Contabilidad: 7 subitems

## 🔄 Comportamiento Interactivo

### Al hacer clic en un item principal:
- Si está colapsado → Se expande mostrando submenús
- Si está expandido → Se colapsa ocultando submenús
- El chevron (▶/▼) indica el estado

### Al hacer clic en un subitem:
- Navega a la ruta correspondiente
- El item se marca como activo (highlight)
- Si el item principal estaba colapsado, se expande automáticamente

### Estados Visuales:
- **Activo:** Fondo azul, texto blanco
- **Hover:** Fondo gris claro
- **Colapsado:** Chevron apuntando a la derecha (▶)
- **Expandido:** Chevron apuntando abajo (▼)

## 📱 Responsive

### Desktop (Sidebar completo)
- Muestra todos los items con texto
- Permite colapsar/expandir individualmente
- Ancho: ~256px expandido, ~64px colapsado

### Mobile (Sidebar colapsado)
- Solo muestra iconos
- Al hacer clic, muestra drawer lateral
- Ancho: 100% del viewport

## 🎨 Detalles Visuales

### Espaciado:
- Entre items principales: 4px
- Entre subitems: 2px
- Padding interno: 12px horizontal, 8px vertical

### Iconos:
- Tamaño: 16px
- Color: Muted cuando inactivo, Blanco cuando activo
- Espaciado con texto: 12px

### Tipografía:
- Items principales: font-medium, 14px
- Subitems: font-normal, 13px
- Sub-subitems: font-normal, 12px

### Indentación:
- Items principales: 0px
- Subitems nivel 2: 24px
- Subitems nivel 3: 48px

