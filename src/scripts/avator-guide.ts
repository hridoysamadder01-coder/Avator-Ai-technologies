/**
 * AVATOR Guide controller — browser-local solution routing.
 *
 * No backend, no API key, no network calls for conversation: messages run
 * through the deterministic engine in src/lib/avator-guide/ against a
 * knowledge pack serialized into the page at build time from the site's own
 * public content. Voice input uses the browser's Web Speech Recognition where
 * available; Listen uses browser speech synthesis. Everything rendered here
 * uses textContent, and every route is re-checked against the site base path.
 *
 * The component instance is persisted across ClientRouter navigations
 * (transition:persist), so this module initializes exactly once.
 */

import { navigate } from 'astro:transitions/client';
import { buildBrief, respond } from '../lib/avator-guide/engine.ts';
import type {
  GuideConversationState,
  GuideKnowledge,
  GuideRecommendation,
  GuideResult,
} from '../lib/avator-guide/types.ts';

type Role = 'user' | 'assistant';

/* Minimal Web Speech Recognition typings (not yet in lib.dom everywhere). */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

const STORE_KEY = 'avator-guide:session';
const BRIEF_KEY = 'avator-guide:brief';
const GREETING =
  "Tell me what you're trying to build, fix, automate, or understand. I'll point you to the right AVATOR path.";

function initGuide(): void {
  const rootMaybe = document.querySelector<HTMLElement>('[data-guide-root]');
  if (!rootMaybe || rootMaybe.dataset.init) return;
  const root: HTMLElement = rootMaybe;
  root.dataset.init = '1';

  const base = (root.dataset.base ?? '/').replace(/\/$/, '');
  const launcher = root.querySelector<HTMLButtonElement>('[data-guide-launcher]')!;
  const panel = root.querySelector<HTMLElement>('[data-guide-panel]')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-guide-close]')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-guide-clear]')!;
  const scroller = root.querySelector<HTMLElement>('[data-guide-scroll]')!;
  const messagesEl = root.querySelector<HTMLElement>('[data-guide-messages]')!;
  const chipsEl = root.querySelector<HTMLElement>('[data-guide-chips]')!;
  const input = root.querySelector<HTMLTextAreaElement>('[data-guide-input]')!;
  const sendBtn = root.querySelector<HTMLButtonElement>('[data-guide-send]')!;
  const micBtn = root.querySelector<HTMLButtonElement>('[data-guide-mic]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-guide-status]')!;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* knowledge pack — serialized into the page at build time */
  let knowledge: GuideKnowledge | null = null;
  try {
    const packEl = root.querySelector('[data-guide-knowledge]');
    knowledge = packEl?.textContent ? (JSON.parse(packEl.textContent) as GuideKnowledge) : null;
  } catch {
    knowledge = null;
  }

  let history: Array<{ role: Role; content: string }> = [];
  let convState: GuideConversationState = {};
  let uiState: 'closed' | 'idle' | 'routing' = 'closed';

  /* ---------- persistence ---------- */

  function save(): void {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ history: history.slice(-30), convState }),
      );
    } catch {
      /* storage unavailable — in-memory only */
    }
  }

  function restore(): void {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        history?: Array<{ role: Role; content: string }>;
        convState?: GuideConversationState;
      };
      if (Array.isArray(data.history)) history = data.history;
      if (data.convState) convState = data.convState;
      history.forEach((m) => renderMessage(m.role, m.content));
      if (history.length) chipsEl.hidden = true;
    } catch {
      /* corrupted state — start fresh */
    }
  }

  /* ---------- rendering (textContent only) ---------- */

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scrollToEnd(): void {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  function renderMessage(role: Role | 'note', text: string): HTMLElement {
    const wrap = el('div', `gm ${role === 'user' ? 'gm-you' : 'gm-avator'}`);
    wrap.appendChild(el('p', 'gm-label', role === 'user' ? 'You' : 'AVATOR'));
    wrap.appendChild(el('p', 'gm-body', text));
    if (role !== 'user' && 'speechSynthesis' in window) {
      const listen = el('button', 'gm-listen', '🔊 Listen');
      listen.setAttribute('aria-label', 'Listen to this answer');
      listen.addEventListener('click', () => toggleSpeech(text, listen));
      wrap.appendChild(listen);
    }
    messagesEl.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function renderQuickReplies(replies: string[]): void {
    const wrap = el('div', 'gm gm-avator gm-brief-actions');
    wrap.setAttribute('data-quick-replies', '1');
    for (const reply of replies) {
      const b = el('button', undefined, reply);
      b.addEventListener('click', () => {
        wrap.remove();
        send(reply);
      });
      wrap.appendChild(b);
    }
    messagesEl.appendChild(wrap);
    scrollToEnd();
  }

  function renderRecommendation(recc: GuideRecommendation): void {
    if (!recc.href.startsWith(`${base}/`) && recc.href !== `${base}/`) return;
    const card = el('div', 'gm gm-card');
    card.appendChild(el('p', 'gc-k', 'Match'));
    card.appendChild(el('p', 'gc-title', recc.title));
    card.appendChild(el('p', 'gc-k', 'Why'));
    card.appendChild(el('p', 'gc-why', recc.reason));
    const cta = el('button', 'gc-cta');
    cta.appendChild(document.createTextNode(recc.ctaLabel || `Open ${recc.title}`));
    cta.appendChild(el('span', undefined, ' →'));
    cta.addEventListener('click', () => goTo(recc.href));
    card.appendChild(cta);
    messagesEl.appendChild(card);
    scrollToEnd();
  }

  function renderBriefOffer(): void {
    if (messagesEl.querySelector('[data-brief-offer]')) return;
    const wrap = el('div', 'gm gm-avator gm-brief-actions');
    wrap.setAttribute('data-brief-offer', '1');
    const prep = el('button', undefined, 'Prepare a brief');
    prep.addEventListener('click', () => {
      wrap.remove();
      renderBriefCard();
    });
    wrap.appendChild(prep);
    messagesEl.appendChild(wrap);
    scrollToEnd();
  }

  function renderBriefCard(): void {
    const brief = buildBrief(convState);
    const card = el('div', 'gm gm-card');
    card.appendChild(el('p', 'gc-k', 'Brief'));
    card.appendChild(el('p', 'gm-body', brief));
    const actions = el('div', 'gm-brief-actions');
    const toContact = el('button', undefined, 'Take it to Contact →');
    toContact.addEventListener('click', () => {
      try {
        sessionStorage.setItem(BRIEF_KEY, brief);
      } catch {
        /* ignore */
      }
      goTo(`${base}/contact/`);
    });
    const copy = el('button', undefined, 'Copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(brief);
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1500);
      } catch {
        copy.textContent = 'Copy failed';
      }
    });
    actions.appendChild(toContact);
    actions.appendChild(copy);
    card.appendChild(actions);
    messagesEl.appendChild(card);
    scrollToEnd();
  }

  /* ---------- open / close ---------- */

  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

  function setBackgroundInert(on: boolean): void {
    document.querySelectorAll('main, footer, header.nav').forEach((n) => {
      if (root.contains(n)) return; // the guide's own composer is a <footer>
      (n as HTMLElement).inert = on;
    });
  }

  function open(): void {
    if (uiState !== 'closed') return;
    uiState = 'idle';
    root.setAttribute('data-open', '1');
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    if (isMobile()) {
      document.body.style.overflow = 'hidden';
      setBackgroundInert(true);
    }
    launcher.setAttribute('aria-expanded', 'true');
    if (!messagesEl.childElementCount) {
      renderMessage('note', GREETING);
    }
    input.focus({ preventScroll: true });
  }

  function close(returnFocus = true, immediate = false): void {
    if (uiState === 'closed') return;
    uiState = 'closed';
    root.removeAttribute('data-open');
    panel.classList.remove('open');
    document.body.style.overflow = '';
    setBackgroundInert(false);
    launcher.setAttribute('aria-expanded', 'false');
    stopSpeech();
    stopRecognition();
    if (immediate || reduced.matches) {
      panel.hidden = true;
    } else {
      window.setTimeout(() => {
        if (uiState === 'closed') panel.hidden = true;
      }, 320);
    }
    if (returnFocus) launcher.focus();
  }

  function goTo(path: string): void {
    close(false, true);
    navigate(path);
  }

  /* ---------- conversation (fully local) ---------- */

  function send(text: string): void {
    const content = text.trim().slice(0, 2000);
    if (!content || uiState === 'routing' || !knowledge) return;

    uiState = 'routing';
    chipsEl.hidden = true;
    messagesEl.querySelector('[data-quick-replies]')?.remove();
    history.push({ role: 'user', content });
    renderMessage('user', content);
    input.value = '';
    autoSize();

    const tick = el('div', 'gm gm-avator');
    tick.appendChild(el('p', 'gm-thinking', 'AVATOR · routing'));
    messagesEl.appendChild(tick);
    scrollToEnd();

    // local responses are instant — a short deliberate beat keeps the
    // exchange legible without faking model latency
    const beat = reduced.matches ? 0 : 240;
    window.setTimeout(() => {
      let result: GuideResult;
      try {
        const out = respond({
          message: content,
          state: convState,
          knowledge: knowledge!,
          pagePath: location.pathname,
        });
        result = out.result;
        convState = out.state;
      } catch {
        result = {
          message:
            'Something went wrong on this device. These paths always work: Technology, Work, Developers, Enterprise, Contact.',
          state: 'discovering',
        };
      }
      tick.remove();
      history.push({ role: 'assistant', content: result.message });
      renderMessage('assistant', result.message);
      if (result.recommendation) renderRecommendation(result.recommendation);
      if (result.quickReplies?.length) renderQuickReplies(result.quickReplies);
      if (result.briefReady) renderBriefOffer();
      save();
      uiState = uiState === 'closed' ? 'closed' : 'idle';
    }, beat);
  }

  /* ---------- voice input — browser Web Speech Recognition, $0 ---------- */

  const SR: (new () => SpeechRecognitionLike) | undefined =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;

  let recognition: SpeechRecognitionLike | null = null;

  if (SR) micBtn.hidden = false;

  function voiceLang(): string {
    if (convState.style === 'bn' || convState.style === 'banglish') return 'bn-BD';
    const last = history.filter((m) => m.role === 'user').pop();
    if (last && /[ঀ-৿]/.test(last.content)) return 'bn-BD';
    return navigator.language?.startsWith('bn') ? 'bn-BD' : 'en-US';
  }

  function startRecognition(): void {
    if (!SR || recognition) return;
    stopSpeech();
    try {
      recognition = new SR();
      recognition.lang = voiceLang();
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript ?? '';
        if (transcript) {
          // transcript lands in the composer so the visitor can review/edit
          input.value = transcript;
          autoSize();
          input.focus();
        }
      };
      recognition.onerror = (e) => {
        stopRecognition();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          renderMessage('note', "Voice isn't available right now. You can keep typing here.");
        }
      };
      recognition.onend = () => stopRecognition();
      recognition.start();
      micBtn.dataset.state = 'listening';
      micBtn.setAttribute('aria-label', 'Stop voice input');
    } catch {
      stopRecognition();
      renderMessage('note', "Voice isn't available right now. You can keep typing here.");
    }
  }

  function stopRecognition(): void {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
      recognition = null;
    }
    micBtn.dataset.state = '';
    micBtn.setAttribute('aria-label', 'Start voice input');
  }

  /* ---------- listen (speech synthesis — user-initiated only) ---------- */

  let speakingBtn: HTMLElement | null = null;

  function stopSpeech(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (speakingBtn) {
      speakingBtn.textContent = '🔊 Listen';
      speakingBtn = null;
    }
  }

  function toggleSpeech(text: string, btn: HTMLElement): void {
    if (speakingBtn === btn) {
      stopSpeech();
      return;
    }
    stopSpeech();
    const utter = new SpeechSynthesisUtterance(text);
    const bengali = /[ঀ-৿]/.test(text);
    utter.lang = bengali ? 'bn-BD' : 'en-US';
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith(bengali ? 'bn' : 'en'));
    if (voice) utter.voice = voice;
    utter.onend = () => stopSpeech();
    utter.onerror = () => stopSpeech();
    speakingBtn = btn;
    btn.textContent = '⏹ Stop';
    window.speechSynthesis.speak(utter);
  }

  /* ---------- composer ---------- */

  function autoSize(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  input.addEventListener('input', autoSize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
  sendBtn.addEventListener('click', () => send(input.value));
  micBtn.addEventListener('click', () => {
    if (micBtn.dataset.state === 'listening') stopRecognition();
    else startRecognition();
  });

  chipsEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-chip]');
    if (chip) send(chip.textContent ?? '');
  });

  /* ---------- shell events ---------- */

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', () => close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && uiState !== 'closed') close();
  });

  clearBtn.addEventListener('click', () => {
    stopSpeech();
    stopRecognition();
    history = [];
    convState = {};
    messagesEl.textContent = '';
    try {
      sessionStorage.removeItem(STORE_KEY);
      sessionStorage.removeItem(BRIEF_KEY);
    } catch {
      /* ignore */
    }
    chipsEl.hidden = false;
    renderMessage('note', GREETING);
  });

  statusEl.dataset.state = 'live';
  statusEl.textContent = 'Local routing';
  restore();
}

/* ---------- contact page handoff ---------- */

function initContactHandoff(): void {
  const slot = document.querySelector<HTMLElement>('[data-guide-brief-slot]');
  if (!slot || slot.dataset.done) return;
  let brief: string | null = null;
  try {
    brief = sessionStorage.getItem(BRIEF_KEY);
  } catch {
    return;
  }
  if (!brief) return;
  slot.dataset.done = '1';

  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const box = make('div', 'guide-brief-box');
  box.appendChild(make('p', 'mono guide-brief-label', 'Prepared by AVATOR Guide'));
  box.appendChild(make('pre', 'guide-brief-pre', brief));

  const actions = make('div', 'guide-brief-actions');
  const mail = make('a', 'btn btn--solid') as HTMLAnchorElement;
  mail.textContent = 'Open email with this brief →';
  const emailLink = document.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
  const address = emailLink ? emailLink.href.replace(/^mailto:/, '').split('?')[0] : '';
  mail.href = `mailto:${address}?subject=${encodeURIComponent('Brief — prepared with AVATOR Guide')}&body=${encodeURIComponent(brief)}`;

  const copy = make('button', 'btn');
  copy.textContent = 'Copy';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(brief!);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
  });

  const remove = make('button', 'btn');
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(BRIEF_KEY);
    } catch {
      /* ignore */
    }
    box.remove();
  });

  actions.appendChild(mail);
  actions.appendChild(copy);
  actions.appendChild(remove);
  box.appendChild(actions);
  slot.appendChild(box);
}

document.addEventListener('astro:page-load', () => {
  initGuide();
  initContactHandoff();
});
