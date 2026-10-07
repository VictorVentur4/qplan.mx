import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Plus, Trash2, ImageOff, ArrowUp, ArrowDown,
  Upload, Camera, Loader2, Check, AlertCircle, Link2,
} from "lucide-react";
import {
  ACCEPT, subirImagen, revisarArchivo, mensajeDeError, enMB,
} from "../lib/subidas";

export const MAX_IMAGES = 5;

/**
 * Galería del negocio: hasta 5 imágenes.
 *
 * Se pueden subir desde el dispositivo (varias de un jalón) o pegar una URL.
 * Lo que se guarda siempre es la URL que devuelve la API de imágenes.
 *
 * Al subir varias juntas se procesan EN SERIE, no en paralelo: desde un
 * celular con datos, cinco subidas simultáneas se estorban entre sí y es
 * más fácil que alguna falle. En serie además se ve el avance real.
 */
const ImagesEditor = ({ value = [], onChange, token, scope = "admin" }) => {
  const archivoRef = useRef(null);
  const camaraRef = useRef(null);

  const [nueva, setNueva] = useState("");
  const [rotas, setRotas] = useState({});
  const [modoUrl, setModoUrl] = useState(false);
  const [subiendo, setSubiendo] = useState(null);   // {actual, total, progreso}
  const [error, setError] = useState(null);
  const [recienSubidas, setRecienSubidas] = useState(0);
  const [ahorrado, setAhorrado] = useState(null);

  const lleno = value.length >= MAX_IMAGES;
  const espacio = MAX_IMAGES - value.length;

  const agregarUrl = () => {
    const url = nueva.trim();
    if (!url || lleno || value.includes(url)) { setNueva(""); return; }
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

  const elegir = async (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (!archivos.length) return;

    setError(null);
    const caben = archivos.slice(0, espacio);
    const sobran = archivos.length - caben.length;

    const subidas = [];
    const fallos = [];
    let ahorro = 0;

    for (let i = 0; i < caben.length; i++) {
      const archivo = caben[i];
      const problema = revisarArchivo(archivo);
      if (problema) { fallos.push(`${archivo.name}: ${problema}`); continue; }

      setSubiendo({ actual: i + 1, total: caben.length, progreso: 0 });
      try {
        const r = await subirImagen(archivo, {
          token, scope,
          onProgreso: (p) => setSubiendo({ actual: i + 1, total: caben.length, progreso: p }),
        });
        subidas.push(r.url);
        if (r.se_comprimio) {
          ahorro += Number(r.tamano_original_bytes || 0) - Number(r.tamano_final_bytes || 0);
        }
      } catch (err) {
        fallos.push(`${archivo.name}: ${mensajeDeError(err)}`);
      }
    }

    setSubiendo(null);
    if (subidas.length) {
      onChange([...value, ...subidas]);
      setRecienSubidas(subidas.length);
      setAhorrado(ahorro > 0 ? enMB(ahorro) : null);
      setTimeout(() => { setRecienSubidas(0); setAhorrado(null); }, 4500);
    }
    const avisos = [...fallos];
    if (sobran > 0) avisos.push(`Se omitieron ${sobran}: el máximo son ${MAX_IMAGES}.`);
    if (avisos.length) setError(avisos.join(" · "));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
        <span className="text-sm text-[#A3A3A3]">Galería de imágenes</span>
        <div className="flex items-center gap-3 flex-shrink-0">
          {recienSubidas > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#CCFF00] whitespace-nowrap"
                  data-testid="galeria-exitosa">
              <Check className="w-3 h-3" />
              {recienSubidas === 1 ? "1 imagen subida" : `${recienSubidas} imágenes subidas`}
            {ahorrado && <span className="text-[#737373] font-normal"> · −{ahorrado}</span>}
            </span>
          )}
          <span className={`text-xs whitespace-nowrap ${lleno ? "text-[#CCFF00]" : "text-[#737373]"}`}>
            {value.length} de {MAX_IMAGES}
          </span>
          <button type="button" onClick={() => setModoUrl((v) => !v)}
                  className="text-xs text-[#737373] hover:text-[#CCFF00] inline-flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            {modoUrl ? "Subir" : "URL"}
          </button>
        </div>
      </div>

      {modoUrl ? (
        <div className="flex gap-2">
          <Input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarUrl(); } }}
            placeholder={lleno ? "Llegaste al máximo de 5 imágenes" : "https://ejemplo.com/foto.jpg"}
            disabled={lleno}
            className="bg-[#0A0A0A] border-[#262626] text-white disabled:opacity-50"
          />
          <Button type="button" onClick={agregarUrl} disabled={lleno || !nueva.trim()}
                  className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600] flex-shrink-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <>
          <input ref={archivoRef} type="file" accept={ACCEPT} multiple
                 onChange={elegir} className="hidden" />
          <input ref={camaraRef} type="file" accept="image/*" capture="environment"
                 onChange={elegir} className="hidden" />
          <div className="flex gap-2">
            <Button type="button" disabled={lleno || !!subiendo}
                    onClick={() => archivoRef.current?.click()}
                    className="flex-1 bg-[#171717] border border-[#262626] text-white hover:bg-[#1f1f1f] disabled:opacity-40">
              <Upload className="w-4 h-4 mr-2" /> Subir fotos
            </Button>
            <Button type="button" disabled={lleno || !!subiendo}
                    onClick={() => camaraRef.current?.click()}
                    className="flex-1 bg-[#171717] border border-[#262626] text-white hover:bg-[#1f1f1f] disabled:opacity-40">
              <Camera className="w-4 h-4 mr-2" /> Cámara
            </Button>
          </div>
        </>
      )}

      {subiendo && (
        <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-3"
             data-testid="galeria-subiendo">
          <div className="flex items-center gap-2 text-xs text-white mb-2">
            <Loader2 className="w-3.5 h-3.5 text-[#CCFF00] animate-spin" />
            Subiendo {subiendo.actual} de {subiendo.total}… {subiendo.progreso}%
          </div>
          <div className="h-1 bg-[#262626] rounded-full overflow-hidden">
            <div className="h-full bg-[#CCFF00] transition-all"
                 style={{ width: `${subiendo.progreso}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400" data-testid="galeria-error">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          {value.map((url, i) => (
            <div key={`${url}-${i}`}
                 className="relative group rounded-xl overflow-hidden border border-[#262626] bg-[#0A0A0A]">
              <div className="h-24 flex items-center justify-center">
                {rotas[url] ? (
                  <div className="text-center px-2">
                    <ImageOff className="w-5 h-5 text-[#525252] mx-auto mb-1" />
                    <span className="text-[10px] text-[#525252]">No se pudo cargar</span>
                  </div>
                ) : (
                  <img src={url} alt={`Imagen ${i + 1}`} className="w-full h-full object-cover"
                       onError={() => setRotas((r) => ({ ...r, [url]: true }))} />
                )}
              </div>

              {i === 0 && (
                <span className="absolute top-1 left-1 text-[10px] bg-[#CCFF00] text-black font-bold px-1.5 py-0.5 rounded">
                  Principal
                </span>
              )}

              {/* En móvil no hay hover: los controles se ven siempre. */}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70
                              opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <div className="flex">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                          className="p-2 sm:p-1.5 text-white disabled:opacity-25" title="Mover antes">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === value.length - 1}
                          className="p-2 sm:p-1.5 text-white disabled:opacity-25" title="Mover después">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button type="button" onClick={() => quitar(i)}
                        className="p-2 sm:p-1.5 text-red-400" title="Quitar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[#737373]">
        Hasta {MAX_IMAGES} fotos. La primera encabeza la galería del detalle.
      </p>
    </div>
  );
};

export default ImagesEditor;
