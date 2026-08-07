-- Los usuarios que ya venían usando el sistema no reciben las guías de golpe.
--
-- Sin esto, al publicar, cada usuario existente se comía las 6 guías de
-- pantalla a medida que navegara: users.onboarding_state está en NULL para
-- todos (la columna existía desde 20260630000002 pero nunca se escribió), y
-- "sin registro" significa "nunca la vio" para el auto-disparo.
--
-- Se marcan como 'preexisting', que NO es lo mismo que 'dismissed':
--   * frena el auto-disparo, igual que dismissed
--   * pero sigue contando como no vista, así que el punto rojo del menú "Guías"
--     les avisa que la pantalla tiene una y la abren cuando quieran
--
-- Solo toca filas con onboarding_state NULL: si alguien ya tiene estado
-- guardado, se respeta.
--
-- La lista de guías es un SNAPSHOT del momento de la publicación, a propósito.
-- No tiene que mantenerse sincronizada con lib/tours/definitions: una guía que
-- se agregue más adelante es contenido nuevo y corresponde que sí le
-- auto-dispare a todo el mundo, incluidos los usuarios de hoy.
--
-- 'setup-cuenta' queda afuera: es org-scoped, su progreso vive en
-- organization_settings y ya arrastra el estado del onboarding anterior.

UPDATE public.users
SET onboarding_state = jsonb_build_object(
      'version', 1,
      'toursDisabled', false,
      'seenTours', (
        SELECT jsonb_object_agg(
          tour_id,
          jsonb_build_object(
            'status', 'preexisting',
            'lastStepIndex', 0,
            'startedAt', NULL,
            'completedAt', NULL,
            'dismissedAt', NULL
          )
        )
        FROM unnest(ARRAY[
          'operations-list',
          'operation-detail',
          'billing-afip',
          'cash-summary',
          'crm-kanban',
          'commissions'
        ]) AS tour_id
      )
    )
WHERE onboarding_state IS NULL;
