import { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../api/axios";

// Parte central de autenticación. Guarda quién está logueado, su token, y expone las funciones de login y logout.
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          const response = await axiosInstance.get("/auth/me", {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
        } catch (error) {
          localStorage.removeItem("token");
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    verifyToken();
  }, [token]);

  const login = (newToken, userData) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};