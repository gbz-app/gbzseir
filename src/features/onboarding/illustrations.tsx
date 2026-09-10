/**
 * Inline SVG illustrations for the onboarding slides. Animations use the gz-* keyframes from globals.css
 * and only run while the slide is active (remounted via `key`), and are disabled by prefers-reduced-motion.
 */
import * as React from "react";

type IlluProps = { active: boolean };

const TEAL = "#0F766E";
const TEAL_L = "#14B8A6";
const TEAL_XL = "#99F6E4";
const AMBER = "#F59E0B";
const GREEN = "#10B981";
const BLUE = "#3B82F6";
const CARD = "var(--card)";
const LINE = "var(--border)";
const INK = "var(--foreground)";
const MUTED = "var(--muted-foreground)";

function anim(active: boolean, cls: string, delayMs = 0): { className?: string; style?: React.CSSProperties } {
  if (!active) return { style: { opacity: 1 } };
  return { className: `svg-anim ${cls}`, style: { animationDelay: `${delayMs}ms` } };
}

function Svg({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 320 260" role="img" aria-label={label} className="h-full w-full overflow-visible">
      <defs>
        <filter id="gz-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#0B3B37" floodOpacity="0.16" />
        </filter>
        <linearGradient id="gz-teal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={TEAL_L} />
          <stop offset="1" stopColor={TEAL} />
        </linearGradient>
      </defs>
      {children}
    </svg>
  );
}

function FloatBadge({ x, y, children, active, delay }: { x: number; y: number; children: React.ReactNode; active: boolean; delay: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g {...anim(active, "animate-float", delay)}>
        <circle r="19" fill={CARD} filter="url(#gz-shadow)" />
        {children}
      </g>
    </g>
  );
}

/** 1. Gebze skyline: castle tower, mosque with minaret, historic house + floating pill / bus / briefcase. */
export function SkylineIllustration({ active }: IlluProps) {
  return (
    <Svg label="Gebze silueti: kale, cami ve tarihi ev">
      <circle cx="160" cy="138" r="104" fill="var(--brand-soft)" />
      <ellipse cx="160" cy="226" rx="130" ry="12" fill={TEAL} opacity="0.12" />
      {/* Castle tower */}
      <g {...anim(active, "animate-slide-up", 100)}>
        <rect x="42" y="120" width="50" height="104" rx="4" fill="#5EAAA2" />
        {[42, 56, 70, 84].map((x) => (
          <rect key={x} x={x} y="110" width="8" height="12" rx="1.5" fill="#5EAAA2" />
        ))}
        <path d="M58 224v-26a9 9 0 0 1 18 0v26z" fill={TEAL} />
        <rect x="61" y="140" width="12" height="16" rx="6" fill={TEAL} opacity="0.7" />
      </g>
      {/* Mosque */}
      <g {...anim(active, "animate-slide-up", 0)}>
        <rect x="112" y="150" width="92" height="74" rx="4" fill={TEAL_L} />
        <path d="M118 152a40 40 0 0 1 80 0z" fill="url(#gz-teal)" />
        <rect x="156" y="104" width="4" height="10" rx="2" fill={AMBER} />
        <path d="M122 170a10 10 0 0 1 20 0v14h-20zM174 170a10 10 0 0 1 20 0v14h-20z" fill={CARD} opacity="0.85" />
        <path d="M148 224v-24a10 10 0 0 1 20 0v24z" fill={TEAL} />
        {/* Minaret */}
        <rect x="212" y="84" width="12" height="140" rx="3" fill={TEAL_L} />
        <rect x="208" y="120" width="20" height="6" rx="3" fill={TEAL} />
        <path d="M212 86l6-30 6 30z" fill={TEAL} />
        <circle cx="218" cy="52" r="2.5" fill={AMBER} />
      </g>
      {/* Historic house */}
      <g {...anim(active, "animate-slide-up", 200)}>
        <rect x="238" y="146" width="54" height="78" rx="3" fill={CARD} stroke={LINE} strokeWidth="2" />
        <rect x="234" y="140" width="62" height="10" rx="2" fill="#C2410C" opacity="0.85" />
        <path d="M232 142l33-24 33 24z" fill="#C2410C" />
        {[250, 272].map((x) => (
          <rect key={`a${x}`} x={x} y="158" width="10" height="16" rx="2" fill={TEAL_XL} />
        ))}
        {[250, 272].map((x) => (
          <rect key={`b${x}`} x={x} y="184" width="10" height="16" rx="2" fill={TEAL_XL} />
        ))}
        <rect x="259" y="204" width="12" height="20" rx="2" fill="#9A3412" />
      </g>
      {/* Trees */}
      <circle cx="104" cy="210" r="12" fill={GREEN} opacity="0.85" />
      <circle cx="30" cy="212" r="10" fill={GREEN} opacity="0.7" />
      <circle cx="300" cy="214" r="9" fill={GREEN} opacity="0.7" />
      {/* Floating icons */}
      <FloatBadge x={70} y={64} active={active} delay={0}>
        <g transform="rotate(-35)">
          <rect x="-11" y="-5" width="22" height="10" rx="5" fill={AMBER} />
          <path d="M0 -5h6a5 5 0 0 1 0 10H0z" fill={TEAL_L} />
        </g>
      </FloatBadge>
      <FloatBadge x={252} y={58} active={active} delay={600}>
        <rect x="-10" y="-9" width="20" height="16" rx="4" fill={BLUE} />
        <rect x="-7" y="-6" width="14" height="6" rx="1.5" fill="#DBEAFE" />
        <circle cx="-5" cy="9" r="2.4" fill={INK} />
        <circle cx="5" cy="9" r="2.4" fill={INK} />
      </FloatBadge>
      <FloatBadge x={160} y={36} active={active} delay={1200}>
        <rect x="-10" y="-6" width="20" height="14" rx="3" fill={TEAL} />
        <path d="M-4 -6v-3h8v3" fill="none" stroke={TEAL} strokeWidth="2.4" strokeLinejoin="round" />
        <rect x="-10" y="-1" width="20" height="2" fill={TEAL_XL} />
      </FloatBadge>
    </Svg>
  );
}

/** 2. Map with pulsing location dot, dropping pins and a "Nöbetçi" card sliding up. */
export function MapIllustration({ active }: IlluProps) {
  return (
    <Svg label="Harita üzerinde konumun ve yakındaki yerler">
      <rect x="22" y="16" width="276" height="228" rx="28" fill="var(--brand-soft)" filter="url(#gz-shadow)" />
      <path d="M40 80c30 10 50-20 90-8s60 30 110 10 50 10 50 10" stroke={CARD} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M110 16v228M22 150c60-6 120 20 276-10" stroke={CARD} strokeWidth="10" fill="none" />
      <path d="M210 16c-10 60 20 120 0 228" stroke={CARD} strokeWidth="8" fill="none" />
      <ellipse cx="70" cy="200" rx="34" ry="20" fill={GREEN} opacity="0.25" />
      <ellipse cx="262" cy="52" rx="30" ry="18" fill={BLUE} opacity="0.2" />
      {/* Pins */}
      {[
        { x: 78, y: 112, c: TEAL, d: 200 },
        { x: 246, y: 104, c: GREEN, d: 450 },
        { x: 190, y: 62, c: AMBER, d: 700 },
      ].map((p) => (
        <g key={p.x} transform={`translate(${p.x} ${p.y})`}>
          <g {...anim(active, "animate-pin-drop", p.d)}>
            <path d="M0 18C-8 9-12 3-12-3a12 12 0 0 1 24 0c0 6-4 12-12 21z" fill={p.c} />
            <circle cy="-3" r="4.5" fill={CARD} />
          </g>
        </g>
      ))}
      {/* Me */}
      <g transform="translate(160 118)">
        <circle r="10" fill={BLUE} opacity="0.35" {...anim(active, "animate-pulse-ring")} />
        <circle r="9" fill={BLUE} stroke="#fff" strokeWidth="3.5" />
      </g>
      {/* Duty card */}
      <g {...anim(active, "animate-slide-up", 900)}>
        <rect x="46" y="170" width="228" height="58" rx="16" fill={CARD} filter="url(#gz-shadow)" />
        <circle cx="74" cy="199" r="15" fill={GREEN} />
        <path d="M71 190h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="#fff" />
        <rect x="98" y="186" width="92" height="10" rx="5" fill={INK} opacity="0.85" />
        <rect x="98" y="203" width="60" height="8" rx="4" fill={MUTED} opacity="0.5" />
        <rect x="204" y="188" width="56" height="22" rx="11" fill={AMBER} />
        <text x="232" y="203" textAnchor="middle" fontSize="11" fontWeight="800" fill="#451A03">
          Nöbetçi
        </text>
      </g>
    </Svg>
  );
}

function Star({ x, y }: { x: number; y: number }) {
  return <path transform={`translate(${x} ${y}) scale(0.55)`} d="M12 2l3 6.3 6.9 1-5 4.8 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.8 6.9-1z" fill={AMBER} />;
}

/** 3. Stacked verified business cards with rating and green call button. */
export function BusinessIllustration({ active }: IlluProps) {
  return (
    <Svg label="Onaylı işletme kartları, puan ve arama butonu">
      <circle cx="160" cy="130" r="100" fill="var(--brand-soft)" />
      <g transform="rotate(-8 160 130)" {...anim(active, "animate-fade-in", 0)}>
        <rect x="70" y="56" width="180" height="92" rx="18" fill={CARD} stroke={LINE} strokeWidth="2" opacity="0.7" />
      </g>
      <g transform="rotate(5 160 130)" {...anim(active, "animate-fade-in", 150)}>
        <rect x="66" y="76" width="188" height="96" rx="18" fill={CARD} stroke={LINE} strokeWidth="2" opacity="0.85" />
      </g>
      <g {...anim(active, "animate-slide-up", 300)}>
        <rect x="54" y="104" width="212" height="112" rx="20" fill={CARD} filter="url(#gz-shadow)" />
        <circle cx="88" cy="140" r="20" fill="url(#gz-teal)" />
        <path d="M81 133l14 14M95 133l-14 14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="81" cy="133" r="3.5" fill="none" stroke="#fff" strokeWidth="2.5" />
        <circle cx="95" cy="133" r="3.5" fill="none" stroke="#fff" strokeWidth="2.5" />
        <rect x="118" y="126" width="84" height="11" rx="5.5" fill={INK} opacity="0.85" />
        <Star x={118} y={143} />
        <text x="134" y="154" fontSize="12" fontWeight="800" fill={INK}>
          4,8
        </text>
        <text x="156" y="154" fontSize="11" fill={MUTED}>
          (126)
        </text>
        <g {...anim(active, "animate-pop", 800)}>
          <rect x="70" y="174" width="70" height="24" rx="12" fill="var(--brand-soft)" />
          <circle cx="84" cy="186" r="6" fill={TEAL} />
          <path d="M81 186l2 2 4-4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="95" y="190" fontSize="11" fontWeight="800" fill={TEAL}>
            Onaylı
          </text>
        </g>
        <g transform="translate(236 186)" {...anim(active, "animate-pop", 1100)}>
          <circle r="19" fill={GREEN} />
          <path
            d="M-6 -8c1-1 2.6-1 3.4.2l1.6 2.5c.6 1 .4 2.2-.4 2.9l-1.2 1c.9 2 2.4 3.6 4.4 4.6l1-1.3c.7-.8 1.9-1 2.9-.4l2.5 1.6c1.2.8 1.3 2.4.2 3.4l-1.3 1.2c-1.5 1.4-3.8 1.6-5.6.6-4.6-2.6-8.2-6.3-10.6-11-1-1.8-.7-4 .8-5.4z"
            fill="#fff"
          />
        </g>
      </g>
    </Svg>
  );
}

/** 4. A 2. el listing card and a job card ("Servis var · Yemek"). */
export function ListingsIllustration({ active }: IlluProps) {
  return (
    <Svg label="İkinci el ilan ve iş ilanı kartları">
      <circle cx="160" cy="130" r="100" fill="var(--brand-soft)" />
      <g {...anim(active, "animate-float", 0)}>
        <g transform="rotate(-6 100 130)">
          <rect x="34" y="44" width="128" height="164" rx="18" fill={CARD} filter="url(#gz-shadow)" />
          <rect x="44" y="54" width="108" height="78" rx="12" fill={TEAL_XL} opacity="0.6" />
          {/* bike */}
          <circle cx="76" cy="104" r="14" fill="none" stroke={TEAL} strokeWidth="4" />
          <circle cx="120" cy="104" r="14" fill="none" stroke={TEAL} strokeWidth="4" />
          <path d="M76 104l14-22h18l12 22M90 82l8 22h-22M104 76h8" fill="none" stroke={TEAL} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="46" y="144" width="86" height="10" rx="5" fill={INK} opacity="0.8" />
          <text x="46" y="178" fontSize="15" fontWeight="800" fill={TEAL}>
            2.750 TL
          </text>
          <rect x="46" y="188" width="58" height="8" rx="4" fill={MUTED} opacity="0.45" />
        </g>
      </g>
      <g {...anim(active, "animate-float", 700)}>
        <g transform="rotate(5 220 140)">
          <rect x="148" y="70" width="140" height="150" rx="18" fill={CARD} filter="url(#gz-shadow)" />
          <rect x="162" y="86" width="36" height="36" rx="11" fill={AMBER} />
          <rect x="171" y="98" width="18" height="14" rx="3" fill="#fff" />
          <path d="M176 98v-3h8v3" stroke="#fff" strokeWidth="2.5" fill="none" />
          <rect x="162" y="134" width="104" height="10" rx="5" fill={INK} opacity="0.8" />
          <rect x="162" y="152" width="70" height="8" rx="4" fill={MUTED} opacity="0.45" />
          <g {...anim(active, "animate-pop", 900)}>
            <rect x="162" y="174" width="112" height="26" rx="13" fill="var(--success-soft)" />
            <text x="218" y="191" textAnchor="middle" fontSize="11" fontWeight="800" fill={GREEN}>
              Servis var · Yemek
            </text>
          </g>
        </g>
      </g>
    </Svg>
  );
}

/** 5. Checklist -> paper plane -> 3 firm cards "İlgileniyorum". */
export function ServiceRequestIllustration({ active }: IlluProps) {
  return (
    <Svg label="Talep formu firmalara gidiyor, firmalar ilgileniyor">
      <circle cx="160" cy="130" r="104" fill="var(--brand-soft)" />
      {/* checklist */}
      <g {...anim(active, "animate-slide-up", 0)}>
        <rect x="18" y="62" width="104" height="136" rx="16" fill={CARD} filter="url(#gz-shadow)" />
        {[88, 122, 156].map((y, i) => (
          <g key={y}>
            <g {...anim(active, "animate-pop", 300 + i * 250)}>
              <circle cx="40" cy={y} r="9" fill={i < 3 ? TEAL : LINE} />
              <path d={`M35.5 ${y}l3 3 6-6`} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <rect x="56" y={y - 5} width={i === 1 ? 44 : 54} height="10" rx="5" fill={INK} opacity="0.7" />
          </g>
        ))}
      </g>
      {/* plane */}
      <g transform="translate(150 96)">
        <g {...anim(active, "animate-fly", 400)}>
          <path d="M-16 4L18-12 8 16 1 7z" fill={TEAL_L} />
          <path d="M1 7l17-19-10 28z" fill={TEAL} />
        </g>
      </g>
      <path d="M126 130c14-6 22-20 34-24" stroke={TEAL} strokeWidth="2" strokeDasharray="4 5" fill="none" opacity="0.5" />
      {/* firms */}
      {[46, 106, 166].map((y, i) => (
        <g key={y} {...anim(active, "animate-slide-up", 700 + i * 220)}>
          <rect x="178" y={y} width="126" height="48" rx="14" fill={CARD} filter="url(#gz-shadow)" />
          <circle cx="200" cy={y + 24} r="11" fill={[TEAL, AMBER, BLUE][i]} />
          <rect x="218" y={y + 12} width="54" height="8" rx="4" fill={INK} opacity="0.75" />
          <rect x="218" y={y + 27} width="76" height="14" rx="7" fill="var(--success-soft)" />
          <text x="256" y={y + 37.5} textAnchor="middle" fontSize="9" fontWeight="800" fill={GREEN}>
            İlgileniyorum
          </text>
        </g>
      ))}
    </Svg>
  );
}

/** 6. Phone with a location pin and a privacy shield. */
export function LocationIllustration({ active }: IlluProps) {
  return (
    <Svg label="Konum pini ve gizlilik kalkanı">
      <circle cx="160" cy="130" r="104" fill="var(--brand-soft)" />
      <g {...anim(active, "animate-slide-up", 0)}>
        <rect x="106" y="28" width="108" height="206" rx="24" fill={INK} />
        <rect x="113" y="36" width="94" height="190" rx="18" fill={CARD} />
        <path d="M113 110c30 8 60-18 94-6M113 170c26-10 64 8 94-4M150 36v190" stroke="var(--brand-soft)" strokeWidth="9" fill="none" />
        <rect x="146" y="42" width="28" height="6" rx="3" fill={INK} opacity="0.8" />
      </g>
      <g transform="translate(160 132)">
        <ellipse cy="26" rx="16" ry="5" fill={TEAL} opacity="0.2" {...anim(active, "animate-pulse-ring", 600)} />
        <g {...anim(active, "animate-pin-drop", 300)}>
          <path d="M0 26C-14 12-22 2-22-8a22 22 0 0 1 44 0c0 10-8 20-22 34z" fill="url(#gz-teal)" />
          <circle cy="-8" r="8" fill="#fff" />
        </g>
      </g>
      <g transform="translate(236 176)" {...anim(active, "animate-pop", 900)}>
        <path d="M0 -30l24 9v17c0 16-10 28-24 34-14-6-24-18-24-34v-17z" fill={CARD} filter="url(#gz-shadow)" />
        <path d="M0 -22l17 6v12c0 11-7 20-17 25-10-5-17-14-17-25v-12z" fill={GREEN} />
        <path d="M-7 -1l5 5 10-10" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(82 84)" {...anim(active, "animate-float", 400)}>
        <circle r="17" fill={CARD} filter="url(#gz-shadow)" />
        <rect x="-7" y="-2" width="14" height="11" rx="2.5" fill={AMBER} />
        <path d="M-4 -2v-3a4 4 0 0 1 8 0v3" stroke={AMBER} strokeWidth="2.5" fill="none" />
      </g>
    </Svg>
  );
}
