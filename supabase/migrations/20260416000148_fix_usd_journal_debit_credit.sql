-- Fix: USD journal entries had debit/credit set to amount_ars_equivalent
-- instead of amount_original. Correct them to use the original USD amount.

-- Entry #4: Cobro PUCCI (3400 USD, was showing 4080000)
UPDATE ledger_movements
SET debit_amount = 3400
WHERE id = '6dae5d20-33a9-4b55-9651-67ea1431f883'
  AND debit_amount = 4080000;

UPDATE ledger_movements
SET credit_amount = 3400
WHERE id = 'c1268cbc-7509-4867-ac57-0dcab492e5bd'
  AND credit_amount = 4080000;

UPDATE journal_entries
SET total_amount = 3400
WHERE id = 'ef04aa59-7a76-4011-80f1-5cace4a0fc39'
  AND total_amount = 4080000;

-- Entry #1: Pago operador TETTAMANZI (2903.83 USD, was showing 3484596)
UPDATE ledger_movements
SET credit_amount = 2903.83
WHERE id = '41c4e6fc-acb8-49cd-987e-58b5a141cad0'
  AND credit_amount = 3484596;

UPDATE ledger_movements
SET debit_amount = 2903.83
WHERE id = 'e5428a9e-7f7a-4a8d-97c0-be8f6694ea25'
  AND debit_amount = 3484596;

UPDATE journal_entries
SET total_amount = 2903.83
WHERE id = '25acc8bc-9bca-4ddd-9f9d-65e41dd5cc30'
  AND total_amount = 3484596;
