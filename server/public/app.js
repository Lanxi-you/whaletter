/* 鲸鱼娘 · 手机端聊天页（无框架，纯手写）
   做的事：拿令牌进门 → 拉历史 → 每 1.5 秒补一次新消息 → 发出去交给 DSH 的会话 */
'use strict';

const BASE = './';
const KEY = 'lanxi-chat.token';
const POLL_MS = 1500;

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const emptyEl = $('empty');
const inputEl = $('input');
const sendEl = $('send');
const formEl = $('composer');
const gateEl = $('gate');
const gateForm = $('gateForm');
const gateErr = $('gateErr');
const tokenInput = $('tokenInput');
const bannerEl = $('banner');
const statusEl = $('statusLine');
const peerEl = $('peerName');

let token = localStorage.getItem(KEY) || '';
let lastSeq = 0;
let polling = false;
let timer = 0;
let seen = new Map(); // seq -> 元素（避免重复渲染）
let lastTs = 0;

/* ---------- 网络 ---------- */

async function api(path, opts = {}) {
  const r = await fetch(BASE + 'api/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { 'content-type': 'application/json' },
      token ? { 'x-lanxi-token': token } : {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  if (r.status === 401) {
    const err = new Error('unauthorized');
    err.code = 401;
    throw err;
  }
  if (!r.ok || !data || data.ok === false) {
    const err = new Error((data && data.say) || ('HTTP ' + r.status));
    throw err;
  }
  return data;
}

/* ---------- 界面 ---------- */

function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return hh + ':' + mm;
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hh + ':' + mm;
}

function atBottom() {
  return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
}

function scrollToEnd(smooth) {
  requestAnimationFrame(() => {
    listEl.scrollTo({ top: listEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  });
}

function makeRow(m) {
  const row = document.createElement('div');
  row.className = 'row ' + (m.role === 'user' ? 'me' : 'her');
  row.dataset.seq = String(m.seq);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = m.text;
  row.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const t = document.createElement('span');
  t.textContent = fmtTime(m.ts || Date.now());
  meta.appendChild(t);
  if (m.pending) {
    const p = document.createElement('span');
    p.className = 'bad';
    p.textContent = '发送中…';
    meta.appendChild(p);
  }
  row.appendChild(meta);
  return row;
}

function render(messages, { replace } = {}) {
  if (replace) {
    listEl.textContent = '';
    listEl.appendChild(emptyEl);
    seen.clear();
  }
  const stick = atBottom();
  for (const m of messages) {
    if (m.seq != null && seen.has(m.seq)) continue;
    const row = makeRow(m);
    if (m.seq != null) seen.set(m.seq, row);
    listEl.appendChild(row);
    if (m.seq != null && m.seq > lastSeq) lastSeq = m.seq;
    lastTs = Math.max(lastTs, m.ts || 0);
  }
  emptyEl.hidden = listEl.querySelectorAll('.row').length > 0;
  if (stick) scrollToEnd(false);
}

function setStatus(text, bad) {
  statusEl.textContent = text;
  statusEl.style.color = bad ? '#d1655f' : '';
}

function showBanner(text) {
  if (!text) { bannerEl.hidden = true; return; }
  bannerEl.textContent = text;
  bannerEl.hidden = false;
}

/* ---------- 拉消息 ---------- */

async function pullInitial() {
  const data = await api('messages?tail=120');
  if (data.target && data.target.title) peerEl.textContent = data.target.title;
  render(data.messages || [], { replace: true });
  setStatus(data.alive ? '在线' : '会话没开着', !data.alive);
  showBanner(data.alive ? '' : '目标会话现在没活着，消息会等它醒过来');
  if (data.messages && data.messages.length) scrollToEnd(false);
}

async function pullNew() {
  if (polling) return;
  polling = true;
  try {
    const data = await api('messages?after=' + lastSeq);
    const msgs = data.messages || [];
    if (msgs.length) {
      render(msgs);
      if (atBottom()) scrollToEnd(true);
    }
    setStatus(data.alive ? '在线' : '会话没开着', !data.alive);
    showBanner('');
  } catch (e) {
    if (e.code === 401) return needToken();
    setStatus('连不上', true);
    showBanner('连不上后台：' + e.message);
  } finally {
    polling = false;
  }
}

function startPolling() {
  stopPolling();
  timer = setInterval(() => {
    if (document.hidden) return;
    pullNew();
  }, POLL_MS);
}
function stopPolling() {
  if (timer) clearInterval(timer);
  timer = 0;
}

/* ---------- 发消息 ---------- */

async function send(text) {
  const clientId = 'c' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const temp = { seq: null, role: 'user', text, ts: Date.now(), pending: true };
  const tempRow = makeRow(temp);
  listEl.appendChild(tempRow);
  emptyEl.hidden = true;
  scrollToEnd(false);

  sendEl.disabled = true;
  try {
    const data = await api('send', { method: 'POST', body: { text, clientId } });
    tempRow.remove();
    render(data.messages || []);
    scrollToEnd(true);
  } catch (e) {
    if (e.code === 401) return needToken();
    const bad = tempRow.querySelector('.meta .bad');
    if (bad) { bad.textContent = '没发出去'; }
    showBanner('发送失败：' + e.message);
  } finally {
    sendEl.disabled = false;
    inputEl.focus();
  }
}

/* ---------- 输入框 ---------- */

function autosize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(132, inputEl.scrollHeight) + 'px';
}

inputEl.addEventListener('input', autosize);
inputEl.addEventListener('keydown', (e) => {
  // 电脑上回车发送、手机上是「发送」键；Shift+回车换行
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event('submit'));
  }
});

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  autosize();
  send(text);
});

$('menuBtn').addEventListener('click', () => {
  const ok = confirm('要退出这条通道吗？\n（只会清掉这台设备上存的令牌）');
  if (!ok) return;
  localStorage.removeItem(KEY);
  token = '';
  needToken();
});

/* ---------- 令牌 ---------- */

function needToken() {
  stopPolling();
  $('app').hidden = true;
  gateEl.hidden = false;
  gateErr.hidden = true;
  tokenInput.value = '';
  setTimeout(() => tokenInput.focus(), 60);
}

async function enter(t) {
  token = t.trim();
  if (!token) return;
  try {
    await api('state');
    localStorage.setItem(KEY, token);
    gateEl.hidden = true;
    $('app').hidden = false;
    await pullInitial();
    startPolling();
    inputEl.focus();
  } catch (e) {
    gateErr.textContent = e.code === 401 ? '令牌不对' : ('连不上：' + e.message);
    gateErr.hidden = false;
    token = '';
  }
}

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  enter(tokenInput.value);
});

/* ---------- 键盘 / 视口 ---------- */

function fitViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', h + 'px');
  const app = $('app');
  if (app) app.style.height = Math.max(240, Math.round(h)) + 'px';
  if (!document.hidden && atBottom()) scrollToEnd(false);
}

window.visualViewport && window.visualViewport.addEventListener('resize', fitViewport);
window.visualViewport && window.visualViewport.addEventListener('scroll', fitViewport);
window.addEventListener('resize', fitViewport);
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 220));

inputEl.addEventListener('focus', () => setTimeout(() => { fitViewport(); scrollToEnd(false); }, 120));
inputEl.addEventListener('blur', () => setTimeout(fitViewport, 120));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && token) pullNew();
});

window.addEventListener('online', () => showBanner(''));
window.addEventListener('offline', () => showBanner('网络断了，等它回来'));

// 禁用双击缩放（iOS 上 300ms 内第二次点击）
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300) e.preventDefault();
  lastTouch = now;
}, { passive: false });

/* ---------- 开工 ---------- */

fitViewport();
autosize();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}

if (token) {
  gateEl.hidden = true;
  $('app').hidden = false;
  pullInitial()
    .then(() => startPolling())
    .catch((e) => {
      if (e.code === 401) needToken();
      else { needToken(); }
    });
} else {
  needToken();
}
