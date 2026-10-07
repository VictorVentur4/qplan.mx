import { useRef, useState } from "react";
import { Upload, Camera, Loader2, Check, AlertCircle, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCEPT, subirImagen, revisarArchivo, mensajeDeError, resumenCompresion,
} from "../lib/subidas";

/**
 * Botón de subida con vista previa, pensado para usarse desde el celular.
 *
 * Son dos botones y no uno: en el teléfono, «Cámara» abre directo la cámara
 * (atributo capture) y «Galería» el carrete. Teniendo que dar de alta
 * negocios parado en la banqueta, esa diferencia ahorra toques.
 *
 * La vista previa aparece ANTES de que termine la subida, leyendo el archivo
 * en local: el usuario confirma que eligió la foto correcta mientras sube.
 */
const ImageUploader = ({
  value,                 // URL ya guardada, si la hay
  onUploaded,            // (url) => void
  token,
  scope = "admin",
  label = "Imagen",
  ayuda,
  alto = "h-40",
  permitirUrl = true,    // deja pegar una URL como respaldo
}) => {
  const archivoRef = useRef(null);
  const camaraRef = useRef(null);

  const [previa, setPrevia] = useState(null);   // DataURL local mientras sube
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);
  const [compresion, setCompresion] = useState(null);
  const [modoUrl, setModoUrl] = useState(false);
  const [urlManual, setUrlManual] = useState("");
  const [rota, setRota] = useState(false);

  const mostrada = previa || value;

  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";                 // permite reelegir el mismo archivo
    if (!archivo) return;

    const problema = revisarArchivo(archivo);
    if (problema) { setError(problema); return; }

    setError(null);
    setListo(false);
    setRota(false);
    setCompresion(null);

    // Vista previa inmediata, sin esperar al servidor.
    const lector = new FileReader();
    lector.onload = () => setPrevia(lector.result);
    lector.readAsDataURL(archivo);

    setSubiendo(true);
    setProgreso(0);
    try {
      const r = await subirImagen(archivo, { token, scope, onProgreso: setProgreso });
      onUploaded(r.url);
      setCompresion(resumenCompresion(r));
      setPrevia(null);                   // ya hay URL real: se usa esa
      setListo(true);
      setTimeout(() => setListo(false), 3500);
    } catch (err) {
      setError(mensajeDeError(err));
      setPrevia(null);
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = () => {
    onUploaded("");
    setPrevia(null); setError(null); setListo(false); setRota(false);
  };

  const aceptarUrl = () => {
    const u = urlManual.trim();
    if (!u) return;
    onUploaded(u);
    setUrlManual(""); setModoUrl(false); setRota(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[#A3A3A3]">{label}</span>
        {permitirUrl && (
          <button
            type="button"
            onClick={() => setModoUrl((v) => !v)}
            className="text-xs text-[#737373] hover:text-[#CCFF00] inline-flex items-center gap-1"
          >
            <Link2 className="w-3 h-3" />
            {modoUrl ? "Subir archivo" : "Pegar URL"}
          </button>
        )}
      </div>

      {modoUrl ? (
        <div className="flex gap-2">
          <Input
            value={urlManual}
            onChange={(e) => setUrlManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aceptarUrl(); } }}
            placeholder="https://ejemplo.com/foto.jpg"
            className="bg-[#0A0A0A] border-[#262626] text-white"
          />
          <Button type="button" onClick={aceptarUrl} disabled={!urlManual.trim()}
                  className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600] flex-shrink-0">
            Usar
          </Button>
        </div>
      ) : (
        <>
          <input ref={archivoRef} type="file" accept={ACCEPT} onChange={elegir} className="hidden" />
          <input ref={camaraRef} type="file" accept="image/*" capture="environment"
                 onChange={elegir} className="hidden" />

          <div
            className={`relative ${alto} rounded-xl border border-dashed border-[#333]
                        bg-[#0A0A0A] overflow-hidden flex items-center justify-center`}
            data-testid="zona-imagen"
          >
            {mostrada && !rota ? (
              <img src={mostrada} alt={label}
                   className="w-full h-full object-contain"
                   onError={() => setRota(true)} />
            ) : (
              <div className="text-center px-4">
                <Upload className="w-7 h-7 text-[#333] mx-auto mb-2" />
                <p className="text-xs text-[#525252]">
                  {rota ? "No se pudo cargar la imagen" : "Sin imagen"}
                </p>
              </div>
            )}

            {subiendo && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 text-[#CCFF00] animate-spin" />
                <span className="text-xs text-white">Subiendo… {progreso}%</span>
                <div className="w-2/3 h-1 bg-[#262626] rounded-full overflow-hidden">
                  <div className="h-full bg-[#CCFF00] transition-all"
                       style={{ width: `${progreso}%` }} />
                </div>
              </div>
            )}

            {listo && !subiendo && (
              <div
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full
                           bg-[#CCFF00] text-black text-[11px] font-bold"
                data-testid="subida-exitosa"
              >
                <Check className="w-3 h-3" /> Subida
              </div>
            )}

            {mostrada && !subiendo && (
              <button type="button" onClick={quitar} title="Quitar imagen"
                      className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/70
                                 text-white flex items-center justify-center hover:bg-red-500/80">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={() => archivoRef.current?.click()} disabled={subiendo}
                    className="flex-1 bg-[#171717] border border-[#262626] text-white hover:bg-[#1f1f1f]">
              <Upload className="w-4 h-4 mr-2" /> Galería
            </Button>
            {/* En escritorio el navegador ignora capture y abre el explorador. */}
            <Button type="button" onClick={() => camaraRef.current?.click()} disabled={subiendo}
                    className="flex-1 bg-[#171717] border border-[#262626] text-white hover:bg-[#1f1f1f]">
              <Camera className="w-4 h-4 mr-2" /> Cámara
            </Button>
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400" data-testid="error-subida">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {compresion && !error && (
        <p className="text-xs text-[#CCFF00]" data-testid="compresion">
          La API la comprimió: {compresion}
        </p>
      )}

      {ayuda && !error && <p className="text-xs text-[#737373]">{ayuda}</p>}
    </div>
  );
};

export default ImageUploader;
