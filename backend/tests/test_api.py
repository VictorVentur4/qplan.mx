"""
Pruebas de integración de la API de Qplan contra un PostgreSQL real.

Uso:
    createdb qplan_test
    psql -d qplan_test -f backend/sql/schema.sql
    DATABASE_URL=postgresql://.../qplan_test DB_SSL=disable pytest backend/tests/ -v
"""

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient
from passlib.context import CryptContext

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server  # noqa: E402

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_EMAIL = "admin@qplan.mx"
OWNER_EMAIL = "cafe@qplan.mx"
PASSWORD = "qplan1234"


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def seed_passwords():
    """
    Pone contraseñas conocidas a los usuarios sembrados.

    Usa una conexión propia en su propio event loop: el pool de la app
    pertenece al loop del TestClient y no se puede reutilizar desde aquí.
    """
    import asyncio
    import asyncpg

    async def _seed():
        conn = await asyncpg.connect(os.environ['DATABASE_URL'], ssl=None)
        try:
            await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE email = ANY($2::text[])",
                pwd_context.hash(PASSWORD), [ADMIN_EMAIL, OWNER_EMAIL],
            )
        finally:
            await conn.close()

    asyncio.run(_seed())


def unique_user():
    """Genera datos de alta únicos. El teléfono debe ser solo dígitos."""
    suf = uuid.uuid4().hex[:8]
    digits = str(uuid.uuid4().int)[:8]
    return f"u{suf}@qplan.mx", f"55{digits}"


def auth_header(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------- públicas


def test_root(client):
    assert client.get("/api/").status_code == 200


def test_categories_solo_activas(client):
    r = client.get("/api/categories")
    assert r.status_code == 200
    slugs = [c["slug"] for c in r.json()]
    assert "cafe" in slugs
    assert "municipality" not in slugs, "las categorías inactivas no deben salir"


def test_businesses_sin_filtro_devuelve_todos(client):
    r = client.get("/api/businesses")
    assert r.status_code == 200
    assert len(r.json()) >= 2, "sin parámetro type debe devolver todos los negocios"


def test_businesses_filtra_por_categoria(client):
    r = client.get("/api/businesses", params={"type": "cafe"})
    assert r.status_code == 200
    assert all(b["type"] == "cafe" for b in r.json())


def test_businesses_calcula_distancia_y_ordena(client):
    r = client.get("/api/businesses", params={"lat": 18.92, "lng": -99.23, "radius": 50})
    body = r.json()
    assert all("distance" in b for b in body)
    assert body == sorted(body, key=lambda b: b["distance"])


def test_municipios_y_qr_ya_no_existen(client):
    assert client.get("/api/municipalities").status_code == 404
    assert client.get(f"/api/scan/{uuid.uuid4()}").status_code == 404


# ---------------------------------------------------------------- auth


def test_registro_crea_rol_user(client):
    email, phone = unique_user()
    r = client.post("/api/auth/register", json={
        "full_name": "Nuevo Usuario", "email": email,
        "phone": phone, "password": PASSWORD, "confirm_password": PASSWORD,
    })
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "user"
    assert r.json()["user"]["is_admin"] is False


def test_registro_rechaza_password_no_coincide(client):
    email, phone = unique_user()
    r = client.post("/api/auth/register", json={
        "full_name": "Malo", "email": email, "phone": phone,
        "password": PASSWORD, "confirm_password": "otracosa",
    })
    assert r.status_code == 422


def test_login_invalido(client):
    r = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "malo"})
    assert r.status_code == 401


# ---------------------------------------------------------------- permisos


def test_admin_requiere_token(client):
    assert client.get("/api/admin/businesses").status_code == 403


def test_usuario_normal_no_entra_a_admin(client):
    email, phone = unique_user()
    client.post("/api/auth/register", json={
        "full_name": "Plano", "email": email, "phone": phone,
        "password": PASSWORD, "confirm_password": PASSWORD,
    })
    h = auth_header(client, email)
    assert client.get("/api/admin/businesses", headers=h).status_code == 403
    assert client.get("/api/me/business", headers=h).status_code == 403


# ---------------------------------------------------------------- dueño


def test_dueno_ve_solo_su_negocio(client):
    h = auth_header(client, OWNER_EMAIL)
    r = client.get("/api/me/business", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Cafe Central"


def test_dueno_edita_su_negocio(client):
    h = auth_header(client, OWNER_EMAIL)
    r = client.put("/api/me/business", json={"description": "Descripción actualizada por el dueño"},
                   headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["description"] == "Descripción actualizada por el dueño"


def test_dueno_no_puede_reasignar_ni_reactivar(client):
    """owner_id e is_active no están en OwnBusinessUpdate: se ignoran silenciosamente."""
    h = auth_header(client, OWNER_EMAIL)
    antes = client.get("/api/me/business", headers=h).json()
    client.put("/api/me/business",
               json={"owner_id": str(uuid.uuid4()), "is_active": False}, headers=h)
    despues = client.get("/api/me/business", headers=h).json()
    assert despues["owner_id"] == antes["owner_id"]
    assert despues["is_active"] == antes["is_active"]


def test_dueno_no_puede_usar_categoria_inexistente(client):
    h = auth_header(client, OWNER_EMAIL)
    r = client.put("/api/me/business", json={"type": "no_existe"}, headers=h)
    assert r.status_code == 400


# ---------------------------------------------------------------- admin


def test_admin_ve_todos_incluidos_inactivos(client):
    h = auth_header(client, ADMIN_EMAIL)
    r = client.get("/api/admin/businesses", headers=h)
    assert r.status_code == 200
    assert len(r.json()) >= 3, "el admin debe ver también los inactivos"


def test_admin_filtra_por_categoria(client):
    h = auth_header(client, ADMIN_EMAIL)
    r = client.get("/api/admin/businesses", params={"type": "restaurant"}, headers=h)
    assert all(b["type"] == "restaurant" for b in r.json())


def test_admin_desactiva_y_reactiva(client):
    h = auth_header(client, ADMIN_EMAIL)
    biz = client.get("/api/admin/businesses", headers=h).json()[0]
    r = client.patch(f"/api/admin/businesses/{biz['id']}/toggle", headers=h)
    assert r.json()["is_active"] is not biz["is_active"]
    client.patch(f"/api/admin/businesses/{biz['id']}/toggle", headers=h)  # restaurar


def test_admin_crea_negocio_y_promueve_al_dueno(client):
    h = auth_header(client, ADMIN_EMAIL)
    email, phone = unique_user()
    nuevo = client.post("/api/auth/register", json={
        "full_name": "Futuro Dueño", "email": email, "phone": phone,
        "password": PASSWORD, "confirm_password": PASSWORD,
    }).json()["user"]
    assert nuevo["role"] == "user"

    r = client.post("/api/admin/businesses", json={
        "name": "Hotel Prueba", "type": "hotel",
        "description": "Un hotel de prueba para la suite", "address": "Calle 1",
        "latitude": 18.9, "longitude": -99.2, "owner_id": nuevo["id"],
    }, headers=h)
    assert r.status_code == 200, r.text

    # asignar un negocio debe promover al usuario a business_owner
    yo = client.get("/api/auth/me", headers=auth_header(client, email)).json()
    assert yo["role"] == "business_owner"
    assert yo["business_id"] == r.json()["id"]


def test_admin_no_asigna_dos_negocios_al_mismo_dueno(client):
    h = auth_header(client, ADMIN_EMAIL)
    owner = client.get("/api/admin/users", headers=h).json()
    con_negocio = next(u for u in owner if u["business_id"])
    r = client.post("/api/admin/businesses", json={
        "name": "Segundo Negocio", "type": "cafe",
        "description": "No debería poder crearse nunca", "address": "Calle 2",
        "latitude": 18.9, "longitude": -99.2, "owner_id": con_negocio["id"],
    }, headers=h)
    assert r.status_code == 400


def test_admin_rechaza_categoria_inexistente(client):
    h = auth_header(client, ADMIN_EMAIL)
    r = client.post("/api/admin/businesses", json={
        "name": "Fantasma", "type": "inventada",
        "description": "Categoría que no existe en el catálogo", "address": "X",
        "latitude": 1.0, "longitude": 1.0,
    }, headers=h)
    assert r.status_code == 400


# ---------------------------------------------------------------- categorías


def test_admin_crud_categorias(client):
    h = auth_header(client, ADMIN_EMAIL)
    slug = f"prueba_{uuid.uuid4().hex[:6]}"

    r = client.post("/api/admin/categories",
                    json={"slug": slug, "label": "Prueba", "icon": "Store"}, headers=h)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    r = client.put(f"/api/admin/categories/{cid}", json={"label": "Renombrada"}, headers=h)
    assert r.json()["label"] == "Renombrada"

    assert client.delete(f"/api/admin/categories/{cid}", headers=h).status_code == 200


def test_no_se_borra_categoria_en_uso(client):
    h = auth_header(client, ADMIN_EMAIL)
    cafe = next(c for c in client.get("/api/admin/categories", headers=h).json()
                if c["slug"] == "cafe")
    r = client.delete(f"/api/admin/categories/{cafe['id']}", headers=h)
    assert r.status_code == 409, "debe proteger las categorías con negocios"


def test_slug_duplicado_rechazado(client):
    h = auth_header(client, ADMIN_EMAIL)
    r = client.post("/api/admin/categories",
                    json={"slug": "cafe", "label": "Otra vez", "icon": "Coffee"}, headers=h)
    assert r.status_code == 400


# ---------------------------------------------------------------- otros


def test_stats_sin_municipios_ni_qr(client):
    h = auth_header(client, ADMIN_EMAIL)
    s = client.get("/api/admin/stats", headers=h).json()
    assert "total_municipalities" not in s
    assert "total_qrs" not in s
    assert s["total_businesses"] > 0


def test_autoregistro_apagado_por_defecto(client):
    h = auth_header(client, OWNER_EMAIL)
    r = client.post("/api/business/register", json={
        "name": "Auto", "type": "cafe", "description": "Registro por cuenta propia",
        "address": "X", "latitude": 1.0, "longitude": 1.0,
    }, headers=h)
    assert r.status_code == 403
