import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Menu, X, HelpCircle, Users, Mail } from "lucide-react";

export const MENU_ITEMS = [
  { path: "/que-es-qplan", label: "¿Qué es Qplan?", icon: HelpCircle },
  { path: "/nosotros",     label: "Nosotros",        icon: Users },
  { path: "/contacto",     label: "Contacto",        icon: Mail },
];

/**
 * Menú hamburguesa del sitio público.
 *
 * Se construye a mano en vez de usar el componente Sheet de shadcn porque
 * ese se eliminó en la limpieza y no hace falta traerlo de vuelta solo
 * para tres enlaces.
 */
const PublicMenu = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const cerrar = useCallback(() => setOpen(false), []);

  // Cerrar con Escape y bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", onKey);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowPrevio;
    };
  }, [open, cerrar]);

  const ir = (path) => {
    cerrar();
    navigate(path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={open}
        className="w-11 h-11 rounded-full border border-[#262626] bg-[#0A0A0A] flex items-center justify-center text-white hover:border-[#CCFF00]/50 hover:text-[#CCFF00] transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/*
        El overlay se monta con un portal en document.body a propósito.
        El header lleva la clase `glass`, que aplica backdrop-filter, y eso
        convierte al header en bloque contenedor de sus descendientes con
        position:fixed. Sin el portal, este panel quedaba recortado a los
        76 px de alto del header en lugar de ocupar la pantalla.
      */}
      {open && createPortal(
        <div className="fixed inset-0 z-[100]">
          {/* Fondo */}
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={cerrar}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in cursor-default"
          />

          {/* Panel */}
          <nav
            aria-label="Menú principal"
            className="absolute top-0 right-0 h-full w-full sm:w-80 bg-[#050505] border-l border-[#262626] shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#262626]">
              <span className="text-xl font-bold text-white">
                Qplan<span className="text-[#CCFF00]">.mx</span>
              </span>
              <button
                type="button" onClick={cerrar} aria-label="Cerrar menú"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#A3A3A3] hover:text-white hover:bg-[#171717] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ul className="flex-1 py-4">
              {MENU_ITEMS.map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => ir(path)}
                    className="w-full flex items-center gap-4 px-6 py-4 text-left text-white hover:bg-[#0A0A0A] hover:text-[#CCFF00] transition-colors"
                  >
                    <Icon className="w-5 h-5 text-[#CCFF00]" />
                    <span className="text-base">{label}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="px-6 py-5 border-t border-[#262626]">
              <p className="text-xs text-[#525252]">
                Qplan.mx — Descubre lugares cerca de ti
              </p>
            </div>
          </nav>
        </div>,
        document.body
      )}
    </>
  );
};

export default PublicMenu;
