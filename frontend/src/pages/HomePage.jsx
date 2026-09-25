import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Navigation, Loader2, LogOut, Settings, Store, LayoutGrid, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel, CarouselContent, CarouselItem,
  CarouselPrevious, CarouselNext,
} from "@/components/ui/carousel";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axiosInstance from "../api/axios";
import { useAuth } from "../context/AuthContext";
import BusinessCard from "../components/BusinessCard";
import BusinessModal from "../components/BusinessModal";
import PublicMenu from "../components/PublicMenu";
import LocationPrompt from "../components/LocationPrompt";
import { getIcon, getIconForType, getLabelForType, ALL_CATEGORIES } from "../constants/businessTypes";
import { getQrCoords, requestBrowserLocation } from "../lib/location";
import { trackPageview, trackBusinessView } from "../lib/analytics";

const SEARCH_RADIUS_KM = 50;

/** De dónde salió la ubicación que estamos usando. */
const FUENTE = {
  BUSCANDO: "buscando",  // todavía preguntando al navegador
  GPS: "gps",            // el usuario compartió su ubicación
  QR: "qr",              // coordenadas del código QR escaneado
  NINGUNA: "ninguna",    // no hay ubicación: se le pide al usuario
};

const HomePage = () => {
  const [businesses, setBusinesses] = useState([]);
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [selectedType, setSelectedType] = useState(ALL_CATEGORIES);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fuente, setFuente] = useState(FUENTE.BUSCANDO);
  const [motivoFallo, setMotivoFallo] = useState(null);
  const [pidiendoUbicacion, setPidiendoUbicacion] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  /*
   * Enlace compartido (/lugar/:id). El detalle se abre de inmediato y sin
   * pedir ubicación: quien recibe el enlace puede estar en otra ciudad.
   * La ubicación se pide DESPUÉS de cerrar el detalle; si se pidiera al
   * cargar, el diálogo del navegador saltaría encima del modal.
   */
  const { sharedId } = useParams();
  const [ubicacionDiferida, setUbicacionDiferida] = useState(Boolean(sharedId));
  const [compartidoNoEncontrado, setCompartidoNoEncontrado] = useState(false);
  const ubicacionResuelta = useRef(false);

  /**
   * Resuelve la ubicación con la prioridad del negocio:
   *   1. GPS del usuario.
   *   2. Coordenadas del QR (?lat=&lng= o ?c=lat,lng).
   *   3. Nada: se le pide al usuario que la comparta.
   */
  const resolverUbicacion = useCallback(async () => {
    const delQr = getQrCoords();

    /*
     * Si el QR trae coordenadas, se pintan YA y el GPS se pide en segundo
     * plano. Esperar al navegador antes de mostrar nada dejaba al usuario
     * mirando un spinner varios segundos teniendo ya una ubicación válida.
     * Si el GPS llega después, se sustituye por ser más preciso.
     */
    if (delQr) {
      setUserLocation(delQr);
      setFuente(FUENTE.QR);
      setMotivoFallo(null);
    }

    setPidiendoUbicacion(true);
    try {
      const gps = await requestBrowserLocation();
      setUserLocation(gps);
      setFuente(FUENTE.GPS);
      setMotivoFallo(null);
    } catch (err) {
      // Con coordenadas del QR ya hay algo que mostrar: no se molesta al usuario.
      if (!delQr) {
        setUserLocation(null);
        setFuente(FUENTE.NINGUNA);
        setMotivoFallo(err?.motivo || "desconocido");
      }
    } finally {
      setPidiendoUbicacion(false);
    }
  }, []);

  useEffect(() => {
    trackPageview();
  }, []);

  useEffect(() => {
    if (ubicacionDiferida || ubicacionResuelta.current) return;
    ubicacionResuelta.current = true;
    resolverUbicacion();
  }, [ubicacionDiferida, resolverUbicacion]);

  // Carga del negocio compartido, por id y no desde la lista cercana.
  useEffect(() => {
    if (!sharedId) return;
    let cancelado = false;
    (async () => {
      try {
        const { data } = await axiosInstance.get(`/businesses/${sharedId}`);
        if (cancelado) return;
        setSelectedBusiness(data);
        setIsModalOpen(true);
        trackBusinessView(data.id);
      } catch {
        if (!cancelado) {
          setCompartidoNoEncontrado(true);
          setUbicacionDiferida(false);   // no hay nada que mostrar: sigue el flujo normal
        }
      }
    })();
    return () => { cancelado = true; };
  }, [sharedId]);

  /*
   * Al cerrar el detalle: si venía de un enlace compartido, se limpia la URL
   * y recién entonces se pide la ubicación.
   */
  useEffect(() => {
    if (compartidoNoEncontrado) {
      toast.error("Ese negocio ya no está disponible en Qplan");
    }
  }, [compartidoNoEncontrado]);

  const cerrarModal = useCallback(() => {
    setIsModalOpen(false);
    if (sharedId) {
      navigate("/", { replace: true });
      setUbicacionDiferida(false);
    }
  }, [sharedId, navigate]);

  // --- Catálogos -----------------------------------------------------------
  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get("/categories");
      setCategories(data);
    } catch (error) {
      console.error("Error al cargar categorías:", error);
    }
  }, []);

  const fetchAmenities = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get("/amenities");
      setAmenities(data);
    } catch (error) {
      console.error("Error al cargar amenidades:", error);
    }
  }, []);

  const fetchBanners = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get("/banners");
      setBanners(data);
    } catch (error) {
      console.error("Error al cargar banners:", error);
    }
  }, []);

  const fetchBusinesses = useCallback(async () => {
    if (!userLocation) {
      setBusinesses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        lat: userLocation.lat.toString(),
        lng: userLocation.lng.toString(),
        radius: String(SEARCH_RADIUS_KM),
      });
      // Sin "type" el backend devuelve todas las categorías.
      if (selectedType !== ALL_CATEGORIES) params.set("type", selectedType);

      const { data } = await axiosInstance.get(`/businesses?${params}`);
      setBusinesses(data);
    } catch (error) {
      toast.error("Error al cargar los negocios");
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, userLocation]);

  useEffect(() => {
    fetchCategories();
    fetchAmenities();
    fetchBanners();
  }, [fetchCategories, fetchAmenities, fetchBanners]);

  useEffect(() => {
    if (fuente !== FUENTE.BUSCANDO) fetchBusinesses();
  }, [fetchBusinesses, fuente]);

  // --- Destino del botón del panel según el rol ----------------------------
  const panelPath = user?.role === "admin" ? "/admin" : "/negocio";
  const showPanelButton = user?.role === "admin" || user?.role === "business_owner";

  /*
   * Mientras no haya ubicación se muestra el aviso, incluso durante la
   * búsqueda: así el usuario lee por qué se la pedimos en vez de mirar un
   * spinner mudo mientras el navegador resuelve el permiso.
   */
  const hayUbicacion = Boolean(userLocation);

  const emptyMessage = selectedType === ALL_CATEGORIES
    ? "No encontramos negocios en tu área"
    : `No encontramos ${getLabelForType(categories, selectedType).toLowerCase()} en tu área`;

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="hero-glow fixed inset-0 pointer-events-none z-0" />

      <div className="relative z-10">
        <header className="sticky top-0 z-50 glass border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#CCFF00] flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-black" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Qplan<span className="text-[#CCFF00]">.mx</span>
                </h1>
              </div>

              <div className="flex items-center gap-4">
                {fuente === FUENTE.GPS && (
                  <div className="hidden sm:flex items-center gap-2 text-sm text-[#A3A3A3]">
                    <Navigation className="w-4 h-4 text-[#CCFF00]" />
                    <span>Ubicación activa</span>
                  </div>
                )}
                {fuente === FUENTE.QR && (
                  <div
                    className="hidden sm:flex items-center gap-2 text-sm text-[#A3A3A3]"
                    title="Estás viendo los negocios cercanos al punto del código QR que escaneaste"
                  >
                    <QrCode className="w-4 h-4 text-[#CCFF00]" />
                    <span>Ubicación del QR</span>
                  </div>
                )}
                {/*
                  El visitante no ve ningún acceso: el panel vive en /panel y
                  se entra por URL directa. Solo a quien YA inició sesión se le
                  muestra el atajo a su panel.
                */}
                {showPanelButton && (
                  <>
                    <Button
                      onClick={() => navigate(panelPath)}
                      variant="outline"
                      className="border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00]/10 rounded-full"
                    >
                      {user.role === "admin"
                        ? <Settings className="w-4 h-4 sm:mr-2" />
                        : <Store className="w-4 h-4 sm:mr-2" />}
                      <span className="hidden sm:inline">
                        {user.role === "admin" ? "Admin" : "Mi negocio"}
                      </span>
                    </Button>
                    <Button onClick={logout} variant="ghost"
                            className="text-[#A3A3A3] hover:text-white">
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </>
                )}

                <PublicMenu />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Banners publicitarios */}
          <section className="mb-10 animate-fade-in">
            {banners.length > 0 ? (
              <Carousel opts={{ align: "start", loop: true }} className="w-full">
                <CarouselContent>
                  {banners.map((banner) => (
                    <CarouselItem key={banner.id}>
                      <a
                        href={banner.link || undefined}
                        target={banner.link ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="block relative aspect-[5/2] rounded-3xl overflow-hidden bg-[#0A0A0A]"
                      >
                        {/*
                         * object-contain, no object-cover: con una sola
                         * proporción (5:2) la imagen entra completa y no se
                         * recorta en ningún tamaño de pantalla. La medida
                         * recomendada es 1920 x 768 px.
                         */}
                        <img src={banner.image} alt={banner.title} className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8">
                          <h2 className="text-base sm:text-2xl lg:text-3xl font-bold text-white">
                            {banner.title}
                          </h2>
                        </div>
                      </a>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="left-4 bg-black/50 border-white/20 text-white hover:bg-black/70" />
                <CarouselNext className="right-4 bg-black/50 border-white/20 text-white hover:bg-black/70" />
              </Carousel>
            ) : (
              <div className="aspect-[5/2] rounded-3xl bg-[#0A0A0A] animate-pulse" />
            )}
          </section>

          {fuente === FUENTE.QR && (
            <div className="mb-6 p-4 rounded-xl bg-[#171717] border border-[#262626] text-sm">
              <div className="flex items-start gap-3">
                <QrCode className="w-4 h-4 text-[#CCFF00] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-[#A3A3A3]">
                    Mostrando negocios cerca del punto donde escaneaste el código.
                  </span>
                  <button
                    onClick={resolverUbicacion}
                    disabled={pidiendoUbicacion}
                    className="text-[#CCFF00] hover:underline ml-2 disabled:opacity-50"
                  >
                    {pidiendoUbicacion ? "Buscando…" : "Usar mi ubicación real"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtro por categoría. Sin ubicación no hay nada que filtrar. */}
          {hayUbicacion && (
          <section className="mb-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Negocios cercanos</h2>
                <p className="text-[#A3A3A3] text-sm">Descubre los mejores lugares cerca de ti</p>
              </div>

              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-full sm:w-[220px] bg-[#0A0A0A] border-[#262626] text-white rounded-xl h-12">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A0A] border-[#262626]">
                  <SelectItem
                    value={ALL_CATEGORIES}
                    className="text-white hover:bg-[#171717] focus:bg-[#171717] cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-[#CCFF00]" />
                      Todos
                    </div>
                  </SelectItem>
                  {categories.map((category) => {
                    const Icon = getIcon(category.icon);
                    return (
                      <SelectItem
                        key={category.id}
                        value={category.slug}
                        className="text-white hover:bg-[#171717] focus:bg-[#171717] cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-[#CCFF00]" />
                          {category.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </section>
          )}

          {/* Listado */}
          <section>
            {!hayUbicacion ? (
              <LocationPrompt
                onRetry={resolverUbicacion}
                isRequesting={pidiendoUbicacion}
                motivo={motivoFallo}
              />
            ) : isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#CCFF00] animate-spin" />
              </div>
            ) : businesses.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {businesses.map((business, index) => (
                  <BusinessCard
                    key={business.id}
                    business={business}
                    onViewMore={(b) => {
                      trackBusinessView(b.id, index + 1);
                      setSelectedBusiness(b);
                      setIsModalOpen(true);
                    }}
                    index={index}
                    TypeIcon={getIconForType(categories, business.type)}
                    typeLabel={getLabelForType(categories, business.type)}
                    amenities={amenities}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#171717] flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-[#A3A3A3]" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No hay negocios cerca</h3>
                <p className="text-[#A3A3A3] text-sm">{emptyMessage}</p>
              </div>
            )}
          </section>
        </main>

        <BusinessModal
          business={selectedBusiness}
          isOpen={isModalOpen}
          onClose={cerrarModal}
          TypeIcon={selectedBusiness ? getIconForType(categories, selectedBusiness.type) : MapPin}
          typeLabel={selectedBusiness ? getLabelForType(categories, selectedBusiness.type) : ""}
          amenities={amenities}
        />
      </div>
    </div>
  );
};

export default HomePage;
