# Acceso temporal y entitlement de Emilia

## Objetivo

Emilia queda disponible para todos los tenants con suscripción vigente durante
cuatro semanas. El corte versionado es `2026-08-11T19:32:31.000Z`, equivalente
al 11 de agosto de 2026 a las 16:32:31 de Argentina.

Después del corte acceden únicamente:

- Organizaciones con `organizations.plan = 'ENTERPRISE'`.
- Organizaciones con `organizations.custom_plan_id` no nulo. Billing trata esos
  planes como Enterprise.

El acceso por plan nunca amplía permisos funcionales. Cotizar desde un lead
requiere `leads.write` resuelto con roles adicionales y permisos dinámicos por
agencia.

## Fuente de verdad

`lib/emilia/access.ts` centraliza:

- Suscripción vigente mediante `isAccessAllowed()`.
- Ventana promocional.
- Entitlement Enterprise/custom posterior.
- Permiso `leads.write` y scope de agencias para chats originados en leads.

`lib/billing/plans.ts` comunica la misma regla en la UI comercial: PRO muestra
la fecha de fin de la promoción y Enterprise incluye Emilia sin vencimiento.

No se debe reintroducir un allowlist por email ni consultar el flag histórico
`features.lead_emilia_chat` en rutas individuales.

`tools_settings.emilia_enabled` queda como configuración legacy del módulo de
herramientas y no otorga ni revoca el entitlement de Emilia. La habilitación de
producto se decide sólo en el resolver central para evitar reglas divergentes.

## Configuración

- `EMILIA_PROMOTION_END_AT`: override ISO 8601 opcional del corte.
- `EMILIA_API_URL`: endpoint externo de Emilia.
- `EMILIA_API_KEY`: credencial global, sólo server-side.
- `EMILIA_API_TIMEOUT_MS`: timeout externo, default 65000 ms.

Si `EMILIA_PROMOTION_END_AT` falta o es inválido, se usa el corte versionado.

## Enforcement

La regla se aplica en:

- `GET/POST /api/leads/[id]/emilia`.
- `GET /api/leads/[id]/emilia/suggested-prompt`.
- `POST /api/emilia/chat`.
- `GET/POST /api/emilia/conversations`.
- `GET/DELETE /api/emilia/conversations/[id]`.

Las conversaciones se scopean por `org_id` y `user_id`. Los chats de lead
también revalidan el lead y la agencia antes de llamar al proveedor externo.

## UX al vencer

Para PRO/STARTER, el botón `Cotizar` sigue ofreciendo el cotizador manual. Si el
usuario intenta Emilia después del corte, la API devuelve
`emilia_plan_required`; la UI informa que Emilia requiere Enterprise y abre el
flujo manual de forma explícita.

Los errores de permiso o tenancy no abren el cotizador como fallback.

## Despliegue

1. Aplicar `20260714000001_harden_emilia_access_for_global_promo.sql`.
2. Configurar `EMILIA_API_URL`, `EMILIA_API_KEY` y, sólo si se quiere cambiar el
   corte, `EMILIA_PROMOTION_END_AT` en Railway.
3. Desplegar la aplicación.
4. Validar un tenant PRO y uno Enterprise antes del corte.
5. Simular el tiempo posterior al corte en tests y verificar que PRO cae al
   cotizador manual y Enterprise conserva Emilia.
