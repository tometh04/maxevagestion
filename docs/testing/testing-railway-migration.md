# Checklist de QA — Migración Vercel → Railway

Checklist para validar que todas las integraciones que dependen de **variables de entorno** siguen funcionando después de la migración de hosting de Vercel a Railway y del cambio de dominio `maxevagestion.com` → `app.vibook.ai`.

**Cómo usar**: ir de arriba abajo marcando cada bloque. Cada flujo lista las env vars que necesita, cómo probarlo desde la app en producción (`https://app.vibook.ai`) y cómo verificar que el resultado quedó bien.

> ⚠️ **Antes de empezar**: confirmar en Railway → Service → Variables que *todas* las env vars listadas en `.env.example` + las integraciones abajo están definidas. Una variable faltante se manifiesta como un 500 silencioso o feature que "no hace nada", no como un error claro.

---

## 0. Pre-flight

- [ ] `https://app.vibook.ai` carga sin errores.
- [ ] Logs de Railway del servicio web no muestran `Missing Supabase environment variables`, `Invalid API key`, ni `TypeError: fetch failed` al arrancar.
- [ ] `DISABLE_AUTH` **NO** está seteada (o está en `false`) en el servicio de producción. Si está en `true`, cualquiera entra como SUPER_ADMIN.

---

## 1. Supabase — auth, DB, storage (base de todo)

**Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Login**: entrar con un usuario real y llegar a `/dashboard` sin loops de redirect.
- [ ] **Logout** funciona (botón en sidebar).
- [ ] **Password reset**: pedir reset desde `/login` → llega email → link abre en `app.vibook.ai` (no en `localhost` ni en dominio viejo) → permite cambiar contraseña.
  - ⚠️ Si el link del email va a `maxevagestion.com` o `localhost:3000`, falta actualizar **Site URL** en Supabase Dashboard → Authentication → URL Configuration.
- [ ] **Redirect URLs allowlist** en Supabase incluye `https://app.vibook.ai/**`.
- [ ] Sidebar muestra opciones según rol (SUPER_ADMIN ve todo, SELLER ve solo lo suyo).
- [ ] Algún query crea/lee datos (ej: listar operaciones) — confirma que el anon key y service role key están bien seteados.

## 2. OpenAI — OCR de documentos

**Env var**: `OPENAI_API_KEY`.

- [ ] Ir a un customer o lead → subir una foto/PDF de DNI o pasaporte → esperar 10-30s.
- [ ] Los campos (nombre, nro documento, fecha nac.) se autocompletan.
- [ ] Si falla: revisar logs de Railway, buscar `OPENAI_API_KEY` no definido o `401 Unauthorized` de OpenAI.

## 3. OpenAI — AI Copilot

**Env var**: `OPENAI_API_KEY` (misma).

- [ ] Abrir AI Copilot desde el dashboard → hacer una pregunta tipo "mostrame el resumen de ventas de la semana".
- [ ] Responde con datos reales, no con error o mensaje genérico.

## 4. OpenAI — voice tasks / purchase invoices OCR

**Env var**: `OPENAI_API_KEY`.

- [ ] En `/tools/tasks`, usar input de voz → la tarea se parsea y crea.
- [ ] En una operación, subir una factura de compra → los campos (total, fecha, proveedor) se extraen.

## 5. Emails — Resend

**Env vars**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (recomendado: `noreply@vibook.ai`).

- [ ] Invitar un nuevo usuario desde Settings → Users → Invite → llega el email.
- [ ] Email viene de `@vibook.ai`, **NO** de `@maxevagestion.com`.
- [ ] Email no cae en spam (DKIM/SPF/DMARC del dominio `vibook.ai` verificados en Resend).
- [ ] Link del email apunta a `https://app.vibook.ai/...`.
- [ ] Notificación de pago enviada (si el cliente tiene email) también llega.

## 6. Push notifications (VAPID)

**Env vars**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`.

- [ ] Activar notificaciones push desde el bell icon → el navegador pide permiso.
- [ ] Disparar una notificación (ej: asignar una tarea) → aparece la notificación push en el browser.
- [ ] En iOS: la PWA instalada (home screen) recibe la notif.
- [ ] `VAPID_EMAIL` está seteada a `mailto:hola@vibook.ai` o similar (no a `maxevagestion.com`).

## 7. MercadoPago — checkout + webhook

**Env vars**: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL=https://app.vibook.ai`.

- [ ] Desde `/paywall` o Settings → Subscription, iniciar un checkout de prueba → redirige a MercadoPago.
- [ ] Volver a la app: la URL de retorno es `https://app.vibook.ai/...`, no `localhost` ni dominio viejo.
- [ ] **Dashboard MP** → Webhooks → URL actualizada a `https://app.vibook.ai/api/webhooks/mercadopago`.
- [ ] Tras pago exitoso (modo sandbox si aplica), el estado de la suscripción se actualiza en DB.
- [ ] **Legacy**: suscripciones viejas que apuntan a `maxevagestion.com/api/webhooks/mercadopago` deberían llegar vía redirect 301 — verificar que al menos un webhook legacy llegue OK (MP reintenta, así que revisar logs 24-48h después).

## 8. AFIP SDK — facturación electrónica

**Env var**: `AFIP_SDK_API_KEY`.

- [ ] Settings → Integraciones → AFIP → Test de conexión → responde OK.
- [ ] Emitir una factura de prueba desde una operación → se genera CAE y PDF.
- [ ] Si da error `401` contra AFIP SDK, la env var no está seteada en Railway.

## 9. Trello — sincronización bidireccional

**Env vars**: `TRELLO_API_KEY`, `TRELLO_TOKEN`.

- [ ] Webhooks registrados en Trello apuntan a `https://app.vibook.ai/api/trello/webhook` (ver Settings → Trello en la app, o correr `scripts/trello-health-check.ts`).
- [ ] **Trello → Leads**: crear una card nueva en el board de producción → aparece como lead en `/sales/leads` en <1 min.
- [ ] **Leads → Trello**: crear un lead manual en la app → aparece como card en Trello.
- [ ] Mover card entre listas en Trello → el lead cambia de stage en la app.


## 10. Manychat — webhook de leads

**Env var**: `MANYCHAT_WEBHOOK_API_KEY`.

- [ ] Dashboard Manychat → Webhook URL actualizada a `https://app.vibook.ai/api/webhooks/manychat`.
- [ ] Enviar un mensaje de prueba desde Manychat → aparece como lead en `/sales/crm-manychat`.
- [ ] Header `X-API-Key` de Manychat coincide con `MANYCHAT_WEBHOOK_API_KEY` en Railway (si no coincide, devuelve 401 silencioso).

## 11. WhatsApp Control — conector externo

**Env vars**: `WHA_CONNECTOR_URL`, `WHA_CONNECTOR_SECRET`.

- [ ] `/tools/wha-control` carga sin error.
- [ ] Lista sesiones activas del conector.
- [ ] Enviar un mensaje de prueba → llega al destinatario.

## 12. BCRA — cotización USD/ARS

**Env var**: `USD_ARS_EMERGENCY_RATE` (opcional, fallback si BCRA cae).

- [ ] Tras el cron diario (o disparándolo manual: `curl -X POST https://app.vibook.ai/api/cron/exchange-rates -H "Authorization: Bearer $CRON_SECRET"`), verificar en DB tabla `exchange_rates` que hay fila del día.
- [ ] En la UI, crear un pago en USD → la conversión a ARS usa la tasa del día.

## 13. Amadeus — búsqueda de aeropuertos

**Env vars**: `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`.

- [ ] En el lead/quotation builder, buscar un aeropuerto por nombre (ej: "Ezeiza") → devuelve `EZE` con metadata.
- [ ] Si no está seteado, el input cae al fallback interno (no crashea, pero sugerencias son limitadas).

## 14. Geoapify — búsqueda de hoteles por destino

**Env var**: `GEOAPIFY_API_KEY`.

- [ ] En quotation builder, agregar un hotel por destino (ej: "Miami") → sugiere hoteles con lat/lng.
- [ ] Si falla: es fallback opcional, no bloqueante.

## 15. WhatsApp receipts (envío de comprobantes)

**Env var**: `NEXT_PUBLIC_APP_URL` ⚠️ crítica — el endpoint hace fetch a sí mismo usando esta URL.

- [ ] Desde un pago confirmado, generar recibo WhatsApp → el link compartido es `https://app.vibook.ai/...`, **NO** `http://localhost:3000/...`.
- [ ] Si sale localhost, falta `NEXT_PUBLIC_APP_URL=https://app.vibook.ai` en Railway. Ver `app/api/whatsapp/send-receipt/route.ts:72`.

## 16. Cron jobs — Railway Cron Services

**Env var**: `CRON_SECRET` (compartida entre servicio web y los 7 servicios cron).

- [ ] Los 7 servicios cron creados en Railway (ver plan de migración de crons).
- [ ] Trigger manual de cada uno desde Railway UI → logs muestran `200 OK` y el endpoint ejecuta.
- [ ] Probar también con curl desde tu máquina:
  ```bash
  curl -X POST https://app.vibook.ai/api/cron/alerts -H "Authorization: Bearer $CRON_SECRET" -i
  ```
- [ ] Sin el header → `401 Unauthorized`.
- [ ] Después de 24-48h naturales, verificar en DB:
  - tabla `alerts` tiene filas nuevas del día.
  - tabla `notifications` tiene filas del día.
  - tabla `exchange_rates` tiene fila L-V.

## 17. Invitaciones de usuarios — origin header

**Env var**: `NEXT_PUBLIC_APP_URL` (fallback cuando el request no tiene `Origin`).

- [ ] Invitar usuario desde Settings → Users → Invite → link del email apunta a `https://app.vibook.ai/auth/accept-invite`.
- [ ] Re-enviar invitación también genera link correcto.

## 18. Billing checkout — back URL

**Env var**: `NEXT_PUBLIC_APP_URL`.

- [ ] Iniciar checkout MP → el `back_urls.success/failure/pending` redirige a `https://app.vibook.ai/...`.

## 19. Landing URL (links salientes)

**Env var**: `NEXT_PUBLIC_LANDING_URL` (default `https://vibook.ai`).

- [ ] Desde `/register` o footer, los links a "Inicio" / "Términos" / "Privacidad" van a `https://vibook.ai`, no al dominio viejo.

---

## Variables de entorno — matriz de referencia

Comparar con Railway → Variables. Marcar las que están seteadas en prod:

| Categoría | Variable | Obligatoria | Notas |
|---|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| Supabase | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only, nunca exponer |
| App | `NEXT_PUBLIC_APP_URL` | ✅ | `https://app.vibook.ai` — usada en WhatsApp, invites, MP |
| App | `NEXT_PUBLIC_LANDING_URL` | ➖ | Default `https://vibook.ai` |
| Auth | `DISABLE_AUTH` | ❌ | **NO setear** en prod |
| Cron | `CRON_SECRET` | ✅ | Mismo valor en web y cron services |
| OpenAI | `OPENAI_API_KEY` | ✅ | OCR + Copilot + voice |
| Emails | `RESEND_API_KEY` | ✅ | |
| Emails | `RESEND_FROM_EMAIL` | ➖ | Default `Vibook <noreply@vibook.ai>` |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ➖ | Si se usan push |
| Push | `VAPID_PRIVATE_KEY` | ➖ | idem |
| Push | `VAPID_EMAIL` | ➖ | idem, `mailto:soporte@vibook.ai` |
| MP | `MP_ACCESS_TOKEN` | ✅ | Si hay billing activo |
| MP | `MP_WEBHOOK_SECRET` | ✅ | idem |
| AFIP | `AFIP_SDK_API_KEY` | ➖ | Si se emiten facturas |
| Trello | `TRELLO_API_KEY` | ✅ | |
| Trello | `TRELLO_TOKEN` | ✅ | |
| Emilia | `EMILIA_API_KEY` | ✅ | Format `wsk_xxx` |
| Emilia | `EMILIA_API_URL` | ➖ | Default `https://api.vibook.ai/search` |
| Manychat | `MANYCHAT_WEBHOOK_API_KEY` | ➖ | Si se usa Manychat |
| WhatsApp | `WHA_CONNECTOR_URL` | ➖ | Si se usa módulo wha-control |
| WhatsApp | `WHA_CONNECTOR_SECRET` | ➖ | idem |
| Amadeus | `AMADEUS_CLIENT_ID` | ➖ | |
| Amadeus | `AMADEUS_CLIENT_SECRET` | ➖ | |
| Geoapify | `GEOAPIFY_API_KEY` | ➖ | |
| Misc | `USD_ARS_EMERGENCY_RATE` | ➖ | Fallback FX |
| Misc | `MULTI_TENANT_STRICT` | ➖ | Feature flag RLS |

---

## Red flags durante el QA

Si alguno de estos aparece, es probable que falte una env var en Railway:

- **Link en email apunta a `localhost:3000`** → falta `NEXT_PUBLIC_APP_URL` o `RESEND_FROM_EMAIL`.
- **401 al crear/invitar usuario** → revisar `SUPABASE_SERVICE_ROLE_KEY`.
- **OCR devuelve texto vacío o error silencioso** → `OPENAI_API_KEY` faltante.
- **Webhook de Trello/MP no dispara nada** → URL no actualizada en el proveedor externo (no es env var, es config en el dashboard del tercero).
- **Cron jobs no corren** → los 7 servicios en Railway no están creados o `CRON_SECRET` difiere entre web y cron.
- **Emails a spam** → DNS de Resend (DKIM/SPF/DMARC) no verificado para `vibook.ai`.
- **Emilia responde 403** → Origin header bloqueado por API (coordinar con equipo Emilia).

---

## Reporte final

Al terminar, responder:

- [ ] ¿Todos los flujos críticos (1, 5, 7, 9, 17) pasaron?
- [ ] ¿Algún flujo opcional falló? ¿Cuál y por qué?
- [ ] ¿Hay env vars marcadas como "obligatorias" arriba que no aparecen en Railway?
- [ ] Screenshots de al menos: login OK, email de reset llegando a `app.vibook.ai`, webhook Trello creando lead, cron ejecutándose.
