"""
Qplan.mx — API

Directorio B2B de negocios con geolocalización, categorías administrables,
banners publicitarios y tres roles de usuario:

  - user           : usuario final, solo consulta
  - business_owner : dueño de un negocio, edita únicamente el suyo
  - admin          : dueño de la plataforma, administra todo
"""

from fastapi import FastAPI, APIRouter, Query, HTTPException, Depends, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import asyncpg
import json
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import math
import jwt
from passlib.context import CryptContext
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR.parent / '.env')

DATABASE_URL = os.environ['DATABASE_URL']
db_pool = None

# Versión del backend. Súbela en cada entrega: permite verificar de un vistazo
# —en GET /api/ o en el título de /docs— si el servidor que está corriendo
# corresponde al frontend desplegado.
API_VERSION = "2.4.0"
FUNCIONES = [
    "roles",         # user / business_owner / admin
    "categorias",    # catálogo administrable
    "amenidades",    # catálogo administrable + horarios por día + galería
    "metricas",      # contadores agregados y reportes
    "compartir",     # enlaces /lugar/{id}
    "redes",         # instagram / facebook / whatsapp por negocio
    "horario24h",    # días marcados como abiertos las 24 horas
]

app = FastAPI(title="Qplan.mx API", version=API_VERSION)
api_router = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get('JWT_SECRET', 'qplan-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Interruptor para la fase 2: cuando esté en "true", un dueño podrá registrar
# su propio negocio sin intervención del admin. Hoy apagado por decisión de
# producto: el admin da de alta los negocios.
ALLOW_BUSINESS_SELF_REGISTRATION = (
    os.environ.get('ALLOW_BUSINESS_SELF_REGISTRATION', 'false').lower() == 'true'
)

# Zona horaria con la que se cortan los días en los reportes. Si se usara
# UTC, una visita de las 7 de la tarde en México caería en el día siguiente.
REPORT_TIMEZONE = os.environ.get('REPORT_TIMEZONE', 'America/Mexico_City')

ROLE_USER = "user"
ROLE_OWNER = "business_owner"
ROLE_ADMIN = "admin"
VALID_ROLES = (ROLE_USER, ROLE_OWNER, ROLE_ADMIN)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# ==================== DB POOL ====================


# Supabase exige SSL; un PostgreSQL local normalmente no lo tiene.
# Pon DB_SSL=disable en el .env para desarrollo local.
DB_SSL = os.environ.get('DB_SSL', 'require')


# Qué necesita cada migración para considerarse aplicada. Se comprueba al
# arrancar: sin esto, una migración olvidada se manifiesta como un error 500
# suelto en tiempo de uso, difícil de relacionar con su causa.
ESQUEMA_REQUERIDO = {
    "migration_001_b2b.sql": {
        "tablas": ["categories"],
        "columnas": [("users", "role")],
    },
    "migration_002_horarios_amenidades.sql": {
        "tablas": ["amenities"],
        "columnas": [("businesses", "hours_schedule"), ("businesses", "amenities")],
    },
    "migration_003_metricas.sql": {
        "tablas": ["stats_site_daily", "stats_business_daily"],
        "columnas": [],
    },
    "migration_004_redes_sociales.sql": {
        "tablas": [],
        "columnas": [("businesses", "instagram"), ("businesses", "facebook"),
                     ("businesses", "whatsapp")],
    },
}

# Se llena al arrancar. Lo expone GET /api/ para poder diagnosticar de un vistazo.
MIGRACIONES_PENDIENTES = []


async def verificar_esquema(conn):
    """Compara la base contra lo que el código necesita y avisa fuerte si falta algo."""
    tablas = {r["table_name"] for r in await conn.fetch(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )}
    columnas = {(r["table_name"], r["column_name"]) for r in await conn.fetch(
        "SELECT table_name, column_name FROM information_schema.columns "
        "WHERE table_schema = 'public'"
    )}

    pendientes = []
    for archivo, requisitos in ESQUEMA_REQUERIDO.items():
        faltan = [f"tabla {t}" for t in requisitos["tablas"] if t not in tablas]
        faltan += [f"columna {t}.{c}" for t, c in requisitos["columnas"]
                   if (t, c) not in columnas]
        if faltan:
            pendientes.append({"migracion": archivo, "falta": faltan})

    if pendientes:
        logging.error("=" * 68)
        logging.error("LA BASE DE DATOS NO ESTÁ AL DÍA. Faltan migraciones por ejecutar:")
        for p in pendientes:
            logging.error("  backend/sql/%s", p["migracion"])
            for f in p["falta"]:
                logging.error("      falta %s", f)
        logging.error("")
        logging.error("Mientras tanto, algunos endpoints responderán con error 500.")
        logging.error("Ejecuta las migraciones EN ORDEN en el SQL Editor de Supabase,")
        logging.error("o corre  python backend/tools/check_db.py  para el detalle.")
        logging.error("=" * 68)
    else:
        logging.info("Esquema al día: las %d migraciones están aplicadas",
                     len(ESQUEMA_REQUERIDO))
    return pendientes


async def _init_connection(conn):
    """asyncpg entrega JSONB como texto; este códec lo convierte a objetos
    de Python en ambos sentidos, para poder trabajar con hours_schedule."""
    await conn.set_type_codec(
        'jsonb',
        encoder=json.dumps,
        decoder=json.loads,
        schema='pg_catalog',
    )


@app.on_event("startup")
async def startup_db():
    global db_pool
    ssl_mode = None if DB_SSL in ('disable', 'false', 'off') else DB_SSL
    db_pool = await asyncpg.create_pool(DATABASE_URL, ssl=ssl_mode, init=_init_connection)
    logging.info("Conectado a PostgreSQL (ssl=%s)", ssl_mode)

    global MIGRACIONES_PENDIENTES
    async with db_pool.acquire() as conn:
        MIGRACIONES_PENDIENTES = await verificar_esquema(conn)


@app.on_event("shutdown")
async def shutdown_db():
    if db_pool:
        await db_pool.close()


# ==================== MODELOS ====================


class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=6)
    confirm_password: str

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        cleaned = re.sub(r'[\s\-]', '', v)
        if not re.match(r'^\+?[0-9]{10,15}$', cleaned):
            raise ValueError('Número de teléfono inválido')
        return cleaned

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Las contraseñas no coinciden')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    role: str
    is_admin: bool          # derivado de role; se conserva por compatibilidad
    business_id: Optional[str] = None
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleUpdate(BaseModel):
    role: str

    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Rol inválido. Valores permitidos: {', '.join(VALID_ROLES)}")
        return v


class CategoryCreate(BaseModel):
    slug: str = Field(..., min_length=2, max_length=50, pattern="^[a-z0-9_]+$")
    label: str = Field(..., min_length=2, max_length=60)
    icon: str = Field(default="MapPin", max_length=40)
    display_order: int = 0
    is_active: bool = True


class CategoryUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


MAX_IMAGES = 5
DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
HORA_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")


class HoursDay(BaseModel):
    """
    Horario de un día. day: 0 = lunes ... 6 = domingo.

    Tres estados posibles, en este orden de prioridad:
      closed   → cerrado ese día.
      all_day  → abierto las 24 horas; open y close se ignoran.
      open/close → rango normal.

    all_day es opcional para no romper los negocios dados de alta antes:
    si la llave no viene en el JSON guardado, vale False.
    """
    day: int = Field(..., ge=0, le=6)
    closed: bool = False
    all_day: bool = False
    open: Optional[str] = None
    close: Optional[str] = None

    @field_validator('open', 'close')
    @classmethod
    def validate_hora(cls, v):
        if v in (None, ""):
            return None
        if not HORA_RE.match(v):
            raise ValueError("La hora debe tener formato HH:MM de 24 horas")
        return v

    @field_validator('close')
    @classmethod
    def validate_rango(cls, v, info):
        # Se permite un cierre anterior a la apertura: es un negocio que
        # cierra de madrugada (22:00 a 02:00), no un error.
        if (not info.data.get('closed') and not info.data.get('all_day')
                and v and not info.data.get('open')):
            raise ValueError("Falta la hora de apertura")
        return v


def validate_schedule(schedule: Optional[List[HoursDay]]) -> Optional[list]:
    """Normaliza el horario a una lista de 7 días sin repetidos."""
    if schedule is None:
        return None
    vistos = set()
    dias = []
    for d in schedule:
        if d.day in vistos:
            raise HTTPException(status_code=400, detail=f"El día {DIAS[d.day]} está repetido")
        vistos.add(d.day)
        if not d.closed and not d.all_day and not (d.open and d.close):
            raise HTTPException(
                status_code=400,
                detail=(f"{DIAS[d.day]}: indica apertura y cierre, "
                        f"o márcalo como cerrado o abierto 24 horas"),
            )
        # Un día cerrado o de 24 horas no guarda horas sueltas: así la
        # base nunca contradice a la pantalla.
        limpio = d.model_dump()
        if d.closed:
            limpio['all_day'] = False
        if limpio['closed'] or limpio['all_day']:
            limpio['open'] = limpio['close'] = None
        dias.append(limpio)
    return sorted(dias, key=lambda x: x['day'])


# --------------------------------------------------------------- redes
#
# Se guarda el identificador, no la URL: el enlace lo arma el frontend.
# Así da igual que el negocio te pase "@cafecentral", "cafecentral" o
# "https://www.instagram.com/cafecentral/?hl=es": los tres terminan
# guardados igual y el enlace siempre sale bien formado.

LADA_POR_DEFECTO = os.environ.get("DEFAULT_COUNTRY_CODE", "52")  # México

IG_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")
FB_RE = re.compile(r"^[A-Za-z0-9._\-]{1,60}$")
FB_PERFIL_RE = re.compile(r"^profile\.php\?id=\d{5,25}$")


def _quitar_dominio(valor: str, dominios: tuple) -> str:
    """Deja solo lo que va después del dominio, si venía una URL."""
    v = valor.strip()
    v = re.sub(r"^https?://", "", v, flags=re.I)
    v = re.sub(r"^www\.", "", v, flags=re.I)
    for d in dominios:
        if v.lower().startswith(d):
            v = v[len(d):]
            break
    return v.lstrip("/")


def normalize_instagram(valor: Optional[str]) -> Optional[str]:
    if not valor or not valor.strip():
        return None
    v = _quitar_dominio(valor, ("instagram.com/", "instagr.am/"))
    v = v.split("?")[0].split("/")[0].lstrip("@").strip()
    if not v:
        return None
    if not IG_RE.match(v):
        raise HTTPException(
            status_code=400,
            detail=("Instagram: usa el nombre de usuario (por ejemplo cafecentral) "
                    "o el enlace completo del perfil."),
        )
    return v


def normalize_facebook(valor: Optional[str]) -> Optional[str]:
    if not valor or not valor.strip():
        return None
    v = _quitar_dominio(valor, ("facebook.com/", "fb.com/", "m.facebook.com/"))
    v = v.rstrip("/")
    # Las páginas sin nombre personalizado son /profile.php?id=123456
    if v.lower().startswith("profile.php"):
        v = v.split("&")[0]
        if not FB_PERFIL_RE.match(v):
            raise HTTPException(status_code=400, detail="Facebook: el enlace del perfil no es válido.")
        return v
    v = v.split("?")[0].split("/")[0]
    if not v:
        return None
    if not FB_RE.match(v):
        raise HTTPException(
            status_code=400,
            detail=("Facebook: usa el nombre de la página (por ejemplo CafeCentral) "
                    "o el enlace completo."),
        )
    return v


def normalize_whatsapp(valor: Optional[str]) -> Optional[str]:
    """Deja el número en formato internacional, solo dígitos y sin +."""
    if not valor or not valor.strip():
        return None
    v = _quitar_dominio(valor, ("wa.me/", "api.whatsapp.com/send", "whatsapp.com/"))
    digitos = re.sub(r"\D", "", v)
    if not digitos:
        return None
    # Un número mexicano de 10 dígitos viene sin lada de país: se le pone.
    if len(digitos) == 10:
        digitos = LADA_POR_DEFECTO + digitos
    # 1 + 10 dígitos es el formato viejo de México (521...); WhatsApp ya no
    # lo usa para números móviles, pero se acepta y se deja tal cual.
    if not 8 <= len(digitos) <= 15:
        raise HTTPException(
            status_code=400,
            detail=("WhatsApp: escribe el número a 10 dígitos (7771234567) "
                    "o en formato internacional (+52 777 123 4567)."),
        )
    return digitos


NORMALIZADORES_RED = {
    "instagram": normalize_instagram,
    "facebook": normalize_facebook,
    "whatsapp": normalize_whatsapp,
}


def normalize_socials(update_data: dict) -> dict:
    """Aplica el normalizador de cada red a las llaves presentes."""
    for red, fn in NORMALIZADORES_RED.items():
        if red in update_data:
            update_data[red] = fn(update_data[red])
    return update_data


def validate_images(images: Optional[List[str]]) -> Optional[List[str]]:
    if images is None:
        return None
    limpias = [i.strip() for i in images if i and i.strip()]
    if len(limpias) > MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_IMAGES} imágenes por negocio (recibidas {len(limpias)})",
        )
    return limpias


class AmenityCreate(BaseModel):
    slug: str = Field(..., min_length=2, max_length=50, pattern="^[a-z0-9_]+$")
    label: str = Field(..., min_length=2, max_length=60)
    icon: str = Field(default="Check", max_length=40)
    display_order: int = 0
    is_active: bool = True


class AmenityUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class BusinessCreate(BaseModel):
    name: str = Field(..., min_length=2)
    type: str
    description: str = Field(..., min_length=10)
    logo: Optional[str] = None
    address: str
    phone: Optional[str] = None
    hours: Optional[str] = None
    hours_schedule: Optional[List[HoursDay]] = None
    latitude: float
    longitude: float
    rating: float = Field(default=4.5, ge=0, le=5)
    images: List[str] = []
    amenities: List[str] = []
    website: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    whatsapp: Optional[str] = None
    owner_id: Optional[str] = None


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    logo: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    hours: Optional[str] = None
    hours_schedule: Optional[List[HoursDay]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rating: Optional[float] = None
    images: Optional[List[str]] = None
    amenities: Optional[List[str]] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    whatsapp: Optional[str] = None
    owner_id: Optional[str] = None


class OwnBusinessUpdate(BaseModel):
    """
    Lo que un dueño puede cambiar de su propio negocio.

    Deliberadamente NO incluye owner_id ni is_active: un dueño no puede
    reasignar su negocio a otra persona ni reactivarlo si el admin lo desactivó.
    """
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    logo: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    hours: Optional[str] = None
    hours_schedule: Optional[List[HoursDay]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    images: Optional[List[str]] = None
    amenities: Optional[List[str]] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    whatsapp: Optional[str] = None


TIPOS_EVENTO = ("pageview", "business_view")
QR_ID_RE = re.compile(r"^[a-z0-9_-]{1,60}$")


class TrackEvent(BaseModel):
    """
    Un evento de uso. No lleva identificador de usuario, ni IP, ni
    coordenadas: solo qué pasó y con qué código QR.
    """
    tipo: str
    business_id: Optional[str] = None
    qr_id: Optional[str] = None
    posicion: Optional[int] = Field(default=None, ge=1, le=500)

    @field_validator('tipo')
    @classmethod
    def validate_tipo(cls, v):
        if v not in TIPOS_EVENTO:
            raise ValueError(f"Tipo inválido. Valores permitidos: {', '.join(TIPOS_EVENTO)}")
        return v

    @field_validator('qr_id')
    @classmethod
    def validate_qr(cls, v):
        if v in (None, ""):
            return None
        v = v.strip().lower()
        if not QR_ID_RE.match(v):
            # No se rechaza la petición: una métrica nunca debe romper la app.
            # Simplemente se ignora el identificador mal formado.
            return None
        return v


class BannerCreate(BaseModel):
    image: str
    title: str = Field(..., min_length=2)
    link: Optional[str] = None
    active: bool = True
    display_order: int = 0


class BannerUpdate(BaseModel):
    image: Optional[str] = None
    title: Optional[str] = None
    link: Optional[str] = None
    active: Optional[bool] = None
    display_order: Optional[int] = None


# ==================== HELPERS ====================


def calculate_distance(lat1, lon1, lat2, lon2):
    """Distancia en kilómetros entre dos puntos (fórmula de Haversine)."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def hash_password(password):
    return pwd_context.hash(password)


def verify_password(plain, hashed):
    # Un hash corrupto o en un formato desconocido no debe tumbar el login con
    # un 500: se trata como credencial inválida.
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        logging.warning("Hash de contraseña ilegible en la base de datos")
        return False


def create_access_token(user_id, email, role):
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {"sub": str(user_id), "email": email, "role": role, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def serialize_business(row) -> dict:
    b = dict(row)
    b['id'] = str(b['id'])
    b['owner_id'] = str(b['owner_id']) if b.get('owner_id') else None
    b['created_at'] = b['created_at'].isoformat()
    # La columna rating es REAL (float de 4 bytes): al ensancharla a float de
    # 8 bytes para el JSON, 4.6 se convierte en 4.599999904632568 y así se
    # imprimía en las tarjetas. Se redondea aquí, que es por donde pasan
    # todas las respuestas que incluyen un negocio.
    if b.get('rating') is not None:
        b['rating'] = round(float(b['rating']), 1)
    return b


def serialize_category(row) -> dict:
    c = dict(row)
    c['id'] = str(c['id'])
    if c.get('created_at'):
        c['created_at'] = c['created_at'].isoformat()
    return c


def serialize_banner(row) -> dict:
    return dict(row) | {
        'id': str(row['id']),
        'created_at': row['created_at'].isoformat(),
    }


async def get_business_id_for_user(conn, user_id) -> Optional[str]:
    row = await conn.fetchrow("SELECT id FROM businesses WHERE owner_id = $1", user_id)
    return str(row['id']) if row else None


async def build_user_response(conn, user: dict) -> UserResponse:
    business_id = await get_business_id_for_user(conn, user['id'])
    return UserResponse(
        id=str(user['id']),
        full_name=user['full_name'],
        email=user['email'],
        phone=user['phone'],
        role=user['role'],
        is_admin=(user['role'] == ROLE_ADMIN),
        business_id=business_id,
        created_at=user['created_at'].isoformat(),
    )


async def assert_category_exists(conn, slug: str):
    exists = await conn.fetchval("SELECT 1 FROM categories WHERE slug = $1", slug)
    if not exists:
        raise HTTPException(status_code=400, detail=f"La categoría '{slug}' no existe")


async def validate_amenities(conn, slugs: Optional[List[str]]) -> Optional[List[str]]:
    """Comprueba que cada amenidad exista en el catálogo y quita repetidas."""
    if slugs is None:
        return None
    unicas = list(dict.fromkeys(s.strip() for s in slugs if s and s.strip()))
    if not unicas:
        return []
    existentes = {
        r['slug'] for r in
        await conn.fetch("SELECT slug FROM amenities WHERE slug = ANY($1::text[])", unicas)
    }
    faltantes = [s for s in unicas if s not in existentes]
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=f"Estas amenidades no existen: {', '.join(faltantes)}",
        )
    return unicas


def build_update_clause(update_data: dict, first_param: int = 2):
    """Construye el SET de un UPDATE. Las llaves vienen de modelos Pydantic,
    nunca del usuario, así que no hay riesgo de inyección."""
    sets = ", ".join(f"{k} = ${i + first_param}" for i, k in enumerate(update_data))
    return sets, list(update_data.values())


# ==================== DEPENDENCIAS DE AUTENTICACIÓN ====================


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", uuid.UUID(user_id))

    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if not user['is_active']:
        raise HTTPException(status_code=401, detail="Cuenta desactivada")
    return dict(user)


async def require_admin(current_user=Depends(get_current_user)):
    if current_user.get("role") != ROLE_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado. Se requieren permisos de administrador.",
        )
    return current_user


async def require_business_owner(current_user=Depends(get_current_user)):
    """Permite pasar a dueños de negocio y también a admins."""
    if current_user.get("role") not in (ROLE_OWNER, ROLE_ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado. Se requiere una cuenta de negocio.",
        )
    return current_user


# ==================== AUTENTICACIÓN ====================


@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    async with db_pool.acquire() as conn:
        if await conn.fetchrow("SELECT id FROM users WHERE email = $1", user_data.email.lower()):
            raise HTTPException(status_code=400, detail="El email ya está registrado")
        if await conn.fetchrow("SELECT id FROM users WHERE phone = $1", user_data.phone):
            raise HTTPException(status_code=400, detail="El teléfono ya está registrado")

        user = await conn.fetchrow(
            """INSERT INTO users (full_name, email, phone, password_hash, role)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            user_data.full_name, user_data.email.lower(), user_data.phone,
            hash_password(user_data.password), ROLE_USER,
        )
        user_response = await build_user_response(conn, dict(user))

    token = create_access_token(user['id'], user['email'], user['role'])
    return TokenResponse(access_token=token, user=user_response)


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", credentials.email.lower())
        if not user or not verify_password(credentials.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
        if not user['is_active']:
            raise HTTPException(status_code=401, detail="Cuenta desactivada")
        user_response = await build_user_response(conn, dict(user))

    token = create_access_token(user['id'], user['email'], user['role'])
    return TokenResponse(access_token=token, user=user_response)


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        return await build_user_response(conn, current_user)


# ==================== RUTAS PÚBLICAS ====================


@api_router.get("/")
async def root():
    """
    Identificación del backend. Sirve para comprobar rápido que el servidor
    que responde es el que corresponde al frontend.
    """
    return {
        "message": "Qplan.mx API - Descubre lugares cerca de ti",
        "version": API_VERSION,
        "funciones": FUNCIONES,
        "rutas": len([r for r in app.routes
                      if hasattr(r, "methods") and r.path.startswith("/api")]),
        "esquema_al_dia": not MIGRACIONES_PENDIENTES,
        "migraciones_pendientes": MIGRACIONES_PENDIENTES,
    }


@api_router.get("/categories")
async def get_categories():
    """Catálogo de categorías activas. Alimenta el select del home."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM categories WHERE is_active = TRUE ORDER BY display_order ASC, label ASC"
        )
    return [serialize_category(r) for r in rows]


@api_router.get("/amenities")
async def get_amenities():
    """Catálogo de amenidades activas. Alimenta los iconos del listado."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM amenities WHERE is_active = TRUE ORDER BY display_order ASC, label ASC"
        )
    return [serialize_category(r) for r in rows]


@api_router.get("/businesses")
async def get_businesses(
    type: Optional[str] = Query(None, description="Slug de categoría. Omitir para traer todas."),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    radius: float = Query(50.0),
):
    query = "SELECT * FROM businesses WHERE is_active = TRUE"
    params = []
    if type:
        params.append(type)
        query += f" AND type = ${len(params)}"

    async with db_pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    businesses = [serialize_business(r) for r in rows]

    if lat is not None and lng is not None:
        for b in businesses:
            b['distance'] = round(calculate_distance(lat, lng, b['latitude'], b['longitude']), 2)
        businesses = [b for b in businesses if b['distance'] <= radius]
        businesses.sort(key=lambda x: x['distance'])
    else:
        businesses.sort(key=lambda x: x['name'])

    return businesses


@api_router.get("/businesses/{business_id}")
async def get_business(business_id: str):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM businesses WHERE id = $1 AND is_active = TRUE",
            uuid.UUID(business_id),
        )
    if not row:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    return serialize_business(row)


@api_router.get("/banners")
async def get_banners():
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM banners WHERE active = TRUE ORDER BY display_order ASC"
        )
    return [serialize_banner(r) for r in rows]


# ==================== REGISTRO DE MÉTRICAS ====================


@api_router.post("/track", status_code=204)
async def track(evento: TrackEvent):
    """
    Registra un uso incrementando un contador del día.

    Es público y sin autenticación a propósito: lo llama cualquier visitante.
    Nunca devuelve error al cliente por un fallo interno — una métrica caída
    no debe romper la navegación — así que los problemas se registran en el
    log y se responde 204 igual.
    """
    try:
        async with db_pool.acquire() as conn:
            hoy = await conn.fetchval(
                "SELECT (NOW() AT TIME ZONE $1)::date", REPORT_TIMEZONE
            )

            if evento.tipo == "pageview":
                await conn.execute(
                    """INSERT INTO stats_site_daily (fecha, qr_id, vistas)
                       VALUES ($1, $2, 1)
                       ON CONFLICT (fecha, qr_id)
                       DO UPDATE SET vistas = stats_site_daily.vistas + 1""",
                    hoy, evento.qr_id or "",
                )

            elif evento.tipo == "business_view":
                if not evento.business_id:
                    return
                try:
                    biz = uuid.UUID(evento.business_id)
                except ValueError:
                    return
                await conn.execute(
                    """INSERT INTO stats_business_daily
                           (fecha, business_id, vistas, suma_posicion)
                       SELECT $1, $2, 1, $3
                       WHERE EXISTS (SELECT 1 FROM businesses WHERE id = $2)
                       ON CONFLICT (fecha, business_id)
                       DO UPDATE SET
                           vistas = stats_business_daily.vistas + 1,
                           suma_posicion = stats_business_daily.suma_posicion
                                           + EXCLUDED.suma_posicion""",
                    hoy, biz, evento.posicion or 0,
                )
    except Exception:
        logging.exception("No se pudo registrar la métrica")
    return


# ==================== ADMIN: MÉTRICAS ====================


async def _rango(conn, dias: int):
    """Devuelve (desde, hasta) en la zona horaria de los reportes."""
    hasta = await conn.fetchval("SELECT (NOW() AT TIME ZONE $1)::date", REPORT_TIMEZONE)
    return hasta - timedelta(days=dias - 1), hasta


@api_router.get("/admin/metrics/summary")
async def admin_metrics_summary(
    dias: int = Query(30, ge=1, le=365),
    admin=Depends(require_admin),
):
    async with db_pool.acquire() as conn:
        desde, hasta = await _rango(conn, dias)

        total_visitas = await conn.fetchval(
            "SELECT COALESCE(SUM(vistas),0) FROM stats_site_daily WHERE fecha BETWEEN $1 AND $2",
            desde, hasta,
        )
        total_negocios = await conn.fetchval(
            "SELECT COALESCE(SUM(vistas),0) FROM stats_business_daily WHERE fecha BETWEEN $1 AND $2",
            desde, hasta,
        )
        visitas_qr = await conn.fetchval(
            "SELECT COALESCE(SUM(vistas),0) FROM stats_site_daily "
            "WHERE fecha BETWEEN $1 AND $2 AND qr_id <> ''",
            desde, hasta,
        )

        # Serie diaria completa: los días sin datos salen en cero para que
        # la gráfica no invente una línea continua donde hubo un hueco.
        serie = await conn.fetch(
            """SELECT d::date AS fecha,
                      COALESCE(s.vistas, 0)  AS visitas,
                      COALESCE(b.vistas, 0)  AS vistas_negocios
                 FROM generate_series($1::date, $2::date, '1 day') AS d
                 LEFT JOIN (SELECT fecha, SUM(vistas) vistas FROM stats_site_daily
                             GROUP BY fecha) s ON s.fecha = d::date
                 LEFT JOIN (SELECT fecha, SUM(vistas) vistas FROM stats_business_daily
                             GROUP BY fecha) b ON b.fecha = d::date
                ORDER BY d""",
            desde, hasta,
        )

        top_negocios = await conn.fetch(
            """SELECT b.id, b.name, b.type, b.is_active,
                      SUM(s.vistas) AS vistas,
                      CASE WHEN SUM(s.suma_posicion) > 0
                           THEN ROUND(SUM(s.suma_posicion)::numeric / SUM(s.vistas), 1)
                           ELSE NULL END AS posicion_media
                 FROM stats_business_daily s
                 JOIN businesses b ON b.id = s.business_id
                WHERE s.fecha BETWEEN $1 AND $2
                GROUP BY b.id, b.name, b.type, b.is_active
                ORDER BY vistas DESC
                LIMIT 20""",
            desde, hasta,
        )

        top_qr = await conn.fetch(
            """SELECT qr_id, SUM(vistas) AS vistas
                 FROM stats_site_daily
                WHERE fecha BETWEEN $1 AND $2
                GROUP BY qr_id
                ORDER BY vistas DESC
                LIMIT 20""",
            desde, hasta,
        )

    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "dias": dias,
        "zona_horaria": REPORT_TIMEZONE,
        "total_visitas": total_visitas,
        "total_vistas_negocios": total_negocios,
        "visitas_desde_qr": visitas_qr,
        "visitas_directas": total_visitas - visitas_qr,
        "serie": [
            {"fecha": r["fecha"].isoformat(),
             "visitas": r["visitas"],
             "vistas_negocios": r["vistas_negocios"]}
            for r in serie
        ],
        "top_negocios": [
            {"id": str(r["id"]), "nombre": r["name"], "tipo": r["type"],
             "is_active": r["is_active"], "vistas": r["vistas"],
             "posicion_media": float(r["posicion_media"]) if r["posicion_media"] else None}
            for r in top_negocios
        ],
        "top_qr": [
            {"qr_id": r["qr_id"] or "(entrada directa)", "vistas": r["vistas"]}
            for r in top_qr
        ],
    }


@api_router.get("/admin/metrics/business/{business_id}")
async def admin_metrics_business(
    business_id: str,
    dias: int = Query(90, ge=1, le=365),
    admin=Depends(require_admin),
):
    """Detalle de un negocio, para revisarlo o mandárselo a su dueño."""
    biz_uuid = uuid.UUID(business_id)
    async with db_pool.acquire() as conn:
        negocio = await conn.fetchrow("SELECT * FROM businesses WHERE id = $1", biz_uuid)
        if not negocio:
            raise HTTPException(status_code=404, detail="Negocio no encontrado")

        desde, hasta = await _rango(conn, dias)
        filas = await conn.fetch(
            """SELECT d::date AS fecha, COALESCE(s.vistas,0) AS vistas,
                      CASE WHEN COALESCE(s.vistas,0) > 0 AND s.suma_posicion > 0
                           THEN ROUND(s.suma_posicion::numeric / s.vistas, 1)
                           ELSE NULL END AS posicion_media
                 FROM generate_series($2::date, $3::date, '1 day') AS d
                 LEFT JOIN stats_business_daily s
                        ON s.fecha = d::date AND s.business_id = $1
                ORDER BY d""",
            biz_uuid, desde, hasta,
        )
        total = sum(r["vistas"] for r in filas)

    return {
        "negocio": {"id": str(negocio["id"]), "nombre": negocio["name"],
                    "tipo": negocio["type"]},
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "total_vistas": total,
        "serie": [
            {"fecha": r["fecha"].isoformat(), "vistas": r["vistas"],
             "posicion_media": float(r["posicion_media"]) if r["posicion_media"] else None}
            for r in filas
        ],
    }


@api_router.get("/admin/metrics/business/{business_id}/csv")
async def admin_metrics_business_csv(
    business_id: str,
    dias: int = Query(90, ge=1, le=365),
    admin=Depends(require_admin),
):
    """Reporte descargable para entregarle al dueño del negocio."""
    datos = await admin_metrics_business(business_id, dias, admin)

    lineas = [
        f"Reporte de visibilidad en Qplan.mx",
        f"Negocio,{datos['negocio']['nombre']}",
        f"Periodo,{datos['desde']} a {datos['hasta']}",
        f"Total de veces que abrieron su ficha,{datos['total_vistas']}",
        "",
        "Fecha,Vistas,Posicion promedio en la lista",
    ]
    for d in datos["serie"]:
        pos = d["posicion_media"] if d["posicion_media"] is not None else ""
        lineas.append(f"{d['fecha']},{d['vistas']},{pos}")

    # BOM para que Excel en Windows respete los acentos.
    contenido = "﻿" + "\n".join(lineas)
    nombre = re.sub(r"[^a-zA-Z0-9]+", "-", datos["negocio"]["nombre"]).strip("-").lower()

    return Response(
        content=contenido,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="qplan-{nombre}-{datos["hasta"]}.csv"'},
    )


# ==================== PANEL DEL DUEÑO DE NEGOCIO ====================


@api_router.get("/me/business")
async def get_my_business(current_user=Depends(require_business_owner)):
    """Devuelve el único negocio del usuario autenticado."""
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM businesses WHERE owner_id = $1", current_user['id']
        )
    if not row:
        raise HTTPException(
            status_code=404,
            detail="No tienes un negocio asignado. Contacta al administrador.",
        )
    return serialize_business(row)


@api_router.put("/me/business")
async def update_my_business(payload: OwnBusinessUpdate, current_user=Depends(require_business_owner)):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    async with db_pool.acquire() as conn:
        owned = await conn.fetchrow(
            "SELECT id FROM businesses WHERE owner_id = $1", current_user['id']
        )
        if not owned:
            raise HTTPException(
                status_code=404,
                detail="No tienes un negocio asignado. Contacta al administrador.",
            )
        if 'type' in update_data:
            await assert_category_exists(conn, update_data['type'])
        if 'hours_schedule' in update_data:
            update_data['hours_schedule'] = validate_schedule(payload.hours_schedule)
        if 'images' in update_data:
            update_data['images'] = validate_images(update_data['images'])
        if 'amenities' in update_data:
            update_data['amenities'] = await validate_amenities(conn, update_data['amenities'])
        normalize_socials(update_data)

        sets, values = build_update_clause(update_data)
        row = await conn.fetchrow(
            f"UPDATE businesses SET {sets} WHERE id = $1 RETURNING *", owned['id'], *values
        )
    return serialize_business(row)


# ==================== ADMIN: NEGOCIOS ====================


@api_router.get("/admin/businesses")
async def admin_list_businesses(
    type: Optional[str] = Query(None),
    include_inactive: bool = Query(True),
    admin=Depends(require_admin),
):
    query = "SELECT * FROM businesses"
    conditions, params = [], []
    if type:
        params.append(type)
        conditions.append(f"type = ${len(params)}")
    if not include_inactive:
        conditions.append("is_active = TRUE")
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at DESC"

    async with db_pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    return [serialize_business(r) for r in rows]


@api_router.post("/admin/businesses")
async def admin_create_business(business: BusinessCreate, admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        await assert_category_exists(conn, business.type)
        owner_uuid = uuid.UUID(business.owner_id) if business.owner_id else None

        if owner_uuid:
            owner = await conn.fetchrow("SELECT id, role FROM users WHERE id = $1", owner_uuid)
            if not owner:
                raise HTTPException(status_code=400, detail="El usuario dueño no existe")
            taken = await conn.fetchrow("SELECT id FROM businesses WHERE owner_id = $1", owner_uuid)
            if taken:
                raise HTTPException(
                    status_code=400, detail="Ese usuario ya tiene un negocio asignado"
                )

        row = await conn.fetchrow(
            """INSERT INTO businesses (name, type, description, logo, address, phone, hours,
               hours_schedule, latitude, longitude, rating, images, amenities, website,
               instagram, facebook, whatsapp, owner_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               RETURNING *""",
            business.name, business.type, business.description, business.logo,
            business.address, business.phone, business.hours,
            validate_schedule(business.hours_schedule),
            business.latitude, business.longitude, business.rating,
            validate_images(business.images) or [],
            await validate_amenities(conn, business.amenities) or [],
            business.website,
            normalize_instagram(business.instagram),
            normalize_facebook(business.facebook),
            normalize_whatsapp(business.whatsapp),
            owner_uuid,
        )

        # Asignar un negocio promueve al usuario a dueño.
        if owner_uuid:
            await conn.execute(
                "UPDATE users SET role = $1 WHERE id = $2 AND role <> $3",
                ROLE_OWNER, owner_uuid, ROLE_ADMIN,
            )

    return serialize_business(row)


@api_router.put("/admin/businesses/{business_id}")
async def admin_update_business(
    business_id: str, business: BusinessUpdate, admin=Depends(require_admin)
):
    update_data = business.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    biz_uuid = uuid.UUID(business_id)

    async with db_pool.acquire() as conn:
        if 'type' in update_data and update_data['type']:
            await assert_category_exists(conn, update_data['type'])
        if 'hours_schedule' in update_data:
            update_data['hours_schedule'] = validate_schedule(business.hours_schedule)
        if 'images' in update_data:
            update_data['images'] = validate_images(update_data['images'])
        if 'amenities' in update_data:
            update_data['amenities'] = await validate_amenities(conn, update_data['amenities'])
        normalize_socials(update_data)

        new_owner = None
        if 'owner_id' in update_data:
            new_owner = uuid.UUID(update_data['owner_id']) if update_data['owner_id'] else None
            if new_owner:
                if not await conn.fetchval("SELECT 1 FROM users WHERE id = $1", new_owner):
                    raise HTTPException(status_code=400, detail="El usuario dueño no existe")
                taken = await conn.fetchrow(
                    "SELECT id FROM businesses WHERE owner_id = $1 AND id <> $2",
                    new_owner, biz_uuid,
                )
                if taken:
                    raise HTTPException(
                        status_code=400, detail="Ese usuario ya tiene un negocio asignado"
                    )
            update_data['owner_id'] = new_owner

        sets, values = build_update_clause(update_data)
        row = await conn.fetchrow(
            f"UPDATE businesses SET {sets} WHERE id = $1 RETURNING *", biz_uuid, *values
        )
        if not row:
            raise HTTPException(status_code=404, detail="Negocio no encontrado")

        if new_owner:
            await conn.execute(
                "UPDATE users SET role = $1 WHERE id = $2 AND role <> $3",
                ROLE_OWNER, new_owner, ROLE_ADMIN,
            )

    return serialize_business(row)


@api_router.patch("/admin/businesses/{business_id}/toggle")
async def admin_toggle_business(business_id: str, admin=Depends(require_admin)):
    """Desactiva o reactiva un negocio. No borra: el registro se conserva."""
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE businesses SET is_active = NOT is_active WHERE id = $1 "
            "RETURNING id, name, is_active",
            uuid.UUID(business_id),
        )
    if not row:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    return {"id": str(row['id']), "name": row['name'], "is_active": row['is_active']}


# ==================== ADMIN: CATEGORÍAS ====================


@api_router.get("/admin/categories")
async def admin_list_categories(admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM categories ORDER BY display_order ASC, label ASC"
        )
    return [serialize_category(r) for r in rows]


@api_router.post("/admin/categories")
async def admin_create_category(category: CategoryCreate, admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        if await conn.fetchval("SELECT 1 FROM categories WHERE slug = $1", category.slug):
            raise HTTPException(status_code=400, detail="Ya existe una categoría con ese slug")
        row = await conn.fetchrow(
            """INSERT INTO categories (slug, label, icon, display_order, is_active)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            category.slug, category.label, category.icon,
            category.display_order, category.is_active,
        )
    return serialize_category(row)


@api_router.put("/admin/categories/{category_id}")
async def admin_update_category(
    category_id: str, category: CategoryUpdate, admin=Depends(require_admin)
):
    update_data = category.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    sets, values = build_update_clause(update_data)
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE categories SET {sets} WHERE id = $1 RETURNING *",
            uuid.UUID(category_id), *values,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return serialize_category(row)


@api_router.delete("/admin/categories/{category_id}")
async def admin_delete_category(category_id: str, admin=Depends(require_admin)):
    """
    Solo permite borrar categorías que no estén en uso. Si hay negocios en ella,
    devuelve 409 y sugiere desactivarla, que es lo no destructivo.
    """
    async with db_pool.acquire() as conn:
        category = await conn.fetchrow(
            "SELECT * FROM categories WHERE id = $1", uuid.UUID(category_id)
        )
        if not category:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

        in_use = await conn.fetchval(
            "SELECT COUNT(*) FROM businesses WHERE type = $1", category['slug']
        )
        if in_use:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede eliminar: {in_use} negocio(s) usan esta categoría. "
                    "Desactívala o reasigna esos negocios primero."
                ),
            )
        await conn.execute("DELETE FROM categories WHERE id = $1", uuid.UUID(category_id))
    return {"message": "Categoría eliminada"}


# ==================== ADMIN: AMENIDADES ====================


@api_router.get("/admin/amenities")
async def admin_list_amenities(admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM amenities ORDER BY display_order ASC, label ASC")
    return [serialize_category(r) for r in rows]


@api_router.post("/admin/amenities")
async def admin_create_amenity(amenity: AmenityCreate, admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        if await conn.fetchval("SELECT 1 FROM amenities WHERE slug = $1", amenity.slug):
            raise HTTPException(status_code=400, detail="Ya existe una amenidad con ese slug")
        row = await conn.fetchrow(
            """INSERT INTO amenities (slug, label, icon, display_order, is_active)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            amenity.slug, amenity.label, amenity.icon,
            amenity.display_order, amenity.is_active,
        )
    return serialize_category(row)


@api_router.put("/admin/amenities/{amenity_id}")
async def admin_update_amenity(
    amenity_id: str, amenity: AmenityUpdate, admin=Depends(require_admin)
):
    update_data = amenity.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    sets, values = build_update_clause(update_data)
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE amenities SET {sets} WHERE id = $1 RETURNING *",
            uuid.UUID(amenity_id), *values,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Amenidad no encontrada")
    return serialize_category(row)


@api_router.delete("/admin/amenities/{amenity_id}")
async def admin_delete_amenity(amenity_id: str, admin=Depends(require_admin)):
    """
    Al eliminar una amenidad también se quita de todos los negocios que la
    tuvieran, porque `businesses.amenities` es un arreglo sin llave foránea
    y quedarían referencias huérfanas.
    """
    async with db_pool.acquire() as conn:
        amenity = await conn.fetchrow(
            "SELECT * FROM amenities WHERE id = $1", uuid.UUID(amenity_id)
        )
        if not amenity:
            raise HTTPException(status_code=404, detail="Amenidad no encontrada")

        async with conn.transaction():
            afectados = await conn.fetchval(
                "SELECT COUNT(*) FROM businesses WHERE $1 = ANY(amenities)", amenity['slug']
            )
            await conn.execute(
                "UPDATE businesses SET amenities = array_remove(amenities, $1) "
                "WHERE $1 = ANY(amenities)",
                amenity['slug'],
            )
            await conn.execute("DELETE FROM amenities WHERE id = $1", uuid.UUID(amenity_id))

    return {"message": "Amenidad eliminada", "negocios_actualizados": afectados}


# ==================== ADMIN: USUARIOS ====================


@api_router.get("/admin/users")
async def admin_get_users(admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at,
                      b.id AS business_id, b.name AS business_name
               FROM users u
               LEFT JOIN businesses b ON b.owner_id = u.id
               ORDER BY u.created_at DESC"""
        )
    return [
        dict(r) | {
            'id': str(r['id']),
            'business_id': str(r['business_id']) if r['business_id'] else None,
            'is_admin': r['role'] == ROLE_ADMIN,
            'created_at': r['created_at'].isoformat(),
        }
        for r in rows
    ]


@api_router.patch("/admin/users/{user_id}/role")
async def admin_update_user_role(user_id: str, payload: RoleUpdate, admin=Depends(require_admin)):
    target = uuid.UUID(user_id)
    if target == admin['id'] and payload.role != ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="No puedes quitarte tu propio rol de administrador")

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET role = $2 WHERE id = $1 RETURNING id, full_name, role",
            target, payload.role,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"id": str(row['id']), "full_name": row['full_name'], "role": row['role']}


@api_router.patch("/admin/users/{user_id}/toggle")
async def admin_toggle_user(user_id: str, admin=Depends(require_admin)):
    target = uuid.UUID(user_id)
    if target == admin['id']:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET is_active = NOT is_active WHERE id = $1 "
            "RETURNING id, full_name, is_active",
            target,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"id": str(row['id']), "full_name": row['full_name'], "is_active": row['is_active']}


# ==================== ADMIN: ESTADÍSTICAS ====================


@api_router.get("/admin/stats")
async def admin_get_stats(admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        total_businesses = await conn.fetchval("SELECT COUNT(*) FROM businesses")
        active_businesses = await conn.fetchval(
            "SELECT COUNT(*) FROM businesses WHERE is_active = TRUE"
        )
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users")
        total_owners = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE role = $1", ROLE_OWNER
        )
        total_categories = await conn.fetchval(
            "SELECT COUNT(*) FROM categories WHERE is_active = TRUE"
        )
        total_banners = await conn.fetchval("SELECT COUNT(*) FROM banners WHERE active = TRUE")
        types = await conn.fetch("SELECT type, COUNT(*) AS count FROM businesses GROUP BY type")

    return {
        "total_businesses": total_businesses,
        "active_businesses": active_businesses,
        "total_users": total_users,
        "total_owners": total_owners,
        "total_categories": total_categories,
        "total_banners": total_banners,
        "business_by_type": {r['type']: r['count'] for r in types},
    }


# ==================== ADMIN: BANNERS ====================


@api_router.get("/admin/banners")
async def admin_list_banners(admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM banners ORDER BY display_order ASC")
    return [serialize_banner(r) for r in rows]


@api_router.post("/admin/banners")
async def admin_create_banner(banner: BannerCreate, admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO banners (image, title, link, active, display_order)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            banner.image, banner.title, banner.link, banner.active, banner.display_order,
        )
    return serialize_banner(row)


@api_router.put("/admin/banners/{banner_id}")
async def admin_update_banner(banner_id: str, banner: BannerUpdate, admin=Depends(require_admin)):
    update_data = banner.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    sets, values = build_update_clause(update_data)
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE banners SET {sets} WHERE id = $1 RETURNING *",
            uuid.UUID(banner_id), *values,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Banner no encontrado")
    return serialize_banner(row)


@api_router.delete("/admin/banners/{banner_id}")
async def admin_delete_banner(banner_id: str, admin=Depends(require_admin)):
    async with db_pool.acquire() as conn:
        result = await conn.execute("DELETE FROM banners WHERE id = $1", uuid.UUID(banner_id))
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Banner no encontrado")
    return {"message": "Banner eliminado exitosamente"}


# ==================== FASE 2: AUTO-REGISTRO DE NEGOCIOS ====================
# Listo para encenderse con ALLOW_BUSINESS_SELF_REGISTRATION=true en el .env.
# Un usuario registra su propio negocio, que nace INACTIVO hasta que el admin
# lo apruebe desde el panel con el toggle que ya existe.


@api_router.post("/business/register")
async def self_register_business(business: BusinessCreate, current_user=Depends(get_current_user)):
    if not ALLOW_BUSINESS_SELF_REGISTRATION:
        raise HTTPException(
            status_code=403,
            detail="El registro de negocios por cuenta propia está deshabilitado. "
                   "Contacta al administrador para dar de alta tu negocio.",
        )

    async with db_pool.acquire() as conn:
        await assert_category_exists(conn, business.type)
        if await conn.fetchrow("SELECT id FROM businesses WHERE owner_id = $1", current_user['id']):
            raise HTTPException(status_code=400, detail="Ya tienes un negocio registrado")

        row = await conn.fetchrow(
            """INSERT INTO businesses (name, type, description, logo, address, phone, hours,
               latitude, longitude, rating, images, website, owner_id, is_active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, FALSE) RETURNING *""",
            business.name, business.type, business.description, business.logo,
            business.address, business.phone, business.hours, business.latitude,
            business.longitude, business.rating, business.images, business.website,
            current_user['id'],
        )
        await conn.execute(
            "UPDATE users SET role = $1 WHERE id = $2 AND role <> $3",
            ROLE_OWNER, current_user['id'], ROLE_ADMIN,
        )

    return serialize_business(row) | {
        "message": "Negocio registrado. Quedará visible cuando el administrador lo apruebe."
    }


# ==================== APP SETUP ====================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
