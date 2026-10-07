/**
 * Subida de imágenes.
 *
 * El navegador manda el archivo al backend de Qplan, no a la API externa:
 * así la llave de esa API nunca llega al navegador y no dependemos de cómo
 * tenga configurado el CORS el otro proyecto.
 */

import axiosInstance from "../api/axios";

/** Límite del lado del navegador. El backend lo vuelve a validar. */
export const MAX_MB = 8;

export const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** El atributo accept del input, para que el selector del celular filtre. */
export const ACCEPT = TIPOS_ACEPTADOS.join(",");

/**
 * Revisa el archivo antes de gastar datos del usuario subiéndolo.
 * Devuelve un mensaje de error, o null si está bien.
 */
export const revisarArchivo = (archivo) => {
  if (!archivo) return "No se eligió ningún archivo.";
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    return "Formato no admitido. Usa JPG, PNG, WebP o GIF.";
  }
  const mb = archivo.size / 1024 / 1024;
  if (mb > MAX_MB) {
    return `La imagen pesa ${mb.toFixed(1)} MB y el máximo son ${MAX_MB} MB.`;
  }
  return null;
};

/** 1987345 → «1.9 MB». Para mostrar lo que comprimió la API. */
export const enMB = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
};

/**
 * Resumen legible de la compresión, o null si la API no informó nada.
 * Ejemplo: «5.0 MB → 1.9 MB».
 */
export const resumenCompresion = (r) => {
  if (!r?.se_comprimio) return null;
  const antes = enMB(r.tamano_original_bytes);
  const despues = enMB(r.tamano_final_bytes);
  return antes && despues ? `${antes} → ${despues}` : null;
};

/**
 * Sube una imagen y devuelve lo que informó la API.
 *
 * `scope` decide la ruta: el admin sube por /admin/uploads y el dueño de un
 * negocio por /me/uploads. El backend valida el rol en cada una.
 *
 * `onProgreso` recibe un número de 0 a 100. En conexiones móviles lentas
 * la diferencia entre una barra que avanza y un spinner mudo es enorme.
 */
export async function subirImagen(archivo, { token, scope = "admin", onProgreso } = {}) {
  const error = revisarArchivo(archivo);
  if (error) throw new Error(error);

  const cuerpo = new FormData();
  cuerpo.append("file", archivo);

  const { data } = await axiosInstance.post(
    scope === "owner" ? "/me/uploads" : "/admin/uploads",
    cuerpo,
    {
      headers: { Authorization: `Bearer ${token}` },
      onUploadProgress: (e) => {
        if (onProgreso && e.total) {
          onProgreso(Math.round((e.loaded * 100) / e.total));
        }
      },
    }
  );
  // Se devuelve el objeto completo: además de la url trae, cuando la API
  // los manda, los datos de compresión que el panel muestra al usuario.
  return data;
}

/** Saca el mensaje legible de un error de axios. */
export const mensajeDeError = (e) =>
  e?.response?.data?.detail || e?.message || "No se pudo subir la imagen.";
