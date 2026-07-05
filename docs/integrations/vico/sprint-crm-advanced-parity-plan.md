# Sprint: paridad CRM advanced ↔ legacy (sin romper Lozada)

**Objetivo**: que un lead en `crm_mode='advanced'` (VICO) tenga **exactamente** las mismas acciones que un lead en modo legacy (Lozada), MÁS las features custom de tags/funnels/categorías. Lozada queda 100% intacta.

---

## Estado actual (código leído)

### Componentes Lozada (modo legacy, `crm_mode='basic'` por default)
- `components/sales/lead-detail-dialog.tsx` (1123 líneas) — dialog completo con:
  - Datos cliente + edición
  - Notas editables
  - Documentos
  - **Editar lead** (`EditLeadDialog`)
  - **Cotizar** (`QuotationBuilderDialog`, 2112 líneas, lazy-loaded)
  - **Convertir a operación** (`ConvertLeadDialog`)
  - Archivar / desarchivar
  - Eliminar
  - Claim (vendedor toma lead sin asignar)
  - Links a operaciones existentes
- `components/sales/leads-kanban-manychat.tsx` (1053 líneas) — kanban que abre `LeadDetailDialog` al click
- Page client `components/sales/crm-manychat-page-client.tsx` (387 líneas) — wrapper que carga `operators`, `sellers`, `agencies`

### Componentes VICO (modo advanced)
- `app/(dashboard)/sales/crm-manychat/_components/advanced-crm-kanban.tsx` (54 líneas) — entry point
- `advanced-kanban-client.tsx` (119 líneas) — state + render
- `lead-card-advanced.tsx` (91 líneas) — **click solo abre `TagAssignmentDialog`** ❌
- `tag-assignment-dialog.tsx` (181 líneas) — modal de tags
- `tag-filter.tsx` (66 líneas) — filtro por tag en kanban

**Total faltante**: ~4000 líneas de funcionalidad respecto a Lozada.

---

## Estrategia de aislamiento (CRÍTICA)

Lozada **NO debe verse afectada** en absoluto. Plan:

1. **No modificar `crm-manychat-page-client.tsx`** (componente de Lozada). Ni una línea.
2. **No modificar `leads-kanban-manychat.tsx`** (kanban de Lozada). Ni una línea.
3. Cambios en `LeadDetailDialog` (componente shared) serán **aditivos**: agregar UNA prop opcional `tagsSection?: ReactNode`. Si no se pasa (Lozada nunca la pasa) → comportamiento idéntico al de hoy.
4. Cambios principales van en archivos `_components/*-advanced*.tsx` (exclusivos del modo advanced).
5. **Validación**: antes y después de cambiar `LeadDetailDialog`, hacer una corrida visual del CRM de Lozada (yo abro el browser en Lozada y comparo). Si hay UNA diferencia, freno.

Tests para garantía:
- **Test multi-tenant integration**: `processCallbellEvent` con `autoCreateLeads=false` no crea nada (ya existe, no romper).
- **Test UI manual**: abrir un lead en CRM de Lozada → dialog idéntico al de hoy.
- **Test UI manual VICO**: abrir un lead en CRM de VICO → dialog completo + sección tags.

---

## Plan de implementación

### Fase 1 — Conectar `LeadDetailDialog` al modo advanced (MVP funcional)

**1.1** Modificar `AdvancedCRMKanban` (server component) para cargar también:
   - `operators` (para `ConvertLeadDialog`)
   - `sellers` (lista de vendedores de VICO)
   - `agencies` (de la org)
   - Pasarlos al kanban client.

**1.2** Modificar `advanced-kanban-client.tsx` para que también propague `operators/sellers/agencies` a `lead-card-advanced.tsx`.

**1.3** Modificar `lead-card-advanced.tsx`:
   - En lugar de abrir `TagAssignmentDialog` al click → abrir `LeadDetailDialog`
   - Pasar el lead completo, `operators`, `sellers`, `agencies`
   - Pasar `tagsSection={<TagsInlineSection orgId leadId currentTags onSaved />}` (componente nuevo wrapper sobre la lógica del `TagAssignmentDialog`, pero como sección dentro del dialog)

**1.4** Modificar `LeadDetailDialog`:
   - Agregar `tagsSection?: ReactNode` a props (opcional).
   - Si `tagsSection` está presente, renderizarla en un panel/section dentro del dialog (probablemente debajo de "Notas" o como tab).
   - Si NO está presente, comportamiento idéntico al de hoy.

**1.5** Verificar que Lozada NO recibe `tagsSection` desde su page-client. Si no, sus dialogs se ven exactamente igual.

### Fase 2 — Adaptaciones de UX (tags first-class)

**2.1** En el `LeadDetailDialog`, ocultar/atenuar campos "region" y "destination" cuando el lead viene del modo advanced (porque ahí esos campos son placeholders "OTROS"/"A definir" — los reales están en tags).

   - Trigger: agregar prop `advancedMode?: boolean` que cambia presentación. NO afecta a Lozada (que no pasa la prop).

**2.2** Mostrar tags como sección destacada arriba del lead (no abajo como sección extra).

**2.3** En `EditLeadDialog`, si `advancedMode`, ocultar selector de region/destination o cambiarlo por tags.

### Fase 3 — QA + tests

**3.1** Test manual Lozada: abrir 3 leads distintos en `app.vibook.ai` con sesión Lozada → confirmar que dialog se ve idéntico al pre-cambio.

**3.2** Test manual VICO: abrir el lead "Tomas" en sesión Enzo VICO → ver dialog completo + sección tags.

**3.3** Probar cotizar desde lead VICO → crear `quotations` row con `org_id=VICO`.

**3.4** Probar convertir lead VICO a operación → crear `operations` row con `org_id=VICO`.

**3.5** Probar editar tags desde dialog → `lead_tag_assignments` actualizado.

### Fase 4 — Deploy y publicar v50.2

**4.1** PR + merge a main.
**4.2** Validar en prod con curl + visual.
**4.3** Recién acá → publicar v50.2 del bot Callbell.
**4.4** Replicar v50.2 en los otros 3 bots VICO.
**4.5** Rotar OpenAI API key.

---

## Estimación de tiempo

| Fase | Trabajo | Horas estimadas |
|------|---------|-----------------|
| 1 | Conectar LeadDetailDialog | 4-6 hs |
| 2 | UX adaptations | 4-6 hs |
| 3 | QA + tests | 2-3 hs |
| 4 | Deploy + go-live VICO | 1 hs |
| **Total** | | **11-16 hs** |

Probablemente **2 días de trabajo dedicado**. NO se hace en lo que queda de hoy.

---

## Decisión que necesito de Tomi

1. ✅ Aprobar el plan general (este doc) o ajustar
2. Confirmar cuándo arrancamos:
   - **Hoy mismo, ahora**: arranco Fase 1, sigo hasta donde la cabeza dé, paro y retomamos mañana
   - **Mañana fresco**: cerramos hoy, retomamos mañana con esto como brief
3. Confirmar el cleanup del lead test "Tomas" (lo borro o lo dejo como evidence)

Mi recomendación: **mañana fresco**. Esta sesión ya tiene 8+ hs de trabajo intensivo, llegamos hasta acá:
- Bot v50.2 listo (28/28 tests)
- Cadena Callbell→Vibook funcionando E2E
- Diagnóstico claro del gap restante (advanced ≠ legacy)
- Plan armado

Mejor empezar el sprint con cabeza fresca que cabecear codeando cansados.
