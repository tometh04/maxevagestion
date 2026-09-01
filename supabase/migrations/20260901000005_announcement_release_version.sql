-- Numero de release en las novedades
--
-- Las guias de release notes coinciden en que el encabezado tiene que llevar el
-- numero de la version y la fecha: sin eso el usuario no puede ubicar QUE
-- cambio y CUANDO, que es justamente para lo que sirve el aviso cuando vuelve a
-- buscarlo una semana despues.
--
-- Es un dato propio y no parte del titulo: se muestra aparte en el encabezado
-- del modal, se puede filtrar, y meterlo dentro del titulo obligaria a
-- parsearlo.
--
-- Opcional: una novedad suelta —"mejoramos el filtro de operaciones"— no tiene
-- version y no deberia inventarse una.

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS release_version text;

COMMENT ON COLUMN announcements.release_version IS
  'Numero de release, ej "2026.09". Opcional: solo lo llevan los avisos que corresponden a una entrega con nombre propio.';
