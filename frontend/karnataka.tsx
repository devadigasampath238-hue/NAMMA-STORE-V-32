"use client";

// ===========================================================
// karnataka.tsx
// -----------------------------------------------------------
// Karnataka / Kannada visual-identity building blocks: hand-drawn
// inline SVG motifs (temple gopuram skyline, Yakshagana-inspired
// crown pattern, Hampi stone-chariot wheel, a coastal wave) plus a
// couple of tiny, dependency-free scroll animation hooks.
//
// Every graphic here is drawn in code, not sourced from a photo or
// stock library, so there is nothing to license - "royalty-safe" by
// construction. The uploaded Hampi/Vijayanagara photos are used only
// as inspiration for these shapes, exactly as the brief asked.
//
// Framer Motion note: this container has no network access to add
// new npm packages (this file cannot `npm install framer-motion`,
// and neither can your deployment pull it without you running
// `npm install` yourself first - see README). Rather than leave
// half the brief unmet, RevealOnScroll/useParallaxOffset below give
// the same reveal/parallax/micro-interaction feel using
// IntersectionObserver + a passive scroll listener, which is exactly
// the approach this codebase's own globals.css already documents
// ("plain CSS on purpose: framer-motion is not a dependency of this
// project"). If you `npm install framer-motion` yourself later, these
// two exports are the only places you would swap it in.
// ===========================================================

import { useEffect, useRef, useState } from "react";

/* -----------------------------------------------------------
   REVEAL ON SCROLL
   Fades + lifts a section in the first time it enters the
   viewport. Cheap (one IntersectionObserver per element,
   disconnects itself once triggered) and respects
   prefers-reduced-motion via the .ns-reveal CSS below.
   ----------------------------------------------------------- */
export function RevealOnScroll({
  children,
  className = "",
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`ns-reveal ${visible ? "ns-reveal-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

/**
 * A gentle, capped parallax offset for a decorative background layer.
 * Only listens to scroll while the element is near the viewport, and
 * the effect is capped at +/-24px so it reads as "subtle depth", not
 * motion-sickness. Returns a ready-to-use transform string.
 */
export function useParallaxOffset(strength = 0.15, max = 24) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let inView = false;
    const io = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting), {
      rootMargin: "200px",
    });
    io.observe(el);

    let ticking = false;
    function onScroll() {
      if (!inView || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = el!.getBoundingClientRect();
        const center = rect.top + rect.height / 2 - window.innerHeight / 2;
        const raw = -center * strength;
        setOffset(Math.max(-max, Math.min(max, raw)));
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [strength, max]);

  return { ref, style: { transform: `translate3d(0, ${offset}px, 0)` } as React.CSSProperties };
}

/* -----------------------------------------------------------
   TEMPLE SKYLINE DIVIDER
   A row of gopuram/shikhara silhouettes (Hampi + Mysuru-style
   temple towers), used as a section divider or banner backdrop.
   ----------------------------------------------------------- */
export function TempleSkylineDivider({
  className = "",
  tone = "currentColor",
  flip = false,
}: {
  className?: string;
  tone?: string;
  flip?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1200 90"
      preserveAspectRatio="none"
      className={className}
      style={flip ? { transform: "scaleY(-1)" } : undefined}
      aria-hidden="true"
    >
      <path
        fill={tone}
        d="M0,90 L0,60 L40,60 L40,40 L55,40 L55,20 L60,8 L65,20 L65,40 L80,40 L80,58 L120,58
           L120,44 L140,44 L140,26 L150,10 L160,26 L160,44 L180,44 L180,58 L230,58 L230,50 L245,50
           L245,34 L260,14 L275,34 L275,50 L290,50 L290,58 L340,58 L340,42 L355,42 L355,24 L370,8
           L385,24 L385,42 L400,42 L400,58 L460,58 L460,48 L475,48 L475,30 L490,12 L505,30 L505,48
           L520,48 L520,58 L580,58 L580,40 L598,40 L598,20 L615,4 L632,20 L632,40 L650,40 L650,58
           L710,58 L710,48 L725,48 L725,30 L740,12 L755,30 L755,48 L770,48 L770,58 L830,58 L830,42
           L845,42 L845,24 L860,8 L875,24 L875,42 L890,42 L890,58 L950,58 L950,50 L965,50 L965,34
           L980,14 L995,34 L995,50 L1010,50 L1010,58 L1070,58 L1070,44 L1085,44 L1085,26 L1100,10
           L1115,26 L1115,44 L1130,44 L1130,60 L1200,60 L1200,90 Z"
      />
    </svg>
  );
}

/* -----------------------------------------------------------
   YAKSHAGANA PATTERN STRIP
   A slim repeating kirita/crown-inspired triangular border in
   Kannada-flag colours - a decorative rule, not a photo of an
   actual Yakshagana costume, so it stays elegant rather than
   costume-literal.
   ----------------------------------------------------------- */
export function YakshaganaPatternStrip({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 16"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <pattern id="ns-yakshagana-tri" width="24" height="16" patternUnits="userSpaceOnUse">
          <polygon points="0,16 12,2 24,16" fill="#F2A93B" />
          <polygon points="6,16 12,7 18,16" fill="#B3231C" />
        </pattern>
      </defs>
      <rect width="240" height="16" fill="url(#ns-yakshagana-tri)" />
    </svg>
  );
}

/* -----------------------------------------------------------
   HAMPI CHARIOT WHEEL
   The stone chariot at Hampi's Vittala Temple is Karnataka's most
   recognisable emblem (it even anchors the Namma Store logo) - a
   simple spoked-wheel badge nods to it without reproducing any
   photograph.
   ----------------------------------------------------------- */
export function ChariotWheelBadge({
  className = "",
  tone = "#7C2D12",
}: {
  className?: string;
  tone?: string;
}) {
  const spokes = Array.from({ length: 8 });
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="none" stroke={tone} strokeWidth="4" />
      <circle cx="50" cy="50" r="10" fill="none" stroke={tone} strokeWidth="4" />
      {spokes.map((_, i) => {
        const angle = (i * Math.PI) / 4;
        const x1 = 50 + Math.cos(angle) * 12;
        const y1 = 50 + Math.sin(angle) * 12;
        const x2 = 50 + Math.cos(angle) * 44;
        const y2 = 50 + Math.sin(angle) * 44;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone} strokeWidth="3" />;
      })}
      {spokes.map((_, i) => {
        const angle = (i * Math.PI) / 4 + Math.PI / 8;
        const x = 50 + Math.cos(angle) * 44;
        const y = 50 + Math.sin(angle) * 44;
        return <circle key={`b${i}`} cx={x} cy={y} r="2.4" fill={tone} />;
      })}
    </svg>
  );
}

/* -----------------------------------------------------------
   COASTAL WAVE DIVIDER
   A soft wave shape for the coastal-Karnataka (Udupi/Mangaluru)
   note the brief asks for - used between sections instead of a
   hard rectangular cut.
   ----------------------------------------------------------- */
export function WaveDivider({
  className = "",
  tone = "currentColor",
}: {
  className?: string;
  tone?: string;
}) {
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        fill={tone}
        d="M0,32 C150,60 350,4 600,28 C850,52 1050,8 1200,30 L1200,60 L0,60 Z"
      />
    </svg>
  );
}
