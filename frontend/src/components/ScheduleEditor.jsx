import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Copy, Clock } from "lucide-react";
import { DIAS } from "../constants/businessTypes";

/**
 * Editor de horario día por día.
 *
 * `value` es el arreglo de 7 objetos {day, closed, all_day, open, close}
 * que viaja al backend como `hours_schedule`.
 *
 * Cada día tiene tres estados: cerrado, abierto 24 horas, o un rango.
 * Cuando está en 24 horas se ocultan las horas: no hay rango que capturar.
 */
const ScheduleEditor = ({ value, onChange }) => {
  const setDia = (day, cambios) =>
    onChange(value.map((d) => (d.day === day ? { ...d, ...cambios } : d)));

  // Copia el horario del primer día abierto al resto de los días abiertos.
  const copiarAlResto = () => {
    const base = value.find((d) => !d.closed);
    if (!base) return;
    onChange(value.map((d) => (d.closed
      ? d
      : { ...d, all_day: base.all_day, open: base.open, close: base.close })));
  };

  const todos24h = value.every((d) => d.all_day && !d.closed);

  // Un solo clic para el caso más común de 24 horas: toda la semana.
  const alternarSemana24h = () =>
    onChange(value.map((d) => (todos24h
      ? { ...d, all_day: false, open: d.open || "09:00", close: d.close || "18:00" }
      : { ...d, closed: false, all_day: true, open: "", close: "" })));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <span className="text-sm text-[#A3A3A3]">Horario de atención</span>
        <div className="flex items-center gap-1">
          <Button
            type="button" variant="ghost" size="sm"
            onClick={alternarSemana24h}
            aria-pressed={todos24h}
            className={`h-8 ${todos24h
              ? "text-black bg-[#CCFF00] hover:bg-[#B3E600]"
              : "text-[#CCFF00] hover:bg-[#CCFF00]/10"}`}
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Abierto 24 h
          </Button>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={copiarAlResto}
            className="text-[#CCFF00] hover:bg-[#CCFF00]/10 h-8"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copiar al resto
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#262626] divide-y divide-[#262626] overflow-hidden">
        {value.map((d) => (
          <div key={d.day} className="flex items-center gap-3 px-3 py-2 bg-[#0A0A0A]">
            <span className="w-24 text-sm text-white flex-shrink-0">{DIAS[d.day]}</span>

            <Switch
              checked={!d.closed}
              onCheckedChange={(abierto) => setDia(d.day, { closed: !abierto })}
              aria-label={`${DIAS[d.day]} abierto`}
            />

            {d.closed ? (
              <span className="text-sm text-[#525252] flex-1">Cerrado</span>
            ) : (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDia(d.day, {
                    all_day: !d.all_day,
                    open: d.all_day ? (d.open || "09:00") : "",
                    close: d.all_day ? (d.close || "18:00") : "",
                  })}
                  aria-pressed={d.all_day}
                  aria-label={`${DIAS[d.day]} abierto las 24 horas`}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    d.all_day
                      ? "bg-[#CCFF00] text-black border-[#CCFF00]"
                      : "bg-[#050505] text-[#A3A3A3] border-[#262626] hover:text-white"
                  }`}
                >
                  24 h
                </button>

                {d.all_day ? (
                  <span className="text-sm text-[#CCFF00]">Abierto las 24 horas</span>
                ) : (
                  <>
                    <Input
                      type="time" value={d.open || ""}
                      onChange={(e) => setDia(d.day, { open: e.target.value })}
                      className="bg-[#050505] border-[#262626] text-white h-9 w-32"
                    />
                    <span className="text-[#525252] text-sm">a</span>
                    <Input
                      type="time" value={d.close || ""}
                      onChange={(e) => setDia(d.day, { close: e.target.value })}
                      className="bg-[#050505] border-[#262626] text-white h-9 w-32"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[#737373]">
        Si un negocio cierra de madrugada, pon por ejemplo 22:00 a 02:00. Se entiende
        que el cierre es del día siguiente. Si abre las 24 horas los siete días, la
        ficha muestra solo «Abierto las 24 horas».
      </p>
    </div>
  );
};

export default ScheduleEditor;
