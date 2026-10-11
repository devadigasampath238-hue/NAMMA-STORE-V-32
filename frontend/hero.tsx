"use client";

// ===========================================================
// hero.tsx - the storefront hero carousel.
//
// It renders whatever banners the admin has scheduled. There is
// no festival list in this file and no festival list anywhere
// else in the codebase: Deepavali, Dasara, Ugadi, Sankranti,
// Republic Day and whatever campaign is invented in 2028 are all
// just rows created at /admin/banners.
//
// If there are no live banners, this component renders NOTHING
// and the page falls back to its own static hero. That is a
// deliberate choice - an empty carousel with dots and arrows
// looks broken, a missing one does not.
// ===========================================================

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Banner } from "./types";
import { SafeImage } from "./components";
import { bannerImageSources } from "./imageUrl";

const ROTATE_MS = 5500;

export function HeroCarousel({ banners }: { banners: Banner[] }) {
  // A slide needs real artwork (imageUrl, images[0] or mobileImageUrl) or at least a title.
  const slides = banners.filter((b) => bannerImageSources(b).desktop || b.title);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = slides.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  // Auto-advance. Paused on hover, on focus within, and when the tab is
  // hidden (an offscreen carousel burning timers is just wasted battery).
  useEffect(() => {
    if (count <= 1 || paused) return;

    // Respect the OS "reduce motion" setting rather than overriding it.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [count, paused]);

  useEffect(() => {
    function onVisibility() {
      setPaused(document.visibilityState === "hidden");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (count === 0) return null;

  const current = slides[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      className="ns-animate-fade-up relative h-full overflow-hidden rounded-2xl bg-coffee-900 shadow-lift"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const delta = (e.changedTouches[0]?.clientX ?? start) - start;
        // 48px threshold so a slightly slanted vertical scroll is not
        // mistaken for a swipe.
        if (Math.abs(delta) < 48) return;
        go(delta < 0 ? index + 1 : index - 1);
      }}
    >
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9] lg:aspect-auto lg:h-full lg:min-h-[300px]">
        {slides.map((banner, i) => {
          const art = bannerImageSources(banner);
          return (
          <div
            key={banner.id}
            aria-hidden={i !== index}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              i === index ? "kar-kenburns opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/* SafeImage handles loading state, broken URLs and object-fit. */}
            <SafeImage
        fit="blur"
              src={art.desktop}
              mobileSrc={art.mobile}
              alt={banner.title}
              className="h-full w-full"
              sizes="100vw"
              priority={i === 0}
            />

            {/* Readability scrim: without it, light banner artwork makes
                white copy unreadable. */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-coffee-950/85 via-coffee-950/50 to-transparent"
              aria-hidden="true"
            />

            <div className="absolute inset-0 flex items-center">
              <div className="max-w-[460px] px-5 py-4 sm:px-9">
                <span className="mb-2 inline-block rounded-full border border-gold-200/60 bg-gold-400/15 px-3 py-0.5 text-xs text-gold-200">
                  ★ <span className="font-kannada">ನಮ್ಮ ಕರ್ನಾಟಕ</span>
                </span>
                <h2 className={`font-display text-2xl font-bold leading-[1.1] text-white drop-shadow-sm sm:text-3xl lg:text-4xl ${i === index ? "kar-hero-in" : ""}`}>
                  {banner.title}
                </h2>

                {banner.subtitle && (
                  <p className={`mt-2 line-clamp-2 text-sm text-brand-50/95 sm:text-[15px] ${i === index ? "kar-hero-in-2" : ""}`}>
                    {banner.subtitle}
                  </p>
                )}

                {banner.ctaText && banner.ctaUrl && (
                  <Link
                    href={banner.ctaUrl}
                    className={`kar-shine mt-4 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:text-base ${i === index ? "kar-hero-in-3" : ""}`}
                    style={{ backgroundColor: banner.accentColor || "#F5B90A", color: banner.accentColor ? "#fff" : "#22140F" }}
                  >
                    {banner.ctaText}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-brand-900 shadow transition hover:bg-white sm:flex"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next banner"
            className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-brand-900 shadow transition hover:bg-white sm:flex"
          >
            ›
          </button>

          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
            {slides.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to banner ${i + 1}: ${banner.title}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? "w-[26px] bg-gold-400" : "w-2 bg-white/55 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* Screen readers get a plain text announcement instead of the
          visual transition. */}
      <p className="sr-only" aria-live="polite">
        Banner {index + 1} of {count}: {current.title}
      </p>
    </section>
  );
}
