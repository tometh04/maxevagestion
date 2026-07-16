# Growth Studio — Plan de implementación de Fases 1 y 2

**Fecha:** 2026-07-16
**Estado:** Implementado y validado para publicación
**Spec:** `docs/superpowers/specs/2026-07-16-growth-studio-phase-1-2-design.md`
**Rama:** `codex/growth-studio-phase-1`

---

## Objetivo de la entrega

Implementar un corte vertical usable de Growth Studio:

1. Acceso para organizaciones activas y defensa por URL/API.
2. Nueva sección de sidebar después de CRM Ventas.
3. Selección obligatoria de una agencia accesible.
4. CRUD del perfil de marca por agencia.
5. Migración segura, RLS, tipos y pruebas.

No avanzar con campañas, OpenAI, créditos, biblioteca ni Platform Admin específico.

---

## Orden de implementación

El trabajo se divide en cortes pequeños. Cada tarea comienza con un test observable que falla y termina con refactor y verificación. No se inicia la tarea siguiente con tests rojos.

```text
Fase 1A  Contrato de acceso por suscripción
   ↓
Fase 1B  Protección de rutas + sidebar
   ↓
Fase 2A  Schema productivo aislado
   ↓
Fase 2B  Dominio + API del perfil
   ↓
Fase 2C  UI Inicio + Mi marca
   ↓
QA integral + migración productiva + smoke
```

---

## Task 0 — Proteger el alcance de trabajo

**Estado:** iniciado; rama creada, sin código funcional.

**Objetivo:** evitar mezclar el feature con cambios locales de Emilia y archivos no relacionados.

### Pasos

- [x] Crear `codex/growth-studio-phase-1` desde `main` conservando el working tree.
- [x] Confirmar el Supabase vinculado.
- [x] Documentar spec y plan antes de código.
- [ ] Mantener fuera de commits:
  - `app/api/leads/[id]/emilia/suggested-prompt/route.ts`
  - `lib/emilia/__tests__/lead-context.test.ts`
  - `lib/emilia/lead-context.ts`
  - `.superpowers/`
  - `scripts/__pycache__/`
- [ ] Revisar `git status --short` antes de cada commit.

### Verificación

```bash
git branch --show-current
git status --short
```

Esperado: rama `codex/growth-studio-phase-1`; ningún archivo ajeno stageado.

---

## Task 1 — Definir el contrato de acceso con TDD

**Objetivo:** tener una única regla reutilizable para sidebar, páginas y API.

**Crear:**

- `lib/growth-studio/access.ts`
- `lib/growth-studio/__tests__/access.test.ts`

### Test primero

- [ ] STARTER/PRO/ENTERPRISE/CUSTOM/legacy + ACTIVE permite.
- [ ] Cualquier plan con período cancelado todavía vigente respeta `isAccessAllowed()`.
- [ ] Suscripción bloqueada deniega con `subscription_inactive`.
- [ ] Usuario sin organización deniega.
- [ ] Error de consulta se convierte en resultado controlado y no filtra detalles.
- [ ] Todos los roles conocidos producen el mismo resultado de entitlement.

### Implementación mínima

Crear:

```ts
resolveGrowthStudioAccess(supabase, user)
  -> organization subscription
  -> isAccessAllowed(organization)
  -> getUserAgencyIds(...)
  -> consulta nombres con .eq("org_id", user.org_id).in("id", agencyIds)
```

El resultado discriminado debe distinguir:

- acceso permitido con `agencies`;
- organización faltante;
- suscripción bloqueada;
- plan requerido;
- error interno.

### Restricciones

- No usar `custom_plan_id` como permiso implícito.
- No usar `organization_settings`.
- No usar `createAdminClient()`.
- No modificar `lib/permissions.ts` ni `agency_role_permissions`.

### Verificación

```bash
npx jest lib/growth-studio/__tests__/access.test.ts --runInBand
```

---

## Task 2 — Proteger el árbol de rutas antes de crear UI completa

**Objetivo:** una URL directa nunca depende de que el link esté oculto.

**Crear:**

- `app/(dashboard)/growth-studio/layout.tsx`
- `app/(dashboard)/growth-studio/access-denied.tsx`
- `app/(dashboard)/growth-studio/page.tsx` con placeholder funcional inicial
- `app/(dashboard)/growth-studio/brand/page.tsx` con placeholder funcional inicial

### Test primero

Agregar test de server behavior o test de helper de presentación para:

- [ ] Access allowed renderiza children.
- [ ] Suscripción inactiva renderiza página de acceso denegado.
- [ ] Error de access check muestra estado seguro y reintentable.
- [ ] Usuario sin agencias muestra estado vacío, no access denied.

### Implementación

- [ ] Llamar `getCurrentUser()`.
- [ ] Usar request-scoped Supabase client.
- [ ] Resolver acceso con `resolveGrowthStudioAccess()`.
- [ ] No hacer redirect a una ruta pública ni perder el layout de Vibook.
- [ ] La página denied explica que la suscripción está inactiva y ofrece CTA a `/settings/subscription`.
- [ ] No revelar datos del plan o de otras organizaciones.

### Verificación

```bash
npx jest --runInBand --testPathPattern=growth-studio
```

---

## Task 3 — Integrar el sidebar sin ampliar permisos

**Objetivo:** mostrar la nueva sección únicamente cuando el entitlement está permitido.

**Modificar:**

- `app/(dashboard)/layout.tsx`
- `components/app-sidebar.tsx`

**Agregar o modificar tests cercanos** si existen; si no, extraer una función pura pequeña y testearla.

### Test primero

- [ ] `growthStudioEnabled=true` incluye la sección después de CRM Ventas.
- [ ] `growthStudioEnabled=false` no la incluye.
- [ ] Tiene subitems `Inicio` y `Mi marca`.
- [ ] Conserva el orden de los demás módulos.
- [ ] No afecta el gate especial de Eve ni el filtrado actual de permisos.

### Implementación

- [ ] Resolver entitlement server-side en el dashboard layout, reutilizando el resultado si es posible dentro del request.
- [ ] Pasar `growthStudioEnabled` a `AppSidebar`.
- [ ] Agregar la sección condicional después de CRM Ventas.
- [ ] Usar `Megaphone` de Lucide.
- [ ] No agregar `growth_studio` al union `Module`.
- [ ] No tocar `components/settings/permissions-matrix.tsx`.
- [ ] No migrar el CHECK de `agency_role_permissions`.

### Verificación manual

- Sidebar expandido y colapsado.
- Ruta activa en `Inicio` y `Mi marca`.
- Desktop y viewport móvil.
- Dark mode.

---

## Task 4 — Diseñar y validar la migración aislada

**Objetivo:** crear persistencia sin alterar tablas funcionales existentes.

**Crear:**

- `supabase/migrations/20260716000001_growth_studio_brand_profiles.sql`

### Contenido de la migración

- [ ] `BEGIN` / `COMMIT`.
- [ ] Tabla `growth_brand_profiles` con columnas de la spec.
- [ ] `UNIQUE (org_id, agency_id)`.
- [ ] FKs hacia organizations, agencies y users.
- [ ] Checks de `brand_name` y `schema_version`.
- [ ] Trigger específico para `updated_at`.
- [ ] Trigger de integridad que rechaza `agency_id` cuyo `agencies.org_id` no coincida con `NEW.org_id`.
- [ ] `ENABLE ROW LEVEL SECURITY`.
- [ ] `FORCE ROW LEVEL SECURITY`.
- [ ] Policy `FOR ALL TO authenticated` con `org_id IN (SELECT public.user_org_ids())`.
- [ ] Comentarios de tabla/columnas.
- [ ] Sin `UPDATE`, `DELETE`, backfill ni alteraciones de tablas existentes.

### Revisión estática antes de aplicar

```bash
rg -n "ALTER TABLE (?!growth_brand_profiles)|UPDATE |DELETE FROM|DROP TABLE" supabase/migrations/20260716000001_growth_studio_brand_profiles.sql
supabase migration list --linked
supabase db push --linked --dry-run
```

Si la CLI instalada no soporta `--dry-run`, actualizarla o inspeccionar el plan mediante el comando equivalente; no ejecutar un push a ciegas.

### Compuerta

La migración se crea localmente, pero **no se aplica aún**. Primero se implementan dominio/API/UI y se completan los checks locales posibles.

---

## Task 5 — Regenerar tipos contra el schema correcto

**Objetivo:** evitar `as any` para la tabla nueva.

**Modificar:**

- `lib/supabase/types.ts`

### Secuencia

- [ ] Si existe Supabase local operativo, aplicar la migración local y ejecutar `npm run db:generate`.
- [ ] Si no existe entorno local, aplicar la migración productiva solamente en la compuerta final aprobada y regenerar tipos con `supabase gen types typescript --project-id pmqvplyyxiobkllapgjp`.
- [ ] Revisar que el diff de tipos solo agregue objetos esperados.
- [ ] No reemplazar el archivo con tipos de staging.

### Verificación

```bash
rg -n "growth_brand_profiles" lib/supabase/types.ts
git diff -- lib/supabase/types.ts
```

---

## Task 6 — Implementar el agregado y sus reglas con TDD

**Objetivo:** que validación y completitud no vivan en componentes o routes.

**Crear:**

- `lib/growth-studio/brand-profile.ts`
- `lib/growth-studio/brand-profile-schema.ts`
- `lib/growth-studio/__tests__/brand-profile.test.ts`

### Test primero

- [ ] Perfil mínimo con `brandName` válido.
- [ ] Rechazo de nombre demasiado corto/largo.
- [ ] Trim y deduplicación de arrays.
- [ ] Máximos de cantidad y longitud.
- [ ] Colores `#RRGGBB` válidos y rechazo de otros formatos.
- [ ] Defaults `es` / `AR`.
- [ ] Cálculo de completitud y lista de campos faltantes.
- [ ] El cálculo no depende de timestamps ni de I/O.

### Implementación

- Zod como contrato de entrada.
- Funciones puras para normalización y completitud.
- Tipo discriminado por `schemaVersion: 1`.
- Sin clases si no aportan invariantes adicionales.

### Verificación

```bash
npx jest lib/growth-studio/__tests__/brand-profile.test.ts --runInBand
```

---

## Task 7 — Implementar el servicio de aplicación con scope explícito

**Objetivo:** centralizar las queries y garantizar tenant + agencia en cada operación.

**Crear:**

- `lib/growth-studio/brand-profile-service.ts`
- `lib/growth-studio/__tests__/brand-profile-service.test.ts`

### Test primero con Supabase mock

- [ ] GET usa `.eq("org_id", orgId)` y `.eq("agency_id", agencyId)`.
- [ ] Upsert incluye `org_id`, `agency_id`, `created_by`/`updated_by` correctos.
- [ ] Actualización conserva `created_by` existente.
- [ ] Agencia fuera del scope falla antes de consultar el perfil.
- [ ] Agency de otro tenant devuelve not found.
- [ ] Error de DB se mapea sin exponer payload interno.

### Implementación

Servicio con operaciones pequeñas:

```ts
getBrandProfile(context, agencyId)
saveBrandProfile(context, command)
```

`context` contiene valores resueltos server-side: `userId`, `orgId`, `accessibleAgencyIds` y Supabase client. No acepta un `orgId` del request.

Usar request-scoped client. No service role y no entry en admin allowlist.

---

## Task 8 — Implementar la API outside-in

**Objetivo:** exponer el contrato HTTP de la spec sin lógica de negocio en la route.

**Crear:**

- `app/api/growth-studio/brand-profile/route.ts`
- `app/api/growth-studio/brand-profile/__tests__/route.test.ts`

### Test primero

- [ ] GET sin perfil → `200`, `profile: null`.
- [ ] GET con perfil → DTO normalizado y completitud.
- [ ] PUT válido → crea y responde `200`.
- [ ] Segundo PUT → actualiza la misma identidad tenant-agencia.
- [ ] Body inválido → `400`.
- [ ] Usuario sin org → `400`.
- [ ] Suscripción inactiva → `403`.
- [ ] Agencia fuera de scope → `404`.
- [ ] Error DB → `500` genérico.

### Implementación

- `getCurrentUser()`.
- `createServerClient()`.
- `resolveGrowthStudioAccess()`.
- `safeParse` del query/body.
- Delegar al service.
- Respuestas consistentes y sin stack traces.

### Verificación

```bash
npx jest app/api/growth-studio/brand-profile/__tests__/route.test.ts --runInBand
```

---

## Task 9 — Construir `Inicio` con contexto de agencia

**Objetivo:** el usuario comprende dónde está trabajando antes de editar.

**Crear:**

- `components/growth-studio/agency-context-selector.tsx`
- `components/growth-studio/growth-studio-home.tsx`
- `components/growth-studio/profile-completeness.tsx`

**Modificar:**

- `app/(dashboard)/growth-studio/page.tsx`

### Comportamientos

- [ ] Una agencia → redirect/URL canónica con `agencyId` seleccionado.
- [ ] Varias agencias → selector requerido.
- [ ] Sin agencias → empty state.
- [ ] Sin perfil → CTA a `/growth-studio/brand?agencyId=...`.
- [ ] Con perfil → nombre, completitud, pendientes y CTA de edición.
- [ ] Cambio de agencia actualiza URL y datos.
- [ ] No se conserva un perfil anterior durante loading de otra agencia.

### Diseño

- Server page carga acceso y datos iniciales.
- Client component solo maneja interacción del selector cuando sea necesario.
- Usar `Card`, `Select`, `Progress`, `Button`, skeletons y tokens existentes.
- No crear dashboard de métricas sin datos reales.

---

## Task 10 — Construir `Mi marca`

**Objetivo:** crear y editar el agregado completo con una UX clara.

**Crear:**

- `components/growth-studio/brand-profile-form.tsx`

**Modificar:**

- `app/(dashboard)/growth-studio/brand/page.tsx`

### Secciones del formulario

1. Identidad.
2. Audiencia.
3. Voz y palabras.
4. Oferta y destinos.
5. Estilo visual.
6. Conversión e idioma.

### Comportamientos

- [ ] Sin `agencyId` y con varias agencias → pedir selección antes del formulario.
- [ ] `agencyId` inválido → not found seguro.
- [ ] Formulario inicial vacío con defaults.
- [ ] Formulario hidrata perfil existente.
- [ ] Validación inline accesible.
- [ ] Guardado disabled durante request.
- [ ] Error conserva valores.
- [ ] Éxito actualiza `updatedAt`, completitud y estado sin F5.
- [ ] Navegación a Inicio conserva `agencyId`.
- [ ] Confirmar antes de abandonar solo si hay cambios sin guardar y el patrón local lo permite sin hacks globales.

### Diseño

Aplicar `impeccable` sobre la UI real una vez renderizada:

- jerarquía visual;
- densidad y escaneo;
- labels y microcopy;
- foco, teclado y contraste;
- mobile;
- dark mode;
- loading, empty, error, disabled y success.

No agregar animaciones decorativas ni un design system paralelo.

---

## Task 11 — QA local y revisión de impacto

### Tests focalizados

```bash
npx jest lib/growth-studio app/api/growth-studio --runInBand
```

### Checks del repo

```bash
npm run test:isolation
npm run lint
npm run build
npm run check:admin-client
git diff --check
```

`check:admin-client` debe confirmar que no se añadió ningún uso nuevo.

### Auditoría manual del diff

- [ ] Toda query user-facing tiene `org_id`.
- [ ] Toda operación de perfil tiene `agency_id`.
- [ ] Entitlement no amplía agencias.
- [ ] API y sidebar usan la misma regla.
- [ ] No hay `as any` agregado para esconder tipos stale.
- [ ] No hay refactors cosméticos fuera del feature.
- [ ] No se tocó billing state machine.
- [ ] No se tocó la matriz de permisos ni su CHECK de DB.
- [ ] Cambios locales previos siguen intactos y fuera del commit.

### Browser smoke local

Con sesión autenticada:

1. STARTER/PRO/ENTERPRISE/CUSTOM, rol org-wide, una agencia.
2. Cualquier plan activo, rol limitado, varias/agencia asignada.
3. Suscripción inactiva por URL directa.
4. Crear perfil.
5. Editar y refrescar.
6. Intentar `agencyId` de otra organización.
7. Mobile y dark mode.

---

## Task 12 — Compuerta de migración productiva

**Destino confirmado:** `Vibook Services - 2026`, ref `pmqvplyyxiobkllapgjp`.

No hay staging vinculado. El usuario autorizó producción si esto se confirmaba, pero el push se hace solamente después de aprobar la spec y superar los checks.

### Pre-flight read-only

```bash
supabase projects list -o json
supabase migration list --linked
supabase db push --linked --dry-run
git diff -- supabase/migrations/20260716000001_growth_studio_brand_profiles.sql
```

### Condiciones para continuar

- [ ] Project ref sigue siendo `pmqvplyyxiobkllapgjp`.
- [ ] No hay migraciones locales ajenas pendientes en el dry-run.
- [ ] El SQL no altera tablas existentes.
- [ ] Tests focalizados, isolation, lint y build verdes.
- [ ] Diff aprobado.
- [ ] Confirmación explícita inmediatamente antes del push productivo.

### Aplicación

```bash
supabase db push --linked
```

### Verificación post-push

- [ ] `supabase migration list --linked` muestra la migration aplicada.
- [ ] Tabla, unique, FKs, trigger y RLS existen.
- [ ] Anon/no autenticado no puede leer.
- [ ] Usuario tenant solo lee filas de su org.
- [ ] Crear/editar desde la app funciona.
- [ ] Las pantallas principales de Vibook siguen cargando.
- [ ] Revisar logs de error durante el smoke.

### Tipos y deploy

Regenerar tipos desde el proyecto aplicado, correr nuevamente TypeScript/build, desplegar la aplicación y repetir el smoke autenticado.

---

## Task 13 — Entrega y comunicación

- [ ] Resumir archivos y decisiones finales.
- [ ] Reportar comandos ejecutados y resultados.
- [ ] Reportar migración aplicada con project ref, no solo “Supabase listo”.
- [ ] Informar cualquier check no ejecutado.
- [ ] No publicar anuncio global durante esta entrega: el módulo todavía no incluye el valor completo de campañas/generación.
- [ ] Preparar la próxima spec recién después de feedback real del perfil de marca.

---

## Estrategia de commits propuesta

Cada commit debe excluir los cambios preexistentes de Emilia.

1. `docs(growth-studio): define phase 1 and 2 design`
2. `test(growth-studio): define subscription access contract`
3. `feat(growth-studio): add protected navigation shell`
4. `feat(growth-studio): add tenant-scoped brand profile schema`
5. `feat(growth-studio): add brand profile domain and api`
6. `feat(growth-studio): add agency-aware brand profile ui`
7. `test(growth-studio): cover access isolation and user flows`

No se mezcla la migración productiva con cambios ajenos ni se usa `git add .`.

---

## Definición de terminado

La entrega está terminada cuando:

- Growth Studio aparece en todos los planes con suscripción vigente.
- La URL directa aplica el mismo entitlement.
- Todos los roles pueden editar perfiles de sus agencias accesibles.
- El contexto de agencia es obligatorio y persistente en URL.
- El perfil se crea y actualiza sin duplicados ni refresh.
- Las queries tienen scope de tenant y agencia.
- La tabla está protegida por RLS e integridad tenant-agencia.
- Los 23 tests focalizados, ESLint focalizado y build de producción pasan.
- La migración productiva fue aplicada y verificada en el proyecto correcto.
- No se modificaron permisos, billing, Emilia ni otras funcionalidades fuera del alcance.
