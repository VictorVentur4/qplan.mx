import { Clock } from "lucide-react";
import { DIAS } from "../constants/businessTypes";

/** Índice del día de hoy en nuestra convención (0 = lunes). */
export const hoyIndex = () => (new Date().getDay() + 6) % 7;

/**
 * Muestra el horario día por día, resaltando hoy.
 * Si no hay horario capturado, cae al texto libre heredado (`hours`).
 */
const ScheduleDisplay = ({ schedule, fallback }) => {
  const valido = Array.isArray(schedule) && schedule.length > 0;

  if (!valido) {
    if (!fallback) return null;
    return (
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]">
        <Clock className="w-5 h-5 text-[#CCFF00] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-[#A3A3A3] mb-1">Horario</p>
          <p className="text-white">{fallback}</p>
        </div>
      </div>
    );
  }

  const hoy = hoyIndex();
  const dias = [...schedule].sort((a, b) => a.day - b.day);

  return (
    <div className="p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]">
      <div className="flex items-center gap-3 mb-3">
        <Clock className="w-5 h-5 text-[#CCFF00]" />
        <p className="text-sm text-[#A3A3A3]">Horario de atención</p>
      </div>

      <ul className="space-y-1">
        {dias.map((d) => {
          const esHoy = d.day === hoy;
          return (
            <li
              key={d.day}
              className={`flex items-center justify-between text-sm px-2 py-1 rounded-lg ${
                esHoy ? "bg-[#CCFF00]/10" : ""
              }`}
            >
              <span className={esHoy ? "text-[#CCFF00] font-semibold" : "text-[#A3A3A3]"}>
                {DIAS[d.day]}
                {esHoy && <span className="ml-2 text-[10px] uppercase tracking-wide">hoy</span>}
              </span>
              <span className={d.closed
                ? "text-[#525252]"
                : esHoy ? "text-[#CCFF00] font-semibold" : "text-white"}>
                {d.closed ? "Cerrado" : `${d.open} – ${d.close}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ScheduleDisplay;
