"""
Diagnóstico de la base de datos de Qplan.

SOLO LEE. No modifica nada, no crea nada, no borra nada.

Comprueba que la conexión funcione y reporta si el esquema está listo
para la versión B2B de la API o si hace falta correr la migración.

Uso (con el entorno virtual activado y el .env configurado):

    python backend/tools/check_db.py
"""

import asyncio
import os
import sys
from pathlib import Path

try:
    import asyncpg
    from dotenv import load_dotenv
except ImportError as e:
    sys.exit(f"Falta una dependencia ({e.name}). Ejecuta: pip install -r backend/requirements.txt")

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

OK, NO, WARN = "  [OK] ", "  [--] ", "  [!!] "


def titulo(t):
    print(f"\n{t}\n{'-' * len(t)}")


async def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: falta DATABASE_URL en el .env de la raíz del proyecto.")

    ssl_mode = os.environ.get("DB_SSL", "require")
    ssl_mode = None if ssl_mode in ("disable", "false", "off") else ssl_mode

    # Oculta la contraseña al mostrar a dónde se conecta.
    visible = url
    if "@" in url and "://" in url:
        cabeza, cola = url.split("://", 1)
        if "@" in cola:
            cred, host = cola.split("@", 1)
            usuario = cred.split(":")[0]
            visible = f"{cabeza}://{usuario}:********@{host}"

    print(f"Conectando a: {visible}")
    print(f"SSL: {ssl_mode or 'desactivado'}")

    try:
        conn = await asyncpg.connect(url, ssl=ssl_mode, timeout=15)
    except Exception as e:
        print(f"\nERROR DE CONEXIÓN: {type(e).__name__}: {e}")
        print("\nRevisa:")
        print("  - Que DATABASE_URL esté completa y la contraseña sea correcta.")
        print("  - Que el puerto sea 5432 (modo sesión). El 6543 no funciona con asyncpg.")
        print("  - Que tu IP esté permitida en Supabase, si restringiste el acceso.")
        sys.exit(1)

    print(f"{OK}Conexión establecida")

    try:
        titulo("Tablas encontradas")
        tablas = [r["table_name"] for r in await conn.fetch(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' ORDER BY 1"
        )]
        for t in tablas:
            n = await conn.fetchval(f'SELECT COUNT(*) FROM "{t}"')
            print(f"  {t:<20} {n} registro(s)")

        cols_biz = [r["column_name"] for r in await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='businesses'"
        )]

        titulo("Columnas de users")
        cols_users = [r["column_name"] for r in await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position"
        )]
        print("  " + (", ".join(cols_users) if cols_users else "(la tabla users no existe)"))

        titulo("Migración 001 — enfoque B2B")
        pendientes = []

        if "categories" in tablas:
            print(f"{OK}Tabla categories existe")
        else:
            print(f"{NO}Tabla categories NO existe")
            pendientes.append("crear la tabla categories")

        if "role" in cols_users:
            print(f"{OK}Columna users.role existe")
            for r in await conn.fetch("SELECT role, COUNT(*) c FROM users GROUP BY role ORDER BY 1"):
                print(f"       {r['role']}: {r['c']}")
            admins = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role='admin'")
            if not admins:
                print(f"{WARN}No hay ningún administrador. Usa set_password.py --crear-admin")
        else:
            print(f"{NO}Columna users.role NO existe")
            pendientes.append("añadir users.role")

        if "is_admin" in cols_users:
            print(f"{WARN}Columna users.is_admin todavía existe (la migración la elimina)")
        else:
            print(f"{OK}Columna users.is_admin ya no existe")

        for obsoleta in ("municipalities", "qr_codes"):
            if obsoleta in tablas:
                print(f"{NO}Tabla {obsoleta} todavía existe")
                pendientes.append(f"eliminar {obsoleta}")
            else:
                print(f"{OK}Tabla {obsoleta} ya no existe")

        if "businesses" in tablas:
            if "municipality_id" in cols_biz:
                print(f"{NO}Columna businesses.municipality_id todavía existe")
                pendientes.append("eliminar businesses.municipality_id")
            else:
                print(f"{OK}Columna businesses.municipality_id ya no existe")

            titulo("Categorías en uso por los negocios")
            for r in await conn.fetch("SELECT type, COUNT(*) c FROM businesses GROUP BY type ORDER BY 2 DESC"):
                marca = OK
                if "categories" in tablas:
                    existe = await conn.fetchval("SELECT 1 FROM categories WHERE slug=$1", r["type"])
                    marca = OK if existe else NO
                print(f"{marca}{r['type']:<20} {r['c']} negocio(s)")

            titulo("Riesgos para la migración")
            dup = await conn.fetch(
                "SELECT owner_id, COUNT(*) c FROM businesses "
                "WHERE owner_id IS NOT NULL GROUP BY owner_id HAVING COUNT(*) > 1"
            )
            if dup:
                print(f"{NO}Hay {len(dup)} usuario(s) con más de un negocio.")
                print("       El índice único fallará. Hay que resolverlo antes de migrar:")
                for d in dup:
                    print(f"       owner_id {d['owner_id']}: {d['c']} negocios")
            else:
                print(f"{OK}Ningún usuario tiene más de un negocio")

        # ---- Migración 002: horarios y amenidades ----
        titulo("Migración 002 — horarios y amenidades")
        faltan_002 = []

        if "amenities" in tablas:
            n = await conn.fetchval("SELECT COUNT(*) FROM amenities")
            print(f"{OK}Tabla amenities existe ({n} registros)")
            if n == 0:
                print(f"{WARN}Está vacía: el catálogo base no se sembró")
        else:
            print(f"{NO}Tabla amenities NO existe")
            faltan_002.append("crear la tabla amenities")

        if "businesses" in tablas:
            for col, desc in (("hours_schedule", "horario por día"),
                              ("amenities", "amenidades del negocio")):
                if col in cols_biz:
                    print(f"{OK}Columna businesses.{col} existe ({desc})")
                else:
                    print(f"{NO}Columna businesses.{col} NO existe")
                    faltan_002.append(f"añadir businesses.{col}")

        # ---- Migración 003: métricas ----
        titulo("Migración 003 — métricas")
        faltan_003 = []
        for tabla in ("stats_site_daily", "stats_business_daily"):
            if tabla in tablas:
                n = await conn.fetchval(f"SELECT COUNT(*) FROM {tabla}")
                print(f"{OK}Tabla {tabla} existe ({n} registros)")
            else:
                print(f"{NO}Tabla {tabla} NO existe")
                faltan_003.append(f"crear {tabla}")

        titulo("Conclusión")
        algo_falta = False
        for nombre, archivo, lista in (
            ("001", "migration_001_b2b.sql", pendientes),
            ("002", "migration_002_horarios_amenidades.sql", faltan_002),
            ("003", "migration_003_metricas.sql", faltan_003),
        ):
            if lista:
                algo_falta = True
                print(f"\n  Falta la migración {nombre} — backend/sql/{archivo}")
                for x in lista:
                    print(f"    - {x}")

        if not algo_falta:
            print("  Las tres migraciones están aplicadas. El esquema está al día.")
        else:
            print("\n  Ejecútalas EN ORDEN en el SQL Editor de Supabase.")
            print("  La 001 borra datos: haz un backup antes. Las 002 y 003 solo agregan.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
