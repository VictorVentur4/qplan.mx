-- ============================================================
-- Migración 005 — Ajustes de la plataforma
-- ============================================================
--
-- SEGURA: solo crea una tabla nueva. No borra ni modifica nada.
-- Se puede volver a ejecutar sin problema.
--
-- Ejecútala en el SQL Editor de Supabase DESPUÉS de la 001 a la 004.
--
-- Para qué sirve: guardar configuración que el administrador debe poder
-- cambiar desde el panel, sin tocar archivos ni reiniciar el servidor.
-- Hoy la usa la conexión con la API externa de imágenes; si mañana esa
-- API se cae o cambia de dirección, se corrige desde /admin → Ajustes.
--
-- Por qué una tabla clave/valor y no columnas: cada ajuste nuevo sería
-- una migración más. Con JSONB se agregan llaves sin tocar el esquema.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
    clave          TEXT PRIMARY KEY,
    valor          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_settings IS
  'Ajustes editables desde el panel de administración. Una fila por grupo.';
COMMENT ON COLUMN app_settings.clave IS
  'Identificador del grupo de ajustes. Hoy existe: "uploads".';

-- Fila inicial, vacía y desactivada: la aplicación arranca sin subida de
-- imágenes hasta que el administrador capture la dirección y la llave.
INSERT INTO app_settings (clave, valor)
VALUES ('uploads', '{"activo": false}'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
SELECT clave, valor, actualizado_en FROM app_settings;
-- Debe devolver al menos la fila "uploads".
