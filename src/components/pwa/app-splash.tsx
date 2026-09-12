import Image from "next/image";

const KEY = "gebzem.splash";

/** Runs before the splash is parsed: a reload in the same tab session skips it (sessionStorage, no personal data). */
const SCRIPT = `try{if(sessionStorage.getItem("${KEY}"))document.documentElement.setAttribute("data-splash","done");else sessionStorage.setItem("${KEY}","1")}catch(e){}`;

/** Shown for 2.2 s, then fades out and stops catching taps; skipped instantly after a reload in the same session. */
const CSS = `@keyframes gz-splash-out{to{opacity:0;visibility:hidden}}
.gz-splash{animation:gz-splash-out .45s ease 2.2s forwards}
html[data-splash="done"] .gz-splash{display:none}
@media (prefers-reduced-motion:reduce){.gz-splash{animation-duration:1ms}}`;

/**
 * Launch splash, like WhatsApp's: the black "g" mark in the middle of the logo's lilac-to-white gradient and
 * "AkseDigital" (one word, 22 px) 50 px above the bottom, for about two seconds each time the app is opened (once per tab session), then
 * it fades away. Plain server HTML + CSS, so it is there on the very first paint and needs no JavaScript to go away.
 * Rendered by the root layout on the public site only (not on the admin site). Server-safe.
 */
export function AppSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div
        aria-hidden
        className="gz-splash fixed inset-0 z-[1000] flex items-center justify-center bg-linear-to-b from-[#d4b0fd] via-[#eddefd] via-50% to-white to-90%"
      >
        <Image src="/brand/logo-mark.webp" alt="" width={240} height={240} priority className="size-60" />
        <span className="absolute inset-x-0 bottom-[calc(50px+env(safe-area-inset-bottom,0px))] text-center text-[22px] font-extrabold tracking-normal text-neutral-900/70">
          AkseDigital
        </span>
      </div>
    </>
  );
}
