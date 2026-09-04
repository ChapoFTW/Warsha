'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A major section arriving as it is scrolled to. Once.
 *
 * Three properties this has to hold, and each one is why it is written the way
 * it is rather than in CSS:
 *
 *   IT NEVER HIDES ANYTHING. The markup is rendered visible by the server and
 *   stays visible with JavaScript off, with an observer unavailable, and to
 *   anything reading the document rather than painting it. `data-reveal` is set
 *   here, after hydration, and the stylesheet only knows how to hide an element
 *   that has already been marked — so the failure mode is "no animation", never
 *   "no content".
 *
 *   IT NEVER FLASHES. A section that is already on screen when the page loads
 *   is marked shown and left alone. The naive version of this component hides
 *   everything on mount and fades it back in, which means the reader watches
 *   content they were already looking at disappear and return.
 *
 *   IT HAPPENS ONCE. The observer disconnects on the first intersection. A
 *   scroll-driven timeline would have been fewer lines and no JavaScript, but
 *   those reverse: scroll back up and the section fades out again, which is the
 *   single most irritating thing a marketing page can do.
 *
 * Reduced motion opts out here as well as in the stylesheet. Belt and braces is
 * correct for this one: the CSS guard covers the animation, and this covers the
 * observer, so a reader who asked for less motion has nothing running at all.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const settle = () => { element.dataset.reveal = 'shown'; };

    if (
      typeof IntersectionObserver === 'undefined'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Already on screen: there is nothing to reveal, and hiding it to reveal
      // it again is the flash this component exists to avoid.
      || element.getBoundingClientRect().top < window.innerHeight
    ) {
      settle();
      return;
    }

    element.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      (entries) => {
        // `isIntersecting` alone is not enough. A jump — a restored scroll
        // position, an in-page anchor, a flick on a trackpad — can carry a
        // section from below the fold to above it between two callbacks, and
        // the observer then reports it as not intersecting for the rest of the
        // session. The section would stay at opacity 0 permanently. So a
        // section that has ended up above the viewport counts as arrived: it
        // has been scrolled past, which is the strongest possible evidence
        // that it should be visible. Found by the browser check, not by eye.
        const arrived = entries.some(
          (entry) => entry.isIntersecting || entry.boundingClientRect.top < 0,
        );
        if (!arrived) return;
        settle();
        observer.disconnect();
      },
      {
        // Bottom: a little inside the fold, so the section has finished
        // arriving by the time the reader's eye reaches it rather than
        // starting under it.
        //
        // Top: effectively unbounded, and that is the whole fix for a bug the
        // browser check found. An observer only reports a *change* in
        // intersection, so a section that goes from below the fold to above it
        // between two frames — a restored scroll position, an in-page anchor, a
        // hard flick — never intersects, never fires, and stays at opacity 0
        // for the rest of the session. Growing the root upward makes "already
        // scrolled past" an intersection, which is exactly what it means.
        rootMargin: '100000px 0px -12% 0px',
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
