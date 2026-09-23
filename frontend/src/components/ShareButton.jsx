import { useState, useRef, useEffect } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** URL pública y compartible de un negocio. */
export const shareUrl = (businessId) =>
  `${window.location.origin}/lugar/${businessId}`;

/**
 * Botón de compartir.
 *
 * En móvil usa la hoja nativa del sistema (Web Share API), que es lo que la
 * gente espera: manda directo a WhatsApp, Telegram, lo que tenga.
 * En escritorio, o si el navegador no la trae, copia el enlace al portapapeles.
 * Si tampoco hay portapapeles —pasa en http:// sin cifrar— muestra el enlace
 * en un campo seleccionable para copiarlo a mano.
 */
const ShareButton = ({ business }) => {
  const [copiado, setCopiado] = useState(false);
  const [enlaceVisible, setEnlaceVisible] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (enlaceVisible && inputRef.current) {
      inputRef.current.select();
    }
  }, [enlaceVisible]);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2200);
    return () => clearTimeout(t);
  }, [copiado]);

  if (!business) return null;

  const url = shareUrl(business.id);
  const texto = `${business.name} en Qplan.mx`;

  const compartir = async () => {
    // 1. Hoja nativa de compartir (móvil)
    if (navigator.share) {
      try {
        await navigator.share({ title: business.name, text: texto, url });
        return;
      } catch (e) {
        // El usuario canceló: no es un error que deba avisarse.
        if (e?.name === "AbortError") return;
      }
    }

    // 2. Portapapeles (escritorio). Requiere contexto seguro.
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Enlace copiado");
      return;
    } catch {
      // 3. Último recurso: mostrarlo para copiar a mano.
      setEnlaceVisible(true);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={compartir}
        className="border-[#262626] text-white hover:bg-[#171717] hover:text-[#CCFF00] rounded-full"
        aria-label={`Compartir ${business.name}`}
        data-testid="share-button"
      >
        {copiado
          ? <Check className="w-4 h-4 sm:mr-2 text-[#CCFF00]" />
          : <Share2 className="w-4 h-4 sm:mr-2" />}
        <span className="hidden sm:inline">{copiado ? "Copiado" : "Compartir"}</span>
      </Button>

      {enlaceVisible && (
        <div className="absolute left-0 right-0 bottom-full mb-3 mx-4 p-3 rounded-xl bg-[#171717] border border-[#262626] shadow-xl z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#A3A3A3]">Copia este enlace</span>
            <button
              type="button" onClick={() => setEnlaceVisible(false)}
              aria-label="Cerrar" className="text-[#A3A3A3] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            ref={inputRef}
            readOnly value={url}
            onFocus={(e) => e.target.select()}
            className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg px-3 py-2 text-xs text-white font-mono"
          />
          <p className="text-[10px] text-[#525252] mt-2 flex items-center gap-1">
            <Copy className="w-3 h-3" />
            Tu navegador no permite copiar automáticamente en sitios sin https.
          </p>
        </div>
      )}
    </>
  );
};

export default ShareButton;
