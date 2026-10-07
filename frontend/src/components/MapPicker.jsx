import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Loader2, MapPin, AlertCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestBrowserLocation, MENSAJES_UBICACION } from "../lib/location";

/**
 * Selector de coordenadas sobre un mapa.
 *
 * Por qué un mapa dentro del formulario y no "abrir Google Maps": cuando el
 * navegador abre la app de Maps pierde el control y Maps no tiene forma de
 * devolver nada a la página. No existe ese callback. Así que el mapa vive
 * aquí y de aquí salen la latitud y la longitud.
 *
 * Tres formas de fijar el punto, pensadas para quien da de alta negocios
 * desde el celular, parado en la banqueta:
 *   1. «Estoy aquí» toma el GPS del teléfono. Es el camino rápido.
 *   2. Arrastrar el pin, o tocar el mapa, para corregir a mano.
 *   3. Pegar «lat, lng» copiadas de Google Maps.
 *
 * Los mosaicos son de OpenStreetMap: no requieren cuenta ni tarjeta. Su
 * licencia exige dejar visible la atribución, que Leaflet pinta solo.
 */

// Leaflet trae su icono por defecto como archivos sueltos que el empaquetador
// no resuelve. Se dibuja uno propio con los colores de la marca y de paso se
// evita el clásico marcador roto.
const ICONO = L.divIcon({
  className: "",
  html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      background:#CCFF00;border:3px solid #0a0a0a;
      transform:rotate(-45deg);box-shadow:0 4px 14px rgba(0,0,0,.6)">
      <div style="width:9px;height:9px;border-radius:50%;background:#0a0a0a;
        position:absolute;top:7px;left:7px"></div></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

const redondea = (n) => Math.round(n * 1e6) / 1e6;

const MapPicker = ({ lat, lng, onChange, alto = "h-64" }) => {
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const marcador = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [pegado, setPegado] = useState("");

  // --- creación del mapa, una sola vez ---------------------------------
  useEffect(() => {
    if (mapa.current || !contenedor.current) return;

    const inicio = [lat ?? 18.9242, lng ?? -99.2216];   // Cuernavaca por defecto
    const m = L.map(contenedor.current, {
      center: inicio,
      zoom: lat && lng ? 16 : 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);

    const mk = L.marker(inicio, { draggable: true, icon: ICONO }).addTo(m);
    mk.on("dragend", () => {
      const p = mk.getLatLng();
      onChangeRef.current(redondea(p.lat), redondea(p.lng));
    });
    m.on("click", (e) => {
      mk.setLatLng(e.latlng);
      onChangeRef.current(redondea(e.latlng.lat), redondea(e.latlng.lng));
    });

    mapa.current = m;
    marcador.current = mk;

    // El mapa suele nacer dentro de un diálogo que todavía está animando;
    // sin esto Leaflet calcula mal el tamaño y los mosaicos salen cortados.
    const t = setTimeout(() => m.invalidateSize(), 250);
    return () => { clearTimeout(t); m.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- el pin sigue a los valores del formulario -----------------------
  useEffect(() => {
    if (!mapa.current || !marcador.current) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const actual = marcador.current.getLatLng();
    if (Math.abs(actual.lat - lat) < 1e-7 && Math.abs(actual.lng - lng) < 1e-7) return;
    marcador.current.setLatLng([lat, lng]);
    mapa.current.panTo([lat, lng]);
  }, [lat, lng]);

  const usarMiUbicacion = async () => {
    setBuscando(true);
    setAviso(null);
    try {
      const { lat: la, lng: lo } = await requestBrowserLocation({ timeout: 10000 });
      onChange(redondea(la), redondea(lo));
      mapa.current?.setView([la, lo], 17);
    } catch (e) {
      setAviso(MENSAJES_UBICACION[e?.motivo] || MENSAJES_UBICACION.desconocido);
    } finally {
      setBuscando(false);
    }
  };

  /** Acepta «18.9242, -99.2216» y también el formato con espacios o sin coma. */
  const aplicarPegado = () => {
    const m = pegado.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) { setAviso("No reconocí esas coordenadas. Usa «18.9242, -99.2216»."); return; }
    const la = Number(m[1]);
    const lo = Number(m[2]);
    if (!(la >= -90 && la <= 90) || !(lo >= -180 && lo <= 180)) {
      setAviso("Esas coordenadas están fuera de rango.");
      return;
    }
    setAviso(null);
    setPegado("");
    onChange(redondea(la), redondea(lo));
    mapa.current?.setView([la, lo], 17);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-[#A3A3A3] inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#CCFF00]" />
          Ubicación en el mapa
        </span>
        <Button
          type="button" size="sm" onClick={usarMiUbicacion} disabled={buscando}
          data-testid="estoy-aqui"
          className="h-9 bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600] disabled:opacity-60"
        >
          {buscando
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Buscando…</>
            : <><Crosshair className="w-3.5 h-3.5 mr-1.5" /> Estoy aquí</>}
        </Button>
      </div>

      <div
        ref={contenedor}
        data-testid="mapa-selector"
        className={`${alto} w-full rounded-xl overflow-hidden border border-[#262626] bg-[#0A0A0A] z-0`}
      />

      <div className="flex items-center gap-2">
        <Input
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarPegado(); } }}
          placeholder="O pega aquí: 18.9242, -99.2216"
          aria-label="Pegar coordenadas"
          data-testid="pegar-coords"
          className="bg-[#0A0A0A] border-[#262626] text-white h-9 text-sm"
        />
        <Button type="button" size="sm" onClick={aplicarPegado} disabled={!pegado.trim()}
                className="h-9 bg-[#171717] border border-[#262626] text-white hover:bg-[#1f1f1f] flex-shrink-0">
          Ir
        </Button>
      </div>

      {aviso && (
        <div className="flex items-start gap-2 text-xs text-amber-400" data-testid="aviso-mapa">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{aviso}</span>
        </div>
      )}

      <p className="text-xs text-[#737373] flex items-start gap-1.5">
        <Maximize2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Toca el mapa o arrastra el pin para ajustar. En Google Maps puedes
        mantener presionado un punto para copiar sus coordenadas y pegarlas aquí.
      </p>
    </div>
  );
};

export default MapPicker;
