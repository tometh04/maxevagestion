# Operadores opcionales al emitir una cotización

El diálogo para preparar el PDF deja de mostrar «Operadores de esta opción».
Permite preparar precios y contenido sin asignar operadores internos y omite
`item_operators`, preservando cualquier asignación existente mediante el default
vacío de la API. La edición completa de la cotización conserva su selector.

La migración `20260905000001_quotation_document_optional_operators.sql` elimina
únicamente el requisito de operador no nulo en `issue_quotation_document`.
Conserva CAS, idempotencia, validación de estructura/precios/monedas y de los
operadores ya asignados, permisos, snapshots y el trigger de cuotas. Convertir
a operación sigue exigiendo operadores por servicio para proteger las deudas.
Aplicar la migración antes de publicar el frontend.

Validación: 19 tests focalizados y lint. La función vigente se comparó con el
repositorio antes de migrar. Emisión sin operador e idempotencia se probaron en
Supabase dentro de una transacción revertida, sin dejar documentos de prueba.

La publicación incluye la definición de `quotation_provider_bookings` generada
desde Supabase: faltaba en los tipos del repositorio y bloqueaba los builds de
Railway de los dos commits anteriores. No modifica su schema ni comportamiento.
