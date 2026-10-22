'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Photos one at a time, swiped on a phone and stepped with the arrows or the
 * keyboard elsewhere. The track is a native scroll-snap scroller, so swiping is
 * the browser's own and works before this hydrates; the script only adds the
 * buttons and keeps the counter in step with wherever the track came to rest.
 */
export function PhotoCarousel({ slides, label }: { slides: ReactNode[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = slides.length;

  // Read from the scroll position rather than tracked from the clicks, so a
  // swipe, a trackpad flick and a button press all land on the same number.
  const sync = useCallback(() => {
    const element = track.current;
    if (!element || !element.clientWidth) return;
    setIndex(Math.max(0, Math.min(count - 1, Math.round(element.scrollLeft / element.clientWidth))));
  }, [count]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    element.addEventListener('scroll', sync, { passive: true });
    return () => element.removeEventListener('scroll', sync);
  }, [sync]);

  function go(next: number) {
    const element = track.current;
    if (!element) return;
    const target = (next + count) % count;
    // Reduced motion gets the jump without the glide.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ left: target * element.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }

  return (
    <div className="post-carousel" role="group" aria-roledescription="carousel" aria-label={label}>
      <div ref={track} className="post-carousel-track" tabIndex={0}>
        {slides.map((slide, slideIndex) => (
          <div
            key={slideIndex}
            className="post-carousel-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} of ${count}`}
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <>
          <button type="button" className="post-carousel-step" data-side="prev" onClick={() => go(index - 1)} aria-label="Previous photo">
            <Chevron direction="left" />
          </button>
          <button type="button" className="post-carousel-step" data-side="next" onClick={() => go(index + 1)} aria-label="Next photo">
            <Chevron direction="right" />
          </button>
          <div className="post-carousel-meta">
            <div className="post-carousel-dots">
              {slides.map((_, dot) => (
                <button
                  key={dot}
                  type="button"
                  onClick={() => go(dot)}
                  aria-label={`Show photo ${dot + 1}`}
                  aria-current={dot === index ? 'true' : undefined}
                />
              ))}
            </div>
            <span aria-live="polite">
              {index + 1} / {count}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}
