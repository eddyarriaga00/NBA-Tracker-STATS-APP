import { createContext, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({ pref: 'system', dark: false, setPref: () => {} });

const read = () => {
  try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; }
};

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(read);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const dark = pref === 'dark' || (pref === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', dark ? '#000000' : '#f2f2f7');
      m.removeAttribute('media');
    });
  }, [dark]);

  const setPref = (p) => {
    setPrefState(p);
    try { localStorage.setItem('theme', p); } catch { /* storage unavailable */ }
  };

  return <ThemeCtx.Provider value={{ pref, dark, setPref }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
