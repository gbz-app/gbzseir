import { STORAGE_KEYS } from "@/config/site";

/**
 * Inline, render-blocking script placed in <head> of the root layout. The app is light only (owner, 12.09: no dark
 * mode): it drops a theme saved by the old Görünüm setting and makes sure the page paints light.
 */
export function ThemeScript() {
  const js = `(function(){try{var r=document.documentElement;r.classList.remove('dark');r.style.colorScheme='light';localStorage.removeItem(${JSON.stringify(STORAGE_KEYS.theme)});}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
