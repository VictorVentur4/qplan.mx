"""
Asigna una contraseña a un usuario existente, o crea un administrador.

Útil cuando no recuerdas la contraseña del admin, o para dar de alta el
primer administrador de la plataforma.

Uso (con el entorno virtual activado y el .env configurado):

    python backend/tools/set_password.py admin@qplan.mx MiClaveSegura123
    python backend/tools/set_password.py nuevo@qplan.mx Clave123 --crear-admin
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def main():
    parser = argparse.ArgumentParser(description="Asigna contraseñas de Qplan")
    parser.add_argument("email")
    parser.add_argument("password")
    parser.add_argument("--crear-admin", action="store_true",
                        help="Crea el usuario como administrador si no existe")
    parser.add_argument("--nombre", default="Administrador")
    parser.add_argument("--telefono", default="5500000000")
    args = parser.parse_args()

    if len(args.password) < 6:
        sys.exit("La contraseña debe tener al menos 6 caracteres.")

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Falta DATABASE_URL en el .env")

    ssl_mode = os.environ.get("DB_SSL", "require")
    ssl_mode = None if ssl_mode in ("disable", "false", "off") else ssl_mode

    conn = await asyncpg.connect(url, ssl=ssl_mode)
    try:
        hashed = pwd_context.hash(args.password)
        email = args.email.lower()

        row = await conn.fetchrow(
            "UPDATE users SET password_hash = $2 WHERE email = $1 RETURNING id, full_name, role",
            email, hashed,
        )

        if row:
            print(f"✓ Contraseña actualizada para {email} (rol actual: {row['role']})")
            if args.crear_admin and row["role"] != "admin":
                await conn.execute("UPDATE users SET role = 'admin' WHERE email = $1", email)
                print("✓ Promovido a administrador")
            return

        if not args.crear_admin:
            sys.exit(f"No existe un usuario con el email {email}. "
                     f"Usa --crear-admin para darlo de alta.")

        await conn.execute(
            """INSERT INTO users (full_name, email, phone, password_hash, role)
               VALUES ($1, $2, $3, $4, 'admin')""",
            args.nombre, email, args.telefono, hashed,
        )
        print(f"✓ Administrador creado: {email}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
