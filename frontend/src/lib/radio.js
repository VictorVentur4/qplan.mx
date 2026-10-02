/**
 * Radio de búsqueda que elige el usuario final.
 *
 * La elección se recuerda en el navegador: alguien que siempre busca a 1 km
 * no debería tener que volver a elegirlo en cada visita. Si el almacenamiento
 * está bloqueado (modo privado), simplemente se usa el valor por defecto.
 */

/** Opciones que se le ofrecen al usuario, en kilómetros. */
export const RADIOS_KM = [1, 5, 10, 15, 20];

/** El que se usa mientras el usuario no elija otro. */
export const RADIO_POR_DEFECTO = 5;

const CLAVE = "qplan:radio-km";

const esValido = (n) => RADIOS_KM.includes(Number(n));

export const leerRadio = () => {
  try {
    const guardado = Number(localStorage.getItem(CLAVE));
    if (esValido(guardado)) return guardado;
  } catch {
    // Almacenamiento bloqueado: se cae al valor por defecto.
  }
  return RADIO_POR_DEFECTO;
};

export const guardarRadio = (km) => {
  if (!esValido(km)) return;
  try {
    localStorage.setItem(CLAVE, String(km));
  } catch {
    // Sin efecto: la elección vale solo para esta visita.
  }
};

/** El siguiente radio más amplio, o null si ya está en el máximo. */
export const siguienteRadio = (km) => {
  const i = RADIOS_KM.indexOf(Number(km));
  if (i === -1 || i === RADIOS_KM.length - 1) return null;
  return RADIOS_KM[i + 1];
};

export const etiquetaRadio = (km) => `${km} km a la redonda`;
