import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { DIAS } from "../constants/businessTypes";

/**
 * Editor de horario día por día.
 *
 * `value` es el arreglo de 7 objetos {day, closed, open, close} que viaja
 * al backend como `hours_schedule`.
 */
const ScheduleEditor = ({ value, onChange }) => {
  const setDia = (day, campo, v) =>
    onChange(value.map((d) => (d.day === day ? { ...d, [campo]: v } : d)));

  // Copia el horario del primer día abierto al resto de los días abiertos.
  const copiarAlResto = () => {
    const base = value.find((d) => !d.closed);
    if (!base) return;
    onChange(value.map((d) => (d.closed ? d : { ...d, open: base.open, close: base.close })));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#A3A3A3]">Horario de atención</span>
        <Button
          type="button" variant="ghost" size="sm"
          onClick={copiarAlResto}
          className="text-[#CCFF00] hover:bg-[#CCFF00]/10 h-8"
        >
          <Copy className="w-3.5 h-3.5 mr-1.5" />
          Copiar al resto
        </Button>
      </div>

      <div className="rounded-xl border border-[#262626] divide-y divide-[#262626] overflow-hidden">
        {value.map((d) => (
          <div key={d.day} className="flex items-center gap-3 px-3 py-2 bg-[#0A0A0A]">
            <span className="w-24 text-sm text-white flex-shrink-0">{DIAS[d.day]}</span>

            <Switch
              checked={!d.closed}
              onCheckedChange={(abierto) => setDia(d.day, "closed", !abierto)}
              aria-label={`${DIAS[d.day]} abierto`}
            />

            {d.closed ? (
              <span className="text-sm text-[#525252] flex-1">Cerrado</span>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time" value={d.open || ""}
                  onChange={(e) => setDia(d.day, "open", e.target.value)}
                  className="bg-[#050505] border-[#262626] text-white h-9 w-32"
                />
                <span className="text-[#525252] text-sm">a</span>
                <Input
                  type="time" value={d.close || ""}
                  onChange={(e) => setDia(d.day, "close", e.target.value)}
                  className="bg-[#050505] border-[#262626] text-white h-9 w-32"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[#737373]">
        Si un negocio cierra de madrugada, pon por ejemplo 22:00 a 02:00. Se entiende
        que el cierre es del día siguiente.
      </p>
    </div>
  );
};

export default ScheduleEditor;
