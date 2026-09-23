import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ImageOff, ArrowUp, ArrowDown } from "lucide-react";

export const MAX_IMAGES = 5;

/**
 * Gestión de la galería: hasta 5 URLs de imagen, con vista previa,
 * reordenamiento y borrado.
 *
 * La primera imagen es la que encabeza la galería del modal.
 */
const ImagesEditor = ({ value = [], onChange }) => {
  const [nueva, setNueva] = useState("");
  const [rotas, setRotas] = useState({});

  const lleno = value.length >= MAX_IMAGES;

  const agregar = () => {
    const url = nueva.trim();
    if (!url || lleno) return;
    if (value.includes(url)) {
      setNueva("");
      return;
    }
    onChange([...value, url]);
    setNueva("");
  };

  const quitar = (i) => onChange(value.filter((_, idx) => idx !== i));

  const mover = (i, delta) => {
    const destino = i + delta;
    if (destino < 0 || destino >= value.length) return;
    const copia = [...value];
    [copia[i], copia[destino]] = [copia[destino], copia[i]];
    onChange(copia);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#A3A3A3]">Galería de imágenes</span>
        <span className={`text-xs ${lleno ? "text-[#CCFF00]" : "text-[#737373]"}`}>
          {value.length} de {MAX_IMAGES}
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); agregar(); }
          }}
          placeholder={lleno ? "Llegaste al máximo de 5 imágenes" : "https://ejemplo.com/foto.jpg"}
          disabled={lleno}
          className="bg-[#0A0A0A] border-[#262626] text-white disabled:opacity-50"
        />
        <Button
          type="button" onClick={agregar} disabled={lleno || !nueva.trim()}
          className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600] flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          {value.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group rounded-xl overflow-hidden border border-[#262626] bg-[#0A0A0A]">
              <div className="h-24 flex items-center justify-center">
                {rotas[url] ? (
                  <div className="text-center px-2">
                    <ImageOff className="w-5 h-5 text-[#525252] mx-auto mb-1" />
                    <span className="text-[10px] text-[#525252]">No se pudo cargar</span>
                  </div>
                ) : (
                  <img
                    src={url} alt={`Imagen ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => setRotas((r) => ({ ...r, [url]: true }))}
                  />
                )}
              </div>

              {i === 0 && (
                <span className="absolute top-1 left-1 text-[10px] bg-[#CCFF00] text-black font-bold px-1.5 py-0.5 rounded">
                  Principal
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                          className="p-1.5 text-white disabled:opacity-25" title="Mover antes">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === value.length - 1}
                          className="p-1.5 text-white disabled:opacity-25" title="Mover después">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button type="button" onClick={() => quitar(i)}
                        className="p-1.5 text-red-400" title="Quitar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[#737373]">
        Pega la URL de cada imagen. La primera encabeza la galería del detalle.
      </p>
    </div>
  );
};

export default ImagesEditor;
