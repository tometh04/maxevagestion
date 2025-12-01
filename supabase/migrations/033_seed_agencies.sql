-- ===========================================
-- SEED DE AGENCIAS INICIALES
-- ===========================================

-- Insertar agencias si no existen
INSERT INTO agencies (id, name, address, phone, email)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Rosario', 'Rosario, Santa Fe', NULL, NULL),
  ('22222222-2222-2222-2222-222222222222', 'Madero', 'Puerto Madero, Buenos Aires', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Asignar todas las agencias al usuario admin existente (si existe)
INSERT INTO user_agencies (user_id, agency_id)
SELECT u.id, a.id
FROM users u
CROSS JOIN agencies a
WHERE u.role = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

