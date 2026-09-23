-- ============================================================
-- Qplan.mx — esquema completo (instalación desde cero)
-- PostgreSQL 14+ / Supabase
--
-- Si YA tienes la base de datos en producción, no uses este
-- archivo: usa migration_001_b2b.sql, que transforma el esquema
-- existente sin perder datos.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- para gen_random_uuid()

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    phone         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'business_owner', 'admin')),
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);

-- ------------------------------------------------------------
-- categories — administrables desde el panel
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT        NOT NULL UNIQUE,
    label         TEXT        NOT NULL,
    icon          TEXT        NOT NULL DEFAULT 'MapPin',   -- nombre del icono de lucide-react
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (slug, label, icon, display_order) VALUES
    ('restaurant',  'Restaurantes', 'Utensils', 1),
    ('cafe',        'Cafeterías',   'Coffee',   2),
    ('hotel',       'Hoteles',      'Hotel',    3),
    ('transport',   'Transporte',   'Car',      4),
    ('pharmacy',    'Farmacias',    'Pill',     5),
    ('gas_station', 'Gasolineras',  'Fuel',     6)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- amenities — administrables desde el panel
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
    ('wifi',             'WiFi',                  'Wifi',          1),
    ('delivery',         'Servicio a domicilio',  'Bike',          2),
    ('invoicing',        'Facturación',           'ReceiptText',   3),
    ('parking',          'Estacionamiento',       'CircleParking', 4),
    ('pet_friendly',     'Pet friendly',          'PawPrint',      5),
    ('card_payment',     'Pago con tarjeta',      'CreditCard',    6),
    ('transfer_payment', 'Pago por transferencia','Landmark',      7)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- businesses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT             NOT NULL,
    type        TEXT             NOT NULL REFERENCES categories (slug)
                                 ON UPDATE CASCADE ON DELETE RESTRICT,
    description TEXT             NOT NULL,
    logo        TEXT,
    address     TEXT             NOT NULL,
    phone       TEXT,
    hours       TEXT,                     -- respaldo de texto libre (heredado)
    hours_schedule JSONB,                 -- [{day:0-6 (0=lunes), closed, open:"HH:MM", close:"HH:MM"}]
    amenities   TEXT[]           NOT NULL DEFAULT '{}',   -- slugs de la tabla amenities
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    rating      REAL             NOT NULL DEFAULT 4.5 CHECK (rating >= 0 AND rating <= 5),
    images      TEXT[]           NOT NULL DEFAULT '{}',
    website     TEXT,
    owner_id    UUID             REFERENCES users (id) ON DELETE SET NULL,
    is_active   BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Un usuario administra como máximo un negocio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_owner_unique
    ON businesses (owner_id) WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_type   ON businesses (type);
CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses (is_active);

-- ------------------------------------------------------------
-- banners
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS banners (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image         TEXT        NOT NULL,
    title         TEXT        NOT NULL,
    link          TEXT,
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banners_active ON banners (active, display_order);
