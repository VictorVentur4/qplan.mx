-- ============================================================
-- Migración 004 — Redes sociales por negocio
-- ============================================================
--
-- SEGURA: solo agrega columnas. No borra ni modifica datos.
-- Se puede volver a ejecutar sin problema (todo es IF NOT EXISTS).
--
-- Ejecútala en el SQL Editor de Supabase DESPUÉS de la 001, 002 y 003.
--
-- Nota sobre el horario de 24 horas: NO necesita migración. El horario
-- vive en businesses.hours_schedule (JSONB, creado en la 002) y el día
-- abierto las 24 horas solo agrega la llave "all_day": true dentro de
-- cada día. Los negocios existentes siguen funcionando: si la llave no
-- está, se interpreta como false.
-- ============================================================

-- Se guarda el identificador ya normalizado, no la URL completa:
--   instagram → el usuario, sin @      (ejemplo: cafecentral)
--   facebook  → el nombre de la página (ejemplo: CafeCentralCuernavaca)
--   whatsapp  → solo dígitos con lada de país, sin + ni espacios
--               (ejemplo: 527771234567)
-- La aplicación arma el enlace a partir de esto, así que si mañana
-- cambia el dominio de alguna red, se cambia en un solo lugar.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS facebook  TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp  TEXT;

COMMENT ON COLUMN businesses.instagram IS
  'Usuario de Instagram sin @. La app arma https://instagram.com/<usuario>';
COMMENT ON COLUMN businesses.facebook IS
  'Nombre de la página de Facebook. La app arma https://facebook.com/<pagina>';
COMMENT ON COLUMN businesses.whatsapp IS
  'Teléfono en formato internacional, solo dígitos. La app arma https://wa.me/<numero>';

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'businesses'
  AND  column_name IN ('instagram', 'facebook', 'whatsapp')
ORDER  BY column_name;
-- Debe devolver 3 renglones, los tres de tipo "text".
