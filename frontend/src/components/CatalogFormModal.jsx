import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axiosInstance from "../api/axios";

/**
 * Alta y edición de un catálogo con forma {slug, label, icon, display_order}.
 * Lo usan tanto las categorías como las amenidades: solo cambian el endpoint,
 * la lista de iconos y los textos.
 *
 * El `slug` no se puede editar una vez creado, porque los negocios lo
 * referencian por valor.
 */
const CatalogFormModal = ({
  state, onClose, token, onSuccess,
  endpoint, titulo, iconNames, getIconComponent, defaultIcon = "MapPin",
  placeholderLabel = "", placeholderSlug = "",
}) => {
  const { open, mode, data } = state;
  const [form, setForm] = useState({ slug: "", label: "", icon: defaultIcon, display_order: 0 });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setForm(data
      ? { slug: data.slug, label: data.label, icon: data.icon, display_order: data.display_order }
      : { slug: "", label: "", icon: defaultIcon, display_order: 0 });
  }, [data, open, defaultIcon]);

  const submit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (mode === "create") {
        await axiosInstance.post(endpoint, form, { headers });
      } else {
        const { slug, ...editable } = form;
        await axiosInstance.put(`${endpoint}/${data.id}`, editable, { headers });
      }
      toast.success(mode === "create" ? `Se creó la ${titulo}` : `Se actualizó la ${titulo}`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Error al guardar la ${titulo}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass border-white/10 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">
            {mode === "create" ? `Nueva ${titulo}` : `Editar ${titulo}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Nombre visible</Label>
            <Input
              value={form.label} required
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={placeholderLabel}
              className="bg-[#0A0A0A] border-[#262626] text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Identificador (slug)</Label>
            <Input
              value={form.slug} required disabled={mode === "edit"}
              onChange={(e) => setForm({
                ...form,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
              })}
              placeholder={placeholderSlug}
              className="bg-[#0A0A0A] border-[#262626] text-white font-mono disabled:opacity-50"
            />
            <p className="text-xs text-[#737373]">
              {mode === "edit"
                ? "El slug no se puede cambiar: los negocios existentes lo referencian."
                : "Solo minúsculas, números y guion bajo."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Icono</Label>
              <Select value={form.icon} onValueChange={(v) => setForm({ ...form, icon: v })}>
                <SelectTrigger className="bg-[#0A0A0A] border-[#262626] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A0A] border-[#262626] max-h-64">
                  {iconNames.map((name) => {
                    const Icon = getIconComponent(name);
                    return (
                      <SelectItem key={name} value={name} className="text-white">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-[#CCFF00]" /> {name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Orden</Label>
              <Input
                type="number" value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })}
                className="bg-[#0A0A0A] border-[#262626] text-white"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}
                    className="border-[#262626] text-white">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}
                    className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600]">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CatalogFormModal;
