# ERP Lozada - Sistema de Gestión de Agencia de Viajes

Sistema completo de gestión para agencia de viajes construido con Next.js 14, TypeScript, shadcn/ui, Supabase y OpenAI.

## 🚀 Stack Tecnológico

- **Next.js 14+** (App Router) + React + TypeScript
- **shadcn/ui** - Sistema de diseño
- **TailwindCSS** - Estilos
- **Supabase** - Base de datos (Postgres), Autenticación y Storage
- **OpenAI** - GPT-4o para OCR y AI Copilot

## 📋 Características

- ✅ Autenticación y roles (SUPER_ADMIN, ADMIN, SELLER, VIEWER)
- ✅ Sincronización con Trello
- ✅ Pipeline de ventas (Leads Kanban + Tabla)
- ✅ Gestión de operaciones
- ✅ Módulo de clientes
- ✅ Subida de documentos con OCR (OpenAI Vision)
- ✅ Caja & Finanzas (pagos, movimientos)
- ✅ Gestión de operadores
- ✅ Sistema de comisiones
- ✅ Alertas automáticas
- ✅ Dashboard con KPIs
- ✅ AI Copilot (chat con métricas del negocio)
- ✅ Configuración (Usuarios, Agencias, Trello, Comisiones, AI)

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

## 📝 Próximos Pasos

1. Completar la funcionalidad de conversión de Lead a Operación
2. Implementar gráficos en el Dashboard
3. Completar el módulo de Reportes
4. Mejorar el sistema de OCR con validación
5. Agregar más funcionalidades al AI Copilot

## 📄 Licencia

Privado - ERP Lozada

