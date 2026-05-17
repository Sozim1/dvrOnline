import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  type User
} from "../../services/api";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  useEffect(() => {
    let active = true;
    if (!token) {
      setIsLoading(false);
      setUser(null);
      return;
    }

    api
      .me()
      .then((response) => {
        if (active) setUser(response.user);
      })
      .catch(() => {
        clearStoredToken();
        if (active) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    setStoredToken(response.token);
    setToken(response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, isLoading, login, logout }),
    [token, user, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return context;
}
