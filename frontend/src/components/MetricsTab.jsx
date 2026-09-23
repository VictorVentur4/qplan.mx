import { useState, useEffect, useCallback } from "react";
import {
  Eye, Store, QrCode, Link2, Download, Loader2, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axiosInstance, { API } from "../api/axios";
import StatCard from "./StatCard";
import DailyChart from "./DailyChart";

const RANGOS = [
  { valor: "7", etiqueta: "Últimos 7 días" },
  { valor: "30", etiqueta: "Últimos 30 días" },
  { valor: "90", etiqueta: "Últimos 90 días" },
  { valor: "365", etiqueta: "Último año" },
];

/** Barra proporcional dentro de la tabla: un solo color, la longitud es el dato. */
const BarraProporcion = ({ valor, maximo }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 rounded-full bg-[#171717] overflow-hidden min-w-[60px]">
      <div
        className="h-full rounded-full bg-[#CCFF00]"
        style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%` }}
      />
    </div>
    <span className="text-white tabular-nums text-sm w-12 text-right">
      {valor.toLocaleString("es-MX")}
    </span>
  </div>
);

const MetricsTab = ({ token }) => {
  const [dias, setDias] = useState("30");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await axiosInstance.get("/admin/metrics/summary", {
        params: { dias },
        headers: { Authorization: `Bearer ${token}` },
      });
      setDatos(data);
    } catch {
      toast.error("No se pudieron cargar las métricas");
    } finally {
      setCargando(false);
    }
  }, [dias, token]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarReporte = async (negocio) => {
    setDescargando(negocio.id);
    try {
      const respuesta = await fetch(
        `${API}/admin/metrics/business/${negocio.id}/csv?dias=${dias}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!respuesta.ok) throw new Error();
      const blob = await respuesta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qplan-${negocio.nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Reporte descargado");
    } catch {
      toast.error("No se pudo generar el reporte");
    } finally {
      setDescargando(null);
    }
  };

  if (cargando && !datos) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#CCFF00] animate-spin" />
      </div>
    );
  }

  if (!datos) return null;

  const maxNegocio = Math.max(1, ...datos.top_negocios.map((n) => n.vistas));
  const maxQr = Math.max(1, ...datos.top_qr.map((q) => q.vistas));
  const sinDatos = datos.total_visitas === 0 && datos.total_vistas_negocios === 0;

  return (
    <div className={cargando ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {/* Un solo filtro, arriba de todo lo que afecta */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-6">
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="w-full sm:w-[200px] bg-[#0A0A0A] border-[#262626] text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0A0A0A] border-[#262626]">
            {RANGOS.map((r) => (
              <SelectItem key={r.valor} value={r.valor} className="text-white">
                {r.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[#525252]">
          {datos.desde} a {datos.hasta} · horario de {datos.zona_horaria}
        </p>
      </div>

      {sinDatos ? (
        <div className="rounded-2xl border border-[#262626] bg-[#0A0A0A] p-10 text-center">
          <Eye className="w-10 h-10 text-[#525252] mx-auto mb-4" />
          <h4 className="text-white font-semibold mb-2">Todavía no hay visitas registradas</h4>
          <p className="text-[#737373] text-sm max-w-md mx-auto">
            Las métricas empiezan a contar desde que se instaló esta versión.
            En cuanto alguien abra el sitio, aparecerán aquí.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Visitas al sitio" value={datos.total_visitas.toLocaleString("es-MX")} icon={Eye} />
            <StatCard title="Fichas abiertas" value={datos.total_vistas_negocios.toLocaleString("es-MX")} icon={Store} />
            <StatCard title="Desde un QR" value={datos.visitas_desde_qr.toLocaleString("es-MX")} icon={QrCode} />
            <StatCard title="Entrada directa" value={datos.visitas_directas.toLocaleString("es-MX")} icon={Link2} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <DailyChart serie={datos.serie} titulo="Visitas al sitio por día" campo="visitas" />
            <DailyChart serie={datos.serie} titulo="Fichas de negocio abiertas por día" campo="vistas_negocios" />
          </div>

          {/* Negocios más vistos */}
          <div className="rounded-2xl border border-[#262626] overflow-x-auto mb-6">
            <div className="p-4 border-b border-[#262626]">
              <h4 className="text-white font-semibold">Negocios más vistos</h4>
              <p className="text-xs text-[#737373] mt-1 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                La posición promedio indica en qué lugar de la lista aparecía cuando lo
                abrieron. Un negocio con muchas vistas y posición cercana a 1 puede estar
                ganando por salir primero, no por ser más atractivo.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-[#262626] hover:bg-transparent">
                  <TableHead className="text-[#A3A3A3]">Negocio</TableHead>
                  <TableHead className="text-[#A3A3A3] w-[200px]">Fichas abiertas</TableHead>
                  <TableHead className="text-[#A3A3A3]">Posición promedio</TableHead>
                  <TableHead className="text-[#A3A3A3] text-right">Reporte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.top_negocios.length === 0 ? (
                  <TableRow className="border-[#262626]">
                    <TableCell colSpan={4} className="text-center text-[#737373] py-8">
                      Nadie ha abierto una ficha en este periodo
                    </TableCell>
                  </TableRow>
                ) : datos.top_negocios.map((n) => (
                  <TableRow key={n.id} className="border-[#262626]">
                    <TableCell className="text-white font-medium">
                      <div className="flex items-center gap-2">
                        {n.nombre}
                        {!n.is_active && (
                          <Badge className="bg-[#262626] text-[#A3A3A3] hover:bg-[#262626] text-[10px]">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <BarraProporcion valor={n.vistas} maximo={maxNegocio} />
                    </TableCell>
                    <TableCell className="text-[#A3A3A3] tabular-nums">
                      {n.posicion_media ? `${n.posicion_media}º` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost"
                        disabled={descargando === n.id}
                        onClick={() => descargarReporte(n)}
                        className="text-[#A3A3A3] hover:text-[#CCFF00]"
                        title="Descargar reporte CSV para el dueño"
                      >
                        {descargando === n.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Códigos QR */}
          <div className="rounded-2xl border border-[#262626] overflow-x-auto">
            <div className="p-4 border-b border-[#262626]">
              <h4 className="text-white font-semibold">Origen de las visitas</h4>
              <p className="text-xs text-[#737373] mt-1">
                Agrega <code className="text-[#CCFF00]">?qr=identificador</code> a la URL de
                cada código para saber cuál está funcionando.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-[#262626] hover:bg-transparent">
                  <TableHead className="text-[#A3A3A3]">Código QR</TableHead>
                  <TableHead className="text-[#A3A3A3] w-[240px]">Visitas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.top_qr.map((q) => (
                  <TableRow key={q.qr_id} className="border-[#262626]">
                    <TableCell className="text-white font-mono text-sm">{q.qr_id}</TableCell>
                    <TableCell>
                      <BarraProporcion valor={q.vistas} maximo={maxQr} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

export default MetricsTab;
