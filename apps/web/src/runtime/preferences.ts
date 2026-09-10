import { basePath } from './navigation';
const key = (name: string) => `operis:${basePath}:${name}`;
export function applyPreferences() {
  const theme = localStorage.getItem(key('operis_theme'));
  const density = localStorage.getItem(key('operis_density'));
  document.documentElement.dataset.theme = ['light', 'dark', 'system'].includes(theme ?? '')
    ? theme!
    : 'light';
  document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
}
export async function preferences() {
  return {
    get(name: string) {
      const value = localStorage.getItem(key(name));
      return value === null ? undefined : { value };
    },
    set(name: string, value: string) {
      localStorage.setItem(key(name), value);
      applyPreferences();
    },
    delete(name: string) {
      localStorage.removeItem(key(name));
    },
  };
}
