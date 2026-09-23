"""
Pruebas de horarios por día, galería de imágenes y amenidades.

Requiere la base con migration_001 y migration_002 aplicadas.
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

HORARIO_OK = [
    {"day": 0, "closed": False, "open": "09:00", "close": "18:00"},
    {"day": 1, "closed": False, "open": "09:00", "close": "18:00"},
    {"day": 2, "closed": False, "open": "09:00", "close": "18:00"},
    {"day": 3, "closed": False, "open": "09:00", "close": "18:00"},
    {"day": 4, "closed": False, "open": "09:00", "close": "22:00"},
    {"day": 5, "closed": False, "open": "10:00", "close": "23:00"},
    {"day": 6, "closed": True,  "open": None,    "close": None},
]


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def seed_passwords():
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


def auth(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def crear_negocio(client, headers, **extra):
    payload = {
        "name": f"Negocio {uuid.uuid4().hex[:6]}", "type": "cafe",
        "description": "Un negocio creado por las pruebas automáticas",
        "address": "Calle de prueba 1", "latitude": 18.92, "longitude": -99.23,
    }
    payload.update(extra)
    return client.post("/api/admin/businesses", json=payload, headers=headers)


# ---------------------------------------------------------------- amenidades


def test_catalogo_publico_de_amenidades(client):
    r = client.get("/api/amenities")
    assert r.status_code == 200
    slugs = [a["slug"] for a in r.json()]
    for esperado in ["wifi", "delivery", "invoicing", "parking",
                     "pet_friendly", "card_payment", "transfer_payment"]:
        assert esperado in slugs, f"falta la amenidad {esperado}"


def test_amenidades_tienen_icono_y_etiqueta(client):
    for a in client.get("/api/amenities").json():
        assert a["label"] and a["icon"], f"amenidad incompleta: {a}"


def test_negocio_guarda_amenidades(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, amenities=["wifi", "parking", "card_payment"])
    assert r.status_code == 200, r.text
    assert set(r.json()["amenities"]) == {"wifi", "parking", "card_payment"}


def test_amenidad_inexistente_rechazada(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, amenities=["wifi", "no_existe"])
    assert r.status_code == 400
    assert "no_existe" in r.json()["detail"]


def test_amenidades_repetidas_se_deduplican(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, amenities=["wifi", "wifi", "parking"])
    assert r.status_code == 200
    assert sorted(r.json()["amenities"]) == ["parking", "wifi"]


def test_admin_crud_amenidades(client):
    h = auth(client, ADMIN_EMAIL)
    slug = f"prueba_{uuid.uuid4().hex[:6]}"

    r = client.post("/api/admin/amenities",
                    json={"slug": slug, "label": "Terraza", "icon": "Sparkles"}, headers=h)
    assert r.status_code == 200, r.text
    aid = r.json()["id"]

    r = client.put(f"/api/admin/amenities/{aid}", json={"label": "Terraza techada"}, headers=h)
    assert r.json()["label"] == "Terraza techada"

    assert client.delete(f"/api/admin/amenities/{aid}", headers=h).status_code == 200


def test_borrar_amenidad_la_quita_de_los_negocios(client):
    """El caso delicado: `amenities` es un arreglo sin FK, así que borrar
    del catálogo debe limpiar también las referencias en los negocios."""
    h = auth(client, ADMIN_EMAIL)
    slug = f"temporal_{uuid.uuid4().hex[:6]}"

    aid = client.post("/api/admin/amenities",
                      json={"slug": slug, "label": "Temporal"}, headers=h).json()["id"]
    biz = crear_negocio(client, h, amenities=[slug, "wifi"]).json()
    assert slug in biz["amenities"]

    r = client.delete(f"/api/admin/amenities/{aid}", headers=h)
    assert r.status_code == 200
    assert r.json()["negocios_actualizados"] >= 1

    despues = client.get(f"/api/businesses/{biz['id']}").json()
    assert slug not in despues["amenities"], "quedó una referencia huérfana"
    assert "wifi" in despues["amenities"], "se borraron amenidades de más"


def test_amenidad_slug_duplicado_rechazado(client):
    h = auth(client, ADMIN_EMAIL)
    r = client.post("/api/admin/amenities",
                    json={"slug": "wifi", "label": "Otro wifi"}, headers=h)
    assert r.status_code == 400


# ---------------------------------------------------------------- horarios


def test_negocio_guarda_horario_por_dia(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, hours_schedule=HORARIO_OK)
    assert r.status_code == 200, r.text
    horario = r.json()["hours_schedule"]
    assert len(horario) == 7
    assert horario[6]["closed"] is True
    assert horario[5]["open"] == "10:00"


def test_horario_se_devuelve_ordenado(client):
    h = auth(client, ADMIN_EMAIL)
    revuelto = list(reversed(HORARIO_OK))
    r = crear_negocio(client, h, hours_schedule=revuelto)
    dias = [d["day"] for d in r.json()["hours_schedule"]]
    assert dias == sorted(dias), "el horario debe salir de lunes a domingo"


def test_horario_rechaza_dia_repetido(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, hours_schedule=[
        {"day": 0, "closed": False, "open": "09:00", "close": "18:00"},
        {"day": 0, "closed": False, "open": "10:00", "close": "19:00"},
    ])
    assert r.status_code == 400
    assert "Lunes" in r.json()["detail"]


def test_horario_rechaza_abierto_sin_horas(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, hours_schedule=[
        {"day": 0, "closed": False, "open": None, "close": None},
    ])
    assert r.status_code == 400


def test_horario_rechaza_formato_invalido(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, hours_schedule=[
        {"day": 0, "closed": False, "open": "25:99", "close": "18:00"},
    ])
    assert r.status_code == 422


def test_horario_permite_cierre_de_madrugada(client):
    """22:00 a 02:00 es un negocio nocturno, no un error."""
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, hours_schedule=[
        {"day": 4, "closed": False, "open": "22:00", "close": "02:00"},
    ])
    assert r.status_code == 200, r.text


def test_dia_fuera_de_rango_rechazado(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, hours_schedule=[
        {"day": 7, "closed": False, "open": "09:00", "close": "18:00"},
    ])
    assert r.status_code == 422


# ---------------------------------------------------------------- imágenes


def test_galeria_acepta_cinco_imagenes(client):
    h = auth(client, ADMIN_EMAIL)
    urls = [f"https://ejemplo.com/f{i}.jpg" for i in range(5)]
    r = crear_negocio(client, h, images=urls)
    assert r.status_code == 200, r.text
    assert len(r.json()["images"]) == 5


def test_galeria_rechaza_mas_de_cinco(client):
    h = auth(client, ADMIN_EMAIL)
    urls = [f"https://ejemplo.com/f{i}.jpg" for i in range(6)]
    r = crear_negocio(client, h, images=urls)
    assert r.status_code == 400
    assert "Máximo 5" in r.json()["detail"]


def test_galeria_ignora_cadenas_vacias(client):
    h = auth(client, ADMIN_EMAIL)
    r = crear_negocio(client, h, images=["https://ejemplo.com/a.jpg", "", "   "])
    assert r.status_code == 200
    assert r.json()["images"] == ["https://ejemplo.com/a.jpg"]


def test_galeria_conserva_el_orden(client):
    h = auth(client, ADMIN_EMAIL)
    urls = ["https://ejemplo.com/z.jpg", "https://ejemplo.com/a.jpg", "https://ejemplo.com/m.jpg"]
    r = crear_negocio(client, h, images=urls)
    assert r.json()["images"] == urls, "el orden define cuál es la foto principal"


# ---------------------------------------------------------------- dueño


def test_dueno_edita_horario_galeria_y_amenidades(client):
    h = auth(client, OWNER_EMAIL)
    r = client.put("/api/me/business", json={
        "hours_schedule": HORARIO_OK,
        "images": ["https://ejemplo.com/mi-local.jpg"],
        "amenities": ["wifi", "pet_friendly"],
    }, headers=h)
    assert r.status_code == 200, r.text
    assert len(r.json()["hours_schedule"]) == 7
    assert set(r.json()["amenities"]) == {"wifi", "pet_friendly"}


def test_dueno_tambien_limitado_a_cinco_imagenes(client):
    h = auth(client, OWNER_EMAIL)
    r = client.put("/api/me/business", json={
        "images": [f"https://ejemplo.com/{i}.jpg" for i in range(6)],
    }, headers=h)
    assert r.status_code == 400


def test_dueno_no_puede_inventar_amenidades(client):
    h = auth(client, OWNER_EMAIL)
    r = client.put("/api/me/business", json={"amenities": ["inventada"]}, headers=h)
    assert r.status_code == 400


# ---------------------------------------------------------------- listado


def test_listado_publico_incluye_los_campos_nuevos(client):
    negocios = client.get("/api/businesses").json()
    assert negocios, "debe haber negocios"
    for b in negocios:
        assert "amenities" in b
        assert "hours_schedule" in b
        assert "images" in b
