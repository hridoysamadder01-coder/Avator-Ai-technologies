/* AVATOR — shared interaction layer.
   Lifecycle-aware: re-initializes on every ClientRouter navigation
   (astro:page-load) and tears page-scoped listeners down via AbortController. */

let pageAbort = null;

const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');

/* -- text scramble: decodes [data-scramble] elements left-to-right.
   Letters only — digits and symbols read as Matrix cosplay. -- */
const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz';

function scramble(el) {
  if (reducedMq.matches || el.dataset.scrambled) return;
  el.dataset.scrambled = '1';
  const original = el.textContent;
  // assistive tech reads the finished label, never the decode frames
  if (!el.hasAttribute('aria-label')) {
    el.setAttribute('aria-label', original.replace(/\s+/g, ' ').trim());
  }
  const len = original.length;
  const duration = 700;
  const start = performance.now();

  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const solid = Math.floor(p * len);
    let out = original.slice(0, solid);
    for (let i = solid; i < len; i++) {
      const ch = original[i];
      out += /\s/.test(ch) ? ch : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = original;
  };
  requestAnimationFrame(tick);
}

function init() {
  pageAbort?.abort();
  pageAbort = new AbortController();
  const { signal } = pageAbort;
  const reduced = reducedMq.matches;

  document.body.style.overflow = '';

  /* nav scroll state */
  const nav = document.querySelector('[data-nav]');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true, signal });
  }

  /* mobile menu */
  const menuBtn = document.querySelector('[data-menu-btn]');
  const menu = document.querySelector('[data-menu]');
  if (menuBtn && menu) {
    const onFadeOut = (e) => {
      if (e && (e.target !== menu || e.propertyName !== 'opacity')) return;
      menu.hidden = true;
      menu.removeEventListener('transitionend', onFadeOut);
    };

    const setOpen = (open) => {
      menuBtn.setAttribute('aria-expanded', String(open));
      document.querySelectorAll('main, footer').forEach((el) => {
        el.inert = open;
      });
      if (open) {
        menu.removeEventListener('transitionend', onFadeOut);
        menu.hidden = false;
        requestAnimationFrame(() => menu.classList.add('open'));
        document.body.style.overflow = 'hidden';
        menu.querySelector('a')?.focus({ preventScroll: true });
      } else {
        menu.classList.remove('open');
        document.body.style.overflow = '';
        if (reduced) onFadeOut();
        else menu.addEventListener('transitionend', onFadeOut);
      }
    };

    menuBtn.addEventListener(
      'click',
      () => setOpen(menuBtn.getAttribute('aria-expanded') !== 'true'),
      { signal },
    );
    menu.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('a')) setOpen(false);
      },
      { signal },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
          setOpen(false);
          menuBtn.focus();
        }
      },
      { signal },
    );
  }

  /* kinetic word split */
  if (!reduced) {
    document.querySelectorAll('.kin').forEach((el) => {
      if (el.dataset.split) return;
      el.dataset.split = '1';
      const walk = (node) => {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            const frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach((part) => {
              if (!part.trim()) {
                frag.appendChild(document.createTextNode(part));
                return;
              }
              const w = document.createElement('span');
              w.className = 'w';
              const inner = document.createElement('span');
              inner.textContent = part;
              w.appendChild(inner);
              frag.appendChild(w);
            });
            child.replaceWith(frag);
          } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('w')) {
            walk(child);
          }
        });
      };
      walk(el);
      el.querySelectorAll('.w > span').forEach((s, i) => {
        s.style.setProperty('--kd', `${Math.min(i * 0.045, 0.9)}s`);
      });
    });
  }

  /* reveals + scramble triggers */
  const targets = document.querySelectorAll('.rv, .kin, .rule-draw');
  const scrambles = document.querySelectorAll('[data-scramble]');
  if (reduced) {
    targets.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    targets.forEach((el) => io.observe(el));

    const ioScr = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            scramble(entry.target);
            ioScr.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    scrambles.forEach((el) => ioScr.observe(el));
    signal.addEventListener('abort', () => {
      io.disconnect();
      ioScr.disconnect();
    });
  }

  /* proximity border-glow grids — JS only writes coordinates */
  const glowGrids = document.querySelectorAll('[data-glow-grid]');
  if (
    glowGrids.length &&
    !reduced &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  ) {
    glowGrids.forEach((grid) => {
      grid.addEventListener(
        'pointermove',
        (e) => {
          for (const cell of grid.children) {
            const r = cell.getBoundingClientRect();
            cell.style.setProperty('--mx', `${e.clientX - r.left}px`);
            cell.style.setProperty('--my', `${e.clientY - r.top}px`);
          }
        },
        { passive: true, signal },
      );
    });
  }

  /* live UTC clock */
  const clocks = document.querySelectorAll('[data-utc]');
  if (clocks.length) {
    const paint = () => {
      const now = new Date();
      const t = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
        .map((n) => String(n).padStart(2, '0'))
        .join(':');
      clocks.forEach((c) => {
        c.textContent = t;
      });
    };
    paint();
    const id = setInterval(paint, 1000);
    signal.addEventListener('abort', () => clearInterval(id));
  }
}

document.addEventListener('astro:page-load', init);
