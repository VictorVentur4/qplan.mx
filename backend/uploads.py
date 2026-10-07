"""
Subida de imágenes a una API externa.

Qplan no almacena las imágenes: las reenvía a un servicio externo que
devuelve una URL pública, y en la base solo se guarda esa URL.

Todo lo que define ese servicio —dirección, llave, nombres de los campos—
vive en la tabla app_settings y se edita desde /admin → Ajustes. Así, si la
API se cae o cambia de dominio, se corrige desde el panel sin tocar código
ni reiniciar nada.

Dos decisiones que conviene tener claras:

1. El navegador NUNCA habla con la API externa. Sube el archivo a Qplan y
   Qplan lo reenvía. Así la llave jamás sale del servidor y no dependemos
   de cómo tenga configurado el CORS el otro proyecto.

2. La llave nunca se devuelve al frontend. El panel solo recibe si está
   configurada y sus últimos cuatro caracteres, para que el administrador
   reconozca cuál puso sin poder leerla completa.
"""

import json
import logging
import os
import re
from typing import Optional, Tuple

import httpx
from fastapi import HTTPException

CLAVE_AJUSTES = "uploads"

# Tipos que se aceptan. Deliberadamente corto: son fotos de negocios.
TIPOS_PERMITIDOS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

MAX_MB = float(os.environ.get("UPLOAD_MAX_MB", "8"))
MAX_BYTES = int(MAX_MB * 1024 * 1024)
TIMEOUT_SEGUNDOS = float(os.environ.get("UPLOAD_TIMEOUT_S", "30"))

# Llaves del JSON de respuesta donde se busca la URL cuando el
# administrador no especificó una ruta concreta.
RUTAS_URL_COMUNES = ["url", "data.url", "link", "location", "ruta",
                     "file", "data.link", "result.url", "imagen", "path"]

# Los valores por defecto vienen afinados para la API de imágenes que usa
# Qplan hoy (subir_imagen.php): así solo hay que capturar dirección y llave.
# Todos son editables desde el panel para cuando se cambie de proveedor.
CONFIG_POR_DEFECTO = {
    "activo": False,
    "endpoint": "",
    "modo_clave": "header",      # header | form | query
    "nombre_clave": "X-API-KEY",
    "campo_archivo": "imagen",
    "ruta_url_respuesta": "",    # vacío = se prueban las rutas comunes
    "base_publica": "",          # prefijo si la API devuelve una ruta relativa
    # Tamaño al que la API debe comprimir. 0 = no se manda el campo y la
    # API decide. El recorte lo hace ella, no Qplan.
    "max_kb": 2048,
    "campo_max_kb": "max_kb",
}

# Campos que el panel puede escribir. La llave se trata aparte.
CAMPOS_EDITABLES = ["activo", "endpoint", "modo_clave", "nombre_clave",
                    "campo_archivo", "ruta_url_respuesta", "base_publica",
                    "max_kb", "campo_max_kb"]

# Datos de compresión que algunas APIs devuelven y que vale la pena
# enseñarle al usuario: ver "5.0 MB → 1.9 MB" confirma que sí funcionó.
CAMPOS_COMPRESION = ["tamano_original_bytes", "tamano_final_bytes",
                     "se_comprimio", "mime_final", "token"]

log = logging.getLogger("qplan.uploads")


# ----------------------------------------------------------------- lectura


async def leer_config(conn) -> dict:
    """Configuración completa, con la llave. Solo para uso del servidor."""
    fila = await conn.fetchrow(
        "SELECT valor FROM app_settings WHERE clave = $1", CLAVE_AJUSTES
    )
    guardado = {}
    if fila and fila["valor"]:
        guardado = fila["valor"] if isinstance(fila["valor"], dict) else json.loads(fila["valor"])
    return {**CONFIG_POR_DEFECTO, **guardado}


def config_publica(cfg: dict) -> dict:
    """La misma configuración, pero sin la llave: esto sí va al panel."""
    llave = cfg.get("api_key") or ""
    publica = {k: cfg.get(k, CONFIG_POR_DEFECTO.get(k)) for k in CAMPOS_EDITABLES}
    publica["api_key_configurada"] = bool(llave)
    publica["api_key_pista"] = f"••••{llave[-4:]}" if len(llave) >= 4 else ("••••" if llave else "")
    publica["listo"] = bool(cfg.get("activo") and cfg.get("endpoint"))
    publica["max_mb"] = MAX_MB
    publica["tipos"] = sorted(TIPOS_PERMITIDOS)
    return publica


# --------------------------------------------------------------- escritura


def validar_endpoint(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(
            status_code=400,
            detail="La dirección debe empezar con http:// o https://",
        )
    if url.lower().startswith("http://") and not os.environ.get("UPLOAD_PERMITIR_HTTP"):
        raise HTTPException(
            status_code=400,
            detail=("Usa https. Con http la imagen y la llave viajan sin cifrar. "
                    "Si tu servidor no tiene certificado, define UPLOAD_PERMITIR_HTTP=1."),
        )
    return url


async def guardar_config(conn, cambios: dict, api_key) -> dict:
    """
    Guarda los cambios y devuelve la configuración pública resultante.

    api_key tiene tres comportamientos a propósito:
      None   → no se toca la que ya estaba (editar el endpoint sin retecleárla)
      ""     → se borra
      "algo" → se reemplaza
    """
    actual = await leer_config(conn)
    nueva = dict(actual)

    for campo in CAMPOS_EDITABLES:
        if campo in cambios and cambios[campo] is not None:
            nueva[campo] = cambios[campo]

    nueva["endpoint"] = validar_endpoint(nueva.get("endpoint", ""))

    if nueva.get("modo_clave") not in ("header", "form", "query"):
        raise HTTPException(status_code=400,
                            detail="modo_clave debe ser header, form o query")

    try:
        nueva["max_kb"] = max(0, int(nueva.get("max_kb") or 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400,
                            detail="El tamaño máximo debe ser un número en KB.")
    if nueva["max_kb"] and not str(nueva.get("campo_max_kb") or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Si fijas un tamaño máximo, indica el nombre del campo que lo lleva.")

    if api_key is not None:
        nueva["api_key"] = api_key.strip()

    if nueva.get("activo") and not nueva.get("endpoint"):
        raise HTTPException(
            status_code=400,
            detail="No se puede activar la subida sin una dirección de API.",
        )

    await conn.execute(
        """INSERT INTO app_settings (clave, valor, actualizado_en)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (clave) DO UPDATE
           SET valor = EXCLUDED.valor, actualizado_en = NOW()""",
        CLAVE_AJUSTES, json.dumps(nueva),
    )
    return config_publica(nueva)


# ------------------------------------------------------------------ subida


def validar_archivo(nombre: str, tipo: str, contenido: bytes) -> str:
    if tipo not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=400,
            detail=(f"Tipo de archivo no permitido ({tipo or 'desconocido'}). "
                    f"Acepta: {', '.join(sorted(TIPOS_PERMITIDOS))}."),
        )
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo llegó vacío.")
    if len(contenido) > MAX_BYTES:
        real = len(contenido) / 1024 / 1024
        raise HTTPException(
            status_code=400,
            detail=f"La imagen pesa {real:.1f} MB y el máximo es {MAX_MB:.0f} MB.",
        )
    return nombre or f"imagen{TIPOS_PERMITIDOS[tipo]}"


def _buscar_en_json(datos, ruta: str):
    """Sigue una ruta tipo 'data.url' dentro de un JSON anidado."""
    actual = datos
    for parte in ruta.split("."):
        if isinstance(actual, list) and parte.isdigit():
            idx = int(parte)
            if idx >= len(actual):
                return None
            actual = actual[idx]
        elif isinstance(actual, dict) and parte in actual:
            actual = actual[parte]
        else:
            return None
    return actual if isinstance(actual, str) else None


def extraer_url(cuerpo: str, cfg: dict) -> Optional[str]:
    """
    Saca la URL de la respuesta de la API externa.

    Si el administrador configuró una ruta, se usa esa. Si no, se prueban
    las llaves más comunes. Y si la respuesta es directamente una URL en
    texto plano, también se acepta: hay APIs sencillas que responden así.
    """
    texto = (cuerpo or "").strip()
    if not texto:
        return None

    try:
        datos = json.loads(texto)
    except (ValueError, TypeError):
        # No es JSON. Si parece una URL o una ruta, se toma tal cual.
        if re.match(r"^(https?://|/)\S+$", texto) and len(texto) < 2000:
            return texto
        return None

    if isinstance(datos, str):
        return datos

    rutas = [cfg["ruta_url_respuesta"]] if cfg.get("ruta_url_respuesta") else RUTAS_URL_COMUNES
    for ruta in rutas:
        valor = _buscar_en_json(datos, ruta)
        if valor:
            return valor
    return None


def absolutizar(url: str, cfg: dict) -> str:
    """Si la API devolvió una ruta relativa, se le antepone la base pública."""
    if not url:
        return url
    if re.match(r"^https?://", url, re.I):
        return url
    base = (cfg.get("base_publica") or "").rstrip("/")
    if not base:
        raise HTTPException(
            status_code=502,
            detail=(f"La API devolvió una ruta relativa ({url}) y no hay "
                    f"«Base pública» configurada para completarla."),
        )
    return f"{base}/{url.lstrip('/')}"


async def enviar(cfg: dict, nombre: str, tipo: str, contenido: bytes) -> Tuple[int, str]:
    """Hace la petición a la API externa. Devuelve (status, cuerpo)."""
    if not cfg.get("endpoint"):
        raise HTTPException(
            status_code=503,
            detail="La subida de imágenes no está configurada. Ve a Ajustes en el panel.",
        )

    llave = cfg.get("api_key") or ""
    archivos = {cfg["campo_archivo"]: (nombre, contenido, tipo)}
    datos, cabeceras, params = {}, {}, {}

    # El tope de tamaño se le pide a la API, que es quien comprime.
    max_kb = int(cfg.get("max_kb") or 0)
    if max_kb > 0:
        datos[cfg.get("campo_max_kb") or "max_kb"] = str(max_kb)

    if llave:
        if cfg["modo_clave"] == "header":
            cabeceras[cfg["nombre_clave"]] = llave
        elif cfg["modo_clave"] == "form":
            datos[cfg["nombre_clave"]] = llave
        else:
            params[cfg["nombre_clave"]] = llave

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEGUNDOS, follow_redirects=True) as cliente:
            r = await cliente.post(cfg["endpoint"], files=archivos, data=datos,
                                   headers=cabeceras, params=params)
            return r.status_code, r.text
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"La API de imágenes no respondió en {TIMEOUT_SEGUNDOS:.0f} segundos.",
        )
    except httpx.HTTPError as e:
        # El mensaje de httpx puede traer la URL con la llave en el query.
        limpio = re.sub(re.escape(llave), "••••", str(e)) if llave else str(e)
        log.warning("Fallo al contactar la API de imágenes: %s", limpio)
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo contactar la API de imágenes: {limpio}",
        )


async def subir(conn, nombre: str, tipo: str, contenido: bytes) -> dict:
    """Valida, reenvía y devuelve {url}. Es lo que usa el panel."""
    cfg = await leer_config(conn)
    if not cfg.get("activo"):
        raise HTTPException(
            status_code=503,
            detail="La subida de imágenes está desactivada. Actívala en Ajustes.",
        )

    nombre = validar_archivo(nombre, tipo, contenido)
    status, cuerpo = await enviar(cfg, nombre, tipo, contenido)

    if status >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"La API de imágenes respondió {status}: {cuerpo[:300]}",
        )

    url = extraer_url(cuerpo, cfg)
    if not url:
        raise HTTPException(
            status_code=502,
            detail=("La API respondió correctamente pero no se encontró la URL. "
                    "Usa «Probar conexión» en Ajustes para ver qué devuelve y "
                    f"configura la ruta correcta. Respuesta: {cuerpo[:300]}"),
        )

    resultado = {"url": absolutizar(url, cfg), "nombre": nombre, "bytes": len(contenido)}

    # Si la API informó cuánto comprimió, se pasa tal cual al panel para
    # poder mostrar "5.0 MB → 1.9 MB". Es la confirmación más convincente
    # de que la subida hizo lo que debía.
    try:
        datos = json.loads(cuerpo)
        if isinstance(datos, dict):
            for campo in CAMPOS_COMPRESION:
                if campo in datos:
                    resultado[campo] = datos[campo]
    except (ValueError, TypeError):
        pass

    return resultado


# PNG de 1x1 transparente, para la prueba de conexión.
PNG_PRUEBA = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6300010000050001"
    "0d0a2db40000000049454e44ae426082"
)


async def probar(conn) -> dict:
    """
    Sube una imagen mínima y reporta exactamente qué pasó.

    Está pensado para descubrir el contrato de la API sin adivinar: el
    administrador ve el código de respuesta, el cuerpo crudo y si se pudo
    extraer la URL, y con eso ajusta los nombres de los campos.
    """
    cfg = await leer_config(conn)
    if not cfg.get("endpoint"):
        return {"ok": False, "error": "Falta capturar la dirección de la API."}

    try:
        status, cuerpo = await enviar(cfg, "prueba-qplan.png", "image/png", PNG_PRUEBA)
    except HTTPException as e:
        return {"ok": False, "error": e.detail}

    url = extraer_url(cuerpo, cfg)
    resultado = {
        "ok": status < 400 and bool(url),
        "status": status,
        "respuesta": cuerpo[:1200],
        "url_detectada": None,
    }
    resultado["max_kb_enviado"] = int(cfg.get("max_kb") or 0) or None
    if url:
        try:
            resultado["url_detectada"] = absolutizar(url, cfg)
        except HTTPException as e:
            resultado["ok"] = False
            resultado["error"] = e.detail
    if status >= 400:
        resultado["error"] = f"La API respondió {status}."
    elif not url:
        resultado["error"] = ("Respondió bien, pero no se encontró la URL en el cuerpo. "
                              "Revisa «Ruta de la URL en la respuesta».")
    return resultado
