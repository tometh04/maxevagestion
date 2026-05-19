# VICO × Vibook × Callbell — Status del proyecto

> **Cómo usar este doc**: fuente de verdad del proyecto VICO. Cada cambio relevante actualiza la sección correspondiente + agrega entry al §11 (Historial). Pensado para que cualquier sesión nueva pueda retomar sin perder contexto.
>
> **Última actualización**: 2026-05-19 (PR #53 mergeado — Mundial/F1 detection + Diego fix LIVE)

---

## 1. Status snapshot (HOY) — 🟢 PRODUCCIÓN LIVE

| Componente | Estado | Evidencia |
|------------|--------|-----------|
| Bot WhatsApp "Bot Sin Multimedia" (Emilia VICO) v50.2 | ✅ **PUBLICADO** en Callbell | Conversaciones reales funcionando |
| Cadena Callbell → Vibook | ✅ **LIVE con clientes reales** | 2+ leads creados de tráfico genuino |
| Adapter del envelope `{event, payload}` | ✅ Deployado (PR #51) | Bug del envelope fixeado el 19/05 |
| Parser del resumen del bot → destination + tags + quoted_price | ✅ Live (PR #45) | Lead Tomas tiene destino=Cancún, $1500, tags CANCUN+SEPTIEMBRE |
| Detección campaña Mundial/F1 (opción 4/5 del menú) | ✅ Live (PR #53) | Lead Diego ahora tiene destino="Formula 1" + tag FORMULA 1 |
| CRM advanced con paridad de Lozada | ✅ Live (PR #39, #43) | Cotizar/convertir validado |
| Multi-tenant aislado de Lozada | ✅ Garantizado por código | RLS + flag opt-in + queries scoped |
| Otros 3 bots VICO (Aldana WA / Messenger / Instagram) | ❌ Siguen con prompt viejo | Falta replicar v50.2 |
| OpenAI API key rotación | ⚠️ Expuesta en panel Callbell | Rotación pendiente |

### Leads reales actuales en BD VICO

```
Diego  (+5492323534418) → cliente real, opción 5 → destination="Formula 1", tag FORMULA 1
Tomas  (+5492954602920) → tu test, destino=Cancún, $1500 USD, tags CANCUN+SEPTIEMBRE
Daniel (+5492995189991) → cliente real, llegó por rapid-fire → ⚠️ 5 leads duplicados (bug separado)
```

> **⚠️ Bug abierto**: `lib/integrations/callbell/sync-handler.ts` usa `.maybeSingle()` para buscar lead por phone, que falla con error PGRST116 cuando hay duplicados → crea OTRO lead. Si llegan varios eventos del mismo phone en rapid-fire, multiplica el problema. Spawn task creado para fixearlo (defensive lookup + UNIQUE constraint parcial + cleanup de los 5 Daniel).

---

## 2. Contexto del proyecto

- **Cliente**: VICO Travel Group (org slug `vico-travel`, org_id `586bca09-029e-4cc9-8762-2ad01d468428`)
- **Owner**: Enzo Maineri (`e.maineri@vicotravelgroup.com`, role SUPER_ADMIN)
- **Agency principal**: "VICO Travel Group" (id `19a82bc7-d65a-4cd9-83e7-cfa36befca89`, creada 2026-05-11)
- **Plan**: PRO custom (multi-tenant con tags/funnels/categorías propias)
- **Users**: 10 (1 contable, 7 sellers, 2 super_admin)
- **Tags cargadas**: 60 (Temperatura, Destino, Mes, Origen)
- **Funnels**: 7 (PRIMER CONTACTO, COTIZANDO, SEGUIMIENTO, VENDIDO, NO VENDIDO, EN VIAJE, CLIENTE VICO)
- **Canal WhatsApp principal**: Emilia VICO `+54 9 261 725 5027` (channel uuid `1c8416aee2cf416bb6489620728b9c63`)
- **Segundo canal WhatsApp**: Aldana VICO `+54 9 261 724 1211`
- **Otros canales**: Facebook (Messenger), Instagram
- **Webhook token Vibook**: `30fa0b47d455aaf505b990880e8a3e9c` (en `org_integrations.webhook_token` de callbell-in)

---

## 3. Lo que está en main (PRs mergeadas, en orden)

| PR | Título | Qué hizo |
|----|--------|----------|
| #35 | feat(callbell): opt-in lead creation per-org | Handler crea leads cuando `org_integrations.config.auto_create_leads=true`. Default off. |
| #36 | feat(db): add 'Callbell' to leads.source CHECK constraint | Migration. Aplicada manualmente en Supabase. |
| #37 | fix(callbell): adapt real Callbell webhook payload shape | Adapter inicial (asumía shape sin envelope). |
| #39 | feat(crm-advanced): paridad con CRM legacy via tagsSection prop | LeadDetailDialog completo en modo advanced + sección tags. |
| #42 | revert: hide region/destination placeholders | Revertí PR #41 que inventaba UI distinta. |
| #43 | fix(crm-advanced): remove invalid customers FK | Removido join inválido que rompía la query. |
| #44 | fix(callbell-adapter): permissive matching + log unknown shapes | Fallback para shapes raros. |
| #45 | feat(callbell): parse bot's structured summary | Parser de los 5 emojis (🌍🌴📆👥💵) → popula destination/tags/quoted_price. |
| #50 | fix(callbell-in): log raw body when adapter rejects | Inserta el rawBody en BD cuando adapter retorna null → permitió diagnosticar el bug del envelope. |
| #51 | **fix(callbell-adapter): unwrap {event, payload} envelope** | **EL FIX FINAL**. Callbell envuelve eventos en `{event, payload, createdAt}` — el modal de Callbell muestra solo el inner payload por eso era invisible. Caso 0 del adapter ahora unwrappea el envelope. |
| #52 | docs: VICO status doc — system LIVE | Doc actualizado con estado post-go-live. |
| #53 | feat(callbell): detect Mundial/F1 campaigns from client message | Cuando el cliente elige opción 4 (Mundial) o 5 (F1) del menú del bot, lo derivamos a agente sin resumen → ahora populamos `destination` + tag de campaña. Filtra por número origen ≠ bot. Idempotente. |

---

## 4. Arquitectura crítica

### Bot v50.2 (en Callbell, NO en Vibook)
- Vive 100% en Callbell (id bot `24537`, "Bot Sin Multimedia")
- Backup del prompt: `docs/vico-bot-v50-prompt-backup.txt` (~6170 chars original)
- Nueva versión: `docs/vico-bot-v50.1-prompt.txt` (~7900 chars con REGLAS ABSOLUTAS al inicio)
- 28/28 tests en simulador (5 grupo>9 + 5 presupuesto + 5 originales + 2 multi-turn + 3 adversariales + 2 fallback)

### Cadena Callbell → Vibook (webhook) — SHAPE REAL DESCUBIERTO

**Body que Callbell envía** (envelope-wrapped):
```json
{
  "event": "message_created",
  "payload": {
    "to": "...", "from": "...", "text": "...", "uuid": "...",
    "status": "...", "channel": "whatsapp",
    "contact": { "name", "phoneNumber", "uuid", "channel", ... }
  },
  "createdAt": "..."
}
```

⚠️ **Trampa importante**: el modal "Carga útil" de Callbell muestra SOLO el contenido de `body.payload` (sin envelope). Eso confundió todo el desarrollo inicial — los curls con el inner shape pasaban pero los reales fallaban como `unrecognized_payload`. **Fix definitivo en PR #51**: Caso 0 del adapter detecta `{event, payload}` y procesa recursivamente el inner.

### Flujo completo

```
WhatsApp cliente
    ↓
Callbell (bot v50.2 responde + dispara webhook con envelope {event, payload})
    ↓ POST https://app.vibook.ai/api/integrations/callbell-in/{TOKEN}/webhook
Vibook handler (app/api/integrations/callbell-in/[token]/webhook/route.ts)
    ↓ lookup org_integrations by token → resuelve org_id (VICO)
    ↓ adaptCallbellWebhook(rawBody)
       ├─ Caso 0: unwrap {event, payload} → recursivo
       ├─ Caso 1: { type, data } (tests / curl format)
       ├─ Caso 2: { text, contact } al root (lo que muestra modal)
       ├─ Caso 3: { phoneNumber, name, uuid } al root
       ├─ Caso 4: fallback con contact.phoneNumber
       └─ Si todo falla: insert al log como `event_type='unrecognized'` con payload completo (PR #50)
    ↓ insert webhook_event_log (idempotencia por event_uuid)
    ↓ processCallbellEvent(admin, orgId, event, {autoCreateLeads: true})
       ├─ contact_created sin lead existente → crea lead nuevo
       ├─ message_created → append a notes
       │     └─ Si el text matchea el resumen del bot (5 emojis) → extractBotSummary
       │           └─ Update destination, quoted_price + asignar tags
       ├─ tag_added → upsert lead_tag_assignments
       ├─ tag_removed → delete lead_tag_assignments
       ├─ funnel_changed → update leads.funnel_id
       └─ agent_assigned → update leads.assigned_seller_id
```

### Configuración Callbell (dashboard)
- Webhook URL: `https://app.vibook.ai/api/integrations/callbell-in/30fa0b47d455aaf505b990880e8a3e9c/webhook`
- Eventos suscritos: **Mensaje creado** + **Contacto creado**
- Estado: ✅ ON

### Multi-tenant flag (opt-in por org)
- Tabla `org_integrations`, fila VICO callbell-in
- `config.auto_create_leads = true` → habilita la creación automática de leads
- Otros tenants (Lozada, etc.): sin flag → comportamiento legacy (no crea, solo update)
- Activación: `npx tsx scripts/enable-vico-auto-create-leads.ts`

---

## 5. CRM Advanced — paridad con Lozada (Sprint A)

VICO está en `crm_mode='advanced'`. Antes del Sprint A, el lead-card abría SOLO el modal de etiquetas. Ahora:

| Componente | Archivo | Cambio |
|------------|---------|--------|
| Server | `app/(dashboard)/sales/crm-manychat/_components/advanced-crm-kanban.tsx` | Carga `agencies/sellers/operators` + campos completos del lead. NO incluye `customers:operation_customers`. |
| Client | `_components/advanced-kanban-client.tsx` | Propaga arrays al lead-card. |
| Lead card | `_components/lead-card-advanced.tsx` | Click abre `LeadDetailDialog` + pasa `tagsSection={<AdvancedTagsSection ...>}`. |
| Tags section | `_components/advanced-tags-section.tsx` | Sección inline + botón "Editar" abre TagAssignmentDialog. |
| Shared dialog | `components/sales/lead-detail-dialog.tsx` | Prop opcional `tagsSection?: ReactNode`. Lozada NO la pasa → comportamiento idéntico. |

**Aislamiento Lozada**: prop OPCIONAL + render condicional. Ningún archivo de Lozada modificado.

---

## 6. Lo que falta (en orden de prioridad)

### 🟥 Pendientes inmediatos

| # | Tarea | Tiempo estimado | Notas |
|---|-------|-----------------|-------|
| 1 | **Replicar v50.2 en otros 3 bots VICO**: Aldana WA, Messenger, Instagram. Cada uno: copiar prompt v50.1 + agregar nodo "Decisión: derivar?" con condición "agente" + probar en simulador + publicar | 1-2 hs | Crítico: hoy esos canales reciben el bot v49 con bugs viejos |
| 2 | **Rotar OpenAI API key** (expuesta en panel Callbell del nodo OpenAI: `sk-proj-wz43H0r...`). Generar nueva + reemplazar en los 4 bots | 15 min (login OpenAI de Tomi) | Crítico de seguridad |

### 🟨 Mejoras conocidas (no bloqueantes)

| # | Tarea | Origen |
|---|-------|--------|
| 3 | Parser solo dispara si el bot llega al resumen completo. Si el cliente elige opciones 2/3/4/5 (derivación directa), el resumen no se emite → tags y quoted_price quedan en null. **Caso esperado**: Lead Diego (eligió F1) tiene destino="A definir" y null. Vendedor completa manual con "Editar". | Comportamiento aceptado |
| 4 | "$" sin sufijo se infiere como USD. Trade-off del parser. | PR #45 |
| 5 | Rename de agencia no propaga a `organizations.name` (papercut UX) | Reportado 17/05 |
| 6 | Agency duplicada VICO ("Vico Travel Group" del 15/05 vs "VICO Travel Group" del 11/05). El handler usa la más vieja por created_at asc | Bootstrap legacy |
| 7 | Modal de Etiquetas muestra 60 tags amontonadas sin búsqueda | UX general del CRM |

### 🟩 Después

| # | Tarea |
|---|-------|
| 8 | Borrar el lead test "Tomas" cuando ya haya más leads reales |
| 9 | Implementar parsing fino de "Fechas" → `estimated_departure_date` |
| 10 | Sincronizar el vendedor del lead con quien asigna Callbell |
| 11 | Limpieza eventual de `event_type='unrecognized'` antiguos del log (ya están backfilled con `backfilled-message_created` y similares) |

---

## 7. Archivos clave del repo

```
lib/integrations/callbell/
├── api-client.ts              # Cliente para la API de Callbell (outbound)
├── types.ts                   # Tipos de payloads
├── payload-adapter.ts         # ⚠️ KEY — adapta el payload real al shape interno (incl. envelope unwrap)
├── summary-extractor.ts       # Extrae destination/mes/presupuesto del resumen del bot
├── sync-handler.ts            # Procesa eventos: crea leads, append notes, aplica tags, dispara parser
└── reconcile.ts               # Cron que sincroniza contactos cada 30 min

app/api/integrations/callbell-in/[token]/webhook/route.ts  # Entrypoint del webhook (loguea rawBody si rechaza)

app/(dashboard)/sales/crm-manychat/
├── page.tsx                   # Routing: advanced → AdvancedCRMKanban, basic → CRMManychatPageClient
└── _components/               # Componentes solo del modo advanced (VICO)
    ├── advanced-crm-kanban.tsx
    ├── advanced-kanban-client.tsx
    ├── lead-card-advanced.tsx
    ├── advanced-tags-section.tsx
    ├── tag-assignment-dialog.tsx
    └── tag-filter.tsx

components/sales/lead-detail-dialog.tsx  # SHARED con Lozada — tiene prop opcional tagsSection

docs/
├── VICO-CALLBELL-STATUS.md         # este archivo
├── vico-bot-v50-final-report.md
├── vico-bot-v50-prompt-backup.txt  # Prompt v49 original
├── vico-bot-v50.1-prompt.txt       # Prompt v50.2 con REGLAS ABSOLUTAS
├── vico-callbell-bot-v50-blueprint.md
├── vico-bot-analysis.md
└── sprint-crm-advanced-parity-plan.md
```

---

## 8. Scripts útiles

```bash
# Estado completo de VICO
npx tsx scripts/check-vico-status.ts

# Snapshot rápido (leads + eventos + tags del lead Tomas)
npx tsx scripts/check-vico-snapshot.ts

# Re-procesar eventos descartados como 'unrecognized' con el adapter nuevo
npx tsx scripts/backfill-from-unrecognized.ts

# Ver últimos webhook events (todas las orgs)
npx tsx scripts/check-all-webhook-events.ts

# Ver bodies de eventos `unrecognized` para diagnosticar
npx tsx scripts/check-unrecognized-bodies.ts

# Ver notas + datos del lead Tomas
npx tsx scripts/check-lead-notes.ts

# Activar flag auto_create_leads en VICO (idempotente)
npx tsx scripts/enable-vico-auto-create-leads.ts

# Reset password de los 10 users VICO
npx tsx scripts/reset-vico-passwords.ts  # password: VicoVibook2026!

# Test del adapter con payload real de Callbell
npx tsx scripts/test-real-event-adapter.ts

# Test del extractor de resumen del bot
npx tsx scripts/test-summary-extractor.ts
```

---

## 9. Decisiones clave tomadas

1. **NO inventar UI distinta entre tenants**: el CRM advanced debe ser idéntico al de Lozada + sección de tags. PR #41 fue revertido.
2. **Multi-tenant safety**: cualquier feature nueva del callbell-in es opt-in por org via `config.auto_create_leads`. Default = comportamiento legacy.
3. **Currency heuristic en parser**: "$" bare default a USD (v50.2 prompt elide sufijo solo cuando USD).
4. **Log de rawBody en BD cuando adapter rechaza** (PR #50): Railway logs pueden estar delayed; BD es fiable. Permitió diagnosticar el bug del envelope.
5. **Modal de Callbell muestra `payload`, NO el body raw**: trampa de UX que costó horas de debugging. Documentado en el adapter.

---

## 10. Riesgos para el cliente

| Riesgo | Mitigación |
|--------|------------|
| Bot v50.2 puede tener glitches en casos no probados (multimedia, mensajes muy largos) | Monitorear primeras 48hs. Tenemos `Restaurar versión` de Callbell para rollback. |
| Parser falla si el destino no está cargado como tag en VICO | Match case-insensitive en BD. Si no matchea → no asigna tag → conversación queda en notes. |
| Si el cliente elige opciones 2/3/4/5 (derivación directa), el resumen no se emite | Lead se crea igual con notes. Vendedor completa manualmente desde "Editar". Diego es ese caso. |
| Otros 3 bots VICO siguen con prompt viejo (v49 con bugs) | Falta replicar v50.2. Ver §6 pendiente 1. |
| OpenAI API key expuesta | Rotar después de la entrega. Ver §6 pendiente 2. |

---

## 11. Historial de cambios

| Fecha | Cambio | PR |
|-------|--------|-----|
| 2026-05-11 | Bootstrap VICO: org + agency + users + tags + funnels + integrations | (script) |
| 2026-05-12 | Construcción inicial del bot v50 en Callbell DRAFT | manual |
| 2026-05-15 | Iteración del prompt v50.1 (REGLAS ABSOLUTAS al inicio) | docs |
| 2026-05-16 | Batería QA completa 28/28 después de fixes | docs |
| 2026-05-16 | Sprint A — paridad CRM advanced | #35, #36, #39, #42, #43 |
| 2026-05-17 | Publicación del bot v50.2 (manual desde dash.callbell.eu) | manual |
| 2026-05-18 | Fix adapter (permissive) + parser del resumen del bot | #44, #45 |
| 2026-05-18 | Recap inicial del proyecto | este doc |
| 2026-05-19 | Log de rawBody cuando adapter rechaza | #50 |
| **2026-05-19** | **🎯 Fix del envelope `{event, payload}` — sistema LIVE con clientes reales** | **#51** |
| 2026-05-19 | Backfill de 11 eventos descartados → 2 leads creados (Tomas + Diego) | (script) |

---

## 12. Cómo seguir si la sesión se queda sin contexto

**Para retomar mañana**:
1. Abrir `docs/VICO-CALLBELL-STATUS.md` (este archivo) — contexto completo en 5 min
2. `npx tsx scripts/check-vico-snapshot.ts` — estado actual en BD
3. Revisar §6 pendientes inmediatos
4. PR más reciente mergeada: #51 (envelope unwrap)

**Próximas tareas** (sin orden estricto, vos elegís):
- Replicar v50.2 en los 3 bots restantes (1-2 hs)
- Rotar OpenAI key (15 min, con tu login OpenAI)
- Implementar mejoras del §6 punto 3-11
