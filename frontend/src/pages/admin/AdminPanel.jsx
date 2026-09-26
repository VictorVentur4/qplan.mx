import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, Users, Image as ImageIcon, LayoutGrid, Plus, Pencil,
  Eye, EyeOff, Trash2, Loader2, ArrowLeft, LogOut, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import axiosInstance from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import StatCard from "../../components/StatCard";
import BusinessFormModal from "../../components/BusinessFormModal";
import BannerFormModal from "../../components/BannerFormModal";
import CatalogFormModal from "../../components/CatalogFormModal";
import MetricsTab from "../../components/MetricsTab";
import {
  getIcon, getAmenityIcon, ICON_NAMES, AMENITY_ICON_NAMES, ALL_CATEGORIES,
} from "../../constants/businessTypes";
import { ROLE_LABELS } from "../../lib/roles";

const AdminPanel = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [filterType, setFilterType] = useState(ALL_CATEGORIES);
  // La pestaña activa se guarda en estado. Si el Tabs quedara sin controlar,
  // cualquier recarga de datos desmontaría el componente y lo devolvería a
  // su pestaña por defecto, sacando al admin de donde estaba trabajando.
  const [pestana, setPestana] = useState("metricas");

  const [businessModal, setBusinessModal] = useState({ open: false, mode: "create", data: null });
  const [bannerModal, setBannerModal] = useState({ open: false, mode: "create", data: null });
  const [categoryModal, setCategoryModal] = useState({ open: false, mode: "create", data: null });
  const [amenityModal, setAmenityModal] = useState({ open: false, mode: "create", data: null });
  const [confirm, setConfirm] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  /*
   * Cada recurso se carga por separado con allSettled, NO con Promise.all.
   * Con Promise.all, un solo endpoint caído rechazaba todo el lote y el panel
   * quedaba completamente en blanco: pasó de verdad cuando el backend estaba
   * desactualizado y /admin/amenities respondía 404, tumbando también
   * categorías, negocios, banners y usuarios, que sí funcionaban.
   */
  const loadAll = useCallback(async () => {
    setIsLoading(true);

    const recursos = [
      { nombre: "estadísticas", url: "/admin/stats",      set: setStats,      vacio: null },
      { nombre: "negocios",     url: "/admin/businesses", set: setBusinesses, vacio: [] },
      { nombre: "categorías",   url: "/admin/categories", set: setCategories, vacio: [] },
      { nombre: "banners",      url: "/admin/banners",    set: setBanners,    vacio: [] },
      { nombre: "usuarios",     url: "/admin/users",      set: setUsers,      vacio: [] },
      { nombre: "amenidades",   url: "/admin/amenities",  set: setAmenities,  vacio: [] },
    ];

    const resultados = await Promise.allSettled(
      recursos.map((r) => axiosInstance.get(r.url, { headers }))
    );

    const fallidos = [];
    resultados.forEach((res, i) => {
      const r = recursos[i];
      if (res.status === "fulfilled") {
        r.set(res.value.data);
      } else {
        r.set(r.vacio);
        fallidos.push({ nombre: r.nombre, estado: res.reason?.response?.status });
      }
    });

    if (fallidos.length) {
      const cuatroCientoCuatro = fallidos.filter((f) => f.estado === 404);
      if (cuatroCientoCuatro.length) {
        toast.error(
          `El backend no reconoce: ${cuatroCientoCuatro.map((f) => f.nombre).join(", ")}. ` +
          "Parece que está desactualizado respecto al frontend.",
          { duration: 10000 }
        );
      } else {
        toast.error(`No se pudieron cargar: ${fallidos.map((f) => f.nombre).join(", ")}`);
      }
    }

    setIsLoading(false);
    setPrimeraCarga(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Acciones ------------------------------------------------------------
  const toggleBusiness = async (biz) => {
    try {
      await axiosInstance.patch(`/admin/businesses/${biz.id}/toggle`, {}, { headers });
      toast.success(biz.is_active ? "Negocio desactivado" : "Negocio activado");
      loadAll();
    } catch {
      toast.error("No se pudo cambiar el estado");
    }
  };

  const deleteBanner = async (banner) => {
    try {
      await axiosInstance.delete(`/admin/banners/${banner.id}`, { headers });
      toast.success("Banner eliminado");
      loadAll();
    } catch {
      toast.error("No se pudo eliminar el banner");
    }
  };

  const deleteCategory = async (category) => {
    try {
      await axiosInstance.delete(`/admin/categories/${category.id}`, { headers });
      toast.success("Categoría eliminada");
      loadAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo eliminar la categoría");
    }
  };

  const toggleCategory = async (category) => {
    try {
      await axiosInstance.put(`/admin/categories/${category.id}`,
        { is_active: !category.is_active }, { headers });
      loadAll();
    } catch {
      toast.error("No se pudo cambiar el estado de la categoría");
    }
  };

  const toggleAmenity = async (a) => {
    try {
      await axiosInstance.put(`/admin/amenities/${a.id}`,
        { is_active: !a.is_active }, { headers });
      loadAll();
    } catch {
      toast.error("No se pudo cambiar el estado de la amenidad");
    }
  };

  const deleteAmenity = async (a) => {
    try {
      const { data } = await axiosInstance.delete(`/admin/amenities/${a.id}`, { headers });
      toast.success(data.negocios_actualizados
        ? `Amenidad eliminada y quitada de ${data.negocios_actualizados} negocio(s)`
        : "Amenidad eliminada");
      loadAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo eliminar la amenidad");
    }
  };

  const changeRole = async (u, role) => {
    try {
      await axiosInstance.patch(`/admin/users/${u.id}/role`, { role }, { headers });
      toast.success(`${u.full_name} ahora es ${ROLE_LABELS[role].toLowerCase()}`);
      loadAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo cambiar el rol");
    }
  };

  const visibleBusinesses = filterType === ALL_CATEGORIES
    ? businesses
    : businesses.filter((b) => b.type === filterType);

  const labelFor = (slug) => categories.find((c) => c.slug === slug)?.label || slug;

  // Solo la primera carga muestra la pantalla completa de espera. En las
  // recargas se mantiene lo ya pintado con menos opacidad, para no perder
  // la pestaña activa ni provocar un salto de la página.
  if (primeraCarga) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#CCFF00] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="hero-glow fixed inset-0 pointer-events-none z-0" />

      <div className="relative z-10">
        <header className="sticky top-0 z-50 glass border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate("/")}
                      className="text-[#A3A3A3] hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Panel de administración</h1>
                <p className="text-xs text-[#A3A3A3]">{user?.full_name}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={logout} className="text-[#A3A3A3] hover:text-white">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-opacity ${isLoading ? "opacity-60" : ""}`}>
          {/* Resumen */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard title="Negocios activos" value={stats.active_businesses} icon={Store} />
              <StatCard title="Negocios totales" value={stats.total_businesses} icon={LayoutGrid} />
              <StatCard title="Dueños" value={stats.total_owners} icon={Users} />
              <StatCard title="Banners activos" value={stats.total_banners} icon={ImageIcon} />
            </div>
          )}

          <Tabs value={pestana} onValueChange={setPestana}>
            <TabsList className="bg-[#0A0A0A] border border-[#262626] rounded-xl mb-6 flex-wrap h-auto">
              <TabsTrigger value="metricas" className="data-[state=active]:bg-[#CCFF00] data-[state=active]:text-black">
                Métricas
              </TabsTrigger>
              <TabsTrigger value="negocios" className="data-[state=active]:bg-[#CCFF00] data-[state=active]:text-black">
                Negocios
              </TabsTrigger>
              <TabsTrigger value="categorias" className="data-[state=active]:bg-[#CCFF00] data-[state=active]:text-black">
                Categorías
              </TabsTrigger>
              <TabsTrigger value="amenidades" className="data-[state=active]:bg-[#CCFF00] data-[state=active]:text-black">
                Amenidades
              </TabsTrigger>
              <TabsTrigger value="banners" className="data-[state=active]:bg-[#CCFF00] data-[state=active]:text-black">
                Banners
              </TabsTrigger>
              <TabsTrigger value="usuarios" className="data-[state=active]:bg-[#CCFF00] data-[state=active]:text-black">
                Usuarios
              </TabsTrigger>
            </TabsList>

            {/* ---------------- MÉTRICAS ---------------- */}
            <TabsContent value="metricas">
              <MetricsTab token={token} />
            </TabsContent>

            {/* ---------------- NEGOCIOS ---------------- */}
            <TabsContent value="negocios">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-[220px] bg-[#0A0A0A] border-[#262626] text-white rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A0A] border-[#262626]">
                    <SelectItem value={ALL_CATEGORIES} className="text-white">Todas las categorías</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.slug} className="text-white">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={() => setBusinessModal({ open: true, mode: "create", data: null })}
                  className="bg-[#CCFF00] text-black font-bold rounded-xl hover:bg-[#B3E600]"
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar negocio
                </Button>
              </div>

              <div className="rounded-2xl border border-[#262626] overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#262626] hover:bg-transparent">
                      <TableHead className="text-[#A3A3A3]">Nombre</TableHead>
                      <TableHead className="text-[#A3A3A3]">Categoría</TableHead>
                      <TableHead className="text-[#A3A3A3]">Dueño</TableHead>
                      <TableHead className="text-[#A3A3A3]">Estado</TableHead>
                      <TableHead className="text-[#A3A3A3] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBusinesses.length === 0 ? (
                      <TableRow className="border-[#262626]">
                        <TableCell colSpan={5} className="text-center text-[#A3A3A3] py-10">
                          No hay negocios en esta categoría
                        </TableCell>
                      </TableRow>
                    ) : visibleBusinesses.map((b) => {
                      const owner = users.find((u) => u.id === b.owner_id);
                      return (
                        <TableRow key={b.id} className="border-[#262626]">
                          <TableCell className="text-white font-medium">{b.name}</TableCell>
                          <TableCell className="text-[#A3A3A3]">{labelFor(b.type)}</TableCell>
                          <TableCell className="text-[#A3A3A3]">
                            {owner ? owner.full_name : <span className="text-[#525252]">Sin asignar</span>}
                          </TableCell>
                          <TableCell>
                            <Badge className={b.is_active
                              ? "bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/15"
                              : "bg-[#262626] text-[#A3A3A3] hover:bg-[#262626]"}>
                              {b.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-white"
                                    onClick={() => setBusinessModal({ open: true, mode: "edit", data: b })}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-white"
                              onClick={() => setConfirm({
                                title: b.is_active ? "¿Desactivar negocio?" : "¿Activar negocio?",
                                description: b.is_active
                                  ? `"${b.name}" dejará de aparecer en el home. No se borra nada: puedes reactivarlo cuando quieras.`
                                  : `"${b.name}" volverá a aparecer en el home.`,
                                action: () => toggleBusiness(b),
                              })}
                            >
                              {b.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ---------------- CATEGORÍAS ---------------- */}
            <TabsContent value="categorias">
              <div className="flex justify-end mb-4">
                <Button
                  onClick={() => setCategoryModal({ open: true, mode: "create", data: null })}
                  className="bg-[#CCFF00] text-black font-bold rounded-xl hover:bg-[#B3E600]"
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar categoría
                </Button>
              </div>

              <div className="rounded-2xl border border-[#262626] overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#262626] hover:bg-transparent">
                      <TableHead className="text-[#A3A3A3]">Categoría</TableHead>
                      <TableHead className="text-[#A3A3A3]">Slug</TableHead>
                      <TableHead className="text-[#A3A3A3]">Negocios</TableHead>
                      <TableHead className="text-[#A3A3A3]">Estado</TableHead>
                      <TableHead className="text-[#A3A3A3] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((c) => {
                      const Icon = getIcon(c.icon);
                      const count = businesses.filter((b) => b.type === c.slug).length;
                      return (
                        <TableRow key={c.id} className="border-[#262626]">
                          <TableCell className="text-white font-medium">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-[#CCFF00]" />
                              {c.label}
                            </div>
                          </TableCell>
                          <TableCell className="text-[#A3A3A3] font-mono text-xs">{c.slug}</TableCell>
                          <TableCell className="text-[#A3A3A3]">{count}</TableCell>
                          <TableCell>
                            <Badge className={c.is_active
                              ? "bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/15"
                              : "bg-[#262626] text-[#A3A3A3] hover:bg-[#262626]"}>
                              {c.is_active ? "Visible" : "Oculta"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-white"
                                    onClick={() => setCategoryModal({ open: true, mode: "edit", data: c })}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-white"
                                    onClick={() => toggleCategory(c)}>
                              {c.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="text-[#A3A3A3] hover:text-red-400 disabled:opacity-30"
                              disabled={count > 0}
                              title={count > 0 ? "Tiene negocios asignados; ocúltala en vez de borrarla" : "Eliminar"}
                              onClick={() => setConfirm({
                                title: "¿Eliminar categoría?",
                                description: `"${c.label}" se eliminará permanentemente. Esta acción no se puede deshacer.`,
                                action: () => deleteCategory(c),
                              })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ---------------- AMENIDADES ---------------- */}
            <TabsContent value="amenidades">
              <div className="flex justify-end mb-4">
                <Button
                  onClick={() => setAmenityModal({ open: true, mode: "create", data: null })}
                  className="bg-[#CCFF00] text-black font-bold rounded-xl hover:bg-[#B3E600]"
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar amenidad
                </Button>
              </div>

              <div className="rounded-2xl border border-[#262626] overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#262626] hover:bg-transparent">
                      <TableHead className="text-[#A3A3A3]">Amenidad</TableHead>
                      <TableHead className="text-[#A3A3A3]">Slug</TableHead>
                      <TableHead className="text-[#A3A3A3]">Negocios</TableHead>
                      <TableHead className="text-[#A3A3A3]">Estado</TableHead>
                      <TableHead className="text-[#A3A3A3] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {amenities.map((a) => {
                      const Icon = getAmenityIcon(a.icon);
                      const count = businesses.filter((b) => b.amenities?.includes(a.slug)).length;
                      return (
                        <TableRow key={a.id} className="border-[#262626]">
                          <TableCell className="text-white font-medium">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-[#CCFF00]" />
                              {a.label}
                            </div>
                          </TableCell>
                          <TableCell className="text-[#A3A3A3] font-mono text-xs">{a.slug}</TableCell>
                          <TableCell className="text-[#A3A3A3]">{count}</TableCell>
                          <TableCell>
                            <Badge className={a.is_active
                              ? "bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/15"
                              : "bg-[#262626] text-[#A3A3A3] hover:bg-[#262626]"}>
                              {a.is_active ? "Visible" : "Oculta"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-white"
                                    onClick={() => setAmenityModal({ open: true, mode: "edit", data: a })}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-white"
                                    onClick={() => toggleAmenity(a)}>
                              {a.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-red-400"
                              onClick={() => setConfirm({
                                title: "\u00bfEliminar amenidad?",
                                description: count > 0
                                  ? `"${a.label}" se eliminar\u00e1 y se quitar\u00e1 de ${count} negocio(s). No se puede deshacer.`
                                  : `"${a.label}" se eliminar\u00e1 permanentemente. No se puede deshacer.`,
                                action: () => deleteAmenity(a),
                              })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ---------------- BANNERS ---------------- */}
            <TabsContent value="banners">
              <div className="flex justify-end mb-4">
                <Button
                  onClick={() => setBannerModal({ open: true, mode: "create", data: null })}
                  className="bg-[#CCFF00] text-black font-bold rounded-xl hover:bg-[#B3E600]"
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar banner
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {banners.map((banner) => (
                  <div key={banner.id} className="rounded-2xl border border-[#262626] overflow-hidden bg-[#0A0A0A]">
                    <div className="h-36 bg-[#171717]">
                      <img src={banner.image} alt={banner.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-white font-semibold">{banner.title}</p>
                          <p className="text-xs text-[#A3A3A3]">Orden: {banner.display_order}</p>
                        </div>
                        <Badge className={banner.active
                          ? "bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/15"
                          : "bg-[#262626] text-[#A3A3A3] hover:bg-[#262626]"}>
                          {banner.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="border-[#262626] text-white flex-1"
                                onClick={() => setBannerModal({ open: true, mode: "edit", data: banner })}>
                          <Pencil className="w-4 h-4 mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="text-[#A3A3A3] hover:text-red-400"
                          onClick={() => setConfirm({
                            title: "¿Eliminar banner?",
                            description: `"${banner.title}" se eliminará permanentemente.`,
                            action: () => deleteBanner(banner),
                          })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {banners.length === 0 && (
                  <p className="text-[#A3A3A3] col-span-full text-center py-10">Todavía no hay banners</p>
                )}
              </div>
            </TabsContent>

            {/* ---------------- USUARIOS ---------------- */}
            <TabsContent value="usuarios">
              <div className="rounded-2xl border border-[#262626] overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#262626] hover:bg-transparent">
                      <TableHead className="text-[#A3A3A3]">Nombre</TableHead>
                      <TableHead className="text-[#A3A3A3]">Email</TableHead>
                      <TableHead className="text-[#A3A3A3]">Negocio</TableHead>
                      <TableHead className="text-[#A3A3A3]">Rol</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="border-[#262626]">
                        <TableCell className="text-white font-medium">{u.full_name}</TableCell>
                        <TableCell className="text-[#A3A3A3]">{u.email}</TableCell>
                        <TableCell className="text-[#A3A3A3]">
                          {u.business_name || <span className="text-[#525252]">—</span>}
                        </TableCell>
                        <TableCell>
                          <Select value={u.role} onValueChange={(r) => changeRole(u, r)}
                                  disabled={u.id === user?.id}>
                            <SelectTrigger className="w-[180px] bg-[#0A0A0A] border-[#262626] text-white h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0A0A0A] border-[#262626]">
                              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value} className="text-white">{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Modales */}
      <BusinessFormModal
        isOpen={businessModal.open}
        onClose={() => setBusinessModal({ ...businessModal, open: false })}
        mode={businessModal.mode}
        data={businessModal.data}
        token={token}
        categories={categories.filter((c) => c.is_active)}
        users={users}
        amenities={amenities.filter((a) => a.is_active)}
        scope="admin"
        onSuccess={loadAll}
      />

      <BannerFormModal
        isOpen={bannerModal.open}
        onClose={() => setBannerModal({ ...bannerModal, open: false })}
        mode={bannerModal.mode}
        data={bannerModal.data}
        token={token}
        onSuccess={loadAll}
      />

      <CatalogFormModal
        state={categoryModal}
        onClose={() => setCategoryModal({ ...categoryModal, open: false })}
        token={token}
        onSuccess={loadAll}
        endpoint="/admin/categories"
        titulo="categoría"
        iconNames={ICON_NAMES}
        getIconComponent={getIcon}
        defaultIcon="MapPin"
        placeholderLabel="Panaderías"
        placeholderSlug="panaderia"
      />

      <CatalogFormModal
        state={amenityModal}
        onClose={() => setAmenityModal({ ...amenityModal, open: false })}
        token={token}
        onSuccess={loadAll}
        endpoint="/admin/amenities"
        titulo="amenidad"
        iconNames={AMENITY_ICON_NAMES}
        getIconComponent={getAmenityIcon}
        defaultIcon="Check"
        placeholderLabel="Terraza"
        placeholderSlug="terraza"
      />

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent className="glass border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#A3A3A3]">
              {confirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#262626] bg-transparent text-white hover:bg-[#171717]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#CCFF00] text-black font-bold hover:bg-[#B3E600]"
              onClick={() => { confirm?.action?.(); setConfirm(null); }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPanel;
