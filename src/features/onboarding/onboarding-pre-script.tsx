import { STORAGE_KEYS } from "@/config/site";

/**
 * Render-blocking inline script (root layout <head>). Remembers the landing path of this tab session and,
 * on a FIRST visit that starts at "/", marks <html data-onboarding="pending"> so the splash shows before
 * hydration. Deep links (landing elsewhere) never trigger onboarding.
 */
export function OnboardingPreScript() {
  const js = `(function(){try{var d=document.documentElement,p=location.pathname,s=sessionStorage;if(!s.getItem('gebzem.landing'))s.setItem('gebzem.landing',p);if(p!=='/')return;if(localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.onboarded,
  )})!==null)return;if(s.getItem('gebzem.landing')!=='/'&&s.getItem('gebzem.onboarding.force')!=='1')return;d.setAttribute('data-onboarding','pending')}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
