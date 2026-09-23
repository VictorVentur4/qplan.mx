import { getAmenityIcon } from "../constants/businessTypes";

/**
 * Selección de amenidades como botones alternables.
 * `value` es un arreglo de slugs; `catalog` viene de GET /api/amenities.
 */
const AmenitiesPicker = ({ catalog = [], value = [], onChange }) => {
  const alternar = (slug) =>
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]);

  if (catalog.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-sm text-[#A3A3A3]">Amenidades</span>
        <p className="text-xs text-[#737373]">
          Todavía no hay amenidades en el catálogo. Agrégalas desde la pestaña Amenidades.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#A3A3A3]">Amenidades</span>
        <span className="text-xs text-[#737373]">{value.length} seleccionada(s)</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {catalog.map((a) => {
          const Icon = getAmenityIcon(a.icon);
          const activa = value.includes(a.slug);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => alternar(a.slug)}
              aria-pressed={activa}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                activa
                  ? "bg-[#CCFF00]/15 border-[#CCFF00]/60 text-[#CCFF00]"
                  : "bg-[#0A0A0A] border-[#262626] text-[#A3A3A3] hover:border-[#404040]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AmenitiesPicker;
