import { useState, useCallback, useEffect } from 'react';

const TOKEN_KEY = 'listinha_token';
const USER_KEY  = 'listinha_user';
const HH_KEY    = 'listinha_household';

export function useAuth() {
  const [token,     setToken]     = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user,      setUser]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });
  const [household, setHousehold] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HH_KEY)); } catch { return null; }
  });

  const save = useCallback((token, user, household) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY,  JSON.stringify(user));
    localStorage.setItem(HH_KEY,    JSON.stringify(household));
    setToken(token);
    setUser(user);
    setHousehold(household);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(HH_KEY);
    setToken(null);
    setUser(null);
    setHousehold(null);
  }, []);

  return { token, user, household, save, logout, isLoggedIn: !!token };
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
