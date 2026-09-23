"""
Pruebas del registro y consulta de métricas (Fase 1).

Requiere migration_001, 002 y 003 aplicadas.
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
def seed():
    import asyncio
    import asyncpg

    async def _seed():
        conn = await asyncpg.connect(os.environ['DATABASE_URL'], ssl=None)
        try:
            await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE email = ANY($2::text[])",
                pwd_context.hash(PASSWORD), [ADMIN_EMAIL, OWNER_EMAIL],
            )
            # Partimos de cero para poder contar de forma determinista.
            await conn.execute("DELETE FROM stats_site_daily")
            await conn.execute("DELETE FROM stats_business_daily")
        finally:
            await conn.close()

    asyncio.run(_seed())


def auth(client, email=ADMIN_EMAIL):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def un_negocio(client):
    return client.get("/api/businesses").json()[0]


def resumen(client, dias=30):
    return client.get("/api/admin/metrics/summary",
                      params={"dias": dias}, headers=auth(client)).json()


# ---------------------------------------------------------------- registro


def test_track_no_requiere_autenticacion(client):
    r = client.post("/api/track", json={"tipo": "pageview"})
    assert r.status_code == 204


def test_pageview_incrementa_el_contador(client):
    antes = resumen(client)["total_visitas"]
    client.post("/api/track", json={"tipo": "pageview"})
    client.post("/api/track", json={"tipo": "pageview"})
    assert resumen(client)["total_visitas"] == antes + 2


def test_pageview_con_qr_se_atribuye(client):
    slug = f"qr-{uuid.uuid4().hex[:6]}"
    for _ in range(3):
        client.post("/api/track", json={"tipo": "pageview", "qr_id": slug})
    top = {q["qr_id"]: q["vistas"] for q in resumen(client)["top_qr"]}
    assert top.get(slug) == 3


def test_qr_id_invalido_se_ignora_sin_fallar(client):
    """Un identificador mal formado no debe tumbar la petición: se cuenta
    como entrada directa y ya."""
    r = client.post("/api/track", json={"tipo": "pageview", "qr_id": "¡MAL#FORMADO!"})
    assert r.status_code == 204


def test_business_view_incrementa_y_guarda_posicion(client):
    biz = un_negocio(client)
    client.post("/api/track", json={
        "tipo": "business_view", "business_id": biz["id"], "posicion": 3,
    })
    client.post("/api/track", json={
        "tipo": "business_view", "business_id": biz["id"], "posicion": 1,
    })
    fila = next(n for n in resumen(client)["top_negocios"] if n["id"] == biz["id"])
    assert fila["vistas"] >= 2
    # (3 + 1) / 2 = 2.0 si solo hubo estas dos
    assert fila["posicion_media"] is not None


def test_tipo_invalido_rechazado(client):
    r = client.post("/api/track", json={"tipo": "hackeo"})
    assert r.status_code == 422


def test_posicion_fuera_de_rango_rechazada(client):
    biz = un_negocio(client)
    r = client.post("/api/track", json={
        "tipo": "business_view", "business_id": biz["id"], "posicion": 9999,
    })
    assert r.status_code == 422


def test_negocio_inexistente_no_crea_basura(client):
    """El WHERE EXISTS evita contar vistas de negocios que no existen."""
    fantasma = str(uuid.uuid4())
    r = client.post("/api/track", json={
        "tipo": "business_view", "business_id": fantasma, "posicion": 1,
    })
    assert r.status_code == 204
    ids = [n["id"] for n in resumen(client)["top_negocios"]]
    assert fantasma not in ids


def test_business_id_malformado_no_revienta(client):
    r = client.post("/api/track", json={
        "tipo": "business_view", "business_id": "esto-no-es-un-uuid",
    })
    assert r.status_code == 204


# ---------------------------------------------------------------- permisos


def test_metricas_requieren_admin(client):
    assert client.get("/api/admin/metrics/summary").status_code == 403


def test_dueno_no_ve_las_metricas(client):
    h = auth(client, OWNER_EMAIL)
    assert client.get("/api/admin/metrics/summary", headers=h).status_code == 403
    biz = un_negocio(client)
    assert client.get(f"/api/admin/metrics/business/{biz['id']}",
                      headers=h).status_code == 403


# ---------------------------------------------------------------- resumen


def test_resumen_trae_la_serie_completa(client):
    r = resumen(client, dias=7)
    assert len(r["serie"]) == 7, "debe traer los 7 días, incluidos los vacíos"
    assert all("fecha" in d and "visitas" in d for d in r["serie"])


def test_resumen_separa_qr_de_directo(client):
    r = resumen(client)
    assert r["visitas_desde_qr"] + r["visitas_directas"] == r["total_visitas"]


def test_resumen_usa_la_zona_horaria_configurada(client):
    assert resumen(client)["zona_horaria"] == server.REPORT_TIMEZONE


def test_rango_de_dias_validado(client):
    h = auth(client)
    assert client.get("/api/admin/metrics/summary",
                      params={"dias": 0}, headers=h).status_code == 422
    assert client.get("/api/admin/metrics/summary",
                      params={"dias": 400}, headers=h).status_code == 422


# ---------------------------------------------------------------- reporte


def test_detalle_por_negocio(client):
    biz = un_negocio(client)
    r = client.get(f"/api/admin/metrics/business/{biz['id']}",
                   params={"dias": 30}, headers=auth(client))
    assert r.status_code == 200, r.text
    assert r.json()["negocio"]["nombre"] == biz["name"]
    assert len(r.json()["serie"]) == 30


def test_reporte_csv_descargable(client):
    biz = un_negocio(client)
    r = client.get(f"/api/admin/metrics/business/{biz['id']}/csv",
                   params={"dias": 30}, headers=auth(client))
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "attachment" in r.headers["content-disposition"]

    texto = r.content.decode("utf-8-sig")
    assert biz["name"] in texto
    assert "Fecha,Vistas,Posicion promedio en la lista" in texto
    # cabecera + 30 días de datos
    assert len([l for l in texto.splitlines() if l.startswith("20")]) == 30


def test_reporte_de_negocio_inexistente(client):
    r = client.get(f"/api/admin/metrics/business/{uuid.uuid4()}",
                   headers=auth(client))
    assert r.status_code == 404
