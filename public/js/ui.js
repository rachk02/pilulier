/* ============================================================================
   ui.js — briques d'interface : toasts, feuilles modales, dialogues,
   ondulation tactile, confettis. Tout est anime et accessible au clavier.
   ========================================================================== */
import { el, $, ico } from './util.js';
import { emptyIllus } from './illus.js';
import { blip, vibrate, unlockAudio } from './sound.js';
import { getS } from './store.js';

const vib = (p) => vibrate(p, getS('vibrate'));

/* ------------------------------------------------------------- TOASTS */
let toastHost;
export function toast(message, opt = {}) {
  if (!toastHost) { toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const { type = '', duration = 3200, action, onAction, icon } = opt;
  const node = el('div', { class: `toast ${type}` });
  const ic = icon || (type === 'ok' ? 'check' : type === 'bad' ? 'warn' : null);
  if (ic) node.insertAdjacentHTML('beforeend', ico(ic));
  node.append(el('span', { class: 'grow', text: message }));
  let timer;
  const close = () => {
    clearTimeout(timer); node.classList.add('is-closing');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  };
  if (action) node.append(el('button', { type: 'button', text: action,
    onclick: () => { close(); onAction?.(); } }));
  toastHost.append(node);
  timer = setTimeout(close, duration);
  return close;
}

/* --------------------------------------------------- FEUILLE MODALE */
let openStack = [];
function lockScroll(on) {
  document.documentElement.style.overflow = on ? 'hidden' : '';
}

/**
 * openSheet({ title, body, footer, onClose })
 * `body` et `footer` : Node, tableau de Node, ou fonction(ctl) -> Node.
 */
export function openSheet({ title = '', body, footer, onClose, dismissible = true } = {}) {
  const scrim = el('div', { class: 'scrim' });
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true',
                            'aria-label': title || 'Fenêtre' });
  const ctl = {
    close(result) {
      if (ctl._closed) return; ctl._closed = true;
      scrim.classList.add('is-closing'); sheet.classList.add('is-closing');
      setTimeout(() => { scrim.remove(); sheet.remove();
        openStack = openStack.filter((x) => x !== ctl);
        if (!openStack.length) lockScroll(false);
        onClose?.(result);
      }, 220);
    },
    sheet,
  };
  const inner = el('div', { class: 'sheet-inner' });
  inner.append(el('div', { class: 'sheet-grab' }));
  if (title) {
    inner.append(el('div', { class: 'sheet-head' },
      el('h2', { text: title }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer',
        html: ico('x'), onclick: () => ctl.close() })));
  }
  const bodyNode = el('div', { class: 'sheet-body' });
  const resolve = (v) => typeof v === 'function' ? v(ctl) : v;
  const add = (host, v) => { const r = resolve(v); if (r) host.append(...(Array.isArray(r) ? r : [r])); };
  add(bodyNode, body);
  inner.append(bodyNode);
  if (footer) { const f = el('div', { class: 'sheet-foot' }); add(f, footer); inner.append(f); }
  sheet.append(inner);

  if (dismissible) scrim.addEventListener('click', () => ctl.close());
  document.body.append(scrim, sheet);
  lockScroll(true); openStack.push(ctl);
  attachRipple(sheet);
  setTimeout(() => sheet.querySelector('input,select,textarea,button:not(.icon-btn)')?.focus?.({ preventScroll: true }), 260);

  /* Glisser vers le bas pour fermer */
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => {
    if (bodyNode.scrollTop > 0) return; y0 = e.touches[0].clientY;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy * 0.7}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    const m = /translateY\(([\d.]+)px\)/.exec(sheet.style.transform || '');
    sheet.style.transform = '';
    if (m && parseFloat(m[1]) > 90 && dismissible) ctl.close();
    y0 = null;
  });
  return ctl;
}

/* ------------------------------------------------------- CONFIRMATION */
export function confirmDialog({ title, message, ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const scrim = el('div', { class: 'scrim' });
    const box = el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' });
    const done = (v) => {
      scrim.classList.add('is-closing');
      setTimeout(() => { scrim.remove(); box.remove();
        openStack.pop(); if (!openStack.length) lockScroll(false); resolve(v); }, 180);
    };
    box.append(
      el('h2', { text: title }),
      message ? el('p', { text: message }) : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-ghost', type: 'button', text: cancel, onclick: () => done(false) }),
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button',
          text: ok, onclick: () => done(true) })));
    scrim.addEventListener('click', () => done(false));
    document.body.append(scrim, box);
    lockScroll(true); openStack.push(true);
    setTimeout(() => box.querySelector('.btn-primary,.btn-danger')?.focus(), 200);
  });
}

/* Fermer la couche du dessus avec Echap / retour Android */
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !openStack.length) return;
  const top = openStack[openStack.length - 1];
  if (typeof top?.close === 'function') top.close();
});
export const hasOpenLayer = () => openStack.length > 0;
export const closeTopLayer = () => { const t = openStack[openStack.length - 1]; t?.close?.(); };

/* ------------------------------------------------- RETOUR AU TOUCHER */
/* Le style de reference est une planche imprimee : pas d'ondulation, pas de
   confettis. Il reste le retour haptique et le deverrouillage audio, qui sont
   fonctionnels et non decoratifs. */
const rippleHosts = new WeakSet();
export function attachRipple(root = document.body) {
  if (rippleHosts.has(root)) return; rippleHosts.add(root);
  root.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.btn, .icon-btn, .tab, .fab, .dose, .cal-day, .setting-row, .chip-select .chip');
    if (!t || t.disabled) return;
    unlockAudio();
    vib('tap');
  }, { passive: true });
}

export function confetti() { /* volontairement vide */ }

/** Petite celebration + son quand la journee est bouclee. */
/** Journee bouclee : un bip court et une vibration, rien de visuel. */
export function celebrate() {
  if (getS('sound')) blip(0.14);
  vib('ok');
}

export { vib as haptic };

/* ------------------------------------------------- CHAMPS REUTILISABLES */
export function field(label, control, hint) {
  return el('div', { class: 'field' },
    label ? el('label', { text: label, for: control.id || null }) : null,
    control,
    hint ? el('small', { class: 'hint', text: hint }) : null);
}
export function input(attrs = {}) { return el('input', { class: 'input', ...attrs }); }
export function textarea(attrs = {}) { return el('textarea', { class: 'textarea', ...attrs }); }
export function select(options, attrs = {}) {
  const s = el('select', { class: 'select', ...attrs });
  for (const o of options) s.append(el('option', { value: o.value ?? o.id, selected: o.selected || null }, o.label));
  return s;
}
/**
 * Un choix qui reste dans l'application.
 *
 * `<select>` ouvre le selecteur du systeme : sur Android, une bulle
 * Material bleue posee au milieu d'une planche kaki. Ce n'est pas qu'une
 * question de gout — c'est le seul endroit ou l'application cesse d'etre
 * elle-meme, et l'utilisateur ne sait plus s'il parle a Pilulier ou au
 * telephone. Ici, une feuille maison : meme papier, memes filets, meme
 * casse, cibles de 48 px.
 */
export function choice(options, { value, onchange, title = 'Choisir', label = '' } = {}) {
  const btn = el('button', { class: 'choice', type: 'button', 'aria-haspopup': 'dialog' });
  let cur = value;

  const courant = () => options.find((o) => String(o.value) === String(cur));
  const peindre = () => {
    const o = courant();
    btn.innerHTML = '';
    btn.append(el('span', { class: 'choice-val', text: o ? o.label : '—' }));
    btn.insertAdjacentHTML('beforeend', ico('chevR', 'chev'));
    btn.setAttribute('aria-label', `${label || title} : ${o ? o.label : '—'}`);
  };

  btn.addEventListener('click', () => openSheet({
    title,
    body: (ctl) => {
      const box = el('div', { class: 'col gap-2' });
      for (const o of options) {
        box.append(el('button', { class: 'choice-opt', type: 'button',
          'aria-pressed': String(String(o.value) === String(cur)),
          onclick: () => {
            cur = o.value; peindre(); vib('tap'); ctl.close();
            onchange?.(o.value);
          } },
          el('div', { class: 'grow' },
            el('b', { text: o.label }),
            o.sub ? el('span', { class: 't-xs t-mute', text: o.sub }) : null),
          markEl()));
      }
      return box;
    },
  }));

  peindre();
  btn.valeur = () => cur;
  return btn;
}
const markEl = () => { const s = el('span', { class: 'choice-mark' }); s.innerHTML = ico('check'); return s; };

export function switchBtn(checked, onchange, label = '') {
  const b = el('button', { type: 'button', class: 'switch', role: 'switch',
    'aria-checked': String(!!checked), 'aria-label': label });
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v)); vib('tap'); onchange(v);
  });
  return b;
}
export function settingRow({ icon, title, sub, right, onclick, chevron }) {
  const n = el(onclick ? 'button' : 'div', { class: 'setting-row', type: onclick ? 'button' : null });
  if (icon) n.insertAdjacentHTML('beforeend', ico(icon, 'chev'));
  n.append(el('div', { class: 'grow' },
    el('b', { text: title }), sub ? el('small', { text: sub }) : null));
  if (right) n.append(right.nodeType ? right : el('span', { class: 't-sm t-mute', text: right }));
  if (chevron) n.insertAdjacentHTML('beforeend', ico('chevR', 'chev'));
  if (onclick) n.addEventListener('click', onclick);
  return n;
}
/** Ecran vide : une petite scene dessinee plutot qu'une icone agrandie. */
export function emptyState(icon, title, text, action) {
  const art = emptyIllus(icon);
  return el('div', { class: 'empty' },
    el('div', { class: art ? 'empty-art' : '', html: art || ico(icon) }),
    el('h3', { text: title }),
    text ? el('p', { class: 't-sm', text }) : null,
    action || null);
}
