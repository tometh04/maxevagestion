-- ===========================================
-- SEED DE AGENCIAS INICIALES
-- ===========================================

-- Insertar agencias si no existen
INSERT INTO agencies (id, name, city, timezone)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Rosario', 'Rosario', 'America/Argentina/Buenos_Aires'),
  ('22222222-2222-2222-2222-222222222222', 'Madero', 'Buenos Aires', 'America/Argentina/Buenos_Aires')
ON CONFLICT (id) DO NOTHING;

-- Asignar todas las agencias al usuario admin existente (si existe)
INSERT INTO user_agencies (user_id, agency_id)
SELECT u.id, a.id
FROM users u
CROSS JOIN agencies a
WHERE u.role = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
