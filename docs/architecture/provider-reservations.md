# Reservas de mayoristas en Operaciones

Base: codex/delfos-staging-booking. Una fila por ítem de la solicitud; los ítems
pendientes o fallidos conservan su estado y sólo tienen localizador si el mayorista
creó una reserva. No se deduce confirmación de HTTP 200/201 ni de la conversión ERP.

Ownership: Delfos posee la ficha operativa y el estado del proveedor; Emilia posee
el job, su pertenencia tenant/agencia/API key y los IDs externos autorizados;
Vibook posee la cotización, operación, vendedor y permisos. La consulta de detalles
de Emilia sólo acepta job ID, nunca un booking ID arbitrario del browser.

GET /v1/bookings/:id/detail en Delfos reutiliza la proyección del backoffice,
filtrando por agencia OAuth. Emilia GET /v1/provider-bookings/:jobId/details
enriquece los ítems persistidos y devuelve una copia validada de titular/pasajeros
enviados. No crea, emite ni cancela reservas. Los fallos parciales se explicitan.

Vibook conserva la proyección en quotation_provider_bookings.result y la solicitud
operativa en request_snapshot. provider_reservations es una vista por ítem, con
joins por org/agencia y vendedor actual de la operación. Tabla y vista son privadas
para service_role: RLS habilitada sin políticas cliente y grants revocados. APIs
validan sesión, org_id y scope dinámico de Operaciones agencia por agencia antes
de leer la proyección. Esto evita que documentos en JSON salteen permisos por REST.
La actualización usa CAS updated_at para impedir que una respuesta antigua pise
una más reciente. Ante fallo de detalle se conserva el último snapshot, marcado
como no actualizado. No se guardan blobs crudos ni secretos.

La pantalla se actualiza al entrar y mientras hay solicitudes pendientes; el cron
provider-reservations permite sincronizar sin browser. Debe programarse en Railway
con checkCronAuth. Las reservas históricas se recuperan del job al sincronizar;
los datos ausentes siguen ausentes. El historial inicial muestra las fechas del
ciclo de vida disponibles, no auditorías internas del mayorista.

Publicación: desplegar Delfos, Emilia API, migración Vibook y Vibook, en ese orden.
Validar staging sin crear reservas pagas. Publicar novedad al estar disponible.

## Validación local (2026-09-05)

- Vibook: 26 tests focalizados en seis suites, TypeScript, build de Next y lint
  focalizado aprobados. Se cubren aislamiento por organización/agencia/vendedor,
  autorización de endpoints, conservación del snapshot, CAS y estados del proveedor.
- Emilia API: nueve tests de reservas, TypeScript y build aprobados.
- Delfos API: 13 tests en tres suites, TypeScript, build y lint focalizado aprobados;
  contrato público regenerado y checks de ausencia de rutas admin/internas aprobados.
- Migración ejecutada en PostgreSQL aislado con PGlite: proyección por ítem,
  estado ONRQ, pasajeros, vendedor actual, trigger de pertenencia y grants privados.
  Script reproducible: `scripts/test-provider-reservations-sql.cjs`.
- UI real con datos sintéticos: escritorio, móvil, dark mode, documentos de
  pasajeros, pestañas, búsqueda y estados loading/empty/error. Script:
  `scripts/qa-provider-reservations.cjs`; capturas en `tmp/reservations-qa/`.

Estas pruebas no crearon reservas reales ni validaron el despliegue en producción.
El check global de admin-client tenía 32 infracciones en HEAD antes del cambio;
quedan 30 preexistentes, ninguna en los archivos modificados. Los usos nuevos y
los dos usos existentes tocados están justificados en la allowlist.

## Pendiente de publicación

1. Desplegar los contratos nuevos de Delfos y Emilia API.
2. Migración `20260905180000_provider_reservations.sql` aplicada el 2026-09-05 en
   producción (`pmqvplyyxiobkllapgjp`), registrada atómicamente en el historial.
   Cuatro solicitudes existentes conservadas; grants privados verificados.
   Tipos regenerados desde ese esquema remoto: se incorporan sólo la tabla y la
   vista del módulo, con overrides no nulos para columnas garantizadas por los
   constraints/joins de la vista. La generación local sigue requiriendo Docker.
3. Desplegar Vibook y programar `/api/cron/provider-reservations` en Railway con
   `Authorization: Bearer $CRON_SECRET` (frecuencia sugerida: cada cinco minutos).
4. Validar con sesiones reales los permisos y la lectura de reservas ya existentes.
   Hacer cualquier prueba que cree una reserva sólo en el entorno autorizado.
5. Publicar la novedad cuando la funcionalidad esté disponible: «Reservas de
   mayoristas: consultá en Operaciones las reservas realizadas desde tus
   cotizaciones, con pasajeros, servicios, importes y estado del proveedor».

La primera integración completa es Delfos. Otros mayoristas necesitan su propio
adaptador de lectura de detalle para ofrecer la misma cobertura.
