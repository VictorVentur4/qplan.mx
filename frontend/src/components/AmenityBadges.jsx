import { getAmenityIcon } from "../constants/businessTypes";

/**
 * Amenidades de un negocio.
 *
 *   variant="compact" → solo iconos, para la tarjeta del listado.
 *   variant="full"    → icono + etiqueta, para el modal de detalle.
 *
 * `catalog` viene de GET /api/amenities y traduce cada slug a su
 * etiqueta e icono. Los slugs sin correspondencia se omiten.
 */
const AmenityBadges = ({ slugs = [], catalog = [], variant = "compact", max }) => {
  if (!slugs.length || !catalog.length) return null;

  const items = slugs
    .map((slug) => catalog.find((a) => a.slug === slug))
    .filter(Boolean);

  if (!items.length) return null;

  const visibles = max ? items.slice(0, max) : items;
  const restantes = items.length - visibles.length;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {visibles.map((a) => {
          const Icon = getAmenityIcon(a.icon);
          return (
            <span
              key={a.slug}
              title={a.label}
              aria-label={a.label}
              className="w-7 h-7 rounded-lg bg-[#171717] border border-[#262626] flex items-center justify-center"
            >
              <Icon className="w-3.5 h-3.5 text-[#CCFF00]" />
            </span>
          );
        })}
        {restantes > 0 && (
          <span className="text-xs text-[#737373] px-1">+{restantes}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => {
        const Icon = getAmenityIcon(a.icon);
        return (
          <span
            key={a.slug}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] text-sm"
          >
            <Icon className="w-4 h-4" />
            {a.label}
          </span>
        );
      })}
    </div>
  );
};

export default AmenityBadges;
