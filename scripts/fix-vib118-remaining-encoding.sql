-- VIB-118 - Reparacion final de nombres danados por el import de mayo (Milla Cero)
--
-- Contexto: el import leia los CSV asumiendo UTF-8; los CSV de Excel-espanol
-- venian en CP1252, y la N-enie y las vocales acentuadas quedaron guardadas
-- como U+FFFD. 25 registros ya se repararon el 13/08. Estos 3 quedaron
-- pendientes de confirmacion del cliente, que respondio el 18/08:
--
--   1. MARIO D<FFFD>AMBRA       (doc 20205730894) -> D + U+00B4 + AMBRA
--   2. GASTON CESAR IGU<FFFD>A  (doc 31722703)    -> IGUNIA con enie
--   3. JUAN CESAR IGU<FFFD>A    (doc 55734293)    -> idem
--
-- Este archivo es ASCII puro a proposito: los caracteres se escriben con
-- escapes Unicode (U&'\00D1', U&'\00B4') para que el script no dependa de
-- como lo guarde el editor. Es exactamente la clase de bug que reparamos.
--
-- Idempotente: cada UPDATE exige que el registro TODAVIA tenga el U+FFFD,
-- asi que correrlo dos veces no hace nada. Solo reemplaza el caracter
-- danado; no reescribe el nombre entero.

BEGIN;

-- 1) Los dos IGUNIA -> enie
UPDATE customers
SET last_name = replace(last_name, chr(65533), U&'\00D1'),
    updated_at = now()
WHERE id IN (
        '4faabe5d-468a-4062-ad5f-ed043c6379c0',  -- GASTON CESAR
        '51c15145-ac0b-4764-8a38-a2410c4d4929'   -- JUAN CESAR
      )
  AND last_name LIKE '%' || chr(65533) || '%';

-- 2) D'AMBRA -> apostrofo agudo (U+00B4), tal cual lo confirmo el cliente.
--    Nota: el caracter original NO pudo haber sido un apostrofo ASCII, porque
--    ese byte decodifica bien en UTF-8 y nunca habria quedado como U+FFFD.
UPDATE customers
SET last_name = replace(last_name, chr(65533), U&'\00B4'),
    updated_at = now()
WHERE id = 'dd8d7038-73b0-4a9b-89ef-b2be330db8ac'
  AND last_name LIKE '%' || chr(65533) || '%';

-- 3) Danio residual encontrado en el barrido global (NO estaba en el ticket):
--    el nombre del cliente queda copiado como texto en el asiento contable y
--    en el movimiento de ledger al registrar el cobro. DANIEL ROMAN MINIO ya
--    se reparo en customers el 13/08, pero estas dos fotos quedaron rotas y
--    se siguen viendo en Contabilidad y en el Libro Mayor.
--    Solo se toca texto descriptivo: ningun importe, cuenta ni fecha.
UPDATE ledger_movements
SET concept = replace(concept, chr(65533), U&'\00D1')
WHERE id = 'f1c7d5d4-0573-4686-b1d0-7433d881958d'
  AND concept LIKE '%' || chr(65533) || '%';

UPDATE journal_entries
SET description = replace(description, chr(65533), U&'\00D1')
WHERE id = 'fe42c7e4-4514-4b85-8a49-6de349211eea'
  AND description LIKE '%' || chr(65533) || '%';

COMMIT;

-- Verificacion: tiene que devolver 0 filas en customers, ledger y journal.
-- Lo que SI puede seguir apareciendo, a proposito:
--   - whatsapp_messages: log de un aviso ya enviado. No se reescribe historia.
--   - leads.notes (Vico): emoji perdido de Callbell, no viene del import.
--   - support_ticket_replies: nuestro propio comentario citando el caracter.
SELECT 'customers' AS tabla, id::text, first_name || ' ' || last_name AS valor
FROM customers WHERE last_name LIKE '%' || chr(65533) || '%'
UNION ALL
SELECT 'ledger_movements', id::text, concept
FROM ledger_movements WHERE concept LIKE '%' || chr(65533) || '%'
UNION ALL
SELECT 'journal_entries', id::text, description
FROM journal_entries WHERE description LIKE '%' || chr(65533) || '%';
