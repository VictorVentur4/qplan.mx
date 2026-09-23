/**
 * Resolución de la ubicación del usuario.
 *
 * Prioridad:
 *   1. GPS del navegador, si el usuario lo comparte.
 *   2. Coordenadas que vienen en la URL del código QR.
 *   3. Ninguna: la app pide al usuario que comparta su ubicación.
 *
 * Ya NO existe un respaldo silencioso a una ciudad fija: mostrar negocios
 * de otra ciudad como si fueran cercanos engaña al usuario.
 */

const CLAVE_SESION = "qplan:qr-coords";

/** Formatos aceptados en la URL del QR. */
const ALIAS_LAT = ["lat", "latitude", "la"];
const ALIAS_LNG = ["lng", "lon", "long", "longitude", "lo"];
/** Forma compacta: ?c=18.9261,-99.2308 — genera un QR más chico y fácil de escanear. */
const ALIAS_COMPACTO = ["c", "coords", "q"];

const esLatValida = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
const esLngValida = (n) => Number.isFinite(n) && n >= -180 && n <= 180;

const aNumero = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return NaN;
  return Number(String(v).trim());
};

/**
 * Lee coordenadas de una cadena de consulta.
 * Devuelve {lat, lng} o null si no hay nada válido.
 */
export const parseCoordsFromSearch = (search) => {
  let params;
  try {
    params = new URLSearchParams(search || "");
  } catch {
    return null;
  }

  // Forma compacta primero: ?c=lat,lng
  for (const clave of ALIAS_COMPACTO) {
    const bruto = params.get(clave);
    if (!bruto) continue;
    const partes = bruto.split(",");
    if (partes.length !== 2) continue;
    const lat = aNumero(partes[0]);
    const lng = aNumero(partes[1]);
    if (esLatValida(lat) && esLngValida(lng)) return { lat, lng };
  }

  // Forma explícita: ?lat=..&lng=..
  let lat = NaN;
  let lng = NaN;
  for (const clave of ALIAS_LAT) {
    if (params.has(clave)) { lat = aNumero(params.get(clave)); break; }
  }
  for (const clave of ALIAS_LNG) {
    if (params.has(clave)) { lng = aNumero(params.get(clave)); break; }
  }

  if (esLatValida(lat) && esLngValida(lng)) return { lat, lng };
  return null;
};

/**
 * Guarda las coordenadas del QR en la sesión, para que sobrevivan cuando el
 * usuario navegue a otra página y vuelva (la URL pierde los parámetros).
 */
export const rememberQrCoords = (coords) => {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(coords));
  } catch {
    // Modo privado o almacenamiento bloqueado: seguimos sin recordar.
  }
};

export const recallQrCoords = () => {
  try {
    const bruto = sessionStorage.getItem(CLAVE_SESION);
    if (!bruto) return null;
    const { lat, lng } = JSON.parse(bruto);
    if (esLatValida(lat) && esLngValida(lng)) return { lat, lng };
  } catch {
    // Dato corrupto o almacenamiento inaccesible.
  }
  return null;
};

export const forgetQrCoords = () => {
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* sin efecto */
  }
};

/** Coordenadas del QR: primero la URL actual, si no, las de esta sesión. */
export const getQrCoords = (search = window.location.search) => {
  const deUrl = parseCoordsFromSearch(search);
  if (deUrl) {
    rememberQrCoords(deUrl);
    return deUrl;
  }
  return recallQrCoords();
};

/**
 * Pide la ubicación al navegador.
 * Resuelve con {lat,lng} o rechaza con un motivo legible.
 */
const pedirPosicion = ({ timeout }) =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const motivo =
          err.code === 1 ? "denegado" :
          err.code === 2 ? "no_disponible" :
          err.code === 3 ? "tiempo_agotado" : "desconocido";
        reject({ motivo });
      },
      { enableHighAccuracy: true, timeout, maximumAge: 300000 }
    );
  });

export const requestBrowserLocation = async ({ timeout = 8000 } = {}) => {
  if (!("geolocation" in navigator)) throw { motivo: "no_soportado" };
  // La API de geolocalización solo funciona en HTTPS (o en localhost).
  if (window.isSecureContext === false) throw { motivo: "sin_https" };

  /*
   * Si el permiso ya está denegado, getCurrentPosition puede tardar hasta el
   * timeout completo en responder — y el usuario se queda mirando un spinner
   * para nada. La Permissions API lo resuelve al instante, así que se consulta
   * primero. No todos los navegadores la traen; si falla, seguimos de largo.
   */
  try {
    if (navigator.permissions?.query) {
      const estado = await navigator.permissions.query({ name: "geolocation" });
      if (estado.state === "denied") throw { motivo: "denegado" };
    }
  } catch (e) {
    if (e?.motivo) throw e;   // fue nuestro rechazo, no un fallo de la API
  }

  /*
   * El `timeout` de getCurrentPosition NO es de fiar: mientras el navegador
   * tiene abierto el diálogo de permiso, varias implementaciones no lo
   * aplican y la promesa se queda colgada para siempre. Sin esta carrera,
   * el botón de "Compartir mi ubicación" se quedaba deshabilitado sin
   * posibilidad de reintento.
   */
  let reloj;
  const limite = new Promise((_, reject) => {
    reloj = setTimeout(() => reject({ motivo: "tiempo_agotado" }), timeout + 2000);
  });

  try {
    return await Promise.race([pedirPosicion({ timeout }), limite]);
  } finally {
    clearTimeout(reloj);
  }
};

/** Mensajes para cada motivo de fallo, en lenguaje de usuario. */
export const MENSAJES_UBICACION = {
  denegado: "Bloqueaste el acceso a tu ubicación. Habilítalo desde el candado de la barra de direcciones y vuelve a intentar.",
  no_disponible: "Tu dispositivo no pudo determinar dónde estás. Revisa que el GPS esté encendido.",
  tiempo_agotado: "La búsqueda de tu ubicación tardó demasiado. Inténtalo de nuevo.",
  no_soportado: "Tu navegador no permite compartir la ubicación.",
  sin_https: "La ubicación solo funciona en sitios seguros (https).",
  desconocido: "No pudimos obtener tu ubicación.",
};
