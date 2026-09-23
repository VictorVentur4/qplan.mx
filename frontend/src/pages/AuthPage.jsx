import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MapPin, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axiosInstance from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { landingPathFor } from "../lib/roles";

const AuthPage = ({ isRegister = false }) => {
  const [isLogin, setIsLogin] = useState(!isRegister);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    full_name: "", email: "", phone: "",
    password: "", confirm_password: ""
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (user) navigate(landingPathFor(user), { replace: true });
  }, [user, navigate]);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateForm = () => {
    const newErrors = {};
    if (!isLogin) {
      if (!formData.full_name || formData.full_name.length < 2)
        newErrors.full_name = "El nombre debe tener al menos 2 caracteres";
      if (!formData.phone || formData.phone.length < 10)
        newErrors.phone = "Ingresa un número de teléfono válido";
      if (formData.password !== formData.confirm_password)
        newErrors.confirm_password = "Las contraseñas no coinciden";
    }
    if (!validateEmail(formData.email))
      newErrors.email = "Ingresa un email válido";
    if (!formData.password || formData.password.length < 6)
      newErrors.password = "La contraseña debe tener al menos 6 caracteres";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : formData;
      const response = await axiosInstance.post(endpoint, payload);
      login(response.data.access_token, response.data.user);
      toast.success(isLogin ? "¡Bienvenido!" : "¡Cuenta creada exitosamente!");
      navigate(landingPathFor(response.data.user), { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error en la autenticación");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="hero-glow fixed inset-0 pointer-events-none z-0" />
      <Card className="w-full max-w-md glass border-white/10 rounded-3xl relative z-10">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#CCFF00] flex items-center justify-center">
              <MapPin className="w-5 h-5 text-black" />
            </div>
            <span className="text-2xl font-bold text-white">
              Qplan<span className="text-[#CCFF00]">.mx</span>
            </span>
          </div>
          <CardTitle className="text-xl text-white">
            {isLogin ? "Acceso al panel" : "Crear cuenta"}
          </CardTitle>
          {isLogin && (
            <p className="text-sm text-[#A3A3A3] mt-1">
              Para administradores y dueños de negocio
            </p>
          )}
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label className="text-[#A3A3A3]">Nombre Completo</Label>
                  <Input
                    name="full_name"
                    type="text"
                    placeholder="Juan Pérez"
                    value={formData.full_name}
                    onChange={handleChange}
                    className="bg-[#0A0A0A] border-[#262626] text-white rounded-xl h-12"
                  />
                  {errors.full_name && <p className="text-red-500 text-xs">{errors.full_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-[#A3A3A3]">Teléfono</Label>
                  <Input
                    name="phone"
                    type="tel"
                    placeholder="+52 55 1234 5678"
                    value={formData.phone}
                    onChange={handleChange}
                    className="bg-[#0A0A0A] border-[#262626] text-white rounded-xl h-12"
                  />
                  {errors.phone && <p className="text-red-500 text-xs">{errors.phone}</p>}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Email</Label>
              <Input
                name="email"
                type="email"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
                className="bg-[#0A0A0A] border-[#262626] text-white rounded-xl h-12"
              />
              {errors.email && <p className="text-red-500 text-xs">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-[#A3A3A3]">Contraseña</Label>
              <div className="relative">
                <Input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  className="bg-[#0A0A0A] border-[#262626] text-white rounded-xl h-12 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs">{errors.password}</p>}
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label className="text-[#A3A3A3]">Confirmar Contraseña</Label>
                <div className="relative">
                  <Input
                    name="confirm_password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirm_password}
                    onChange={handleChange}
                    className="bg-[#0A0A0A] border-[#262626] text-white rounded-xl h-12 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.confirm_password && <p className="text-red-500 text-xs">{errors.confirm_password}</p>}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#CCFF00] text-black font-bold rounded-full h-12 hover:bg-[#B3E600]"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLogin ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>

          {isLogin ? (
            <div className="mt-6 text-center">
              <p className="text-[#737373] text-xs leading-relaxed">
                ¿Tienes un negocio y quieres publicarlo en Qplan?
                <br />
                Escríbenos desde la página de{" "}
                <button
                  onClick={() => navigate("/contacto")}
                  className="text-[#CCFF00] hover:underline"
                >
                  contacto
                </button>.
              </p>
            </div>
          ) : (
            <div className="mt-6 text-center">
              <p className="text-[#A3A3A3] text-sm">
                ¿Ya tienes cuenta?
                <button
                  onClick={() => navigate("/panel")}
                  className="text-[#CCFF00] ml-2 hover:underline"
                >
                  Inicia sesión
                </button>
              </p>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => navigate("/")}
              className="text-[#A3A3A3] text-sm hover:text-white transition-colors"
            >
              ← Volver al inicio
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;