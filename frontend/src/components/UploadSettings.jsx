import { useCallback, useEffect, useState } from "react";
import {
  Save, Loader2, CheckCircle2, XCircle, PlugZap, Eye, EyeOff, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axiosInstance from "../api/axios";

/**
 * Configuración de la API externa de imágenes, editable desde el panel.
 *
 * La idea es que si ese servicio se cae o cambia de dominio, se corrige
 * aquí en dos minutos y no hay que tocar archivos ni reiniciar el servidor.
 *
 * La llave nunca llega al navegador: el backend solo manda si está puesta
 * y sus últimos cuatro caracteres. Por eso el campo se deja vacío al
 * cargar: vacío significa «conserva la que ya tienes».
 */
const MODOS = [
  { valor: "header", etiqueta: "En un header", pista: "X-API-Key: tu-llave" },
  { valor: "form", etiqueta: "En el formulario", pista: "un campo más junto al archivo" },
  { valor: "query", etiqueta: "En la URL", pista: "?apikey=tu-llave" },
];

const UploadSettings = ({ token }) => {
  const [cfg, setCfg] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState(null);
  const [llave, setLlave] = useState("");
  const [verLlave, setVerLlave] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const cargar = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get("/admin/settings/uploads", { headers });
      setCfg(data);
    } catch {
      toast.error("No se pudieron cargar los ajustes");
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (valor) => setCfg((c) => ({ ...c, [campo]: valor }));

  const guardar = async () => {
    setGuardando(true);
    setPrueba(null);
    try {
      const cuerpo = {
        activo: cfg.activo,
        endpoint: cfg.endpoint,
        modo_clave: cfg.modo_clave,
        nombre_clave: cfg.nombre_clave,
        campo_archivo: cfg.campo_archivo,
        ruta_url_respuesta: cfg.ruta_url_respuesta,
        base_publica: cfg.base_publica,
        max_kb: Number(cfg.max_kb) || 0,
        campo_max_kb: cfg.campo_max_kb,
      };
      // Solo se manda la llave si el administrador escribió una.
      if (llave.trim()) cuerpo.api_key = llave.trim();
      const { data } = await axiosInstance.put("/admin/settings/uploads", cuerpo, { headers });
      setCfg(data);
      setLlave("");
      toast.success("Ajustes guardados");
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const borrarLlave = async () => {
    try {
      const { data } = await axiosInstance.put(
        "/admin/settings/uploads", { api_key: "" }, { headers });
      setCfg(data);
      toast.success("Llave borrada");
    } catch {
      toast.error("No se pudo borrar la llave");
    }
  };

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const { data } = await axiosInstance.post(
        "/admin/settings/uploads/probar", {}, { headers });
      setPrueba(data);
    } catch (e) {
      setPrueba({ ok: false, error: e.response?.data?.detail || "Falló la prueba" });
    } finally {
      setProbando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-[#CCFF00] animate-spin" />
      </div>
    );
  }
  if (!cfg) return null;

  const campo = "bg-[#0A0A0A] border-[#262626] text-white";

  return (
    <div className="space-y-5 max-w-3xl" data-testid="ajustes-subidas">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]">
        <Info className="w-5 h-5 text-[#CCFF00] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#A3A3A3]">
          Qplan no guarda las imágenes: las manda a este servicio y solo
          almacena la URL que devuelve. Si el servicio cambia de dirección o
          se cae, se corrige aquí sin tocar código.
        </p>
      </div>

      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]">
        <div>
          <p className="text-white font-medium">Subida de imágenes</p>
          <p className="text-xs text-[#737373]">
            {cfg.activo
              ? "Activa: el panel puede subir logotipos y fotos."
              : "Apagada: solo se pueden pegar URLs."}
          </p>
        </div>
        <Switch checked={!!cfg.activo} onCheckedChange={set("activo")}
                aria-label="Activar subida de imágenes" />
      </div>

      <div className="space-y-2">
        <Label className="text-[#A3A3A3]">Dirección de la API</Label>
        <Input value={cfg.endpoint || ""} onChange={(e) => set("endpoint")(e.target.value)}
               placeholder="https://tu-proyecto.com/api/upload.php"
               data-testid="campo-endpoint" className={campo} />
      </div>

      <div className="space-y-2">
        <Label className="text-[#A3A3A3]">
          Llave
          {cfg.api_key_configurada && (
            <span className="ml-2 text-xs text-[#CCFF00]">
              configurada ({cfg.api_key_pista})
            </span>
          )}
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={verLlave ? "text" : "password"}
              value={llave}
              onChange={(e) => setLlave(e.target.value)}
              placeholder={cfg.api_key_configurada
                ? "Déjalo vacío para conservar la actual"
                : "Pega aquí la llave"}
              data-testid="campo-llave"
              className={`${campo} pr-10`}
              autoComplete="off"
            />
            <button type="button" onClick={() => setVerLlave((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#737373] hover:text-white"
                    aria-label={verLlave ? "Ocultar llave" : "Ver llave"}>
              {verLlave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {cfg.api_key_configurada && (
            <Button type="button" variant="outline" onClick={borrarLlave}
                    className="border-[#262626] text-[#A3A3A3] hover:text-red-400 flex-shrink-0">
              Borrar
            </Button>
          )}
        </div>
        <p className="text-xs text-[#737373]">
          Por seguridad la llave nunca se vuelve a mostrar. Si la cambias, escribe la nueva.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[#A3A3A3]">¿Dónde va la llave?</Label>
          <Select value={cfg.modo_clave} onValueChange={set("modo_clave")}>
            <SelectTrigger className={campo} data-testid="campo-modo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0A0A0A] border-[#262626]">
              {MODOS.map((m) => (
                <SelectItem key={m.valor} value={m.valor} className="text-white">
                  {m.etiqueta} <span className="text-[#525252] ml-1">— {m.pista}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[#A3A3A3]">Nombre de la llave</Label>
          <Input value={cfg.nombre_clave || ""} onChange={(e) => set("nombre_clave")(e.target.value)}
                 placeholder="X-API-Key" className={campo} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[#A3A3A3]">Nombre del campo del archivo</Label>
          <Input value={cfg.campo_archivo || ""} onChange={(e) => set("campo_archivo")(e.target.value)}
                 placeholder="file" className={campo} />
          <p className="text-xs text-[#737373]">Como lo espera tu PHP en $_FILES.</p>
        </div>
        <div className="space-y-2">
          <Label className="text-[#A3A3A3]">Ruta de la URL en la respuesta</Label>
          <Input value={cfg.ruta_url_respuesta || ""}
                 onChange={(e) => set("ruta_url_respuesta")(e.target.value)}
                 placeholder="data.url" className={campo} />
          <p className="text-xs text-[#737373]">
            Vacío = se buscan las más comunes (url, data.url, link…).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[#A3A3A3]">Comprimir a un máximo de (KB)</Label>
          <Input type="number" min="0" step="64"
                 value={cfg.max_kb ?? 0}
                 onChange={(e) => set("max_kb")(e.target.value)}
                 data-testid="campo-maxkb" className={campo} />
          <p className="text-xs text-[#737373]">
            {Number(cfg.max_kb) > 0
              ? `Se le pide a la API que deje cada imagen en ${Number(cfg.max_kb)} KB o menos (${(Number(cfg.max_kb)/1024).toFixed(1)} MB). Quien comprime es ella, no Qplan.`
              : "En 0 no se manda el campo y la API decide por su cuenta."}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-[#A3A3A3]">Nombre del campo de tamaño</Label>
          <Input value={cfg.campo_max_kb || ""}
                 onChange={(e) => set("campo_max_kb")(e.target.value)}
                 placeholder="max_kb" className={campo} />
          <p className="text-xs text-[#737373]">Como lo espera tu PHP en $_POST.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[#A3A3A3]">Base pública (opcional)</Label>
        <Input value={cfg.base_publica || ""} onChange={(e) => set("base_publica")(e.target.value)}
               placeholder="https://tu-proyecto.com" className={campo} />
        <p className="text-xs text-[#737373]">
          Solo si tu API devuelve rutas relativas como <code>/img/foto.jpg</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <Button onClick={guardar} disabled={guardando}
                className="bg-[#CCFF00] text-black font-bold rounded-xl hover:bg-[#B3E600]">
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar
        </Button>
        <Button onClick={probar} disabled={probando || !cfg.endpoint}
                variant="outline" data-testid="boton-probar"
                className="border-[#262626] text-white hover:bg-[#171717] rounded-xl">
          {probando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
          Probar conexión
        </Button>
      </div>

      {prueba && (
        <div
          data-testid="resultado-prueba"
          className={`p-4 rounded-2xl border ${prueba.ok
            ? "bg-[#CCFF00]/5 border-[#CCFF00]/30"
            : "bg-red-500/5 border-red-500/30"}`}
        >
          <div className="flex items-start gap-3">
            {prueba.ok
              ? <CheckCircle2 className="w-5 h-5 text-[#CCFF00] flex-shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${prueba.ok ? "text-[#CCFF00]" : "text-red-400"}`}>
                {prueba.ok ? "La conexión funciona" : "La prueba falló"}
              </p>
              {prueba.error && <p className="text-sm text-[#A3A3A3] mt-1">{prueba.error}</p>}
              {prueba.max_kb_enviado && (
                <p className="text-xs text-[#737373] mt-1">
                  Se pidió comprimir a {prueba.max_kb_enviado} KB como máximo.
                </p>
              )}
              {prueba.url_detectada && (
                <p className="text-sm text-white mt-2 break-all">
                  URL detectada:{" "}
                  <a href={prueba.url_detectada} target="_blank" rel="noopener noreferrer"
                     className="text-[#CCFF00] hover:underline">{prueba.url_detectada}</a>
                </p>
              )}
              {prueba.respuesta && (
                <>
                  <p className="text-xs text-[#737373] mt-3 mb-1">
                    Esto respondió tu API (sirve para ajustar los campos de arriba):
                  </p>
                  <pre className="text-xs text-[#A3A3A3] bg-[#050505] border border-[#262626]
                                  rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
{prueba.respuesta}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadSettings;
