# SP-6 (alcance reducido) — Purchase Invoices multi-tenant

**Fecha**: 2026-04-25
**Status**: Spec final (después de pivot)
**Reemplaza**: `2026-04-25-purchase-invoices-design.md` (scope original cancelado)

## Por qué este pivot

El plan original SP-6 (N:M + asiento contable + módulo dedicado) **duplicaba un módulo legacy ya en prod** (commit `5a29e15`, 2026-03-26) que cubre el 90% del scope:

- **Tabla `purchase_invoices`** (creada manualmente en SQL Editor, sin migration en repo)
- **API**: `app/api/operations/[id]/purchase-invoices/[invoiceId]/route.ts` + `route.ts`
- **UI**: `components/operations/purchase-invoices-section.tsx` (630 líneas), montada en `operation-detail-client.tsx`
- **OCR**: con OpenAI Vision para autocompletar campos de factura A AFIP
- **Integraciones**: actualiza `iva_purchases` con datos reales, crea `tax_withholdings` para percepciones IVA + IIBB

**Brecha crítica**: el módulo legacy **no tiene `org_id` ni RLS** → leak entre orgs del SaaS Vibook. Cualquier user de cualquier org veía/escribía las facturas de todas las orgs.

## Decisión

Restaurar la tabla legacy con su schema original + agregar `org_id` + RLS + trigger autopobla. Sin tocar el código existente — solo se beneficia automáticamente del aislamiento.

## Scope

### Lo que hacemos
1. Crear migration `20260425120000_purchase_invoices.sql` con:
   - Tabla `purchase_invoices` con schema legacy completo
   - Columna `org_id UUID NOT NULL REFERENCES organizations(id)` (multi-tenant)
   - RLS pattern estándar (`tenant_isolation`)
   - Trigger `trg_auto_org_id_purchase_invoices` que llama `auto_set_org_id_from_auth()` (función universal de mig 152), de modo que el código legacy sigue funcionando sin pasar `org_id` explícito.
   - Trigger `purchase_invoices_updated_at` (timestamp managed)
   - Indices en `(operation_id)`, `(operator_id)`, `(org_id, invoice_date DESC)`
2. Regenerar `lib/supabase/types.ts`.
3. Test de aislamiento básico (`__tests__/isolation/purchase-invoices.test.ts`): org A no ve facturas de org B, ni puede insertar con `org_id` de otra org.
4. Smoke E2E manual: cargar 1 factura desde la UI (Lozada), confirmar que aparece solo en Lozada.

### Lo que NO hacemos (queda para SP-6.5 o sprint futuro)
- Cardinalidad N:M (1 factura → varias operaciones). El legacy es 1:1.
- Módulo dedicado `/accounting/purchase-invoices`. El legacy entrega via tab Contabilidad de la operación.
- Asiento contable automático. El legacy actualiza `iva_purchases` y `tax_withholdings`, no genera `journal_entry` formal.
- Status DRAFT/CONFIRMED/CANCELLED. El legacy usa `status='REGISTERED'` y permite editar/borrar libremente.
- Permission matrix `accounting.purchase-invoices`. El legacy usa `getCurrentUser()` sin chequeo fino — todos los authenticated escriben.

## Convivencia con `iva_purchases`

`iva_purchases` se sigue auto-creando por operación (legacy). Cuando se carga una `purchase_invoice` real, el código legacy actualiza el row de `iva_purchases` con los datos AFIP reales (ver `app/api/operations/[id]/purchase-invoices/route.ts:227`).

Para SP-3 (Libro IVA Digital), la fuente preferida será `purchase_invoices` cuando exista, fallback `iva_purchases`. Eso lo decidimos en el spec del SP-3.

## Schema (resumen)

```
purchase_invoices
├── id, org_id (NEW), operation_id, operator_id, created_by
├── invoice_type, invoice_number, invoice_date, emitter_cuit, emitter_name
├── currency, exchange_rate
├── net_amount, iva_rate, iva_amount
├── perception_iva, perception_iibb, other_taxes
├── total_amount, total_ars_equivalent
├── document_url, document_name (PDF en bucket `documents` legacy)
├── status (default 'REGISTERED'), notes
└── created_at, updated_at
```

## Dependencias

- `auto_set_org_id_from_auth()` — función universal SaaS (existe desde migration 152)
- `user_org_ids()` — función SaaS (Pilar 1)
- `platform_admins` — tabla SaaS (Pilar 4)

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Trigger universal mig 152 no se aplica auto a esta tabla | Lo agrego explícito en la migration (`trg_auto_org_id_purchase_invoices`) |
| Si alguna org había usado el módulo legacy, su data se perdió en el reset | Ningún usuario reportó uso productivo. Risk aceptado. |
| `iva_purchases` legacy ya tenía datos pero no `org_id` parejo | Verificar que `iva_purchases` también tiene RLS (es parte del Pilar 1 SaaS — confirmar) |

## Plan de ejecución

1. Migration corre en Supabase prod (vía SQL Editor).
2. Tipos regenerados con `npm run db:generate`.
3. Test de aislamiento.
4. Smoke E2E con Lozada.
5. Commit + done.

Total estimado: ~1 día.
