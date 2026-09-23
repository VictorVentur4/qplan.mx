import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axiosInstance from "../api/axios";
import ScheduleEditor from "./ScheduleEditor";
import ImagesEditor from "./ImagesEditor";
import AmenitiesPicker from "./AmenitiesPicker";
import { emptySchedule, DIAS } from "../constants/businessTypes";

const SIN_DUENO = "__sin_dueno__";

const EMPTY = {
  name: "", type: "", description: "", logo: "", address: "",
  phone: "", latitude: 19.4326, longitude: -99.1332,
  rating: 4.5, images: [], amenities: [], website: "", owner_id: null,
  hours_schedule: emptySchedule(),
};

/** Completa los días faltantes para que el editor siempre tenga los 7. */
const normalizeSchedule = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return emptySchedule();
  const porDia = new Map(schedule.map((d) => [d.day, d]));
  return DIAS.map((_, day) =>
    porDia.get(day) || { day, closed: true, open: "", close: "" }
  );
};

/**
 * Formulario de negocio, compartido por dos pantallas:
 *
 *   scope="admin" → el admin crea o edita cualquier negocio y asigna dueño.
 *   scope="owner" → el dueño edita el suyo contra PUT /me/business.
 *                   No ve el campo de dueño ni el de rating.
 */
const BusinessFormModal = ({
  isOpen, onClose, mode, data, token, onSuccess,
  categories = [], users = [], amenities = [], scope = "admin",
}) => {
  const [formData, setFormData] = useState(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const isAdmin = scope === "admin";

  useEffect(() => {
    if (data) {
      setFormData({
        name: data.name || "",
        type: data.type || categories[0]?.slug || "",
        description: data.description || "",
        logo: data.logo || "",
        address: data.address || "",
        phone: data.phone || "",
        latitude: data.latitude ?? 19.4326,
        longitude: data.longitude ?? -99.1332,
        rating: data.rating ?? 4.5,
        images: data.images || [],
        amenities: data.amenities || [],
        website: data.website || "",
        owner_id: data.owner_id || null,
        hours_schedule: normalizeSchedule(data.hours_schedule),
      });
    } else {
      setFormData({ ...EMPTY, type: categories[0]?.slug || "", hours_schedule: emptySchedule() });
    }
  }, [data, mode, isOpen, categories]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.type) {
      toast.error("Selecciona una categoría");
      return;
    }
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      if (!isAdmin) {
        // El dueño no manda owner_id ni rating: el backend los ignoraría igual.
        const { owner_id, rating, ...payload } = formData;
        await axiosInstance.put("/me/business", payload, { headers });
      } else if (mode === "create") {
        await axiosInstance.post("/admin/businesses", formData, { headers });
      } else {
        await axiosInstance.put(`/admin/businesses/${data.id}`, formData, { headers });
      }

      toast.success(mode === "create" ? "Negocio creado" : "Negocio actualizado");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al guardar");
    } finally {
      setIsLoading(false);
    }
  };

  const set = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });
  const setNumber = (field) => (e) =>
    setFormData({ ...formData, [field]: e.target.value === "" ? "" : parseFloat(e.target.value) });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass border-white/10 rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {mode === "create" ? "Agregar negocio" : "Editar negocio"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Nombre</Label>
              <Input
                value={formData.name} onChange={set("name")} required
                className="bg-[#0A0A0A] border-[#262626] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Categoría</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger className="bg-[#0A0A0A] border-[#262626] text-white">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A0A] border-[#262626]">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.slug} className="text-white">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Descripción</Label>
            <Textarea
              value={formData.description} onChange={set("description")} required minLength={10}
              className="bg-[#0A0A0A] border-[#262626] text-white min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Logo (URL)</Label>
              <Input value={formData.logo} onChange={set("logo")}
                     className="bg-[#0A0A0A] border-[#262626] text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Sitio web</Label>
              <Input value={formData.website} onChange={set("website")}
                     className="bg-[#0A0A0A] border-[#262626] text-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Dirección</Label>
            <Input value={formData.address} onChange={set("address")} required
                   className="bg-[#0A0A0A] border-[#262626] text-white" />
          </div>

          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Teléfono</Label>
            <Input value={formData.phone} onChange={set("phone")}
                   className="bg-[#0A0A0A] border-[#262626] text-white" />
          </div>

          <ScheduleEditor
            value={formData.hours_schedule}
            onChange={(v) => setFormData({ ...formData, hours_schedule: v })}
          />

          <ImagesEditor
            value={formData.images}
            onChange={(v) => setFormData({ ...formData, images: v })}
          />

          <AmenitiesPicker
            catalog={amenities}
            value={formData.amenities}
            onChange={(v) => setFormData({ ...formData, amenities: v })}
          />

          <div className={`grid gap-4 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Latitud</Label>
              <Input type="number" step="any" value={formData.latitude}
                     onChange={setNumber("latitude")} required
                     className="bg-[#0A0A0A] border-[#262626] text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Longitud</Label>
              <Input type="number" step="any" value={formData.longitude}
                     onChange={setNumber("longitude")} required
                     className="bg-[#0A0A0A] border-[#262626] text-white" />
            </div>
            {isAdmin && (
              <div className="space-y-2">
                <Label className="text-[#A3A3A3]">Rating</Label>
                <Input type="number" step="0.1" min="0" max="5" value={formData.rating}
                       onChange={setNumber("rating")}
                       className="bg-[#0A0A0A] border-[#262626] text-white" />
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Usuario dueño</Label>
              <Select
                value={formData.owner_id || SIN_DUENO}
                onValueChange={(v) =>
                  setFormData({ ...formData, owner_id: v === SIN_DUENO ? null : v })
                }
              >
                <SelectTrigger className="bg-[#0A0A0A] border-[#262626] text-white">
                  <SelectValue placeholder="Sin dueño asignado" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A0A] border-[#262626]">
                  <SelectItem value={SIN_DUENO} className="text-white">Sin dueño asignado</SelectItem>
                  {users
                    .filter((u) => !u.business_id || u.id === formData.owner_id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-white">
                        {u.full_name} — {u.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#737373]">
                Al asignar un usuario, este pasa automáticamente a rol «dueño de negocio»
                y podrá editar esta ficha desde /negocio.
              </p>
            </div>
          )}

          <DialogFooter className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}
                    className="border-[#262626] text-white">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}
                    className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600]">
              {isLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : (mode === "create" ? "Crear" : "Guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BusinessFormModal;
