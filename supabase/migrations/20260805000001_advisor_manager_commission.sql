-- VIB-102: comisión del administrador de asesores independientes (frees).
--
-- Pedido de Lozada Rosario (Yamil): un asesor de viajes independiente (AVI/free)
-- comisiona sobre el margen de su venta, y ADEMÁS hay alguien del equipo que lo
-- administra y comisiona un porcentaje de cada venta de ese free. En sus
-- palabras: "un free que comisiona el 50% a su vez tiene quien lo administra
-- (mica o rama) y ellos comisionan un 5% de cada venta de ellos. Entonces la
-- ganancia neta se reparte 45% agencia, 50% free y 5% administrador".
--
-- Modelo:
--   - El 45% de la agencia NO se guarda: es el residuo (100 − free − admin).
--     Guardarlo sería un tercer número que puede desincronizarse de los otros
--     dos.
--   - El vínculo free → administrador vive en `users`, no en una tabla nueva:
--     es un atributo del free (uno solo, y cambia cuando la agencia lo decide),
--     igual que `default_commission_percentage`.
--   - La comisión del administrador se persiste como un `commission_records`
--     más. NO es una tabla aparte (como referral_commissions) porque el
--     administrador SÍ es un usuario del tenant: tiene que cobrar por el mismo
--     circuito que cualquier comisión —pago, pago parcial, saldado, reporte de
--     comisiones, societario— y duplicar ese circuito sería la fuente de
--     divergencia más probable.
--
-- El constraint unique (operation_id, seller_id) de la migración 119 se
-- mantiene: una persona tiene UNA fila por operación. Si el administrador
-- además vendió esa misma operación, el motor suma los dos porcentajes en su
-- única fila (ver lib/commissions/calculate.ts) en vez de pelearse con el
-- constraint.

BEGIN;

-- ─────────────────────────────────────────────────────
-- 1. users: quién administra a este free y con qué porcentaje.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS advisor_manager_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advisor_manager_percentage NUMERIC(6,3);

-- ADD CONSTRAINT no soporta IF NOT EXISTS; se hace idempotente a mano.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_advisor_manager_not_self'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_advisor_manager_not_self
      CHECK (advisor_manager_id IS NULL OR advisor_manager_id <> id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_advisor_manager_pct_range'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_advisor_manager_pct_range
      CHECK (
        advisor_manager_percentage IS NULL
        OR (advisor_manager_percentage >= 0 AND advisor_manager_percentage <= 100)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_advisor_manager
  ON public.users(advisor_manager_id)
  WHERE advisor_manager_id IS NOT NULL;

COMMENT ON COLUMN public.users.advisor_manager_id IS
  'VIB-102. Usuario del equipo que administra a este vendedor (típicamente un '
  'asesor independiente) y comisiona un % de cada una de sus ventas. NULL = '
  'nadie lo administra. Se configura en Configuración → Usuarios.';
COMMENT ON COLUMN public.users.advisor_manager_percentage IS
  'VIB-102. % sobre el MARGEN de cada venta de este vendedor que cobra su '
  'administrador (advisor_manager_id). NULL o 0 = no se genera comisión de '
  'administrador, aunque haya administrador asignado: no se inventa un default '
  'porque sería plata que nadie configuró.';

-- ─────────────────────────────────────────────────────
-- 2. commission_records: distinguir la comisión de venta de la de administración.
-- ─────────────────────────────────────────────────────
-- Sin esto, la comisión del administrador aparecería en el reporte como una
-- "comisión huérfana" (un vendedor que no figura en la operación), que es
-- justamente el caso que el reporte usa para señalar datos inconsistentes.
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'SELLER',
  ADD COLUMN IF NOT EXISTS source_seller_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_records_kind_check'
  ) THEN
    ALTER TABLE public.commission_records
      ADD CONSTRAINT commission_records_kind_check
      CHECK (kind IN ('SELLER', 'ADVISOR_MANAGER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commission_records_kind
  ON public.commission_records(kind)
  WHERE kind <> 'SELLER';

COMMENT ON COLUMN public.commission_records.kind IS
  'VIB-102. SELLER = comisión por vender la operación. ADVISOR_MANAGER = '
  'comisión de quien administra al vendedor de esa operación. Las filas '
  'anteriores a esta migración son todas SELLER.';
COMMENT ON COLUMN public.commission_records.source_seller_id IS
  'VIB-102. Solo con kind = ADVISOR_MANAGER: el vendedor administrado que '
  'generó esta comisión. Permite explicar la fila ("5% de la venta de X") sin '
  'volver a resolver el vínculo, que puede haber cambiado después.';

COMMIT;
