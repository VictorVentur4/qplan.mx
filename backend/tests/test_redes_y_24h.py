"""
Pruebas de las redes sociales y del horario de 24 horas.

Corren contra PostgreSQL de verdad, igual que el resto de la suite:

    set -a && . ./.env && set +a
    python -m pytest backend/tests/test_redes_y_24h.py -v
"""

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend import server  # noqa: E402
from backend.server import (  # noqa: E402
    normalize_instagram, normalize_facebook, normalize_whatsapp,
)
from fastapi import HTTPException  # noqa: E402

ADMIN_EMAIL = "admin@qplan.mx"
OWNER_EMAIL = "cafe@qplan.mx"
PASSWORD = "qplan1234"


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


def auth_header(client, email=ADMIN_EMAIL):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def nuevo_negocio(**extra):
    base = {
        "name": f"Negocio {uuid.uuid4().hex[:6]}",
        "type": "cafe",
        "description": "Un negocio de prueba con descripción suficientemente larga.",
        "address": "Calle de prueba 1",
        "latitude": 18.92,
        "longitude": -99.23,
    }
    base.update(extra)
    return base


# ------------------------------------------------- normalización (sin red)


@pytest.mark.parametrize("entrada,esperado", [
    ("@cafecentral", "cafecentral"),
    ("cafecentral", "cafecentral"),
    ("https://www.instagram.com/cafecentral/", "cafecentral"),
    ("https://instagram.com/cafe.central_mx?hl=es", "cafe.central_mx"),
    ("   ", None),
    (None, None),
])
def test_normaliza_instagram(entrada, esperado):
    assert normalize_instagram(entrada) == esperado


@pytest.mark.parametrize("entrada,esperado", [
    ("CafeCentral", "CafeCentral"),
    ("https://www.facebook.com/CafeCentralCuernavaca/", "CafeCentralCuernavaca"),
    ("facebook.com/CafeCentral/photos", "CafeCentral"),
    ("fb.com/mi-negocio", "mi-negocio"),
    ("facebook.com/profile.php?id=61550123456789", "profile.php?id=61550123456789"),
])
def test_normaliza_facebook(entrada, esperado):
    assert normalize_facebook(entrada) == esperado


@pytest.mark.parametrize("entrada,esperado", [
    ("7771234567", "527771234567"),          # 10 dígitos: se le pone la lada 52
    ("+52 777 123 4567", "527771234567"),
    ("(777) 123-4567", "527771234567"),
    ("https://wa.me/527771234567", "527771234567"),
    ("+1 415 555 0123", "14155550123"),      # otro país: se respeta
])
def test_normaliza_whatsapp(entrada, esperado):
    assert normalize_whatsapp(entrada) == esperado


@pytest.mark.parametrize("fn,entrada", [
    (normalize_instagram, "usuario con espacios"),
    (normalize_instagram, "a" * 40),
    (normalize_whatsapp, "123"),
    (normalize_whatsapp, "9" * 20),
])
def test_rechaza_redes_invalidas(fn, entrada):
    with pytest.raises(HTTPException) as e:
        fn(entrada)
    assert e.value.status_code == 400


# ------------------------------------------------------------- por la API


def test_crea_negocio_con_redes_y_las_guarda_normalizadas(client):
    h = auth_header(client)
    r = client.post("/api/admin/businesses", headers=h, json=nuevo_negocio(
        instagram="https://www.instagram.com/mi.cafecito/",
        facebook="facebook.com/MiCafecito",
        whatsapp="777 987 6543",
    ))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["instagram"] == "mi.cafecito"
    assert b["facebook"] == "MiCafecito"
    assert b["whatsapp"] == "527779876543"


def test_negocio_sin_redes_las_devuelve_nulas(client):
    h = auth_header(client)
    r = client.post("/api/admin/businesses", headers=h, json=nuevo_negocio())
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["instagram"] is None
    assert b["facebook"] is None
    assert b["whatsapp"] is None


def test_red_vacia_se_guarda_como_nula_no_como_cadena(client):
    """Una cadena vacía desde el formulario no debe guardarse como "" ."""
    h = auth_header(client)
    r = client.post("/api/admin/businesses", headers=h, json=nuevo_negocio(
        instagram="", facebook="   ", whatsapp="",
    ))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["instagram"] is None and b["facebook"] is None and b["whatsapp"] is None


def test_rechaza_whatsapp_invalido_por_la_api(client):
    h = auth_header(client)
    r = client.post("/api/admin/businesses", headers=h, json=nuevo_negocio(whatsapp="12"))
    assert r.status_code == 400
    assert "WhatsApp" in r.json()["detail"]


def test_editar_puede_borrar_una_red(client):
    h = auth_header(client)
    creado = client.post("/api/admin/businesses", headers=h,
                         json=nuevo_negocio(instagram="algo")).json()
    r = client.put(f"/api/admin/businesses/{creado['id']}", headers=h,
                   json={"instagram": ""})
    assert r.status_code == 200, r.text
    assert r.json()["instagram"] is None


def test_las_redes_salen_en_el_listado_publico(client):
    h = auth_header(client)
    creado = client.post("/api/admin/businesses", headers=h, json=nuevo_negocio(
        whatsapp="7771112233")).json()
    r = client.get("/api/businesses")
    assert r.status_code == 200
    encontrado = next(b for b in r.json() if b["id"] == creado["id"])
    assert encontrado["whatsapp"] == "527771112233"


# --------------------------------------------------------- horario 24 horas


def horario_24x7():
    return [{"day": d, "closed": False, "all_day": True} for d in range(7)]


def test_guarda_negocio_abierto_24_horas(client):
    h = auth_header(client)
    r = client.post("/api/admin/businesses", headers=h,
                    json=nuevo_negocio(hours_schedule=horario_24x7()))
    assert r.status_code == 200, r.text
    dias = r.json()["hours_schedule"]
    assert len(dias) == 7
    assert all(d["all_day"] and not d["closed"] for d in dias)


def test_el_dia_de_24_horas_no_guarda_rango(client):
    """Si viene all_day, las horas sueltas se descartan: la base no se contradice."""
    h = auth_header(client)
    horario = [{"day": 0, "closed": False, "all_day": True, "open": "09:00", "close": "18:00"}]
    horario += [{"day": d, "closed": True} for d in range(1, 7)]
    r = client.post("/api/admin/businesses", headers=h,
                    json=nuevo_negocio(hours_schedule=horario))
    assert r.status_code == 200, r.text
    lunes = r.json()["hours_schedule"][0]
    assert lunes["all_day"] is True
    assert lunes["open"] is None and lunes["close"] is None


def test_dia_cerrado_gana_sobre_24_horas(client):
    h = auth_header(client)
    horario = [{"day": 0, "closed": True, "all_day": True}]
    horario += [{"day": d, "closed": True} for d in range(1, 7)]
    r = client.post("/api/admin/businesses", headers=h,
                    json=nuevo_negocio(hours_schedule=horario))
    assert r.status_code == 200, r.text
    lunes = r.json()["hours_schedule"][0]
    assert lunes["closed"] is True and lunes["all_day"] is False


def test_se_puede_mezclar_24_horas_con_dias_normales(client):
    h = auth_header(client)
    horario = [
        {"day": 0, "closed": False, "all_day": False, "open": "09:00", "close": "18:00"},
        {"day": 1, "closed": False, "all_day": True},
        {"day": 2, "closed": True},
    ] + [{"day": d, "closed": True} for d in range(3, 7)]
    r = client.post("/api/admin/businesses", headers=h,
                    json=nuevo_negocio(hours_schedule=horario))
    assert r.status_code == 200, r.text
    dias = r.json()["hours_schedule"]
    assert dias[0]["open"] == "09:00" and not dias[0]["all_day"]
    assert dias[1]["all_day"] is True
    assert dias[2]["closed"] is True


def test_dia_abierto_sin_horas_y_sin_24h_sigue_siendo_error(client):
    h = auth_header(client)
    horario = [{"day": 0, "closed": False, "all_day": False}]
    horario += [{"day": d, "closed": True} for d in range(1, 7)]
    r = client.post("/api/admin/businesses", headers=h,
                    json=nuevo_negocio(hours_schedule=horario))
    assert r.status_code == 400
    assert "24 horas" in r.json()["detail"]


def test_horario_sin_all_day_sigue_funcionando(client):
    """Compatibilidad: los negocios viejos no mandan la llave all_day."""
    h = auth_header(client)
    horario = [{"day": 0, "closed": False, "open": "08:00", "close": "20:00"}]
    horario += [{"day": d, "closed": True} for d in range(1, 7)]
    r = client.post("/api/admin/businesses", headers=h,
                    json=nuevo_negocio(hours_schedule=horario))
    assert r.status_code == 200, r.text
    assert r.json()["hours_schedule"][0]["all_day"] is False


# ------------------------------------------------------------ como dueño


def test_el_dueno_puede_editar_sus_redes_y_su_horario(client):
    h = auth_header(client, OWNER_EMAIL)
    r = client.put("/api/me/business", headers=h, json={
        "instagram": "@micafe", "whatsapp": "7775554433",
        "hours_schedule": horario_24x7(),
    })
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["instagram"] == "micafe"
    assert b["whatsapp"] == "527775554433"
    assert all(d["all_day"] for d in b["hours_schedule"])
