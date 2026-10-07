"""
Pruebas de los ajustes y del reenvío de imágenes a la API externa.

Levanta una API falsa en un hilo que imita a la de PHP: multipart con campo
"file", llave en un header y respuesta JSON anidada. Así se prueba el camino
completo sin depender de que el servicio real esté arriba.

    set -a && . ./.env && set +a
    python -m pytest backend/tests/test_subidas.py -v
"""

import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend import server  # noqa: E402
from backend import uploads as subidas  # noqa: E402

ADMIN_EMAIL = "admin@qplan.mx"
OWNER_EMAIL = "cafe@qplan.mx"
PASSWORD = "qplan1234"
LLAVE = "llave-de-prueba-123"

PNG = subidas.PNG_PRUEBA


# ------------------------------------------------------------- API falsa


class ApiFalsa(BaseHTTPRequestHandler):
    recibidos = []

    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        ruta = self.path.split("?")[0]

        if ruta == "/sin-url":
            return self._json(200, {"estado": "guardado"})
        if ruta == "/relativa":
            return self._json(200, {"url": "/img/abc.png"})
        if ruta == "/texto":
            return self._texto(200, "https://cdn.ejemplo.mx/img/xyz.png")
        if ruta == "/error":
            return self._json(500, {"error": "explotó"})
        if ruta == "/anidada":
            return self._json(200, {"resultado": {"archivo": {"direccion": "https://cdn.mx/a.png"}}})

        llave = self.headers.get("X-API-Key")
        if ruta == "/form":
            m = re.search(rb'name="apikey"\r\n\r\n([^\r]+)', cuerpo)
            llave = m.group(1).decode() if m else None
        if ruta == "/query":
            m = re.search(r"apikey=([^&]+)", self.path)
            llave = m.group(1) if m else None

        if llave != LLAVE:
            return self._json(401, {"error": "llave invalida"})

        nombre = re.search(rb'filename="([^"]+)"', cuerpo)
        campo = re.search(rb'name="([^"]+)"; filename=', cuerpo)
        maxkb = re.search(rb'name="max_kb"\r\n\r\n([^\r]+)', cuerpo)
        ApiFalsa.recibidos.append({
            "nombre": nombre.group(1).decode() if nombre else None,
            "campo": campo.group(1).decode() if campo else None,
            "max_kb": maxkb.group(1).decode() if maxkb else None,
            "bytes": len(cuerpo),
        })
        # Misma forma que subir_imagen.php
        self._json(200, {
            "ok": True,
            "url": "https://apiqplan.devmex.com.mx/uploads/imagenes/abc123.jpg",
            "token": "abc123",
            "tamano_original_bytes": 5242880,
            "tamano_final_bytes": 1987345,
            "mime_original": "image/jpeg",
            "mime_final": "image/jpeg",
            "se_comprimio": True,
        })

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def _texto(self, code, txt):
        b = txt.encode()
        self.send_response(code); self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def log_message(self, *a):
        pass


@pytest.fixture(scope="module", autouse=True)
def api_falsa():
    srv = ThreadingHTTPServer(("127.0.0.1", 8098), ApiFalsa)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    yield "http://127.0.0.1:8098"
    srv.shutdown()


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


def auth(client, email=ADMIN_EMAIL):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def configurar(client, **extra):
    base = {
        "activo": True, "endpoint": "http://127.0.0.1:8098/subir",
        "modo_clave": "header", "nombre_clave": "X-API-Key",
        "campo_archivo": "imagen", "api_key": LLAVE,
        "ruta_url_respuesta": "", "base_publica": "",
        "max_kb": 2048, "campo_max_kb": "max_kb",
    }
    base.update(extra)
    r = client.put("/api/admin/settings/uploads", headers=auth(client), json=base)
    assert r.status_code == 200, r.text
    return r.json()


def archivo(nombre="foto.png", tipo="image/png", datos=PNG):
    return {"file": (nombre, datos, tipo)}


# --------------------------------------------------------------- ajustes


def test_solo_el_admin_ve_los_ajustes(client):
    assert client.get("/api/admin/settings/uploads").status_code in (401, 403)
    r = client.get("/api/admin/settings/uploads", headers=auth(client, OWNER_EMAIL))
    assert r.status_code == 403


def test_la_llave_nunca_se_devuelve(client):
    configurar(client)
    d = client.get("/api/admin/settings/uploads", headers=auth(client)).json()
    assert "api_key" not in d
    assert d["api_key_configurada"] is True
    assert d["api_key_pista"].endswith("-123")
    assert LLAVE not in json.dumps(d)


def test_editar_sin_reenviar_la_llave_la_conserva(client):
    configurar(client)
    client.put("/api/admin/settings/uploads", headers=auth(client),
               json={"endpoint": "http://127.0.0.1:8098/otro"})
    d = client.get("/api/admin/settings/uploads", headers=auth(client)).json()
    assert d["api_key_configurada"] is True
    assert d["endpoint"].endswith("/otro")


def test_cadena_vacia_borra_la_llave(client):
    configurar(client)
    client.put("/api/admin/settings/uploads", headers=auth(client), json={"api_key": ""})
    d = client.get("/api/admin/settings/uploads", headers=auth(client)).json()
    assert d["api_key_configurada"] is False
    configurar(client)


@pytest.mark.parametrize("malo", ["ftp://x.com/u", "no-es-url", "javascript:alert(1)"])
def test_rechaza_direcciones_invalidas(client, malo):
    r = client.put("/api/admin/settings/uploads", headers=auth(client), json={"endpoint": malo})
    assert r.status_code == 400


def test_no_se_puede_activar_sin_direccion(client):
    client.put("/api/admin/settings/uploads", headers=auth(client),
               json={"activo": False, "endpoint": ""})
    r = client.put("/api/admin/settings/uploads", headers=auth(client), json={"activo": True})
    assert r.status_code == 400
    assert "dirección" in r.json()["detail"]
    configurar(client)


# ---------------------------------------------------------------- subida


def test_sube_y_devuelve_la_url(client):
    configurar(client)
    ApiFalsa.recibidos.clear()
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://apiqplan.devmex.com.mx/uploads/")
    assert ApiFalsa.recibidos[-1]["campo"] == "imagen"


def test_respeta_el_nombre_del_campo_configurado(client):
    configurar(client, campo_archivo="archivo")
    ApiFalsa.recibidos.clear()
    assert client.post("/api/admin/uploads", headers=auth(client), files=archivo()).status_code == 200
    assert ApiFalsa.recibidos[-1]["campo"] == "archivo"
    configurar(client)


# --------------------------------------------------- tamaño máximo (max_kb)


def test_manda_el_max_kb_configurado(client):
    configurar(client, max_kb=1024)
    ApiFalsa.recibidos.clear()
    assert client.post("/api/admin/uploads", headers=auth(client), files=archivo()).status_code == 200
    assert ApiFalsa.recibidos[-1]["max_kb"] == "1024"
    configurar(client)


def test_en_cero_no_manda_el_campo(client):
    """0 significa «que la API decida»: ni siquiera se envía el campo."""
    configurar(client, max_kb=0)
    ApiFalsa.recibidos.clear()
    assert client.post("/api/admin/uploads", headers=auth(client), files=archivo()).status_code == 200
    assert ApiFalsa.recibidos[-1]["max_kb"] is None
    configurar(client)


def test_el_nombre_del_campo_de_tamano_es_configurable(client):
    configurar(client, max_kb=512, campo_max_kb="limite")
    ApiFalsa.recibidos.clear()
    assert client.post("/api/admin/uploads", headers=auth(client), files=archivo()).status_code == 200
    # Ya no viaja como max_kb porque se renombró el campo.
    assert ApiFalsa.recibidos[-1]["max_kb"] is None
    configurar(client)


def test_rechaza_un_max_kb_que_no_es_numero(client):
    r = client.put("/api/admin/settings/uploads", headers=auth(client),
                   json={"max_kb": "dos megas"})
    # 422 lo rechaza Pydantic por el tipo; 400 sería nuestra validación.
    # Cualquiera de los dos sirve: lo importante es que no se guarde basura.
    assert r.status_code in (400, 422)
    configurar(client)


def test_no_deja_un_max_kb_sin_nombre_de_campo(client):
    r = client.put("/api/admin/settings/uploads", headers=auth(client),
                   json={"max_kb": 1024, "campo_max_kb": ""})
    assert r.status_code == 400
    configurar(client)


def test_devuelve_lo_que_la_api_reporto_de_compresion(client):
    """El panel enseña «5.0 MB → 1.9 MB»; esos datos vienen de la API."""
    configurar(client)
    d = client.post("/api/admin/uploads", headers=auth(client), files=archivo()).json()
    assert d["tamano_original_bytes"] == 5242880
    assert d["tamano_final_bytes"] == 1987345
    assert d["se_comprimio"] is True
    assert d["token"] == "abc123"


@pytest.mark.parametrize("modo,ruta", [("form", "/form"), ("query", "/query")])
def test_la_llave_viaja_por_donde_se_configure(client, modo, ruta):
    configurar(client, modo_clave=modo, nombre_clave="apikey",
               endpoint=f"http://127.0.0.1:8098{ruta}")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 200, r.text
    configurar(client)


def test_llave_equivocada_da_error_claro(client):
    configurar(client, api_key="otra-cosa")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 502
    assert "401" in r.json()["detail"]
    configurar(client)


def test_rechaza_tipos_no_permitidos(client):
    configurar(client)
    r = client.post("/api/admin/uploads", headers=auth(client),
                    files={"file": ("virus.exe", b"MZ", "application/x-msdownload")})
    assert r.status_code == 400
    assert "no permitido" in r.json()["detail"]


def test_rechaza_archivos_muy_grandes(client):
    configurar(client)
    grande = b"\x89PNG" + b"0" * (int(subidas.MAX_BYTES) + 10)
    r = client.post("/api/admin/uploads", headers=auth(client),
                    files={"file": ("grande.png", grande, "image/png")})
    assert r.status_code == 400
    assert "máximo" in r.json()["detail"]


def test_rechaza_archivo_vacio(client):
    configurar(client)
    r = client.post("/api/admin/uploads", headers=auth(client),
                    files={"file": ("vacio.png", b"", "image/png")})
    assert r.status_code == 400


def test_desactivado_responde_503(client):
    configurar(client)
    client.put("/api/admin/settings/uploads", headers=auth(client), json={"activo": False})
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 503
    assert "Ajustes" in r.json()["detail"]
    configurar(client)


def test_el_dueno_tambien_puede_subir(client):
    configurar(client)
    r = client.post("/api/me/uploads", headers=auth(client, OWNER_EMAIL), files=archivo())
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://")


def test_un_usuario_normal_no_puede_subir(client):
    assert client.post("/api/admin/uploads", files=archivo()).status_code in (401, 403)


# ------------------------------------------------- formas de la respuesta


def test_respuesta_sin_url_explica_el_problema(client):
    configurar(client, endpoint="http://127.0.0.1:8098/sin-url")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 502
    assert "Probar conexión" in r.json()["detail"]
    configurar(client)


def test_url_relativa_necesita_base_publica(client):
    configurar(client, endpoint="http://127.0.0.1:8098/relativa", base_publica="")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 502
    assert "Base pública" in r.json()["detail"]

    configurar(client, endpoint="http://127.0.0.1:8098/relativa",
               base_publica="https://cdn.ejemplo.mx")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 200
    assert r.json()["url"] == "https://cdn.ejemplo.mx/img/abc.png"
    configurar(client)


def test_acepta_respuesta_en_texto_plano(client):
    configurar(client, endpoint="http://127.0.0.1:8098/texto")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 200
    assert r.json()["url"] == "https://cdn.ejemplo.mx/img/xyz.png"
    configurar(client)


def test_ruta_personalizada_en_json_anidado(client):
    configurar(client, endpoint="http://127.0.0.1:8098/anidada",
               ruta_url_respuesta="resultado.archivo.direccion")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 200
    assert r.json()["url"] == "https://cdn.mx/a.png"
    configurar(client)


def test_error_de_la_api_se_reporta_con_su_cuerpo(client):
    configurar(client, endpoint="http://127.0.0.1:8098/error")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert r.status_code == 502
    assert "500" in r.json()["detail"]
    configurar(client)


# ------------------------------------------------------ probar conexión


def test_probar_reporta_exito(client):
    configurar(client)
    d = client.post("/api/admin/settings/uploads/probar", headers=auth(client)).json()
    assert d["ok"] is True
    assert d["status"] == 200
    assert d["url_detectada"].startswith("https://")
    assert d["max_kb_enviado"] == 2048


def test_probar_explica_cuando_no_encuentra_la_url(client):
    configurar(client, endpoint="http://127.0.0.1:8098/sin-url")
    d = client.post("/api/admin/settings/uploads/probar", headers=auth(client)).json()
    assert d["ok"] is False
    assert "no se encontró la URL" in d["error"]
    assert "estado" in d["respuesta"]      # devuelve el cuerpo crudo para diagnosticar
    configurar(client)


def test_probar_sin_direccion_no_truena(client):
    client.put("/api/admin/settings/uploads", headers=auth(client),
               json={"activo": False, "endpoint": ""})
    d = client.post("/api/admin/settings/uploads/probar", headers=auth(client)).json()
    assert d["ok"] is False
    configurar(client)


def test_la_llave_no_aparece_en_los_errores(client):
    """Un fallo de red no debe filtrar la llave en el mensaje."""
    configurar(client, modo_clave="query", nombre_clave="apikey",
               endpoint="http://127.0.0.1:9/no-existe")
    r = client.post("/api/admin/uploads", headers=auth(client), files=archivo())
    assert LLAVE not in r.text
    configurar(client)
