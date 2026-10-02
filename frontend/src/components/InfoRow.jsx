import { ExternalLink } from "lucide-react";

/**
 * Renglón de dato con icono.
 *
 * `hint` es una nota chica bajo el valor; se usa para avisar que el renglón
 * abre algo fuera de la app ("Ver en Google Maps"), de modo que el usuario
 * sepa a dónde va antes de tocar.
 */
const InfoRow = ({ icon: Icon, label, value, isLink, href, external, hint, testId }) => {
  const contenido = isLink ? (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-white hover:text-[#CCFF00] transition-colors inline-flex items-center gap-1.5"
    >
      {value}
      {external && <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />}
    </a>
  ) : (
    <p className="text-white">{value}</p>
  );

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]"
      data-testid={testId}
    >
      <Icon className="w-5 h-5 text-[#CCFF00] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm text-[#A3A3A3] mb-1">{label}</p>
        {contenido}
        {hint && <p className="text-xs text-[#525252] mt-1">{hint}</p>}
      </div>
    </div>
  );
};

export default InfoRow;
