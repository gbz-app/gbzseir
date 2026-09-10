import { STORAGE_KEYS } from "@/config/site";

/**
 * Inline, render-blocking script placed in <head> of the root layout.
 * Applies the stored theme ('light' | 'dark' | 'system') before first paint (no flash).
 */
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEYS.theme)});var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark')}else{r.classList.remove('dark')}r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
