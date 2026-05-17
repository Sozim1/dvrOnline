import { HardDrive, LogOut, RadioTower, Video } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

export function AppLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark small">
            <Video size={21} />
          </span>
          <div>
            <strong>Camera NVR</strong>
            <span>RTSP local</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Navegacao principal">
          <NavLink to="/dashboard">
            <RadioTower size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/recordings">
            <HardDrive size={18} />
            Gravações
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <span>{user?.email}</span>
          <button className="ghost-button full" onClick={logout} type="button">
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      <div className="content-shell">
        <Outlet />
      </div>
    </div>
  );
}
