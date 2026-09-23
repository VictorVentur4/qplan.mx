import { useState } from "react";
import { MapPin, Phone, Globe, Star, Navigation, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Carousel, CarouselContent,
  CarouselItem, CarouselPrevious, CarouselNext,
} from "@/components/ui/carousel";
import InfoRow from "./InfoRow";
import ScheduleDisplay from "./ScheduleDisplay";
import AmenityBadges from "./AmenityBadges";
import ShareButton from "./ShareButton";

const BusinessModal = ({ business, isOpen, onClose, TypeIcon, typeLabel, amenities = [] }) => {
  const [rotas, setRotas] = useState({});

  if (!business) return null;

  const galeria = (business.images || []).filter((url) => url && !rotas[url]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="glass border-white/10 rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="business-modal"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-[#CCFF00] text-sm mb-2">
            <TypeIcon className="w-4 h-4" />
            <span className="uppercase tracking-wide">{typeLabel || business.type}</span>
          </div>
          <DialogTitle className="text-2xl font-bold text-white">{business.name}</DialogTitle>
          <DialogDescription className="text-[#A3A3A3]">{business.description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-1 bg-[#171717] px-3 py-1.5 rounded-full w-fit">
            <Star className="w-4 h-4 text-[#CCFF00] fill-[#CCFF00]" />
            <span className="font-medium text-white">{business.rating}</span>
            <span className="text-[#A3A3A3] text-sm">/ 5.0</span>
          </div>

          {/* Amenidades */}
          <AmenityBadges slugs={business.amenities} catalog={amenities} variant="full" />

          {/* Datos de contacto */}
          <div className="grid gap-4">
            <InfoRow icon={MapPin} label="Dirección" value={business.address} />
            {business.phone && (
              <InfoRow icon={Phone} label="Teléfono" value={business.phone}
                       isLink href={`tel:${business.phone}`} />
            )}
            {business.website && (
              <InfoRow icon={Globe} label="Sitio web" value={business.website}
                       isLink href={business.website} external />
            )}
            {business.distance !== undefined && (
              <InfoRow icon={Navigation} label="Distancia"
                       value={`${business.distance} km desde tu ubicación`} />
            )}
          </div>

          {/* Horario día por día */}
          <ScheduleDisplay schedule={business.hours_schedule} fallback={business.hours} />

          {/* Galería, al final */}
          {galeria.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Images className="w-5 h-5 text-[#CCFF00]" />
                <p className="text-sm text-[#A3A3A3]">
                  Galería
                  <span className="text-[#525252] ml-2">
                    {galeria.length} {galeria.length === 1 ? "foto" : "fotos"}
                  </span>
                </p>
              </div>

              <Carousel className="w-full">
                <CarouselContent>
                  {galeria.map((image, index) => (
                    <CarouselItem key={`${image}-${index}`}>
                      <div className="h-56 sm:h-72 rounded-2xl overflow-hidden bg-[#0A0A0A]">
                        <img
                          src={image}
                          alt={`${business.name} — foto ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={() => setRotas((r) => ({ ...r, [image]: true }))}
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {galeria.length > 1 && (
                  <>
                    <CarouselPrevious className="left-2 bg-black/50 border-white/20 text-white hover:bg-black/70" />
                    <CarouselNext className="right-2 bg-black/50 border-white/20 text-white hover:bg-black/70" />
                  </>
                )}
              </Carousel>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3 relative">
          <Button variant="outline" onClick={onClose}
                  className="border-[#262626] text-white hover:bg-[#171717] rounded-full">
            Cerrar
          </Button>
          <ShareButton business={business} />
          {business.phone && (
            <Button asChild
                    className="flex-1 bg-[#CCFF00] text-black font-bold rounded-full hover:bg-[#B3E600]">
              <a href={`tel:${business.phone}`}>
                <Phone className="w-4 h-4 mr-2" />
                Llamar
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BusinessModal;
