-- ============================================================
-- Qplan.mx — Migración 003: métricas agregadas (Fase 1)
--
-- QUÉ HACE
--   Crea dos tablas de CONTADORES POR DÍA. No se guarda un registro
--   por visita: cada visita incrementa un contador existente.
--
-- POR QUÉ ASÍ
--   Un registro por evento crecería ~200 MB al año con mil visitas
--   diarias, contra los 500 MB que da el plan gratuito de Supabase.
--   Los contadores ocupan unos pocos cientos de renglones al día,
--   sin importar el tráfico: aproximadamente 1 MB al año.
--
--   Tampoco se guardan coordenadas GPS ni IP: solo el identificador
--   del código QR, que tú mismo defines. Así el dato deja de ser
--   personal y se evita todo el asunto de privacidad.
--
-- ES SEGURA: solo agrega. No borra ni modifica nada existente.
-- Es idempotente.
--
-- REQUISITO: migration_001 y migration_002 ya aplicadas.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Visitas al sitio, por día y por código QR
-- ------------------------------------------------------------
-- qr_id = '' significa entrada directa, sin escanear ningún código.
CREATE TABLE IF NOT EXISTS stats_site_daily (
    fecha  DATE    NOT NULL,
    qr_id  TEXT    NOT NULL DEFAULT '',
    vistas INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (fecha, qr_id)
);

COMMENT ON TABLE stats_site_daily IS
    'Contador de visitas al sitio por día y por código QR. qr_id vacío = entrada directa.';

CREATE INDEX IF NOT EXISTS idx_stats_site_fecha ON stats_site_daily (fecha DESC);

-- ------------------------------------------------------------
-- Vistas de cada negocio, por día
-- ------------------------------------------------------------
-- suma_posicion acumula en qué lugar de la lista aparecía el negocio
-- cada vez que lo abrieron. Dividido entre `vistas` da la posición
-- media, que sirve para distinguir "lo ven porque es bueno" de
-- "lo ven porque sale primero".
CREATE TABLE IF NOT EXISTS stats_business_daily (
    fecha         DATE    NOT NULL,
    business_id   UUID    NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    vistas        INTEGER NOT NULL DEFAULT 0,
    suma_posicion INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (fecha, business_id)
);

COMMENT ON TABLE stats_business_daily IS
    'Contador de aperturas del detalle de cada negocio, por día.';
COMMENT ON COLUMN stats_business_daily.suma_posicion IS
    'Suma de las posiciones en la lista; entre vistas da la posición media.';

CREATE INDEX IF NOT EXISTS idx_stats_business_fecha ON stats_business_daily (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_stats_business_id    ON stats_business_daily (business_id);

COMMIT;

-- ------------------------------------------------------------
-- Comprobación posterior (ejecútala aparte)
-- ------------------------------------------------------------
-- SELECT COUNT(*) FROM stats_site_daily;
-- SELECT COUNT(*) FROM stats_business_daily;
--
-- Cuánto ocupan hoy:
-- SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
--   FROM pg_catalog.pg_statio_user_tables
--  WHERE relname LIKE 'stats_%';
