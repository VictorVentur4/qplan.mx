import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Mail, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicMenu from "../components/PublicMenu";

/**
 * Páginas informativas del sitio público.
 *
 * ⚠️ EL TEXTO ES PROVISIONAL. Reemplázalo con el contenido real de Qplan:
 * el que está aquí describe lo que la plataforma hace hoy, pero no lo
 * escribió nadie de negocio.
 */

const CONTENIDO = {
  "que-es-qplan": {
    titulo: "¿Qué es Qplan?",
    entrada: "La forma más rápida de descubrir qué hay cerca de ti.",
    secciones: [
      {
        h: "Un directorio que sí conoce tu ciudad",
        p: "Qplan reúne los negocios de tu zona en un solo lugar: restaurantes, cafeterías, hoteles, transporte y más. Usamos tu ubicación para ordenarlos del más cercano al más lejano, para que encuentres opciones reales a unos minutos de distancia.",
      },
      {
        h: "Información que sirve",
        p: "Cada negocio muestra su horario día por día, sus fotos, su dirección y sus servicios: si tiene WiFi, estacionamiento, si acepta tarjeta o si puedes llevar a tu mascota. Sin llamar para preguntar.",
      },
      {
        h: "Para los negocios",
        p: "Si tienes un negocio, Qplan te da presencia frente a quien ya está buscando lo que ofreces. Administras tu propia ficha: actualizas horarios, subes fotos y mantienes tus datos al día.",
      },
    ],
  },
  nosotros: {
    titulo: "Nosotros",
    entrada: "Gente que cree que lo local merece encontrarse.",
    secciones: [
      {
        h: "Por qué existimos",
        p: "Los buenos negocios de barrio compiten contra cadenas con presupuestos enormes de publicidad. Qplan nace para emparejar un poco la cancha: que una cafetería de esquina aparezca igual de bien que una franquicia cuando alguien busca dónde tomar café.",
      },
      {
        h: "Cómo trabajamos",
        p: "Cada negocio en Qplan está verificado y tiene un responsable detrás que mantiene su información al día. No listamos por listar: preferimos un catálogo más chico y confiable que uno enorme y desactualizado.",
      },
      {
        h: "Hacia dónde vamos",
        p: "Estamos construyendo Qplan ciudad por ciudad. Si quieres que lleguemos a la tuya, o si tienes un negocio que debería estar aquí, escríbenos.",
      },
    ],
  },
  contacto: {
    titulo: "Contacto",
    entrada: "¿Tienes un negocio o una pregunta? Escríbenos.",
    secciones: [
      {
        h: "Da de alta tu negocio",
        p: "Mándanos el nombre de tu negocio, su dirección y un teléfono de contacto. Te respondemos con los pasos para publicarte en Qplan.",
      },
    ],
    contactos: [
      { icon: Mail, label: "Correo", valor: "hola@qplan.mx", href: "mailto:hola@qplan.mx" },
      { icon: Phone, label: "Teléfono", valor: "+52 55 0000 0000", href: "tel:+525500000000" },
      { icon: MessageCircle, label: "WhatsApp", valor: "+52 55 0000 0000", href: "https://wa.me/525500000000" },
    ],
  },
};

const InfoPage = ({ slug }) => {
  const navigate = useNavigate();
  const data = CONTENIDO[slug];

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="hero-glow fixed inset-0 pointer-events-none z-0" />

      <div className="relative z-10">
        <header className="sticky top-0 z-50 glass border-b border-white/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-3 group"
              aria-label="Ir al inicio"
            >
              <div className="w-10 h-10 rounded-full bg-[#CCFF00] flex items-center justify-center">
                <MapPin className="w-5 h-5 text-black" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Qplan<span className="text-[#CCFF00]">.mx</span>
              </h1>
            </button>
            <PublicMenu />
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Button
            variant="ghost" onClick={() => navigate("/")}
            className="text-[#A3A3A3] hover:text-white mb-8 -ml-3"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al inicio
          </Button>

          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
            {data.titulo}
          </h2>
          <p className="text-lg text-[#CCFF00] mb-12">{data.entrada}</p>

          <div className="space-y-10">
            {data.secciones.map((s) => (
              <section key={s.h}>
                <h3 className="text-xl font-semibold text-white mb-3">{s.h}</h3>
                <p className="text-[#A3A3A3] leading-relaxed">{s.p}</p>
              </section>
            ))}
          </div>

          {data.contactos && (
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {data.contactos.map(({ icon: Icon, label, valor, href }) => (
                <a
                  key={label} href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="p-5 rounded-2xl bg-[#0A0A0A] border border-[#262626] hover:border-[#CCFF00]/50 transition-colors"
                >
                  <Icon className="w-5 h-5 text-[#CCFF00] mb-3" />
                  <p className="text-xs text-[#A3A3A3] mb-1">{label}</p>
                  <p className="text-white text-sm break-all">{valor}</p>
                </a>
              ))}
            </div>
          )}
        </main>

        <footer className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-[#262626] mt-8">
          <p className="text-xs text-[#525252]">
            Qplan.mx — Descubre lugares cerca de ti
          </p>
        </footer>
      </div>
    </div>
  );
};

export default InfoPage;
