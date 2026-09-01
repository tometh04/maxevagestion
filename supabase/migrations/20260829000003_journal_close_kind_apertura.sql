-- VIB-141 — El asiento de apertura necesita su propia marca
--
-- POR QUÉ NO ALCANZA CON LO QUE HAY
-- ---------------------------------
-- El asiento de apertura no es un ajuste de cierre pero se le parece: lo genera
-- el sistema, es idempotente y hay que poder distinguirlo del resto para
-- regenerarlo sin tocar nada más. `close_kind` es exactamente esa marca, así que
-- se reutiliza en vez de agregar otra columna que signifique casi lo mismo.
--
-- POR QUÉ `close_period` QUEDA EN NULL
-- ------------------------------------
-- El índice único de los ajustes de cierre es
-- (org, agencia, período, tipo, operación) y es PARCIAL: solo alcanza a las
-- filas con `close_period` no nulo.
--
-- Una agencia con caja en pesos y en dólares necesita DOS asientos de apertura,
-- uno por moneda, y los dos tendrían el mismo período, el mismo tipo y ninguna
-- operación. Con `close_period` cargado chocarían contra ese índice y el segundo
-- no se podría insertar.
--
-- Dejándolo en NULL quedan fuera del índice, que es correcto: la apertura no
-- pertenece a un período mensual, es el punto desde el que arrancan todos. Su
-- idempotencia la resuelve el proceso, que borra las aperturas anteriores de la
-- agencia antes de escribir las nuevas.

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_close_kind_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_close_kind_check
  CHECK (close_kind IS NULL OR close_kind = ANY (ARRAY[
    'ANTICIPO_CLIENTE', 'ANTICIPO_PROVEEDOR',
    'VENTA_SIN_FACTURAR', 'FACTURA_A_RECIBIR',
    'REVALUACION',
    'APERTURA'
  ]));

COMMENT ON COLUMN journal_entries.close_kind IS
  'Tipo de asiento generado por el sistema: los cuatro ajustes de cierre, la revaluación, y APERTURA (que va con close_period en NULL porque no pertenece a un mes).';

-- Para encontrar la apertura de una agencia sin recorrer todos sus asientos.
CREATE INDEX IF NOT EXISTS journal_entries_apertura_idx
  ON journal_entries (org_id, agency_id)
  WHERE close_kind = 'APERTURA';
