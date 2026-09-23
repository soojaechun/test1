(() => {
  const root = document.querySelector('.axchat');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const panel = $('.axchat-panel'), launcher = $('.axchat-launcher');
  const body = $('.axchat-body'), messages = $('.axchat-messages');
  const welcome = $('.axchat-welcome'), suggestions = $('.axchat-suggestions');
  const form = $('.axchat-form'), input = $('textarea'), send = form.querySelector('button');
  const latest = $('.axchat-latest'), badge = $('.axchat-badge'), status = $('.axchat-status');
  const handle = $('.axchat-resize'), provider = window.AXPORTChatDemo;
  const i18n = window.AXPORTChatI18n, languageSelect = $('.axchat-language select');
  let locale = i18n.normalize(document.documentElement.lang || navigator.language);
  let hasOpened = false, statusKey = '';
  const t = key => i18n.catalog[locale].ui[key];
  function localized(node, key) {
    node.dataset.chatText = key; node.textContent = t(key); return node;
  }
  function announce(key) { statusKey = key; status.textContent = key ? t(key) : ''; }
  function setLanguage(value) {
    locale = i18n.normalize(value); root.lang = locale; languageSelect.value = locale;
    root.querySelectorAll('[data-chat-text]').forEach(node => {
      node.textContent = t(node.dataset.chatText);
      // Pending/error controls follow the UI language; completed messages keep theirs.
      node.closest('.axchat-answer')?.setAttribute('lang', locale);
    });
    [[$('.axchat-minimize'),'minimize'],[$('.axchat-close'),'close'],[handle,'resize'],[body,'body'],[suggestions,'suggestions'],[input,'input'],[send,'sendLabel'],[languageSelect,'language']].forEach(([node,key]) => node.setAttribute('aria-label',t(key)));
    handle.title = t('resizeHint'); input.placeholder = t('placeholder');
    send.textContent = t('send'); latest.querySelector('button').textContent = t('latest'); badge.textContent = t('badge');
    launcher.setAttribute('aria-label', t(opened ? 'minimize' : hasOpened ? 'restore' : 'open'));
    announce(statusKey);
    suggestions.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'axchat-question-heading';
    const sparkle = document.createElement('i'); sparkle.className = 'ph ph-sparkle'; sparkle.setAttribute('aria-hidden', 'true');
    const headingText = document.createElement('span'); headingText.textContent = t('suggestions');
    heading.append(sparkle, headingText); suggestions.append(heading);
    const icons = root.dataset.page === 'workspace' ? ['chart-pie-slice', 'sliders-horizontal', 'bookmarks-simple'] : ['info', 'compass', 'lightbulb'];
    i18n.catalog[locale].questions[root.dataset.page].forEach((question, index) => {
      const button = document.createElement('button'); button.type = 'button';
      const icon = document.createElement('i'); icon.className = `ph ph-${icons[index]} axchat-question-icon`; icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = question; button.append(icon, label);
      button.addEventListener('click', () => submit(question)); suggestions.append(button);
    });
    layout();
  }
  const safe = document.createElement('span'); safe.className = 'axchat-safe'; root.append(safe);
  let generation = 0, pending = false, composing = false, opened = false;
  let desired = { width:400, height:600 }, savedScroll = 0, following = true, unread = false, drag = null;
  const mobile = () => matchMedia('(max-width:767px), (pointer:coarse)').matches;
  const nearBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight <= 40;
  function sync() {
    send.disabled = pending || !input.value.trim();
    root.querySelectorAll('.axchat-retry').forEach(b => { b.disabled = pending; });
    latest.hidden = !unread;
    badge.hidden = !unread || opened;
  }
  function bottom() {
    body.scrollTop = welcome.hidden ? body.scrollHeight : 0; savedScroll = body.scrollTop;
    following = true; unread = false; sync();
  }
  function layout() {
    const vv = window.visualViewport;
    const width = vv ? vv.width : document.documentElement.clientWidth;
    const height = vv ? vv.height : window.innerHeight;
    const left = vv ? vv.offsetLeft : 0, top = vv ? vv.offsetTop : 0;
    const s = getComputedStyle(safe), margin = mobile() ? 16 : 24, size = parseFloat(getComputedStyle(root).getPropertyValue('--axchat-launch-size'));
    const edgeRight = margin + parseFloat(s.paddingRight), edgeBottom = margin + parseFloat(s.paddingBottom);
    const edgeLeft = margin + parseFloat(s.paddingLeft), edgeTop = margin + parseFloat(s.paddingTop);
    const availableW = Math.max(1, width - edgeRight - edgeLeft);
    const availableH = Math.max(1, height - edgeBottom - size - 12 - edgeTop);
    const w = Math.min(mobile() ? 400 : desired.width, availableW);
    const h = Math.min(mobile() ? 600 : desired.height, availableH);
    panel.classList.toggle('axchat-compact', h < 480);
    launcher.style.left = `${left + width - edgeRight - size}px`;
    launcher.style.top = `${top + height - edgeBottom - size}px`;
    Object.assign(panel.style, {left:`${left + width - edgeRight - w}px`, top:`${top + height - edgeBottom - size - 12 - h}px`, width:`${w}px`, height:`${h}px`});
    if (opened && following) bottom();
    return {availableW, availableH};
  }
  function open() {
    opened = true; hasOpened = true; panel.hidden = false; layout();
    body.scrollTop = following ? (welcome.hidden ? body.scrollHeight : 0) : savedScroll;
    if (following) unread = false;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', t('minimize')); sync();
    // Do not summon a mobile keyboard merely by opening the panel.
    $('.axchat-minimize').focus({preventScroll:true});
  }
  function minimize() {
    savedScroll = body.scrollTop; opened = false; panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', t('restore')); sync();
    launcher.focus({preventScroll:true});
  }
  function close() {
    generation++; pending = false; input.value = ''; composing = false;
    messages.replaceChildren(); welcome.hidden = false; suggestions.hidden = false;
    desired = {width:400, height:600}; following = true; unread = false; announce('');
    minimize(); savedScroll = 0; layout();
    hasOpened = false; launcher.setAttribute('aria-label', t('open'));
  }
  function bubble(kind, text) {
    const node = document.createElement('div'); node.className = `axchat-message axchat-${kind}`;
    node.lang = locale;
    if (text) node.textContent = text;
    messages.append(node); return node;
  }
  async function request(question, answer) {
    if (pending) return;
    pending = true; sync();
    const token = generation;
    const responseLocale = answer.dataset.responseLocale || locale;
    answer.dataset.responseLocale = responseLocale;
    answer.lang = locale;
    answer.replaceChildren();
    const loading = document.createElement('div'); loading.className = 'axchat-loading';
    const spinner = document.createElement('span'); spinner.className = 'axchat-spinner'; spinner.setAttribute('aria-hidden','true');
    loading.append(spinner, localized(document.createElement('span'), 'loading')); answer.append(loading);
    announce('loading');
    if (opened && following) bottom();
    let failed = false;
    try {
      const text = await provider.respond(question, responseLocale);
      if (token !== generation) return;
      answer.replaceChildren();
      answer.lang = responseLocale;
      const label = document.createElement('small'); label.textContent = i18n.catalog[responseLocale].ui.replyLabel;
      const content = document.createElement('div'); content.textContent = text; answer.append(label, content);
    } catch {
      if (token !== generation) return;
      failed = true; answer.replaceChildren(localized(document.createElement('span'), 'error'));
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'axchat-retry'; localized(retry, 'retry');
      retry.addEventListener('click', () => { if (!pending) request(question, answer); }); answer.append(retry);
    }
    if (token !== generation) return;
    pending = false; announce(failed ? 'failed' : 'arrived');
    if (opened && following) bottom();
    else { unread = true; sync(); }
    sync();
  }
  function submit(text) {
    const question = text.trim();
    if (!question || pending) return;
    welcome.hidden = true; suggestions.hidden = true;
    bubble('user', question); input.value = '';
    const answer = bubble('answer');
    // request sets pending synchronously, before the first await.
    request(question, answer); bottom();
  }
  launcher.addEventListener('click', () => opened ? minimize() : open());
  $('.axchat-minimize').addEventListener('click', minimize);
  $('.axchat-close').addEventListener('click', close);
  form.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
  input.addEventListener('input', sync);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !mobile() && !e.isComposing && !composing && e.keyCode !== 229) {
      // While waiting, keep Enter available for drafting multiline text.
      if (pending) return;
      e.preventDefault(); submit(input.value);
    }
  });
  root.addEventListener('keydown', e => e.stopPropagation());
  root.addEventListener('pointerdown', e => e.stopPropagation());
  body.addEventListener('scroll', () => {
    if (!opened) return;
    savedScroll = body.scrollTop; following = nearBottom();
    if (following) { unread = false; sync(); }
  });
  latest.querySelector('button').addEventListener('click', bottom);
  function resize(w, h) {
    const bounds = layout();
    desired = {width:Math.min(bounds.availableW, Math.max(360,w)), height:Math.min(bounds.availableH, Math.max(480,h))}; layout();
  }
  handle.addEventListener('pointerdown', e => {
    if (mobile() || e.button !== 0) return;
    e.preventDefault(); const r = panel.getBoundingClientRect();
    drag = {id:e.pointerId, x:e.clientX, y:e.clientY, w:r.width, h:r.height};
    handle.setPointerCapture(e.pointerId); root.classList.add('axchat-resizing');
  });
  handle.addEventListener('pointermove', e => {
    if (drag && e.pointerId === drag.id) resize(drag.w + drag.x - e.clientX, drag.h + drag.y - e.clientY);
  });
  function endDrag() { drag = null; root.classList.remove('axchat-resizing'); }
  ['pointerup','pointercancel','lostpointercapture'].forEach(event => handle.addEventListener(event, endDrag));
  handle.addEventListener('keydown', e => {
    const change = {ArrowLeft:[20,0],ArrowRight:[-20,0],ArrowUp:[0,20],ArrowDown:[0,-20]}[e.key];
    if (!change) return; e.preventDefault();
    const r = panel.getBoundingClientRect(); resize(r.width + change[0], r.height + change[1]);
  });
  window.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('scroll', layout);
  languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));
  // Shared site switchers may update <html lang> or call this chat-only adapter.
  new MutationObserver(() => setLanguage(document.documentElement.lang)).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  window.AXPORTChat = Object.freeze({ setLanguage, getLanguage: () => locale });
  setLanguage(locale);
})();
