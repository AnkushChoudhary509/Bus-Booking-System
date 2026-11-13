import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, getToken, setToken } from '../services/api';
import { resetSocket } from '../services/socket';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [operator, setOperator] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const clear = useCallback(() => { setToken(null); setUser(null); setOperator(null); resetSocket(); }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    try {
      const d = await get('/auth/me');
      setUser(d.user); setOperator(d.operator);
    } catch { clear(); } finally { setLoading(false); }
  }, [clear]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { window.addEventListener('ra:logout', clear); return () => window.removeEventListener('ra:logout', clear); }, [clear]);

  const accept = (res) => { setToken(res.data.token); resetSocket(); setUser(res.data.user); setOperator(res.data.operator || null); return res.data.user; };
  const login = async (email, password) => accept(await post('/auth/login', { email, password }));
  const register = async (payload) => accept(await post('/auth/register', payload));
  const logout = () => { post('/auth/logout').catch(() => {}); clear(); };

  const value = useMemo(() => ({ user, operator, loading, login, register, logout, refresh, setUser }), [user, operator, loading, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const homeFor = (role) => (role === 'admin' ? '/admin' : role === 'operator' ? '/operator' : '/dashboard');
