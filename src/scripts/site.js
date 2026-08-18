/* AVATOR — shared interaction layer: nav state, menu, reveals */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* nav scroll state */
const nav = document.querySelector('[data-nav]');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* mobile menu */
const menuBtn = document.querySelector('[data-menu-btn]');
const menu = document.querySelector('[data-menu]');
if (menuBtn && menu) {
  const setOpen = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('open'));
      document.body.style.overflow = 'hidden';
    } else {
      menu.classList.remove('open');
      document.body.style.overflow = '';
      const done = () => {
        menu.hidden = true;
        menu.removeEventListener('transitionend', done);
      };
      if (reduced) done();
      else menu.addEventListener('transitionend', done);
    }
  };
  menuBtn.addEventListener('click', () => {
    setOpen(menuBtn.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      menuBtn.focus();
    }
  });
}

/* kinetic word split: wrap words of .kin elements */
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

/* reveals */
const targets = document.querySelectorAll('.rv, .kin, .rule-draw');
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
}
