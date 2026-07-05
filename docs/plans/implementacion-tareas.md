# Sistema de Tareas - Documentacion Completa de Implementacion

## Arquitectura General

```
[Page Server Component] --> [TaskList] --> [TaskWeekView]
                                              |
                                   +----------+----------+
                                   |                     |
                              [TaskCard]           [TaskDialog]
                                   |
                              [API /tasks]
                                   |
                            [Supabase: tasks]
                                   |
                        [Cron: task-reminders]
                                   |
                         [Push Notifications]
```

**Stack:** Next.js 15 (App Router) + Supabase + shadcn/ui + date-fns + Sonner (toasts)

---

## 1. Base de Datos (SQL Migration)

Ejecutar en Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),

  -- Personas
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Fechas
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Recordatorio (minutos antes de due_date)
  reminder_minutes INT,
  reminder_sent BOOLEAN DEFAULT FALSE,

  -- Vinculos opcionales
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Agencia
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para queries frecuentes
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_agency ON tasks(agency_id);
CREATE INDEX idx_tasks_operation ON tasks(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX idx_tasks_priority_status ON tasks(priority, status);

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
```

**Campos clave:**
- `status`: PENDING | IN_PROGRESS | DONE
- `priority`: LOW | MEDIUM | HIGH | URGENT
- `reminder_minutes`: Cuantos minutos antes de `due_date` disparar el recordatorio
- `reminder_sent`: Flag para que el cron no envie el recordatorio dos veces
- `operation_id` / `customer_id`: Vinculos opcionales a operaciones y clientes

---

## 2. API Routes

### 2.1 GET /api/tasks

Obtiene tareas con filtros. Soporta dos modos:

**Modo semanal** (con `weekStart` y `weekEnd`): Ejecuta 2 queries separadas - una para tareas con fecha en el rango, otra para tareas sin fecha. Devuelve todo junto.

**Modo paginado** (sin rango semanal): Query unica con paginacion.

**Parametros query:**
- `status`: "ACTIVE" (PENDING + IN_PROGRESS), "DONE", "ALL"
- `priority`: "LOW", "MEDIUM", "HIGH", "URGENT", "ALL"
- `assignedTo`: UUID del usuario
- `operationId`: UUID de la operacion
- `weekStart` / `weekEnd`: ISO strings para filtro semanal
- `includeUndated`: "true" para incluir tareas sin fecha
- `page` / `limit`: Paginacion (max 200)

**Control de acceso por rol:**
- SELLER / CONTABLE / VIEWER: Solo tareas propias (creadas o asignadas)
- ADMIN: Todas las tareas de sus agencias
- SUPER_ADMIN: Todas las tareas

**Select con relaciones:**
```typescript
const TASK_SELECT = `
  *,
  creator:created_by(id, name, email),
  assignee:assigned_to(id, name, email),
  operations:operation_id(id, destination, file_code),
  customers:customer_id(id, first_name, last_name)
`
```

**Respuesta:**
```json
{
  "data": [...tasks],
  "pagination": { "page": 1, "limit": 50, "total": 120, "totalPages": 3 }
}
```

### 2.2 POST /api/tasks

Crea una tarea nueva.

**Body:**
```json
{
  "title": "Llamar a cliente",
  "description": "Consultar por pago pendiente",
  "priority": "HIGH",
  "assigned_to": "uuid-del-usuario",
  "due_date": "2026-02-25",
  "reminder_minutes": 60,
  "operation_id": "uuid-operacion (opcional)",
  "customer_id": "uuid-cliente (opcional)",
  "agency_id": "uuid-agencia"
}
```

**Validaciones:**
- `title` requerido
- `assigned_to` requerido
- `agency_id` requerido
- `reminder_minutes` solo se guarda si hay `due_date`

### 2.3 GET /api/tasks/[id]

Obtiene una tarea por ID. Solo puede verla: el creador, el asignado, o un admin.

### 2.4 PATCH /api/tasks/[id]

Actualiza una tarea. Campos permitidos: title, description, status, priority, assigned_to, due_date, reminder_minutes, operation_id, customer_id.

**Logica especial:**
- Si `status` cambia a "DONE": setea `completed_at` automaticamente
- Si `status` cambia a otra cosa: limpia `completed_at`
- Si `reminder_minutes` cambia: resetea `reminder_sent = false` para que vuelva a disparar

### 2.5 DELETE /api/tasks/[id]

Elimina una tarea. Solo puede: el creador o un admin.

---

## 3. Cron Job: Task Reminders

**Endpoint:** `GET /api/cron/task-reminders`
**Frecuencia:** Cada 5 minutos (`*/5 * * * *`)

**Logica:**
1. Busca tareas donde `reminder_sent = false`, `status != DONE`, y tiene `due_date` + `reminder_minutes`
2. Calcula: `reminderTime = due_date - reminder_minutes`
3. Si `reminderTime <= ahora`: crea una alerta tipo `TASK_REMINDER` y marca `reminder_sent = true`
4. Envia push notification al usuario asignado

```typescript
// Calculo del momento del recordatorio
const dueDate = new Date(task.due_date)
const reminderTime = new Date(dueDate.getTime() - task.reminder_minutes * 60 * 1000)

if (reminderTime <= now) {
  // Crear alerta + enviar push + marcar reminder_sent = true
}
```

**vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/cron/task-reminders",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## 4. Componentes Frontend

### 4.1 Page (Server Component)

```
app/(dashboard)/tools/tasks/page.tsx
```

Obtiene usuario autenticado, su agencia, y renderiza el componente cliente.

### 4.2 TaskWeekView (Componente principal)

**Archivo:** `components/tasks/task-week-view.tsx`

Vista semanal tipo calendario. Muestra 7 columnas (Lun-Dom) con las tareas en cada dia.

**Features:**
- Navegacion semanal (anterior / siguiente / hoy)
- Filtros: estado (Activas/Completadas/Todas), prioridad, usuario asignado
- Desktop: Grid 7 columnas
- Mobile: Lista vertical por dia
- Seccion "Sin fecha asignada" para tareas sin due_date
- Boton "+" en cada dia para crear tarea con fecha pre-seteada

**IMPORTANTE - Fix de Timezone:**
Las fechas ISO como `"2026-02-17"` se parsean como UTC medianoche. En timezones negativos (ej: UTC-3 Argentina), `new Date("2026-02-17")` da el dia anterior.

**Solucion:** Parsear solo la parte YYYY-MM-DD como fecha local:

```typescript
function parseLocalDate(dateStr: string): Date {
  const d = dateStr.split("T")[0]
  const [year, month, day] = d.split("-").map(Number)
  return new Date(year, month - 1, day) // Fecha LOCAL, no UTC
}
```

Usar `parseLocalDate()` en TODOS lados donde se compare o muestre `due_date`.

### 4.3 TaskCard

**Archivo:** `components/tasks/task-card.tsx`

Dos variantes:
- **compact**: Para la grilla semanal (muestra titulo, prioridad como dot de color, y asignado)
- **full**: Para listas (muestra todo: titulo, prioridad badge, descripcion, fecha, operacion, cliente)

**Features:**
- Click en circulo: toggle completar/reabrir tarea
- Click en card (compact): abre edicion
- Menu (...): Editar / Eliminar
- Indicadores visuales: borde rojo si vencida, borde naranja si vence hoy
- Prioridades con colores: rojo (urgente), naranja (alta), azul (media), gris (baja)

### 4.4 TaskDialog

**Archivo:** `components/tasks/task-dialog.tsx`

Dialog modal para crear/editar tareas. Usa react-hook-form + zod.

**Campos:**
- Titulo (requerido)
- Descripcion (opcional, textarea)
- Asignar a (select con usuarios cargados de la API)
- Prioridad (select: Baja/Media/Alta/Urgente)
- Fecha limite (DatePicker)
- Recordatorio (select: aparece solo si hay fecha, opciones: 15min, 30min, 1h, 2h, 1dia, 2dias)
- Vincular a operacion (SearchableCombobox - busca en /api/operations)
- Vincular a cliente (SearchableCombobox - busca en /api/customers)

**SearchableCombobox:** Carga 10 resultados iniciales al abrir, permite buscar escribiendo. Importante que las APIs de operations y customers soporten ser llamadas sin parametro `search`.

---

## 5. DatePicker - Fix de Timezone

**Archivo:** `components/ui/date-picker.tsx`

El DatePicker tiene el mismo problema de timezone. La solucion:

```typescript
/** Parsea "YYYY-MM-DD" como fecha local (no UTC) */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("T")[0].split("-").map(Number)
  return new Date(year, month - 1, day)
}

/** Formatea Date local a "YYYY-MM-DD" sin desfase UTC */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
```

**NUNCA** usar `new Date("2026-02-25")` para fechas que vienen como string.
**NUNCA** usar `.toISOString().split("T")[0]` para formatear fechas locales.
**SIEMPRE** usar `parseLocalDate()` y `formatLocalDate()`.

---

## 6. Dependencias

```json
{
  "date-fns": "^3.x",
  "react-hook-form": "^7.x",
  "@hookform/resolvers": "^3.x",
  "zod": "^3.x",
  "sonner": "^1.x",
  "lucide-react": "^0.x"
}
```

Componentes shadcn/ui necesarios:
- button, card, dialog, form, input, textarea, select, badge, skeleton, tabs, popover, command, calendar, dropdown-menu, tooltip

---

## 7. Estructura de Archivos

```
app/
  (dashboard)/
    tools/
      tasks/
        page.tsx                    # Server component
  api/
    tasks/
      route.ts                     # GET (lista) + POST (crear)
      [id]/
        route.ts                   # GET + PATCH + DELETE
    cron/
      task-reminders/
        route.ts                   # Cron cada 5 min

components/
  tasks/
    task-list.tsx                   # Wrapper simple
    task-week-view.tsx             # Vista semanal principal
    task-card.tsx                   # Card de tarea (compact + full)
    task-dialog.tsx                # Dialog crear/editar
  ui/
    date-picker.tsx                # DatePicker con fix timezone
    searchable-combobox.tsx        # Combobox con busqueda y carga inicial

supabase/
  migrations/
    092_create_tasks.sql           # Schema de la tabla

vercel.json                        # Cron job config
```

---

## 8. Flujo Completo

### Crear tarea:
1. Usuario clickea "+" en un dia o "Nueva Tarea"
2. Se abre TaskDialog con fecha pre-seteada (si clickeo en un dia)
3. Llena los campos y clickea "Crear Tarea"
4. POST /api/tasks crea la tarea con status PENDING
5. TaskWeekView se refresca y muestra la nueva tarea

### Completar tarea:
1. Usuario clickea el circulo de la tarea
2. PATCH /api/tasks/[id] con `{ status: "DONE" }`
3. API setea `completed_at` automaticamente
4. Card se muestra tachada y semitransparente

### Recordatorio:
1. Al crear tarea con fecha + recordatorio (ej: "1 hora antes")
2. Se guarda `reminder_minutes: 60` y `reminder_sent: false`
3. El cron cada 5 min chequea: `due_date - 60min <= ahora?`
4. Si es hora: crea alerta + envia push notification + marca `reminder_sent: true`

### Vincular a operacion/cliente:
1. En el dialog, los campos "Vincular a operacion" y "Vincular a cliente" usan SearchableCombobox
2. Al abrir el dropdown se cargan los primeros 10 resultados
3. El usuario puede escribir para filtrar
4. Se guarda `operation_id` / `customer_id` como FK en la tabla
5. En la vista, se muestran los datos de la operacion/cliente vinculados

---

## 9. Notas de Implementacion

1. **Supabase types**: Si la tabla `tasks` no esta en tus tipos generados, usar `(supabase as any).from("tasks")` para el from, y `(supabase.from("tasks" as any) as any)` NO funciona (rompe el query builder).

2. **RLS**: La tabla tiene RLS habilitado. Crear policies adecuadas o usar service role key en el server.

3. **Timezone**: TODO lo que compare o muestre fechas debe usar `parseLocalDate()`. Es el bug mas comun y afecta a cualquier timezone negativo.

4. **Cron en Vercel**: El plan gratuito de Vercel permite crons cada 1 hora. Para cada 5 minutos necesitas plan Pro. Si usas el plan gratuito, cambia a `0 * * * *` (cada hora).

5. **Push notifications**: El cron usa `sendPushToUser()` que requiere el sistema de Web Push configurado (VAPID keys, service worker, tabla push_subscriptions). Si no lo tenes, simplemente elimina esa parte del cron y deja solo la creacion de alertas.
