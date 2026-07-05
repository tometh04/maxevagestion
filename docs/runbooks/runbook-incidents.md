# Runbook de incidentes — Vibook

Procedimientos para incidentes productivos comunes. Incluye backups, restore,
detección rápida de problemas, y rollback.

**Audiencia**: Tomi y cualquiera que tenga acceso admin a Railway + Supabase.
**Última actualización**: 2026-05-06.

---

## 1. Backups Supabase

### Qué tiene Supabase out-of-the-box

Supabase hace backups automáticos según el plan:

| Plan | Frecuencia | Retención | PITR (Point-In-Time Recovery) |
|---|---|---|---|
| Free | Diario | 7 días | No disponible |
| Pro | Diario | 30 días (extensible a 90) | Add-on opcional ($100/mes) |
| Team | Diario | 30 días | Incluido |
| Enterprise | Diario | Custom | Incluido |

**Para chequear qué plan/backup tenemos hoy**:
1. Entrar a https://supabase.com/dashboard
2. Seleccionar el proyecto Vibook
3. Settings → Billing → ver el Plan actual
4. Database → Backups → ver lista de snapshots disponibles

### Cómo restaurar un backup completo

Solo en caso de **incidente grave** (data corruption, drop accidental de tabla,
hack). Esto **borra TODO lo que pasó después del snapshot** — coordinar con los
tenants afectados antes.

1. Supabase Dashboard → proyecto Vibook → Database → Backups
2. Identificar el snapshot a restaurar (por fecha y hora)
3. Click **Restore** en ese snapshot
4. Confirmar el reemplazo (input del nombre del proyecto)
5. Esperar ~10–30 min según tamaño
6. Avisar por WhatsApp a TODOS los tenants pilotos: "Restauramos backup
   del [fecha] por [razón]. Cualquier cosa creada después de [hora] se perdió."

### Cómo restaurar SOLO una tabla (sin tirar toda la DB)

Si el problema es acotado (ej. alguien dropeó `customers` por error pero el
resto de la DB está OK):

1. Supabase Dashboard → Database → Backups
2. Click el snapshot → **Download SQL** (descarga `.sql.gz`)
3. Local: `gunzip backup.sql.gz`
4. Buscar la sección de la tabla afectada (`-- Data for Name: customers`)
5. Conectarse al proyecto productivo:
   ```
   psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
   ```
6. Crear staging y restaurar SOLO esa tabla:
   ```sql
   CREATE TABLE customers_restore_2026_05_06 AS SELECT * FROM customers WHERE 1=0;
   -- pegar los INSERT de la sección extraída redirigidos a la tabla _restore_
   -- después merge manual evaluando overlapping keys
   ```

### Backup manual ad-hoc (antes de cambios riesgosos)

Antes de correr una migración grande o cambio destructivo:

```bash
# Descarga snapshot del esquema + data al momento actual
SUPABASE_PROJECT_REF=zwgrbqstubwsqdxcarbu  # cambiar por el ref real
SUPABASE_DB_PASSWORD=<password de Supabase Database settings>
pg_dump "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres" \
  --no-owner --no-acl > backup-$(date +%Y%m%d-%H%M).sql
```

Guardar en un lugar SEPARADO de Supabase (Dropbox/Drive personal).

### Lo que YA está cubierto vs hay que mejorar

✅ Backup diario automático — Supabase lo hace solo, retención 7–30 días.
⚠️ NO tenemos PITR si el plan es Free/Pro sin add-on.
⚠️ NO hay copias offline (todo está en Supabase). Si Supabase tiene un
  outage de varios días, no podemos restaurar.

**Recomendación pre-GTM**: confirmar plan Pro+, considerar add-on PITR si
vamos a tener data crítica de tenants pagos. Costo $100/mes para reducir
el RPO (recovery point objective) de 24hs a minutos.

---

## 2. Detección rápida de incidentes

### Lo que monitoreamos hoy

- **Crons**: Railway dashboard muestra estado de cada cron service. Verde = OK.
- **App principal (`maxevagestion`)**: Railway → Online significa que está
  respondiendo health checks.
- **Supabase**: dashboard de Supabase muestra status. También supabase.com/status.

### Síntomas comunes y triage

| Síntoma | Primera revisión |
|---|---|
| Tenant dice "no me funciona" | (1) `https://app.vibook.ai` carga? (2) `/api/health`? (3) Login del tenant funciona? |
| AFIP rechaza facturas | Error code en el dialog. Si 10000 = cert no autorizado en IVA. Si 10036 = FchVtoPago en pasado (ya fixeado). Si otro código = ver `lib/afip/types.ts` |
| Cron rojo en Railway | Click en cron service → View logs → último deploy. Si curl 401 = secret desincronizado. Si timeout = endpoint lento. |
| Página dashboard tarda >10s | Network tab del navegador → identificar endpoint lento. Casi siempre es `/api/settings/organization` (5s cold) o un analytics. |
| Error 500 random | Railway logs del servicio `maxevagestion` filtrando por timestamp del incidente. |

### Logs en Railway

```
Railway → workspace skillful-dedication → production → maxevagestion → Logs tab
```

Filtros útiles:
- `[cron:` para ver runs de crons
- `[perf:` para ver instrumentación de performance
- `Error` para errores
- `org_id` para filtrar por tenant específico

---

## 3. Rollback de deploy

Si un deploy en main rompió producción:

### Opción A — Revertir el commit en GitHub
```bash
cd ~/Desktop/Repos/erplozada
git revert <SHA-del-commit-malo> --no-edit
git push origin main
```
Railway auto-deploya el revert en ~3 min.

### Opción B — Re-deploy de un build anterior en Railway (más rápido)
1. Railway → maxevagestion → Deployments tab
2. Encontrar el último deploy que andaba bien (verde, sin errores)
3. Click los `...` → **Redeploy**
4. Esperar ~2 min

Esto vuelve la app al código viejo SIN tocar el git. Después se puede arreglar
el commit malo con calma.

### Opción C — Pause completo (último recurso)
Si está pasando algo grave (data leak, infinite loop borrando data):
1. Railway → maxevagestion → Settings → **Pause Service**
2. La app entera queda fuera de línea (todos los tenants ven 502)
3. Investigar y resolver
4. Click **Resume** cuando esté arreglado
5. Avisar a los tenants por WhatsApp del downtime

---

## 4. Crons rotos

### Si todos los crons fallan

Probablemente CRON_SECRET desincronizado entre `maxevagestion` y los cron
services. Ver `lib/cron/auth.ts` y procedimiento en
`/Users/tomiisanchezz/.claude/projects/-Users-tomiisanchezz-Desktop-Repos/memory/project_cron_secret_weak.md`.

Resumen: cada cron service usa `Bearer $CRON_SECRET` (referencia a
`${{maxevagestion.CRON_SECRET}}`). Si rotás el secret en main service, los
crons heredan automático. El bug histórico fue tener el secret hardcoded
en cada Custom Start Command — ya migrado el 2026-05-06.

### Si un cron específico falla

1. Railway → cron-XXX → Cron Runs tab → última corrida → View logs
2. Si curl 401: ver auth (paso anterior)
3. Si curl 500: el endpoint /api/cron/XXX devolvió error. Ver Railway logs de
   `maxevagestion` filtrando por `cron:XXX`
4. Si timeout: el endpoint tardó >300s (--max-time del curl). Optimizar el
   endpoint o aumentar max-time.

---

## 5. Tenant-specific support

### Para investigar el estado de un tenant

Mientras no tengamos admin UI per-tenant (TODO post-GTM):

1. Login a Supabase Dashboard → SQL Editor
2. Buscar el `org_id` por nombre o email del usuario:
   ```sql
   SELECT o.* FROM organizations o
   JOIN users u ON u.org_id = o.id
   WHERE u.email = 'tenant@email.com';
   ```
3. Para ver subscription:
   ```sql
   SELECT subscription_status, current_period_ends_at, trial_ends_at, custom_plan_id
   FROM organizations WHERE id = '<org_id>';
   ```
4. Para ver integraciones AFIP:
   ```sql
   SELECT i.* FROM integrations i
   JOIN agencies a ON a.id = i.agency_id
   WHERE a.org_id = '<org_id>' AND i.integration_type = 'afip';
   ```
5. Para últimas facturas y su estado:
   ```sql
   SELECT cbte_tipo, status, error_msg, created_at
   FROM invoices WHERE org_id = '<org_id>'
   ORDER BY created_at DESC LIMIT 20;
   ```

### Acciones admin frecuentes (vía /admin)

| Necesidad | Ruta admin |
|---|---|
| Ver lista de tenants | `/admin/orgs` |
| Detalle de un tenant | `/admin/orgs/[id]` |
| Métricas SaaS (MRR/ARR/churn) | `/admin/metrics` |
| Reconciliar pagos manuales | `/admin/orgs/[id]` → sección "Pagos manuales" |
| Suspender / reactivar tenant | `/admin/orgs/[id]` → "Acciones críticas" |
| Borrar custom plan | `/admin/orgs/[id]` → custom plan card |

---

## 6. Contactos de emergencia

| Vendor | Cuándo escalar | Cómo |
|---|---|---|
| **Supabase** | Outage prolongado (>30min), data corruption | https://supabase.com/dashboard → Help → Submit ticket |
| **Railway** | Service no levanta tras restart, regional outage | https://railway.app/help |
| **AFIP SDK** | Setup automático falla para todos los tenants | support@afipsdk.com |
| **Mercado Pago** | Webhooks no llegan, preapproval falla | Dashboard MP → Developers → Soporte |

---

## 7. Lo que falta documentar (post-GTM)

- [ ] Procedimiento de migración de schema con downtime cero (lock corto + RLS)
- [ ] Procedimiento de re-encriptación de secrets si AFIP_SDK_API_KEY se filtra
- [ ] Cómo agregar un tenant manualmente saltándose el flujo de onboarding
- [ ] Cómo refundir un tenant (devolver MP pago + cancelar subscription)
- [ ] Política de data retention (cuánto guardamos data de tenants cancelados)
