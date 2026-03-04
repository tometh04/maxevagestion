-- Agregar seller_id a manychat_list_order para listas por vendedor
-- Nullable: listas sin vendedor son "compartidas" (visibles para todos)

ALTER TABLE manychat_list_order
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manychat_list_order_seller
  ON manychat_list_order(seller_id);

COMMENT ON COLUMN manychat_list_order.seller_id IS 'ID del vendedor dueño de la lista. NULL = lista compartida visible para todos.';
