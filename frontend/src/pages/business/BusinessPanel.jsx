import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ArrowLeft, LogOut, Pencil, Store, MapPin, Phone,
  Clock, Globe, Star, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import axiosInstance from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import BusinessFormModal from "../../components/BusinessFormModal";
import InfoRow from "../../components/InfoRow";
import { getIcon } from "../../constants/businessTypes";

/**
 * Panel del dueño de negocio: ve y edita únicamente su propia ficha.
 * El alcance lo impone el backend en GET/PUT /me/business, no esta pantalla.
 */
const BusinessPanel = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notAssigned, setNotAssigned] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);

    // Las categorías son accesorias: solo dan la etiqueta y el icono. Si
    // fallan, el dueño debe poder ver y editar su negocio igual, así que se
    // piden por separado y su error no interrumpe nada.
    axiosInstance.get("/categories")
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]));

    try {
      const { data } = await axiosInstance.get("/me/business", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBusiness(data);
      setNotAssigned(false);
    } catch (error) {
      if (error.response?.status === 404) {
        setNotAssigned(true);
      } else {
        toast.error("No se pudo cargar tu negocio");
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#CCFF00] animate-spin" />
      </div>
    );
  }

  const CategoryIcon = business
    ? getIcon(categories.find((c) => c.slug === business.type)?.icon)
    : Store;

  const categoryLabel =
    categories.find((c) => c.slug === business?.type)?.label || business?.type;

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="hero-glow fixed inset-0 pointer-events-none z-0" />

      <div className="relative z-10">
        <header className="sticky top-0 z-50 glass border-b border-white/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate("/")}
                      className="text-[#A3A3A3] hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Mi negocio</h1>
                <p className="text-xs text-[#A3A3A3]">{user?.full_name}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={logout} className="text-[#A3A3A3] hover:text-white">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {notAssigned ? (
            <Card className="glass border-white/10 rounded-2xl">
              <CardContent className="p-10 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#171717] flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-[#A3A3A3]" />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">
                  Todavía no tienes un negocio asignado
                </h2>
                <p className="text-[#A3A3A3] text-sm max-w-md mx-auto">
                  El administrador de Qplan debe dar de alta tu negocio y vincularlo
                  a tu cuenta. En cuanto lo haga, podrás editarlo desde aquí.
                </p>
                <Button onClick={() => navigate("/")}
                        className="mt-6 bg-[#CCFF00] text-black font-bold rounded-full hover:bg-[#B3E600]">
                  Volver al inicio
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {!business.is_active && (
                <div className="mb-6 p-4 rounded-xl bg-[#171717] border border-[#262626] flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-[#CCFF00] flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-white font-medium">Tu negocio está desactivado</p>
                    <p className="text-[#A3A3A3]">
                      No aparece en el listado público. Solo el administrador puede reactivarlo.
                    </p>
                  </div>
                </div>
              )}

              <Card className="glass border-white/10 rounded-2xl mb-6">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#0A0A0A] border border-[#262626] overflow-hidden flex items-center justify-center flex-shrink-0">
                        {business.logo
                          ? <img src={business.logo} alt={business.name} className="w-full h-full object-cover" />
                          : <CategoryIcon className="w-7 h-7 text-[#CCFF00]" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <h2 className="text-2xl font-bold text-white">{business.name}</h2>
                          <Badge className={business.is_active
                            ? "bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/15"
                            : "bg-[#262626] text-[#A3A3A3] hover:bg-[#262626]"}>
                            {business.is_active ? "Visible" : "Oculto"}
                          </Badge>
                        </div>
                        <p className="text-sm text-[#CCFF00] mb-2">{categoryLabel}</p>
                        <p className="text-[#A3A3A3] text-sm max-w-xl">{business.description}</p>
                      </div>
                    </div>

                    <Button onClick={() => setIsEditing(true)}
                            className="bg-[#CCFF00] text-black font-bold rounded-xl hover:bg-[#B3E600] flex-shrink-0">
                      <Pencil className="w-4 h-4 mr-2" /> Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={MapPin} label="Dirección" value={business.address} />
                {business.phone && (
                  <InfoRow icon={Phone} label="Teléfono" value={business.phone}
                           isLink href={`tel:${business.phone}`} />
                )}
                {business.hours && <InfoRow icon={Clock} label="Horario" value={business.hours} />}
                {business.website && (
                  <InfoRow icon={Globe} label="Sitio web" value={business.website}
                           isLink external href={business.website} />
                )}
                <InfoRow icon={Star} label="Calificación" value={`${business.rating} / 5`} />
                <InfoRow icon={MapPin} label="Coordenadas"
                         value={`${business.latitude}, ${business.longitude}`} />
              </div>

              <p className="text-xs text-[#525252] mt-6">
                La calificación y el estado de visibilidad los administra Qplan.
                Si necesitas cambiarlos, contacta al administrador.
              </p>
            </>
          )}
        </main>
      </div>

      <BusinessFormModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        mode="edit"
        data={business}
        token={token}
        categories={categories}
        scope="owner"
        onSuccess={load}
      />
    </div>
  );
};

export default BusinessPanel;
