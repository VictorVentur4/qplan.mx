"""
Pruebas del radio de búsqueda que elige el usuario final.

    set -a && . ./.env && set +a
    python -m pytest backend/tests/test_radio.py -v
"""

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend import server  # noqa: E402
from backend.server import RADIO_POR_DEFECTO, RADIO_MAXIMO  # noqa: E402

ADMIN_EMAIL = "admin@qplan.mx"
PASSWORD = "qplan1234"

# Punto de referencia: el centro de Cuernavaca.
LAT, LNG = 18.9200, -99.2300

# Un grado de latitud son ~111.19 km, así que para separar N km hacia el norte
# basta sumar N/111.19 grados. Se usa latitud (no longitud) porque el meridiano
# no se encoge con la latitud y la cuenta es exacta.
KM_POR_GRADO_LAT = 111.19


def a_km_al_norte(km):
    return LAT + km / KM_POR_GRADO_LAT, LNG


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


def auth_header(client):
    r = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def escalera(client):
    """
    Crea un negocio a 0.5, 3, 7, 12, 17 y 25 km del punto de referencia.
    Devuelve {km: id} para poder afirmar exactamente cuáles deben salir.
    """
    h = auth_header(client)
    creados = {}
    for km in (0.5, 3, 7, 12, 17, 25):
        lat, lng = a_km_al_norte(km)
        r = client.post("/api/admin/businesses", headers=h, json={
            "name": f"Radio {km}km {uuid.uuid4().hex[:6]}",
            "type": "cafe",
            "description": "Negocio sembrado para probar el filtro por distancia.",
            "address": f"A {km} km del centro",
            "latitude": lat, "longitude": lng,
        })
        assert r.status_code == 200, r.text
        creados[km] = r.json()["id"]
    return creados


def consultar(client, radius=None):
    params = {"lat": LAT, "lng": LNG}
    if radius is not None:
        params["radius"] = radius
    r = client.get("/api/businesses", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def ids(negocios):
    return {b["id"] for b in negocios}


# ------------------------------------------------------------------ límites


def test_el_radio_por_defecto_es_cinco_km(client, escalera):
    """Sin pedir radio explícito se usan 5 km."""
    salen = ids(consultar(client))
    assert escalera[0.5] in salen
    assert escalera[3] in salen
    assert escalera[7] not in salen, "7 km no debe caber en el radio por defecto"
    assert RADIO_POR_DEFECTO == 5


@pytest.mark.parametrize("radio,dentro,fuera", [
    (1,  [0.5],                    [3, 7, 12, 17, 25]),
    (5,  [0.5, 3],                 [7, 12, 17, 25]),
    (10, [0.5, 3, 7],              [12, 17, 25]),
    (15, [0.5, 3, 7, 12],          [17, 25]),
    (20, [0.5, 3, 7, 12, 17],      [25]),
])
def test_cada_opcion_del_selector_filtra_bien(client, escalera, radio, dentro, fuera):
    salen = ids(consultar(client, radio))
    for km in dentro:
        assert escalera[km] in salen, f"a {km} km debería entrar con radio {radio}"
    for km in fuera:
        assert escalera[km] not in salen, f"a {km} km NO debería entrar con radio {radio}"


def test_el_maximo_se_respeta_aunque_pidan_mas(client, escalera):
    """
    Pedir 100 km no abre la búsqueda: se recorta al tope. El negocio a 25 km
    sigue fuera.
    """
    salen = ids(consultar(client, 100))
    assert escalera[17] in salen
    assert escalera[25] not in salen, "el tope de 20 km debe imponerse siempre"
    assert RADIO_MAXIMO == 20


def test_pedir_de_mas_no_da_error(client, escalera):
    """
    Se recorta en silencio en vez de rechazar: un frontend viejo en caché
    pidiendo 50 km debe seguir viendo negocios, no una pantalla vacía.
    """
    r = client.get("/api/businesses", params={"lat": LAT, "lng": LNG, "radius": 50})
    assert r.status_code == 200


def test_radio_cero_o_negativo_se_rechaza(client):
    for malo in (0, -5):
        r = client.get("/api/businesses", params={"lat": LAT, "lng": LNG, "radius": malo})
        assert r.status_code == 422, f"radius={malo} debería ser inválido"


# ------------------------------------------------------------ comportamiento


def test_los_resultados_vienen_ordenados_por_cercania(client, escalera):
    negocios = consultar(client, 20)
    distancias = [b["distance"] for b in negocios]
    assert distancias == sorted(distancias)


def test_cada_negocio_trae_su_distancia(client, escalera):
    for b in consultar(client, 20):
        assert isinstance(b["distance"], (int, float))
        assert b["distance"] <= 20


def test_sin_coordenadas_el_radio_no_aplica(client, escalera):
    """Sin lat/lng no hay desde dónde medir: se devuelven todos."""
    r = client.get("/api/businesses", params={"radius": 1})
    assert r.status_code == 200
    salen = ids(r.json())
    assert escalera[25] in salen, "sin ubicación no debe filtrarse por distancia"


def test_el_radio_convive_con_el_filtro_de_categoria(client, escalera):
    h = auth_header(client)
    lat, lng = a_km_al_norte(2)
    otro = client.post("/api/admin/businesses", headers=h, json={
        "name": f"Restaurante cercano {uuid.uuid4().hex[:6]}",
        "type": "restaurant",
        "description": "Para comprobar que categoría y distancia se combinan.",
        "address": "A 2 km", "latitude": lat, "longitude": lng,
    }).json()

    r = client.get("/api/businesses",
                   params={"lat": LAT, "lng": LNG, "radius": 5, "type": "restaurant"})
    assert r.status_code == 200
    salen = ids(r.json())
    assert otro["id"] in salen
    assert escalera[3] not in salen, "el de categoría cafe no debe salir al filtrar restaurant"


def test_la_raiz_publica_los_valores_del_radio(client):
    """El frontend y quien depure necesitan saber el tope sin leer el código."""
    d = client.get("/api/").json()
    assert d["radio_km"]["por_defecto"] == RADIO_POR_DEFECTO
    assert d["radio_km"]["maximo"] == RADIO_MAXIMO
    assert "radio" in d["funciones"]
