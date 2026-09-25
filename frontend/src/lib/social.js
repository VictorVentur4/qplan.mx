/**
 * Enlaces a redes sociales y mapas.
 *
 * La base de datos guarda el identificador pelado (usuario de Instagram,
 * nombre de la página de Facebook, teléfono en dígitos). La URL se arma
 * aquí, en un solo lugar: si mañana cambia un dominio, se toca este archivo
 * y nada más.
 */

/** Redes que se muestran, en el orden en que aparecen. */
export const REDES = ["whatsapp", "instagram", "facebook"];

export const ETIQUETAS_RED = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

/**
 * Lada de país que se asume cuando el teléfono guardado no la trae.
 *
 * El backend normaliza al guardar, así que todo lo que entre por la
 * aplicación ya viene completo. Esta red de seguridad es para los
 * registros cargados directo a la base (importaciones, SQL a mano):
 * wa.me con un número de 10 dígitos no abre la conversación.
 */
const LADA_POR_DEFECTO = "52";

export const telefonoE164 = (valor) => {
  const d = String(valor || "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 10 ? LADA_POR_DEFECTO + d : d;
};

/** Texto que se le muestra al usuario para cada red. */
export const textoRed = (red, valor) => {
  if (!valor) return null;
  if (red === "whatsapp") return formatearTelefono(telefonoE164(valor));
  return `@${valor}`;
};

/** URL de la red a partir del valor guardado. */
export const urlRed = (red, valor) => {
  if (!valor) return null;
  switch (red) {
    case "whatsapp": {
      const tel = telefonoE164(valor);
      return tel ? `https://wa.me/${tel}` : null;
    }
    case "instagram":
      return `https://instagram.com/${valor}`;
    case "facebook":
      return `https://facebook.com/${valor}`;
    default:
      return null;
  }
};

/**
 * 527771234567 → +52 777 123 4567
 * Solo agrupa; si el número no tiene la forma esperada se devuelve tal cual
 * con un + delante, que sigue siendo legible.
 */
export function formatearTelefono(digitos) {
  const d = String(digitos || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("52")) {
    return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return `+${d}`;
}

/** Devuelve solo las redes que el negocio sí tiene capturadas. */
export const redesDe = (business) =>
  REDES.filter((red) => business?.[red]).map((red) => ({
    red,
    valor: business[red],
    url: urlRed(red, business[red]),
    etiqueta: ETIQUETAS_RED[red],
    texto: textoRed(red, business[red]),
  }));

/**
 * Enlace al mapa con las coordenadas exactas del negocio.
 *
 * Se usa el formato universal de Google Maps: en el celular lo abre la
 * aplicación nativa (Android e iOS) y en la computadora el sitio web.
 * Se manda lat,lng y no la dirección escrita porque la dirección puede
 * estar mal escrita o ser ambigua; las coordenadas nunca.
 */
export const urlMapa = (business) => {
  const { latitude: lat, longitude: lng } = business || {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};
