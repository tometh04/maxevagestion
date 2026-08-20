-- =====================================================
-- Migración: condición frente al IVA por operador
-- =====================================================
-- Contexto (VIB-144): el crédito fiscal de compras se calcula asumiendo que
-- TODO operador discrimina IVA al 21%. `createPurchaseIVA` se llama sin tasa y
-- cae al default.
--
-- Medido en producción al 2026-08-20: 2.554 registros en `iva_purchases`, una
-- sola alícuota (0,21) y $37.764.491 de crédito fiscal calculado. Ni un solo
-- caso diferenciado.
--
-- Pero un operador monotributista no discrimina IVA, y uno exento o del
-- exterior tampoco: en esos casos no hay crédito fiscal que computar. Hoy el
-- sistema lo computa igual, inflando el crédito y subestimando el IVA a pagar.
--
-- Aptour resuelve esto con la condición de IVA en la ficha del operador
-- (`soperador.ID_IVA`), que es lo que se replica acá.
--
-- OPT-IN a propósito: la columna es NULLABLE y sin default. Mientras esté en
-- NULL el cálculo se comporta exactamente como hoy (21%). Nada histórico
-- cambia, y nada cambia hasta que alguien cargue la condición de un operador.
-- Esa decisión es del negocio, no de la migración.
--
-- Nullable también por compatibilidad con el RPC `bulk_import_operators`, que
-- inserta una lista explícita de columnas: una columna NOT NULL sin default lo
-- rompería.
-- =====================================================

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS iva_condition TEXT DEFAULT NULL
    CHECK (
      iva_condition IS NULL
      OR iva_condition IN (
        'RESPONSABLE_INSCRIPTO',
        'MONOTRIBUTO',
        'EXENTO',
        'CONSUMIDOR_FINAL',
        'EXTERIOR'
      )
    );

COMMENT ON COLUMN operators.iva_condition IS
  'Condición del operador frente al IVA, para calcular el crédito fiscal de sus facturas. NULL = sin definir: el cálculo asume la alícuota general (21%), que es el comportamiento histórico. Solo RESPONSABLE_INSCRIPTO genera crédito fiscal; monotributo, exento y exterior no discriminan IVA (VIB-144).';
