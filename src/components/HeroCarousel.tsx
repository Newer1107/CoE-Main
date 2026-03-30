"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

export type HeroSlide = {
  id: string;
  image: string;
  title: string;
  description: string;
};

type HeroCarouselProps = {
  slides: HeroSlide[];
  intervalMs?: number;
};

export default function HeroCarousel({ slides, intervalMs = 4000 }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [slides.length, intervalMs]);

  if (slides.length === 0) {
    return null;
  }

  const safeIndex = activeIndex % slides.length;
  const activeSlide = slides[safeIndex];

  const goTo = (index: number) => {
    setActiveIndex(index);
  };

  const prev = () => {
    setActiveIndex((prevIndex) => (prevIndex - 1 + slides.length) % slides.length);
  };

  const next = () => {
    setActiveIndex((prevIndex) => (prevIndex + 1) % slides.length);
  };

  const handleHeroCtaClick = () => {
    try {
      trackEvent("hero_cta_clicked", {
        slide_title: activeSlide.title,
        slide_index: activeIndex + 1,
      });
    } catch {
      // analytics must never break navigation
    }
  };

  return (
    <section className="mb-8 md:mb-12 border border-[#c4c6d3] bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[44%_56%]">
        <div className="bg-[#f5f4f0] border-b lg:border-b-0 lg:border-r border-[#c4c6d3] p-5 sm:p-6 md:p-10 lg:p-12 flex flex-col justify-between min-h-[280px] sm:min-h-[320px] lg:min-h-[420px]">
          <article className="transition-opacity duration-300">
            
            <h1 className="mt-3 font-headline text-2xl sm:text-3xl md:text-4xl font-bold text-[#002155] leading-tight break-words">
              {activeSlide.title}
            </h1>
            <p className="mt-4 text-sm md:text-base text-[#434651] leading-relaxed max-w-2xl">
              {activeSlide.description}
            </p>
            <Link
              href="/innovation"
              onClick={handleHeroCtaClick}
              className="inline-flex mt-5 border border-[#002155] bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-[#1a438e]"
            >
              Explore Innovation
            </Link>
          </article>

          {slides.length > 1 ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    onClick={() => goTo(index)}
                    className={`h-2.5 w-7 sm:w-8 border transition-colors ${
                      index === activeIndex
                        ? "bg-[#002155] border-[#002155]"
                        : "bg-transparent border-[#747782]"
                    }`}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={prev}
                  className="px-3 py-1.5 text-xs font-bold border border-[#747782] text-[#002155] hover:bg-[#002155] hover:text-white transition-colors"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="px-3 py-1.5 text-xs font-bold border border-[#747782] text-[#002155] hover:bg-[#002155] hover:text-white transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative bg-[#e3e2df] overflow-hidden min-h-[240px] sm:min-h-[300px] md:min-h-[380px] lg:min-h-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeSlide.image}
            alt={activeSlide.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#00142f]/45 via-transparent to-transparent" />
        </div>
      </div>
    </section>
  );
}
