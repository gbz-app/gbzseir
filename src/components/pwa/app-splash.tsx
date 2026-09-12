import Image from "next/image";
import "./app-splash.css";

const KEY = "gebzem.splash";

/** Runs before the splash is parsed: a reload in the same tab session skips it (sessionStorage, no personal data); otherwise
 *  the animation holds still until its pictures are in. */
const SCRIPT = `try{var d=document.documentElement;if(sessionStorage.getItem("${KEY}"))d.setAttribute("data-splash","done");else{sessionStorage.setItem("${KEY}","1");d.setAttribute("data-splash","wait")}}catch(e){}`;

/** Runs right after the splash: starts it once both pictures have loaded (at most 1.2 s), so the "g" never plays half-drawn. */
const START = `(function(){var d=document.documentElement;if(d.getAttribute("data-splash")!=="wait")return;var go=function(){if(d.getAttribute("data-splash")==="wait")d.setAttribute("data-splash","play")},imgs=document.querySelectorAll(".gz-splash img"),n=imgs.length;setTimeout(go,1200);imgs.forEach(function(i){if(i.complete)--n||go();else{i.addEventListener("load",function(){--n||go()});i.addEventListener("error",go)}})})()`;

/** The owner's animation is 2.6 s and its last second is the finished logo holding still; then the splash fades out and stops
 *  catching taps. */
const CSS = `@keyframes gz-splash-out{to{opacity:0;visibility:hidden}}
.gz-splash{animation:gz-splash-out .45s ease 2.6s forwards}
html[data-splash="done"] .gz-splash{display:none}
html[data-splash="wait"] .gz-splash,html[data-splash="wait"] .gz-splash img{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.gz-splash{animation-duration:1ms}.gz-splash .gz-splash-stage>img{animation-duration:1ms}}`;

/**
 * Launch splash, like WhatsApp's: the owner's "Gebzem" logo animation (the "g" alone, then it shrinks to the left and "ebzem"
 * is revealed) on the logo's lilac-to-white gradient and "AkseDigital" (one word, 22 px) 50 px above the bottom, each time the
 * app is opened (once per tab session). The animation is plain CSS generated from the owner's Lottie file
 * (scripts/dev/splash-from-lottie.mjs, app-splash.css), so it is there on the very first paint and needs no player; if the
 * script cannot run it simply plays at once. Rendered by the root layout on the public site only (not on the admin site).
 * Server-safe.
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
        <div className="gz-splash-stage">
          <Image src="/brand/splash/g.webp" alt="" width={312} height={386} unoptimized preload className="gz-splash-g" />
          <Image src="/brand/splash/word.webp" alt="" width={680} height={159} unoptimized preload className="gz-splash-word" />
        </div>
        <span className="absolute inset-x-0 bottom-[calc(50px+env(safe-area-inset-bottom,0px))] text-center text-[22px] font-extrabold tracking-normal text-neutral-900/70">
          AkseDigital
        </span>
      </div>
      <script dangerouslySetInnerHTML={{ __html: START }} />
    </>
  );
}
