import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/**
 * Protege una ruta por rol.
 *
 *   <ProtectedRoute allow={["admin"]}>                 solo el admin
 *   <ProtectedRoute allow={["business_owner","admin"]} dueños y admin
 *   <ProtectedRoute>                                   cualquiera autenticado
 *
 * Si el usuario está autenticado pero con el rol equivocado, se le manda al
 * home en lugar del login: ya inició sesión, simplemente no le corresponde.
 */
const ProtectedRoute = ({ children, allow }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#CCFF00] animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allow && !allow.includes(user.role)) return <Navigate to="/" replace />;

  return children;
};

export default ProtectedRoute;
