import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute() {
  const { token, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="screen-loader">Carregando painel...</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
