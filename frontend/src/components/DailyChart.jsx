import { useState, useMemo, useRef } from "react";
import { Table2, LineChart as LineChartIcon } from "lucide-react";

/**
 * Serie diaria de una sola métrica.
 *
 * Es SVG a mano y no una librería de gráficas: para una serie única no vale
 * la pena sumar ~500 KB al paquete. Sigue las reglas de la guía de
 * visualización: una sola serie (sin leyenda, el título la nombra), trazo
 * fino, rejilla sólida discreta, etiqueta directa solo en el máximo, y una
 * vista de tabla equivalente para que ningún valor dependa del tooltip.
 */

const COLOR = "#CCFF00";
const SUPERFICIE = "#0A0A0A";
const REJILLA = "#262626";

const formatearFecha = (iso, largo = false) => {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(a, m - 1, d);
  return fecha.toLocaleDateString("es-MX", largo
    ? { weekday: "short", day: "numeric", month: "long" }
    : { day: "numeric", month: "short" });
};

const DailyChart = ({ serie = [], titulo, campo = "visitas", altura = 240 }) => {
  const [hover, setHover] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const svgRef = useRef(null);

  const { puntos, maxValor, maxIndice, total } = useMemo(() => {
    const valores = serie.map((d) => d[campo] ?? 0);
    const max = Math.max(1, ...valores);
    return {
      puntos: valores,
      maxValor: max,
      maxIndice: valores.indexOf(Math.max(...valores)),
      total: valores.reduce((a, b) => a + b, 0),
    };
  }, [serie, campo]);

  if (!serie.length) {
    return (
      <div className="rounded-2xl border border-[#262626] bg-[#0A0A0A] p-10 text-center">
        <p className="text-[#737373] text-sm">Todavía no hay datos en este periodo</p>
      </div>
    );
  }

  // Geometría. El alto incluye la banda del eje X para que no aparezca
  // un scroll interno en la tarjeta.
  const W = 800, H = altura, PAD_I = 44, PAD_D = 16, PAD_S = 18, PAD_INF = 34;
  const anchoPlot = W - PAD_I - PAD_D;
  const altoPlot = H - PAD_S - PAD_INF;

  const x = (i) => PAD_I + (puntos.length === 1 ? anchoPlot / 2 : (i / (puntos.length - 1)) * anchoPlot);
  const y = (v) => PAD_S + altoPlot - (v / maxValor) * altoPlot;

  const linea = puntos.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${PAD_S + altoPlot} L${x(0).toFixed(1)},${PAD_S + altoPlot} Z`;

  // Cuatro líneas de rejilla con valores enteros
  const pasos = 4;
  const marcasY = Array.from({ length: pasos + 1 }, (_, i) => Math.round((maxValor / pasos) * i));

  // Etiquetas del eje X: no más de 7 para que no se encimen
  const cadaCuantos = Math.max(1, Math.ceil(puntos.length / 7));

  const alMover = (e) => {
    const caja = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - caja.left) / caja.width) * W;
    const i = Math.round(((px - PAD_I) / anchoPlot) * (puntos.length - 1));
    setHover(i >= 0 && i < puntos.length ? i : null);
  };

  return (
    <div className="rounded-2xl border border-[#262626] bg-[#0A0A0A] p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-white font-semibold">{titulo}</h4>
          <p className="text-[#737373] text-xs mt-0.5">
            {total.toLocaleString("es-MX")} en total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVerTabla(!verTabla)}
          className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-white px-2 py-1 rounded-lg hover:bg-[#171717] transition-colors"
          aria-label={verTabla ? "Ver como gráfica" : "Ver como tabla"}
        >
          {verTabla ? <LineChartIcon className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
          {verTabla ? "Gráfica" : "Tabla"}
        </button>
      </div>

      {verTabla ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0A0A0A]">
              <tr className="text-left text-[#737373] text-xs">
                <th className="pb-2 font-normal">Fecha</th>
                <th className="pb-2 font-normal text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((d) => (
                <tr key={d.fecha} className="border-t border-[#171717]">
                  <td className="py-1.5 text-[#A3A3A3]">{formatearFecha(d.fecha, true)}</td>
                  <td className="py-1.5 text-white text-right tabular-nums">
                    {(d[campo] ?? 0).toLocaleString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ height: H }}
            onMouseMove={alMover}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`${titulo}. ${total} en total.`}
          >
            {/* Rejilla: líneas sólidas de un tono sobre la superficie */}
            {marcasY.map((v, i) => (
              <g key={i}>
                <line
                  x1={PAD_I} x2={W - PAD_D}
                  y1={y(v)} y2={y(v)}
                  stroke={REJILLA} strokeWidth="1"
                />
                <text
                  x={PAD_I - 8} y={y(v) + 4}
                  textAnchor="end" fontSize="11" fill="#737373"
                  className="tabular-nums"
                >
                  {v}
                </text>
              </g>
            ))}

            <defs>
              <linearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR} stopOpacity="0.18" />
                <stop offset="100%" stopColor={COLOR} stopOpacity="0" />
              </linearGradient>
            </defs>

            <path d={area} fill="url(#relleno)" />
            <path d={linea} fill="none" stroke={COLOR} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" />

            {/* Etiqueta directa solo en el máximo */}
            {maxValor > 0 && (
              <>
                <circle cx={x(maxIndice)} cy={y(puntos[maxIndice])} r="4"
                        fill={COLOR} stroke={SUPERFICIE} strokeWidth="2" />
                <text
                  x={x(maxIndice)} y={y(puntos[maxIndice]) - 12}
                  textAnchor="middle" fontSize="11" fill="#FFFFFF" fontWeight="600"
                >
                  {puntos[maxIndice]}
                </text>
              </>
            )}

            {/* Eje X */}
            {serie.map((d, i) => (
              i % cadaCuantos === 0 || i === serie.length - 1 ? (
                <text key={d.fecha} x={x(i)} y={H - 12}
                      textAnchor="middle" fontSize="11" fill="#737373">
                  {formatearFecha(d.fecha)}
                </text>
              ) : null
            ))}

            {/* Cruz y marcador del punto bajo el cursor */}
            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={PAD_S} y2={PAD_S + altoPlot}
                      stroke={REJILLA} strokeWidth="1" />
                <circle cx={x(hover)} cy={y(puntos[hover])} r="5"
                        fill={COLOR} stroke={SUPERFICIE} strokeWidth="2" />
              </>
            )}
          </svg>

          {hover !== null && (
            <div
              className="absolute pointer-events-none bg-[#171717] border border-[#262626] rounded-xl px-3 py-2 shadow-xl"
              style={{
                left: `${(x(hover) / W) * 100}%`,
                top: 0,
                transform: "translateX(-50%)",
              }}
            >
              <p className="text-[10px] text-[#A3A3A3] whitespace-nowrap">
                {formatearFecha(serie[hover].fecha, true)}
              </p>
              <p className="text-sm text-white font-semibold tabular-nums">
                {puntos[hover].toLocaleString("es-MX")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DailyChart;
