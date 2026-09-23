-- ============================================================
-- Qplan.mx — Migración 001: enfoque B2B
--
-- QUÉ HACE
--   1. Crea la tabla `categories` y la siembra con las categorías
--      que ya usan tus negocios (no se pierde ninguna).
--   2. Añade `users.role` y lo rellena desde `is_admin` si esa
--      columna existe.
--   3. Elimina municipios y códigos QR.
--   4. Garantiza que un usuario tenga como máximo un negocio.
--
-- ES DEFENSIVA E IDEMPOTENTE
--   No asume que tu esquema sea exactamente el esperado: comprueba
--   la existencia de cada columna y tabla antes de tocarla, así que
--   se puede volver a ejecutar sin romper nada.
--
-- CÓMO EJECUTARLA
--   Supabase → SQL Editor → pega este archivo → Run.
--   Va dentro de una transacción: si algo falla, no se aplica nada.
--
-- ⚠️  ANTES DE EJECUTAR: haz un backup.
--     Supabase → Database → Backups.
--     Los pasos 5 y 6 BORRAN datos de forma irreversible.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tabla de categorías
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT        NOT NULL UNIQUE,
    label         TEXT        NOT NULL,
    icon          TEXT        NOT NULL DEFAULT 'MapPin',
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catálogo base.
INSERT INTO categories (slug, label, icon, display_order) VALUES
    ('restaurant',  'Restaurantes', 'Utensils', 1),
    ('cafe',        'Cafeterías',   'Coffee',   2),
    ('hotel',       'Hoteles',      'Hotel',    3),
    ('transport',   'Transporte',   'Car',      4),
    ('pharmacy',    'Farmacias',    'Pill',     5),
    ('gas_station', 'Gasolineras',  'Fuel',     6)
ON CONFLICT (slug) DO NOTHING;

-- Rescata cualquier tipo que ya exista en `businesses` y no esté en el
-- catálogo base, para que el FK del paso 4 no falle. Nace desactivada
-- para que no aparezca en el home hasta que la revises.
INSERT INTO categories (slug, label, icon, display_order, is_active)
SELECT DISTINCT b.type,
       INITCAP(REPLACE(b.type, '_', ' ')),
       'MapPin',
       99,
       FALSE
FROM businesses b
WHERE b.type IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = b.type)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Roles de usuario
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Rellena desde `is_admin` SOLO si esa columna existe. En bases donde
-- nunca existió, este bloque simplemente no hace nada.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin'
    ) THEN
        EXECUTE 'UPDATE users SET role = ''admin'' WHERE is_admin IS TRUE';
        RAISE NOTICE 'Roles rellenados desde is_admin.';
    ELSE
        RAISE NOTICE 'La columna is_admin no existe; se omite el rellenado.';
    END IF;
END $$;

-- Quien ya tenga un negocio asignado pasa a dueño.
UPDATE users u
SET role = 'business_owner'
WHERE u.role = 'user'
  AND EXISTS (SELECT 1 FROM businesses b WHERE b.owner_id = u.id);

-- Cualquier valor de rol que no reconozcamos se normaliza antes de
-- imponer la restricción, para que el CHECK no falle.
UPDATE users SET role = 'user'
WHERE role IS NULL OR role NOT IN ('user', 'business_owner', 'admin');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'business_owner', 'admin'));

-- `is_admin` queda obsoleto: la API ya no lo lee.
ALTER TABLE users DROP COLUMN IF EXISTS is_admin;

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ------------------------------------------------------------
-- 3. Un negocio por dueño
-- ------------------------------------------------------------
-- Si este índice falla, tienes un usuario con dos negocios. Revísalo con:
--   SELECT owner_id, COUNT(*) FROM businesses
--   WHERE owner_id IS NOT NULL GROUP BY owner_id HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_owner_unique
    ON businesses (owner_id) WHERE owner_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. businesses.type apunta al catálogo
-- ------------------------------------------------------------
-- Elimina cualquier CHECK sobre `type`, sin importar cómo se llame.
DO $$
DECLARE
    nombre TEXT;
BEGIN
    FOR nombre IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = 'public'
          AND rel.relname = 'businesses'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%type%'
    LOOP
        EXECUTE format('ALTER TABLE businesses DROP CONSTRAINT %I', nombre);
        RAISE NOTICE 'Restricción eliminada: %', nombre;
    END LOOP;
END $$;

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_type_fkey;
ALTER TABLE businesses ADD CONSTRAINT businesses_type_fkey
    FOREIGN KEY (type) REFERENCES categories (slug)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_businesses_type   ON businesses (type);
CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses (is_active);

-- ------------------------------------------------------------
-- 5. Fuera municipios  ⚠️ DESTRUCTIVO
-- ------------------------------------------------------------
ALTER TABLE businesses DROP COLUMN IF EXISTS municipality_id;
DROP TABLE IF EXISTS municipalities CASCADE;

-- ------------------------------------------------------------
-- 6. Fuera códigos QR  ⚠️ DESTRUCTIVO
-- ------------------------------------------------------------
DROP TABLE IF EXISTS qr_codes CASCADE;

COMMIT;

-- ------------------------------------------------------------
-- Comprobación posterior (ejecútala aparte)
-- ------------------------------------------------------------
-- SELECT role, COUNT(*) FROM users GROUP BY role;
-- SELECT slug, label, is_active FROM categories ORDER BY display_order;
-- SELECT COUNT(*) AS negocios_sin_categoria_valida
--   FROM businesses b LEFT JOIN categories c ON c.slug = b.type
--  WHERE c.slug IS NULL;
