import { Star, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AmenityBadges from "./AmenityBadges";

const BusinessCard = ({ business, onViewMore, index, TypeIcon, typeLabel, amenities = [] }) => {
  return (
    <Card
      className="glass card-hover rounded-3xl overflow-hidden opacity-0 animate-slide-up"
      style={{ animationDelay: `${index * 0.1}s`, animationFillMode: "forwards" }}
      data-testid={`business-card-${business.id}`}
    >
      <CardContent className="p-0">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#171717] flex-shrink-0 flex items-center justify-center">
              {business.logo ? (
                <img src={business.logo} alt={business.name} className="w-full h-full object-cover" />
              ) : (
                <TypeIcon className="w-7 h-7 text-[#CCFF00]" />
              )}
            </div>
            <div className="flex items-center gap-1 bg-[#171717] px-2 py-1 rounded-full">
              <Star className="w-3.5 h-3.5 text-[#CCFF00] fill-[#CCFF00]" />
              <span className="text-sm font-medium text-white">{business.rating}</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon className="w-4 h-4 text-[#CCFF00]" />
              <span className="text-xs text-[#A3A3A3] uppercase tracking-wide">
                {typeLabel || business.type}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">{business.name}</h3>
            <p className="text-sm text-[#A3A3A3] line-clamp-2">{business.description}</p>
          </div>

          {business.amenities?.length > 0 && (
            <div className="mb-4">
              <AmenityBadges
                slugs={business.amenities}
                catalog={amenities}
                variant="compact"
                max={5}
              />
            </div>
          )}

          {business.distance !== undefined && (
            <div className="flex items-center gap-1 text-sm text-[#A3A3A3] mb-4">
              <Navigation className="w-3.5 h-3.5 text-[#CCFF00]" />
              <span>{business.distance} km de distancia</span>
            </div>
          )}

          <Button
            onClick={() => onViewMore(business)}
            className="w-full bg-[#CCFF00] text-black font-bold rounded-full hover:bg-[#B3E600] transition-all active:scale-95"
            data-testid={`view-more-btn-${business.id}`}
          >
            Ver más
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BusinessCard;