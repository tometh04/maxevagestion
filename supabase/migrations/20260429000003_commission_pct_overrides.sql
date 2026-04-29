-- =====================================================
-- Override de comisiones absolutas para ventas compartidas
-- =====================================================
--
-- Pedido por Tomi (29/04): en ventas compartidas, hoy el split se
-- expresa como un % del 0-100 que se interpreta como "fracción del % de
-- cada vendedor", lo que tiene un bug histórico cuando los vendedores
-- tienen pcts distintos: el secundario puede sumar más de lo que
-- comisiona el principal solo. Tomi quiere que la suma nunca supere lo
-- que comisiona el vendedor principal, y que ADMIN/SUPER_ADMIN puedan
-- editar dos valores absolutos (ej: 10/10 si el principal comisiona
-- 20%). Default es la mitad para cada uno.
--
-- Esta migración agrega dos columnas para almacenar los % efectivos
-- ABSOLUTOS de cada vendedor en la operación. Cuando ambos están
-- seteados, el cálculo usa los valores directos (suma ≤ principal).
-- Cuando son NULL, el cálculo cae al path legacy basado en
-- `commission_split` (sin tocar la lógica buggy existente — el fix solo
-- aplica a operaciones nuevas. Operaciones legacy quedan como están
-- hasta que un admin las edite manualmente con la UI nueva).

ALTER TABLE operations
ADD COLUMN IF NOT EXISTS commission_pct_primary NUMERIC(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commission_pct_secondary NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN operations.commission_pct_primary IS
  'Override absoluto del % de comisión del vendedor principal sobre el margen. Cuando NULL, fallback a commission_split.';

COMMENT ON COLUMN operations.commission_pct_secondary IS
  'Override absoluto del % de comisión del vendedor secundario sobre el margen. Cuando NULL, fallback a commission_split.';
