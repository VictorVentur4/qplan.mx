import {
  Utensils, Coffee, Hotel, Car, Pill, Fuel, MapPin,
  Store, ShoppingBag, Dumbbell, Scissors, Stethoscope,
  Wrench, Beer, IceCream, Croissant, Bike, Building2,
  Wifi, ReceiptText, CircleParking, PawPrint, CreditCard,
  Landmark, Check, Snowflake, Accessibility, Baby, Music,
  Truck, Sparkles,
} from "lucide-react";

/**
 * Las categorías ya NO viven aquí: se consultan a GET /api/categories y se
 * administran desde el panel. Este archivo solo traduce el nombre del icono
 * que guarda la base de datos al componente de lucide-react que lo dibuja.
 *
 * Para ofrecer un icono nuevo en el panel, agrégalo a este mapa.
 */
export const ICON_MAP = {
  Utensils, Coffee, Hotel, Car, Pill, Fuel, MapPin,
  Store, ShoppingBag, Dumbbell, Scissors, Stethoscope,
  Wrench, Beer, IceCream, Croissant, Bike, Building2,
};

/**
 * Iconos disponibles para amenidades. Van aparte de los de categoría
 * porque el panel ofrece listas distintas en cada formulario.
 */
export const AMENITY_ICON_MAP = {
  Wifi, Bike, ReceiptText, CircleParking, PawPrint, CreditCard, Landmark,
  Check, Snowflake, Accessibility, Baby, Music, Truck, Sparkles,
  Coffee, Beer, Utensils, Car, Dumbbell,
};

/** Nombres disponibles para el select de iconos del panel. */
export const ICON_NAMES = Object.keys(ICON_MAP);
export const AMENITY_ICON_NAMES = Object.keys(AMENITY_ICON_MAP);

/** Devuelve el componente de icono de una amenidad, con Check como respaldo. */
export const getAmenityIcon = (iconName) => AMENITY_ICON_MAP[iconName] || Check;

/** Días de la semana, de lunes a domingo, como los usa hours_schedule. */
export const DIAS = [
  "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
];

/** Horario vacío: los 7 días, de lunes a viernes abiertos por defecto. */
export const emptySchedule = () =>
  DIAS.map((_, day) => ({
    day,
    closed: day > 4,
    all_day: false,
    open: day > 4 ? "" : "09:00",
    close: day > 4 ? "" : "18:00",
  }));

/** Devuelve el componente de icono de una categoría, con MapPin como respaldo. */
export const getIcon = (iconName) => ICON_MAP[iconName] || MapPin;

/** Busca en la lista de categorías el icono que corresponde a un slug. */
export const getIconForType = (categories, slug) => {
  const category = categories.find((c) => c.slug === slug);
  return getIcon(category?.icon);
};

/** Etiqueta legible de un slug; si no está en el catálogo, devuelve el slug. */
export const getLabelForType = (categories, slug) =>
  categories.find((c) => c.slug === slug)?.label || slug;

/** Valor centinela del select para "sin filtro". */
export const ALL_CATEGORIES = "all";
