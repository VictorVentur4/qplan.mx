import axiosInstance from "../api/axios";

/**
 * Registro de uso.
 *
 * Dos reglas que hacen que esto sea barato y que los números signifiquen algo:
 *
 *   1. Se cuenta UNA VEZ POR SESIÓN. Si alguien recarga la página cinco veces
 *      o abre tres veces la misma ficha, cuenta uno. Así "vistas" significa
 *      "personas que lo vieron" y no "veces que se disparó un evento".
 *   2. Se envía sin esperar respuesta. Si el registro falla, el usuario ni se
 *      entera: una métrica jamás debe estorbar la navegación.
 */

const CLAVE_VISTOS = "qplan:eventos-contados";
const CLAVE_QR = "qplan:qr-id";

const yaContado = (clave) => {
  try {
    const vistos = JSON.parse(sessionStorage.getItem(CLAVE_VISTOS) || "[]");
    return vistos.includes(clave);
  } catch {
    return false;   // sin almacenamiento, se cuenta (peor duplicar que perder)
  }
};

const marcarContado = (clave) => {
  try {
    const vistos = JSON.parse(sessionStorage.getItem(CLAVE_VISTOS) || "[]");
    vistos.push(clave);
    sessionStorage.setItem(CLAVE_VISTOS, JSON.stringify(vistos));
  } catch {
    /* sin efecto */
  }
};

/**
 * Identificador del código QR: ?qr=hotel-centro-01
 * Se guarda en la sesión para que sobreviva a la navegación interna.
 */
export const getQrId = (search = window.location.search) => {
  try {
    const enUrl = new URLSearchParams(search).get("qr");
    if (enUrl) {
      const limpio = enUrl.trim().toLowerCase().slice(0, 60);
      sessionStorage.setItem(CLAVE_QR, limpio);
      return limpio;
    }
    return sessionStorage.getItem(CLAVE_QR) || null;
  } catch {
    return null;
  }
};

/** Envía el evento sin bloquear ni propagar errores. */
const enviar = (payload) => {
  axiosInstance.post("/track", payload).catch(() => {
    // Silencio intencional: el usuario no debe ver un fallo de métricas.
  });
};

/** Una visita al sitio por sesión, atribuida al QR si lo hubo. */
export const trackPageview = () => {
  if (yaContado("pageview")) return;
  marcarContado("pageview");
  enviar({ tipo: "pageview", qr_id: getQrId() });
};

/**
 * Apertura del detalle de un negocio.
 * `posicion` es el lugar que ocupaba en la lista (1 = primero), para poder
 * distinguir después entre "lo vieron por bueno" y "lo vieron por salir arriba".
 */
export const trackBusinessView = (businessId, posicion) => {
  if (!businessId) return;
  const clave = `negocio:${businessId}`;
  if (yaContado(clave)) return;
  marcarContado(clave);
  enviar({
    tipo: "business_view",
    business_id: businessId,
    posicion: Number.isFinite(posicion) ? posicion : undefined,
  });
};
