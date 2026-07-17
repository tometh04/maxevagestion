# Growth Studio — Plan de implementación de Fase 3

**Spec:** `docs/superpowers/specs/2026-07-16-growth-studio-phase-3-campaigns-assets.md`  
**Estado:** Implementación completa; migración remota pendiente de aprobación

## Corte 1 — Contratos y persistencia

- [x] Tests de brief, tres conceptos, canales, stories y composición.
- [x] Test de sanitización de operaciones/cotizaciones sin PII.
- [x] Migración aditiva con campañas, generaciones, revisiones, assets, eventos y bucket privado.
- [x] Tipos Supabase actualizados contra el schema exacto.

## Corte 2 — Campañas de texto

- [x] Servicio tenant-scoped para crear/listar/ver campañas.
- [x] Reserva atómica de 20 generaciones de texto cada 24 horas.
- [x] Provider OpenAI con Responses API y Structured Outputs.
- [x] Generación de tres conceptos.
- [x] Selección y adaptación a canales.
- [x] Historial append-only.
- [x] UI de listado, brief, selección y resultados.

## Corte 3 — Fuentes comerciales

- [x] Listado de operaciones y cotizaciones de la agencia.
- [x] Exclusión de canceladas, rechazadas o expiradas.
- [x] Snapshot allowlisted.
- [x] Precio opt-in con moneda y vigencia.
- [x] Tests negativos de PII.

## Corte 4 — Biblioteca e imágenes

- [x] Upload privado sin service role.
- [x] Listado con signed URLs.
- [x] Logo por agencia con fallback al logo de organización.
- [x] Reserva de 12 imágenes cada 24 horas y una concurrente.
- [x] `gpt-image-2` con calidad seleccionable.
- [x] Guardado automático del resultado como asset.

## Corte 5 — Compositor

- [x] Fondo desde biblioteca.
- [x] Título, texto secundario, CTA y logo movibles.
- [x] Tres tamaños de logo, color y alineación.
- [x] Exportar PNG sin branding Vibook.
- [x] Guardar composición como asset.
- [x] Eventos copied/exported/edited/rated.

## Corte 6 — Verificación

- [x] Jest focalizado: 43 tests verdes.
- [ ] Test de aislamiento.
- [ ] `npm run check:admin-client`.
- [x] ESLint focalizado y build de producción.
- [x] `git diff --check` y auditoría multi-tenant/agencia.
- [x] Browser QA visual de dark mode, responsive y movimiento por teclado.
- [ ] Browser smoke con sesión autenticada y APIs reales.
- [ ] Dry-run de Supabase y aprobación antes de producción.

Los checks pendientes están bloqueados por el entorno o por deuda previa del repo:
las claves legacy de `.env.local` fueron deshabilitadas, el allowlist global de
`createAdminClient` ya tiene offenders ajenos a Growth Studio y la instancia local
de Supabase no terminó de inicializar. No se aplicó ninguna migración remota.
