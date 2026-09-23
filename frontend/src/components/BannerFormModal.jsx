import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import axiosInstance from "../api/axios";

const BannerFormModal = ({ isOpen, onClose, mode, data, token, onSuccess }) => {
  const [formData, setFormData] = useState({
    image: "", title: "", link: "", active: true, display_order: 0
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (data && mode === "edit") {
      setFormData({
        image: data.image || "",
        title: data.title || "",
        link: data.link || "",
        active: data.active ?? true,
        display_order: data.display_order || 0
      });
    } else {
      setFormData({ image: "", title: "", link: "", active: true, display_order: 0 });
    }
  }, [data, mode, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const endpoint = mode === "create"
        ? "/admin/banners"
        : `/admin/banners/${data.id}`;
      const method = mode === "create" ? "post" : "put";

      await axiosInstance[method](endpoint, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(mode === "create" ? "Banner creado" : "Banner actualizado");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al guardar");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass border-white/10 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">
            {mode === "create" ? "Agregar Banner" : "Editar Banner"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Título</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="bg-[#0A0A0A] border-[#262626] text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">URL de Imagen</Label>
            <Input
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              className="bg-[#0A0A0A] border-[#262626] text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#A3A3A3]">Link (opcional)</Label>
            <Input
              value={formData.link}
              onChange={(e) => setFormData({ ...formData, link: e.target.value })}
              className="bg-[#0A0A0A] border-[#262626] text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Orden</Label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                className="bg-[#0A0A0A] border-[#262626] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Estado</Label>
              <div className="flex items-center gap-3 h-10">
                <Switch
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
                <span className="text-white text-sm">{formData.active ? "Activo" : "Inactivo"}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-[#262626] text-white">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600]">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === "create" ? "Crear" : "Guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BannerFormModal;