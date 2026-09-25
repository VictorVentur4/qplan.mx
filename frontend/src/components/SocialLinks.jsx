import { Instagram, Facebook, MessageCircle } from "lucide-react";
import { redesDe } from "../lib/social";

const ICONOS = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
};

/**
 * Redes sociales del negocio.
 *
 * Solo pinta las que tiene capturadas: si no hay ninguna, no se renderiza
 * nada (ni el título ni el recuadro), tal como se pidió.
 *
 * variant="full"   → recuadro con etiqueta y el usuario/teléfono visible.
 * variant="compact"→ fila de iconos, para espacios chicos.
 */
const SocialLinks = ({ business, variant = "full" }) => {
  const redes = redesDe(business);
  if (redes.length === 0) return null;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2" data-testid="social-links">
        {redes.map(({ red, url, etiqueta }) => {
          const Icono = ICONOS[red];
          return (
            <a
              key={red}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={etiqueta}
              aria-label={etiqueta}
              className="w-8 h-8 rounded-full bg-[#171717] border border-[#262626]
                         flex items-center justify-center text-[#A3A3A3]
                         hover:text-[#CCFF00] hover:border-[#CCFF00]/40 transition-colors"
            >
              <Icono className="w-4 h-4" />
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]"
      data-testid="social-links"
    >
      <p className="text-sm text-[#A3A3A3] mb-3">Redes sociales</p>
      <div className="flex flex-wrap gap-2">
        {redes.map(({ red, url, etiqueta, texto }) => {
          const Icono = ICONOS[red];
          return (
            <a
              key={red}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${etiqueta}: ${texto}`}
              className="flex items-center gap-2 px-3 py-2 rounded-full
                         bg-[#171717] border border-[#262626] text-sm text-white
                         hover:border-[#CCFF00]/40 hover:text-[#CCFF00] transition-colors"
            >
              <Icono className="w-4 h-4 text-[#CCFF00]" />
              <span className="sr-only">{etiqueta}: </span>
              <span>{texto}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default SocialLinks;
