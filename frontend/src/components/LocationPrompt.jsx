import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MENSAJES_UBICACION } from "../lib/location";

/**
 * Se muestra en lugar del listado cuando no hay ninguna ubicación:
 * ni GPS del usuario ni coordenadas de un código QR.
 *
 * Es deliberadamente un bloqueo y no un listado con datos de otra ciudad:
 * sin ubicación, "negocios cercanos" no significa nada.
 */
const LocationPrompt = ({ onRetry, isRequesting, motivo }) => {
  const bloqueado = motivo === "denegado";
  const sinHttps = motivo === "sin_https";

  return (
    <div className="text-center py-16 px-4 animate-fade-in">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 flex items-center justify-center">
        {bloqueado || sinHttps
          ? <AlertCircle className="w-9 h-9 text-[#CCFF00]" />
          : <MapPin className="w-9 h-9 text-[#CCFF00]" />}
      </div>

      <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
        Necesitamos saber dónde estás
      </h3>

      <p className="text-[#A3A3A3] text-sm sm:text-base max-w-md mx-auto mb-2 leading-relaxed">
        Qplan te muestra los negocios más cercanos a ti. Comparte tu ubicación
        para ver qué hay alrededor.
      </p>

      {motivo && (
        <p className="text-[#737373] text-sm max-w-md mx-auto mb-8">
          {MENSAJES_UBICACION[motivo] || MENSAJES_UBICACION.desconocido}
        </p>
      )}
      {!motivo && <div className="mb-8" />}

      {!sinHttps && (
        <Button
          onClick={onRetry}
          disabled={isRequesting}
          className="bg-[#CCFF00] text-black font-bold rounded-full hover:bg-[#B3E600] h-12 px-8"
        >
          {isRequesting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Buscando tu ubicación…
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 mr-2" />
              {bloqueado ? "Intentar de nuevo" : "Compartir mi ubicación"}
            </>
          )}
        </Button>
      )}

      {bloqueado && (
        <div className="mt-8 max-w-md mx-auto text-left p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]">
          <p className="text-xs text-[#A3A3A3] mb-2 font-semibold">
            Si el botón no hace nada, el permiso quedó bloqueado:
          </p>
          <ul className="text-xs text-[#737373] space-y-1 list-disc list-inside">
            <li>Toca el candado 🔒 junto a la dirección del sitio.</li>
            <li>Busca «Ubicación» y cámbialo a «Permitir».</li>
            <li>Recarga la página.</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default LocationPrompt;
