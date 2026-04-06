UPDATE message_templates
SET template = replace(
  replace(
    template,
    '📅 Válida hasta: {fecha_validez}',
    'ℹ️ {nota_disponibilidad}'
  ),
  '📅 Valida hasta: {fecha_validez}',
  'ℹ️ {nota_disponibilidad}'
)
WHERE trigger_type = 'QUOTATION_SENT'
  AND template LIKE '%{fecha_validez}%';
