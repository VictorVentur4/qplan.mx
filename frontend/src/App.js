import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import InfoPage from "./pages/InfoPage";
import AdminPanel from "./pages/admin/AdminPanel";
import BusinessPanel from "./pages/business/BusinessPanel";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" theme="dark" />
        <Routes>
          <Route path="/" element={<HomePage />} />

          {/*
            Enlace compartible de un negocio. Abre la misma home pero con el
            detalle desplegado, sin exigir ubicación: quien lo recibe puede
            estar en otra ciudad. Al cerrar el detalle se le pide la suya.
          */}
          <Route path="/lugar/:sharedId" element={<HomePage />} />

          {/* Páginas informativas del menú */}
          <Route path="/que-es-qplan" element={<InfoPage slug="que-es-qplan" />} />
          <Route path="/nosotros" element={<InfoPage slug="nosotros" />} />
          <Route path="/contacto" element={<InfoPage slug="contacto" />} />

          {/* Acceso de administradores y dueños de negocio */}
          <Route path="/panel" element={<AuthPage />} />
          {/* La ruta anterior se conserva para no romper enlaces ya compartidos */}
          <Route path="/login" element={<Navigate to="/panel" replace />} />

          {/*
            El registro no está enlazado desde ninguna parte: el admin da de
            alta a los dueños. La ruta se conserva para la fase 2, cuando se
            active ALLOW_BUSINESS_SELF_REGISTRATION en el backend.
          */}
          <Route path="/register" element={<AuthPage isRegister />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allow={["admin"]}>
                <AdminPanel />
              </ProtectedRoute>
            }
          />

          <Route
            path="/negocio"
            element={
              <ProtectedRoute allow={["business_owner", "admin"]}>
                <BusinessPanel />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
