-- ============================================================
-- Qplan.mx — Migración 002: horarios por día y amenidades
--
-- QUÉ HACE
--   1. Añade `businesses.hours_schedule` (JSONB) para el horario
--      día por día. La columna `hours` de texto libre se conserva
--      como respaldo de los negocios que ya la tenían.
--   2. Crea la tabla catálogo `amenities` y la siembra con las
--      siete iniciales.
--   3. Añade `businesses.amenities` (TEXT[]) con las amenidades
--      de cada negocio.
--
-- ES SEGURA: solo agrega. No borra nada ni modifica datos existentes.
-- Es idempotente: se puede ejecutar más de una vez.
--
-- REQUISITO: haber ejecutado antes migration_001_b2b.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Horario por día
-- ------------------------------------------------------------
-- Formato: un arreglo de 7 objetos, de lunes (0) a domingo (6).
--   [{"day":0,"closed":false,"open":"09:00","close":"18:00"}, ...]
-- NULL significa "sin horario capturado".
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hours_schedule JSONB;

COMMENT ON COLUMN businesses.hours_schedule IS
    'Horario por día: [{day:0-6 (0=lunes), closed:bool, open:"HH:MM", close:"HH:MM"}]';

-- ------------------------------------------------------------
-- 2. Catálogo de amenidades
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS amenities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT        NOT NULL UNIQUE,
    label         TEXT        NOT NULL,
    icon          TEXT        NOT NULL DEFAULT 'Check',
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO amenities (slug, label, icon, display_order) VALUES
    ('wifi',             'WiFi',                  'Wifi',        1),
    ('delivery',         'Servicio a domicilio',  'Bike',        2),
    ('invoicing',        'Facturación',           'ReceiptText', 3),
    ('parking',          'Estacionamiento',       'CircleParking', 4),
    ('pet_friendly',     'Pet friendly',          'PawPrint',    5),
    ('card_payment',     'Pago con tarjeta',      'CreditCard',  6),
    ('transfer_payment', 'Pago por transferencia','Landmark',    7)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Amenidades de cada negocio
-- ------------------------------------------------------------
-- Arreglo de slugs del catálogo. Se valida en la API, no con un FK,
-- porque PostgreSQL no permite llaves foráneas sobre arreglos.
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_businesses_amenities
    ON businesses USING GIN (amenities);

COMMIT;

-- ------------------------------------------------------------
-- Comprobación posterior (ejecútala aparte)
-- ------------------------------------------------------------
-- SELECT slug, label, icon FROM amenities ORDER BY display_order;
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name='businesses' AND column_name IN ('hours_schedule','amenities');
