# MAXEVA GESTION - Sistema de Gestión de Agencia de Viajes

Sistema completo de gestión para agencia de viajes construido con Next.js 14, TypeScript, shadcn/ui, Supabase y OpenAI.

## 📊 Estado del Proyecto

**Versión:** 1.0.0 (Producción)  
**Última actualización:** Diciembre 2025  
**Estado:** ✅ Listo para Producción

Ver [ROADMAP_PRODUCCION.md](./ROADMAP_PRODUCCION.md) para detalles completos del estado del proyecto.

## 🚀 Stack Tecnológico

- **Next.js 14+** (App Router) + React + TypeScript
- **shadcn/ui** - Sistema de diseño
- **TailwindCSS** - Estilos
- **Supabase** - Base de datos (Postgres), Autenticación y Storage
- **OpenAI** - GPT-4o para OCR y AI Copilot
- **Trello API** - Sincronización de leads y pipeline de ventas

## 📋 Características Principales

### Gestión de Ventas
- ✅ **Pipeline de ventas** (Leads Kanban + Tabla con paginación)
- ✅ **Sincronización bidireccional con Trello** (webhooks, retry logic)
- ✅ **Conversión de Leads a Operaciones**
- ✅ **Búsqueda global** (Cmd+K / Ctrl+K)

### Operaciones
- ✅ **Gestión completa de operaciones** con múltiples clientes
- ✅ **Seguimiento de estados** (Pre-reserva → Reservado → Confirmado → Viajado → Cerrado)
- ✅ **Gestión de documentos** con OCR automático (OpenAI Vision)
- ✅ **Alertas automáticas** (documentación faltante, pagos pendientes, próximos viajes)

### Finanzas
- ✅ **Gestión de pagos** (clientes y operadores)
- ✅ **Movimientos de caja** con múltiples monedas
- ✅ **Contabilidad automática** (ledger movements, cash movements)
- ✅ **Sistema de comisiones** configurable
- ✅ **Reportes financieros** y análisis de cashflow

### Otros Módulos
- ✅ **Módulo de clientes** con historial completo
- ✅ **Gestión de operadores** (mayoristas)
- ✅ **Dashboard con KPIs** en tiempo real (con caché optimizado)
- ✅ **AI Copilot** con contexto completo del negocio
- ✅ **Mensajería WhatsApp** integrada
- ✅ **Calendario** de operaciones

### Seguridad y Permisos
- ✅ **Autenticación robusta** con Supabase Auth
- ✅ **Roles y permisos** (SUPER_ADMIN, ADMIN, SELLER, VIEWER, CONTABLE)
- ✅ **Filtros automáticos** por agencias y roles
- ✅ **Validaciones** en servidor para prevenir datos inválidos

### Performance y Optimización
- ✅ **Paginación server-side** en todas las tablas grandes
- ✅ **Índices de base de datos** optimizados
- ✅ **Caché inteligente** con invalidación automática
- ✅ **Queries N+1 optimizadas** con Promise.all()
- ✅ **Lazy loading** de imágenes

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
cd erplozada
```

2. **Instalar dependencias**
```bash
npm install
# o
pnpm install
```

3. **Configurar variables de entorno**

Crea un archivo `.env.local` basado en `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
OPENAI_API_KEY=tu_openai_api_key
```

4. **Configurar Supabase**

Ejecuta el script SQL en tu base de datos de Supabase (ver `supabase/migrations/001_initial_schema.sql`)

5. **Ejecutar seed (opcional)**
```bash
npm run db:seed
```

6. **Iniciar el servidor de desarrollo**
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 📁 Estructura del Proyecto

```
erplozada/
├── app/
│   ├── (auth)/          # Rutas de autenticación
│   ├── (dashboard)/     # Rutas protegidas del dashboard
│   ├── api/             # API routes
│   └── layout.tsx       # Layout principal
├── components/
│   ├── ui/              # Componentes shadcn/ui
│   ├── dashboard/       # Componentes del dashboard
│   ├── sales/           # Componentes de ventas
│   ├── cash/            # Componentes de caja
│   └── settings/        # Componentes de configuración
├── lib/
│   ├── supabase/        # Clientes y tipos de Supabase
│   └── utils.ts         # Utilidades
└── scripts/
    └── seed.ts          # Script de seed data
```

## 🔐 Roles y Permisos

- **SUPER_ADMIN**: Acceso completo, puede gestionar usuarios y configuración
- **ADMIN**: Acceso operacional y financiero completo
- **SELLER**: Solo sus propios leads/operaciones/comisiones
- **VIEWER**: Solo lectura de la mayoría de datos

## 📊 Base de Datos

El esquema incluye las siguientes tablas principales:

- `users` - Usuarios del sistema
- `agencies` - Agencias (Rosario, Madero)
- `leads` - Leads y oportunidades
- `customers` - Clientes
- `operations` - Operaciones de viajes
- `payments` - Pagos
- `cash_movements` - Movimientos de caja
- `operators` - Operadores/mayoristas
- `commission_rules` - Reglas de comisiones
- `commission_records` - Registros de comisiones
- `documents` - Documentos subidos
- `alerts` - Alertas del sistema
- `settings_trello` - Configuración de Trello

## 🎨 Componentes UI

Todos los componentes UI están construidos con **shadcn/ui**. No se usan otros sistemas de diseño.

## 📚 Documentación

- [Manual de Usuario](./MANUAL_DE_USUARIO.md) - Guía completa para usuarios finales
- [Guía de Migración de Datos](./GUIA_MIGRACION_DATOS.md) - Proceso de importación de datos
- [Guía de Trello](./GUIA_TRELLO.md) - Configuración y uso de la integración con Trello
- [Roadmap de Producción](./ROADMAP_PRODUCCION.md) - Estado actual y tareas completadas

## 🛠️ Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Iniciar servidor de desarrollo

# Build
npm run build           # Construir para producción
npm start               # Iniciar servidor de producción

# Base de datos
npm run db:seed         # Ejecutar seed de datos (desarrollo)
```

## 📝 Notas de Desarrollo

- **Migraciones de base de datos**: Todas las migraciones están en `supabase/migrations/`
- **Componentes UI**: Usar exclusivamente componentes de `components/ui/` (shadcn/ui)
- **API Routes**: Todas las rutas API están en `app/api/` y usan autenticación con `getCurrentUser()`
- **Permisos**: Usar `canPerformAction()` y `shouldShowInSidebar()` para validar permisos
- **Tipos**: TypeScript está completamente tipado, evitar usar `any`

## 🔄 Próximas Mejoras

Ver [ROADMAP_PRODUCCION.md](./ROADMAP_PRODUCCION.md) para la lista completa. Las mejoras futuras incluyen:
- Mejoras adicionales de UX
- Documentación ampliada
- Nuevas funcionalidades según feedback de usuarios

## 📄 Licencia

Privado - ERP Lozada

