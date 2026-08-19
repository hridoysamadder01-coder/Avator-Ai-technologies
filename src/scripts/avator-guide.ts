/**
 * AVATOR Guide controller. The component instance is persisted across
 * ClientRouter navigations (transition:persist), so this module initializes
 * exactly once and the conversation survives internal navigation.
 *
 * Everything rendered here uses textContent — model output is never injected
 * as HTML. Recommendation hrefs are validated server-side against the public
 * route catalog and re-checked here against the site base path.
 */

import { navigate } from 'astro:transitions/client';

type Role = 'user' | 'assistant';

interface Recommendation {
  kind: string;
  title: string;
  reason: string;
  href: string;
  ctaLabel: string;
  confidence: string;
}

interface Brief {
  goal?: string | null;
  industry?: string | null;
  currentWorkflow?: string | null;
  desiredOutcome?: string | null;
  scale?: string | null;
  integrationNeed?: string | null;
  privacyConstraints?: string | null;
  recommendedPath?: string | null;
  unresolvedQuestions?: string[] | null;
}

interface GuideApiResponse {
  message: string;
  state: string;
  recommendation?: Recommendation | null;
  brief?: Brief | null;
  mode?: string;
  error?: string;
}

const STORE_KEY = 'avator-guide:session';
const BRIEF_KEY = 'avator-guide:brief';
const GREETING =
  "Tell me what you're trying to build, fix, automate, or understand. I'll point you to the right AVATOR path.";
const OFFLINE_NOTE =
  "The guide can't run a conversational match right now. These paths cover everything public:";

const QUICK_LINKS: Array<[string, string]> = [
  ['Technology', '/technology/'],
  ['Work', '/work/'],
  ['Developers', '/developers/'],
  ['Enterprise', '/enterprise/'],
  ['Contact', '/contact/'],
];

function initGuide(): void {
  const rootMaybe = document.querySelector<HTMLElement>('[data-guide-root]');
  if (!rootMaybe || rootMaybe.dataset.init) return;
  const root: HTMLElement = rootMaybe;
  root.dataset.init = '1';

  const api = root.dataset.api ?? '';
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

  let sessionId: string = crypto.randomUUID();
  let history: Array<{ role: Role; content: string }> = [];
  let uiState: 'closed' | 'idle' | 'sending' = 'closed';
  let lastBrief: Brief | null = null;

  /* ---------- persistence ---------- */

  function save(): void {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ sessionId, history: history.slice(-24), brief: lastBrief }),
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
        sessionId?: string;
        history?: Array<{ role: Role; content: string }>;
        brief?: Brief | null;
      };
      if (data.sessionId) sessionId = data.sessionId;
      if (Array.isArray(data.history)) history = data.history;
      lastBrief = data.brief ?? null;
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

  function renderQuickLinks(): void {
    const wrap = el('div', 'gm gm-avator');
    const links = el('div', 'gm-links');
    for (const [label, path] of QUICK_LINKS) {
      const a = el('a', undefined, label);
      a.setAttribute('href', `${base}${path}`);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        goTo(`${base}${path}`);
      });
      links.appendChild(a);
    }
    wrap.appendChild(links);
    messagesEl.appendChild(wrap);
    scrollToEnd();
  }

  function renderRecommendation(rec: Recommendation): void {
    if (!rec.href.startsWith(`${base}/`) && rec.href !== `${base}/`) return;
    const card = el('div', 'gm gm-card');
    card.appendChild(el('p', 'gc-k', 'Match'));
    card.appendChild(el('p', 'gc-title', rec.title));
    card.appendChild(el('p', 'gc-k', 'Why'));
    card.appendChild(el('p', 'gc-why', rec.reason));
    const cta = el('button', 'gc-cta');
    cta.appendChild(document.createTextNode(rec.ctaLabel || `Open ${rec.title}`));
    cta.appendChild(el('span', undefined, ' →'));
    cta.addEventListener('click', () => goTo(rec.href));
    card.appendChild(cta);
    messagesEl.appendChild(card);
    scrollToEnd();
  }

  function renderBriefOffer(): void {
    if (!lastBrief?.goal) return;
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

  function briefText(): string {
    const b = lastBrief ?? {};
    const lines: string[] = ['AVATOR GUIDE — CONVERSATION BRIEF', ''];
    const add = (label: string, v?: string | null) => {
      if (v) lines.push(`${label}: ${v}`);
    };
    add('Goal', b.goal);
    add('Industry', b.industry);
    add('Current workflow', b.currentWorkflow);
    add('Desired outcome', b.desiredOutcome);
    add('Scale', b.scale);
    add('Integration need', b.integrationNeed);
    add('Privacy constraints', b.privacyConstraints);
    add('Recommended AVATOR path', b.recommendedPath);
    if (b.unresolvedQuestions?.length) {
      lines.push('Open questions: ' + b.unresolvedQuestions.join(' · '));
    }
    return lines.join('\n');
  }

  function renderBriefCard(): void {
    const card = el('div', 'gm gm-card');
    card.appendChild(el('p', 'gc-k', 'Brief'));
    card.appendChild(el('p', 'gm-body', briefText()));
    const actions = el('div', 'gm-brief-actions');
    const toContact = el('button', undefined, 'Take it to Contact →');
    toContact.addEventListener('click', () => {
      try {
        sessionStorage.setItem(BRIEF_KEY, briefText());
      } catch {
        /* ignore */
      }
      goTo(`${base}/contact/`);
    });
    const copy = el('button', undefined, 'Copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(briefText());
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
      if (!api) {
        setStatus('offline', 'Guide offline');
        renderMessage('note', OFFLINE_NOTE);
        renderQuickLinks();
        input.disabled = true;
        sendBtn.disabled = true;
        micBtn.hidden = true;
        input.placeholder = 'Conversational matching is offline for now.';
        chipsEl.hidden = true;
      }
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
    if (immediate || reduced.matches) {
      panel.hidden = true;
    } else {
      // transitions on persisted elements can be cancelled by the router's
      // DOM swap — a timeout is the reliable end-of-fade signal
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

  function setStatus(state: 'live' | 'offline' | 'dev', text: string): void {
    statusEl.dataset.state = state === 'dev' ? 'live' : state;
    statusEl.textContent = text;
  }

  /* ---------- conversation ---------- */

  async function send(text: string): Promise<void> {
    const content = text.trim().slice(0, 2000);
    if (!content || uiState === 'sending' || !api) return;

    uiState = 'sending';
    chipsEl.hidden = true;
    history.push({ role: 'user', content });
    renderMessage('user', content);
    input.value = '';
    autoSize();
    save();

    const thinking = el('div', 'gm gm-avator');
    thinking.appendChild(el('p', 'gm-thinking', 'AVATOR · routing…'));
    messagesEl.appendChild(thinking);
    scrollToEnd();

    try {
      const res = await fetch(`${api}/v1/guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          sessionId,
          messages: history.slice(-24),
          page: { path: location.pathname, title: document.title.slice(0, 200) },
        }),
      });
      thinking.remove();

      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as GuideApiResponse;

      history.push({ role: 'assistant', content: data.message });
      renderMessage('assistant', data.message);
      if (data.recommendation) renderRecommendation(data.recommendation);
      if (data.brief) {
        lastBrief = data.brief;
        renderBriefOffer();
      }
      setStatus(
        data.mode === 'mock' ? 'dev' : 'live',
        data.mode === 'mock' ? 'Dev mode — deterministic replies' : 'Solution routing',
      );
      save();
    } catch {
      thinking.remove();
      renderMessage('note', "The guide couldn't respond just now. The paths below always work — or try again.");
      renderQuickLinks();
      setStatus('offline', 'Connection issue');
    } finally {
      uiState = (uiState as 'closed' | 'idle' | 'sending') === 'closed' ? 'closed' : 'idle';
    }
  }

  /* ---------- voice input ---------- */

  let recorder: MediaRecorder | null = null;
  let recChunks: BlobPart[] = [];
  let recTimer = 0;

  const voiceSupported =
    !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && !!api;
  if (voiceSupported) micBtn.hidden = false;

  function voiceNote(msg: string): void {
    renderMessage('note', msg);
  }

  async function startRecording(): Promise<void> {
    stopSpeech();
    micBtn.dataset.state = 'requesting';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) recChunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        micBtn.dataset.state = 'processing';
        micBtn.setAttribute('aria-label', 'Processing voice input');
        await transcribe(new Blob(recChunks, { type: recorder?.mimeType || 'audio/webm' }));
        micBtn.dataset.state = '';
        micBtn.setAttribute('aria-label', 'Start voice input');
        recorder = null;
      };
      recorder.start();
      micBtn.dataset.state = 'listening';
      micBtn.setAttribute('aria-label', 'Stop voice input');
      // hard cap: short voice messages only
      recTimer = window.setTimeout(() => stopRecording(), 25_000);
    } catch {
      micBtn.dataset.state = '';
      voiceNote("Voice isn't available right now. You can keep typing here.");
    }
  }

  function stopRecording(): void {
    clearTimeout(recTimer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  async function transcribe(blob: Blob): Promise<void> {
    if (blob.size < 1200) {
      voiceNote("That recording was too short — tap the mic and speak, then tap again to stop.");
      return;
    }
    if (blob.size > 1_400_000) {
      voiceNote('That recording was too long — keep voice messages under ~25 seconds.');
      return;
    }
    try {
      const res = await fetch(`${api}/v1/guide/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' },
        signal: AbortSignal.timeout(30_000),
        body: blob,
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { text?: string };
      if (!data.text) throw new Error('empty');
      // transcript is visible in the composer before it is sent
      input.value = data.text;
      autoSize();
      input.focus();
    } catch {
      voiceNote("Couldn't transcribe that. You can keep typing here.");
    }
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
      void send(input.value);
    }
  });
  sendBtn.addEventListener('click', () => void send(input.value));
  micBtn.addEventListener('click', () => {
    if (micBtn.dataset.state === 'listening') stopRecording();
    else if (!micBtn.dataset.state) void startRecording();
  });

  chipsEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-chip]');
    if (chip) void send(chip.textContent ?? '');
  });

  /* ---------- shell events ---------- */

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', () => close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && uiState !== 'closed') close();
  });

  clearBtn.addEventListener('click', () => {
    stopSpeech();
    history = [];
    lastBrief = null;
    sessionId = crypto.randomUUID();
    messagesEl.textContent = '';
    try {
      sessionStorage.removeItem(STORE_KEY);
      sessionStorage.removeItem(BRIEF_KEY);
    } catch {
      /* ignore */
    }
    chipsEl.hidden = !api ? true : false;
    renderMessage('note', GREETING);
    if (!api) {
      renderMessage('note', OFFLINE_NOTE);
      renderQuickLinks();
    }
  });

  if (api) setStatus('live', 'Solution routing');
  else setStatus('offline', 'Guide offline');
  restore();
}

/* ---------- contact page handoff ---------- */

function initContactHandoff(): void {
  const slot = document.querySelector<HTMLElement>('[data-guide-brief-slot]');
  if (!slot || slot.dataset.done) return;
  let brief: string | null = null;
  try {
    brief = sessionStorage.getItem('avator-guide:brief');
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
  const pre = make('pre', 'guide-brief-pre', brief);
  box.appendChild(pre);

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
      sessionStorage.removeItem('avator-guide:brief');
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
