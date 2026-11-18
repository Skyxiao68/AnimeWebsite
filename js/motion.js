// Motion is decoration. If the vendor files are missing the site still works,
// so every entry point below is guarded and nothing here touches data.

const gsap = window.gsap;

if (!gsap) {
  console.info('[motion] gsap not loaded, skipping animation');
} else {
  const { ScrollTrigger, MotionPathPlugin, Draggable } = window;
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  if (MotionPathPlugin) gsap.registerPlugin(MotionPathPlugin);
  if (Draggable) gsap.registerPlugin(Draggable);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1 — Timeline: the homepage hero arrives in reading order.
  function heroTimeline() {
    const parts = ['.hero__eyebrow', '.hero__title', '.hero__lede', '.search']
      .map((sel) => document.querySelector(sel))
      .filter(Boolean);
    if (!parts.length) return;

    gsap
      .timeline({ defaults: { ease: 'power3.out', duration: 0.7 } })
      .from(parts, { y: 18, opacity: 0, stagger: 0.09 });
  }

  // 2 — ScrollTrigger: cards appear once, in small batches, as they are reached.
  // Cards render asynchronously, so this covers the first paint and later inserts.
  function revealBatch(nodes) {
    if (!ScrollTrigger) return;

    const fresh = [...nodes].filter(
      (el) =>
        el.matches('.card, .mini') &&
        !el.dataset.revealed &&
        // the weekly row belongs to MotionPath; two tweens would fight over transform
        !el.closest('[data-section="weekly"]'),
    );
    if (!fresh.length) return;

    fresh.forEach((el) => {
      el.dataset.revealed = '1';
    });

    gsap.set(fresh, { opacity: 0, y: 16 });
    ScrollTrigger.batch(fresh, {
      start: 'top 95%',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, overwrite: true }),
    });
  }

  function watchCards() {
    revealBatch(document.querySelectorAll('.card, .mini'));

    const observer = new MutationObserver((records) => {
      const added = [];
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches('.card, .mini')) added.push(node);
          added.push(...node.querySelectorAll('.card, .mini'));
        });
      });
      if (added.length) revealBatch(added);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 3 — MotionPath: the Weekly row lands along a shallow arc instead of a rise.
  function weeklyArc() {
    if (!ScrollTrigger || !MotionPathPlugin) return;

    const row = document.querySelector('.grid[data-section="weekly"]');
    if (!row) return;

    ScrollTrigger.create({
      trigger: row,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        const cards = [...row.querySelectorAll('.card')];
        if (!cards.length) return;

        cards.forEach((card) => {
          card.dataset.revealed = '1';
        });

        gsap.from(cards, {
          opacity: 0,
          duration: 0.75,
          stagger: 0.07,
          ease: 'power2.out',
          // three points plus curviness: a shallow arc back to the element's own spot
          motionPath: {
            path: [{ x: 0, y: 70 }, { x: 34, y: 26 }, { x: 0, y: 0 }],
            curviness: 1.5,
          },
        });
      },
    });
  }

  // 4 — Draggable: on phones the Weekly row is a strip you can push sideways
  // (PRD review #16 asked for a horizontal list rather than a stacked column).
  function draggableStrip() {
    if (!Draggable) return;

    const row = document.querySelector('.grid[data-section="weekly"]');
    if (!row) return;

    const narrow = window.matchMedia('(max-width: 599px)');
    let instance = null;

    const build = () => {
      if (!narrow.matches || instance) return;
      if (!row.querySelector('.card')) return; // nothing rendered yet

      row.dataset.drag = 'true';

      // wait one frame before measuring: scrollWidth is only right after the switch
      requestAnimationFrame(() => {
        const overflow = Math.max(0, row.scrollWidth - row.clientWidth);
        if (!overflow) {
          row.dataset.drag = 'false';
          return;
        }

        instance = Draggable.create(row, {
          type: 'x',
          bounds: { minX: -overflow, maxX: 0 },
          edgeResistance: 0.85,
          dragClickables: true,
          onPress: () => row.classList.add('is-dragging'),
          onRelease: () => row.classList.remove('is-dragging'),
          onDragEnd() {
            if (Math.abs(this.x) < 1) gsap.to(row, { x: 0, duration: 0.2 });
          },
        })[0];
      });
    };

    const tearDown = () => {
      if (!instance) return;
      instance.kill();
      instance = null;
      row.dataset.drag = 'false';
      row.classList.remove('is-dragging');
      gsap.set(row, { clearProps: 'transform' });
    };

    narrow.addEventListener('change', () => (narrow.matches ? build() : tearDown()));

    // cards arrive late (the four sections draw after the fetch)
    if (row.querySelector('.card')) build();
    else {
      const observer = new MutationObserver(() => {
        if (!row.querySelector('.card')) return;
        observer.disconnect();
        build();
      });
      observer.observe(row, { childList: true });
    }
  }

  function start() {
    if (reduce) {
      console.info('[motion] prefers-reduced-motion, animation disabled');
      return;
    }

    heroTimeline();
    watchCards();
    weeklyArc();
    draggableStrip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
