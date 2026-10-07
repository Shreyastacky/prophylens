import { useEffect, useLayoutEffect, useState } from 'react';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import { Sun } from '@phosphor-icons/react/dist/csr/Sun';

type Theme = 'light' | 'dark';
const preferenceKey = 'prophylens-appearance';
function readPreference(): Theme | null {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}
export function Appearance() {
  const [preference, setPreference] = useState(readPreference);
  const [system, setSystem] = useState<Theme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const theme = preference ?? system;
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#15181e' : '#edf0f4');
  }, [theme]);
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setPreference(next);
    try {
      localStorage.setItem(preferenceKey, next);
    } catch {
      /* Works in memory when storage is unavailable. */
    }
  }
  return (
    <button
      className="icon-button appearance-button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`}
    >
      {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
    </button>
  );
}
