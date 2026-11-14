(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const view = $('#view');
const SPLIT = /[，。？！；：、,.?!;:“”‘’「」『』《》·—…\s]+/;
const HAN = /[^\u3400-\u9fff\uf900-\ufaff]/g;
const norm = s => s.replace(HAN, '');
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- storage ---------- */
const KEY = 'feihua.v1';
const def = () => ({ games: 0, wins: 0, lines: 0, said: {}, best: {}, fav: [], jie: { n: 0, ok: 0 }, tian: { n: 0, ok: 0 }, wrong: [], days: {} });
let S;
try { S = Object.assign(def(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = def(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const markDay = () => { S.days[today()] = (S.days[today()] || 0) + 1; save(); };

/* ---------- data ---------- */
const P = [];           // poems
const segMap = new Map(); // seg -> [[pid, idx]]
let coreN = 0, extState = 'none', extPromise = null;
function ingest(arr, core) {
  for (const r of arr) {
    const id = P.length;
    const lines = r[4].split('|');
    const segs = [];
    for (const l of lines) for (const s of l.split(SPLIT)) { const n = norm(s); if (n) segs.push(n); }
    P.push({ id, a: r[0], t: r[1], d: r[2], s: r[3], lines, segs, core });
    segs.forEach((s, i) => { let v = segMap.get(s); if (!v) segMap.set(s, v = []); v.push(id * 1000 + i); });
  }
}
async function loadCore() {
  const r = await fetch('data/core.json'); ingest(await r.json(), true); coreN = P.length;
}
function loadExt() {
  if (extPromise) return extPromise;
  extState = 'loading';
  extPromise = fetch('data/ext.json').then(r => r.json()).then(a => { ingest(a, false); extState = 'done'; charCache.clear(); }).catch(() => { extState = 'fail'; extPromise = null; });
  return extPromise;
}
const charCache = new Map();
function segsWith(ch, includeExt) {
  const k = ch + (includeExt ? '+' : '');
  if (charCache.has(k)) return charCache.get(k);
  const out = [];
  const lim = includeExt ? P.length : coreN;
  for (let id = 0; id < lim; id++) { const p = P[id]; p.segs.forEach((s, i) => { if (s.length >= 4 && s.includes(ch)) out.push([s, id, i]); }); }
  charCache.set(k, out); return out;
}
function findLine(input) {
  // returns {segs:[...], pid, idx} or null
  const occ = segMap.get(input);
  if (occ) { const best = occ.find(o => P[Math.floor(o / 1000)].core) ?? occ[0]; return { segs: [input], pid: Math.floor(best / 1000), idx: best % 1000 }; }
  for (let k = 2; k <= input.length - 2; k++) {
    const L = segMap.get(input.slice(0, k)), R = segMap.get(input.slice(k));
    if (!L || !R) continue;
    const rs = new Set(R);
    const hit = L.find(o => rs.has(o + 1));
    if (hit != null) return { segs: [input.slice(0, k), input.slice(k)], pid: Math.floor(hit / 1000), idx: hit % 1000 };
  }
  return null;
}
const srcText = p => `《${p.t}》· ${p.a}${p.d && !p.a.startsWith('诗经') ? '〔' + p.d + '〕' : ''}`;
const hl = (s, ch) => esc(s).split(esc(ch)).join(`<em>${esc(ch)}</em>`);

/* ---------- ui helpers ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1900); }
function modal(html) { Motion.open($('#modal')); $('#modalCard').innerHTML = `<button class="x" data-close aria-label="关闭">×</button>` + html; $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal() { Motion.close($('#modal'), () => { $('#modal').hidden = true; document.body.style.overflow = ''; }); }
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function showPoem(pid, mark) {
  const p = P[pid]; if (!p) return;
  const fav = S.fav.includes(p.a + '|' + p.t + '|' + p.lines[0]);
  const body = p.lines.map(l => { let h = esc(l); if (mark) h = h.split(esc(mark)).join(`<em>${esc(mark)}</em>`); return h; }).join('<br>');
  modal(`<div class="poem-h"><div><h2>${esc(p.t)}</h2><div class="au">${esc(p.a)}${p.d ? ' · ' + esc(p.d) : ''}　<span class="tag">${esc(p.s)}</span></div></div></div>
  <div class="poem-body" id="pbody">${body}</div>
  <div class="poem-acts"><button class="btn sm" id="pv">竖排</button><button class="btn sm ${fav ? 'ink' : ''}" id="pf">${fav ? '已收藏' : '收藏'}</button><button class="btn sm" id="pc">复制</button><button class="btn sm pri" id="pl">用这首诗起令</button></div>`);
  $('#pv').onclick = e => { const b = $('#pbody'); b.classList.toggle('v'); e.target.textContent = b.classList.contains('v') ? '横排' : '竖排'; };
  $('#pf').onclick = e => { const k = p.a + '|' + p.t + '|' + p.lines[0]; const i = S.fav.indexOf(k); if (i >= 0) S.fav.splice(i, 1); else S.fav.unshift(k); save(); e.target.textContent = i >= 0 ? '收藏' : '已收藏'; e.target.classList.toggle('ink', i < 0); toast(i >= 0 ? '已取消收藏' : '已收藏'); };
  $('#pc').onclick = () => { const txt = `${p.t}\n${p.a}${p.d ? '〔' + p.d + '〕' : ''}\n${p.lines.join('\n')}`; navigator.clipboard?.writeText(txt).then(() => toast('已复制'), () => toast('复制失败')); };
  $('#pl').onclick = () => { const cs = [...new Set(p.segs.join(''))].filter(c => HOT.includes(c)); const c = cs.length ? pick(cs) : pick([...new Set(p.segs.join(''))]); closeModal(); cfg.ch = c; goPlay(); };
}
const favPid = k => { const [a, t, l0] = k.split('|'); return P.findIndex(p => p.a === a && p.t === t && p.lines[0] === l0); };

/* ---------- home ---------- */
const HOT = '花月春风山水云雨酒夜江人天雪秋柳归心酒梦愁山日'.split('').filter((c, i, a) => a.indexOf(c) === i);
function dailyPoem() {
  const pool = [];
  for (let i = 0; i < coreN; i++) { const p = P[i]; if ((p.d === '唐' || p.d === '宋') && p.lines.length <= 4 && p.segs.length >= 4 && p.segs.length <= 8 && p.segs.every(s => s.length === 5 || s.length === 7)) pool.push(i); }
  const d = new Date(); const seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  let h = seed; h = (h ^ 61) ^ (h >>> 16); h = h + (h << 3); h ^= h >>> 4; h *= 0x27d4eb2d; h ^= h >>> 15;
  return pool[Math.abs(h) % pool.length];
}
function renderHome() {
  const pid = dailyPoem(), p = P[pid];
  const d = new Date();
  const lines = p.lines.flatMap(l => l.split(/(?<=[，。？！；])/)).filter(Boolean);
  view.innerHTML = `
  <section class="hero">
    <div class="card hero-l">
      <h1>飞花令</h1>
      <div class="sub">花自飘零水自流，一句一句接下去</div>
      <p>给一个字，你一句，我一句，看谁先接不上。这里收录了 ${coreN.toLocaleString()} 首常诵名篇作对手的“腹稿”，另有两万余首唐宋诗词用来核对你的诗句。</p>
      <div class="acts"><a class="btn pri" href="#/ling">开始飞花令</a><a class="btn" href="#/jie">上下句接龙</a></div>
      <div class="stat-row"><div><b>${S.games}</b><span>对局</span></div><div><b>${Object.keys(S.said).length}</b><span>吟出诗句</span></div><div><b>${S.fav.length}</b><span>收藏</span></div></div>
      <svg class="petal" viewBox="0 0 200 200"><g fill="#b23a2e">${[0,72,144,216,288].map(r => `<ellipse cx="100" cy="55" rx="28" ry="48" transform="rotate(${r} 100 100)"/>`).join('')}</g><circle cx="100" cy="100" r="14" fill="#a8844e"/></svg>
    </div>
    <div class="card daily">
      <div class="daily-h"><span>今日一诗</span><span>${d.getMonth()+1}月${d.getDate()}日</span></div>
      <div class="vert" id="dailyV"><span class="vt">${esc(p.t)}</span><span class="va">${esc(p.a)}</span>${lines.map(l => `<span class="vl">${esc(l)}</span>`).join('')}</div>
      <div style="text-align:center"><button class="btn sm" id="dailyOpen">读全诗</button></div>
    </div>
  </section>
  <div class="sec-h"><h2>四种玩法</h2></div>
  <section class="modes">
    <a class="card mode" href="#/ling"><div class="big">令</div><h3>飞花令</h3><p>和对手轮流吟出含有令字的诗句，可选位置飞花与限时。</p></a>
    <a class="card mode" href="#/jie"><div class="big">接</div><h3>上下句</h3><p>看上句选下句，十题一轮，熟句检验。</p></a>
    <a class="card mode" href="#/tian"><div class="big">填</div><h3>诗句填字</h3><p>名句缺一字，从四个字里挑回原句。</p></a>
    <a class="card mode" href="#/ku"><div class="big">卷</div><h3>诗库</h3><p>按作者、题目、字句检索，竖排阅读与收藏。</p></a>
  </section>
  <div class="sec-h"><h2>常用令字</h2><span class="muted" style="font-size:13px">点一个字直接开局</span></div>
  <div class="chars">${HOT.map(c => `<button class="cbtn" data-c="${c}">${c}${S.best[c] ? `<sup>${S.best[c]}</sup>` : ''}</button>`).join('')}</div>`;
  $('#dailyOpen').onclick = () => showPoem(pid);
  $$('.cbtn', view).forEach(b => b.onclick = () => { cfg.ch = b.dataset.c; goPlay(); });
}

/* ---------- 飞花令 ---------- */
const cfg = Object.assign({ ch: '花', mode: 'free', opp: 'cpu', level: 2, time: 30 }, (() => { try { return JSON.parse(localStorage.getItem('feihua.cfg') || '{}'); } catch { return {}; } })());
const saveCfg = () => { try { localStorage.setItem('feihua.cfg', JSON.stringify(cfg)); } catch {} };
const LEVELS = [{ n: '书童', min: 5, max: 9 }, { n: '秀才', min: 12, max: 20 }, { n: '翰林', min: 22, max: 36 }, { n: '状元', min: 999, max: 999 }];
let G = null, pending = false;
function goPlay() { saveCfg(); if (route() === 'ling') startGame(); else { pending = true; location.hash = '#/ling'; } }
function renderLingSetup() {
  if (pending) { pending = false; return startGame(); }
  if (G && G.live) return renderGame();
  const o = (k, v, t) => `<button class="chip ${cfg[k] == v ? 'on' : ''}" data-k="${k}" data-v="${v}">${t}</button>`;
  view.innerHTML = `
  <div class="setup">
    <div class="card">
      <h2 style="margin:0 0 20px">摆下令局</h2>
      <div class="field"><label>令字</label>
        <div class="chars">${HOT.map(c => `<button class="cbtn ${cfg.ch === c ? 'on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
        <div class="custom"><span class="muted" style="font-size:14px">或自定</span><input id="cc" maxlength="1" placeholder="字" value="${HOT.includes(cfg.ch) ? '' : esc(cfg.ch)}"><span class="muted" id="ccInfo" style="font-size:13px"></span></div>
      </div>
      <div class="field"><label>规则</label><div class="opts">${o('mode', 'free', '经典：句中含令字')}${o('mode', 'pos', '位置飞花：令字依次在第 1–7 字')}</div></div>
      <div class="field"><label>对手</label><div class="opts">${o('opp', 'cpu', '与对手对弈')}${o('opp', 'duo', '和同桌轮流（同一台设备）')}</div></div>
      <div class="field" id="lvF" ${cfg.opp === 'duo' ? 'hidden' : ''}><label>对手水平</label><div class="opts">${LEVELS.map((l, i) => o('level', i, l.n)).join('')}</div></div>
      <div class="field"><label>每句限时</label><div class="opts">${o('time', 15, '15 秒')}${o('time', 30, '30 秒')}${o('time', 60, '60 秒')}${o('time', 0, '不限时')}</div></div>
      <button class="btn pri" id="go" style="width:100%;padding:14px;font-size:17px">开局</button>
    </div>
    <div class="card rules">
      <h3 style="margin-top:0">怎么玩</h3>
      <p>双方轮流说出一句<b>含有令字</b>的诗词，说不出、超时或重复即告负。</p>
      <p>可以只说半句，如“<b>春</b>风又绿江南岸”；也可以说一整联。</p>
      <p><b>位置飞花</b>更难：第一句令字须在第 1 个字，第二句在第 2 个字，依此类推到第 7 字再循环。</p>
      <p>每局有三次<b>提示</b>，会给出一句的轮廓。</p>
      <p class="muted" style="font-size:13px;margin-bottom:0">诗句以收录版本为准，个别字与课本略有出入时可换一句。</p>
    </div>
  </div>`;
  $$('.chip', view).forEach(b => b.onclick = () => { const k = b.dataset.k; cfg[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; saveCfg(); renderLingSetup(); });
  $$('.cbtn', view).forEach(b => b.onclick = () => { cfg.ch = b.dataset.c; saveCfg(); renderLingSetup(); });
  const cc = $('#cc');
  cc.oninput = () => { const c = norm(cc.value).slice(-1); cc.value = c; if (c) { cfg.ch = c; saveCfg(); $$('.cbtn', view).forEach(b => b.classList.remove('on')); const n = segsWith(c).length; $('#ccInfo').textContent = n ? `名篇中约有 ${n} 句含“${c}”` : `名篇里没有含“${c}”的句子，换一个吧`; } };
  if (cc.value) cc.oninput();
  $('#go').onclick = startGame;
}
function startGame() {
  const ch = cfg.ch;
  if (!ch || !segsWith(ch).length) { toast('这个字在名篇里找不到，换一个吧'); return; }
  const lv = LEVELS[cfg.level] || LEVELS[1];
  G = { live: true, ch, mode: cfg.mode, opp: cfg.opp, time: cfg.time, level: cfg.level, used: new Set(), log: [], turn: 0, round: 0, hints: 3, mine: 0, theirs: 0,
        cpuLimit: lv.min + rnd(lv.max - lv.min + 1), over: false, startAt: Date.now() };
  G.log.push({ k: 'sys', h: cfg.opp === 'cpu' ? `令字「${esc(ch)}」，你先请。` : `令字「${esc(ch)}」，甲方先请。` });
  loadExt();
  if (location.hash !== '#/ling') location.hash = '#/ling'; else renderGame();
}
const posOf = () => G.mode === 'pos' ? (G.round % 7) + 1 : 0;
function validFor(seg, pos) { return pos ? seg[pos - 1] === G.ch : seg.includes(G.ch); }
function renderGame() {
  const lv = LEVELS[G.level];
  const who = G.opp === 'cpu' ? (G.turn === 0 ? '轮到你' : '对手思索中…') : (G.turn === 0 ? '甲方作答' : '乙方作答');
  view.innerHTML = `
  <div class="game">
    <div class="card board">
      <div class="board-h"><div class="ling">${esc(G.ch)}</div>
        <div class="meta"><b>${G.mode === 'pos' ? '位置飞花' : '经典飞花令'}</b><div id="gwho">${who} · 第 ${G.round + 1} 句${posOf() ? ` · 令字在第 ${posOf()} 字` : ''}</div></div>
        ${G.time ? `<div class="timer" id="timer"><svg width="52" height="52"><circle cx="26" cy="26" r="22" fill="none" stroke="#e6dccb" stroke-width="4"/><circle id="tc" cx="26" cy="26" r="22" fill="none" stroke="#b23a2e" stroke-width="4" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg><span id="tn">${G.time}</span></div>` : ''}
      </div>
      <div class="log" id="log"></div>
      <div class="composer">
        <input id="inp" placeholder="${G.over ? '本局已结束' : '输入一句含「' + esc(G.ch) + '」的诗'}" autocomplete="off" enterkeyhint="send" ${G.over ? 'disabled' : ''}>
        ${G.over ? `<button class="btn pri" id="again">再来一局</button>` : `<button class="btn pri" id="send">出句</button>`}
      </div>
    </div>
    <aside class="side">
      <div class="card"><h4>战况</h4><div class="score"><div><b>${G.mine}</b><span>${G.opp === 'cpu' ? '你' : '甲方'}</span></div><div><b style="color:var(--line)">:</b></div><div><b>${G.theirs}</b><span>${G.opp === 'cpu' ? '对手 · ' + lv.n : '乙方'}</span></div></div>
        ${G.mode === 'pos' ? `<div class="posbar">${[1,2,3,4,5,6,7].map(i => `<i class="${posOf() === i ? 'on' : ''}">${i}</i>`).join('')}</div>` : ''}</div>
      <div class="card"><h4>提示 · 剩 ${G.hints} 次</h4><button class="btn sm" id="hint" ${G.hints && !G.over && (G.opp === 'duo' || G.turn === 0) ? '' : 'disabled'}>给我一点线索</button><div class="hintline" id="hintline"></div></div>
      <div class="card"><h4>操作</h4><div class="opts"><button class="btn sm" id="quit">${G.over ? '换个令字' : '认输'}</button></div></div>
    </aside>
  </div>`;
  const log = $('#log');
  log.innerHTML = G.log.map(msgHTML).join('');
  { const ms = $$('.msg', log), seen = G._seen || 0; ms.forEach((m, i) => { if (i < seen) m.classList.add('old'); }); G._seen = ms.length; }
  log.scrollTop = log.scrollHeight;
  $$('.src', log).forEach(s => s.onclick = () => showPoem(+s.dataset.p, G.ch));
  const inp = $('#inp');
  if (!G.over) {
    $('#send').onclick = submit;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) submit(); });
    if (matchMedia('(pointer:fine)').matches) inp.focus();
  } else $('#again').onclick = startGame;
  $('#hint').onclick = giveHint;
  $('#quit').onclick = () => { if (G.over) { G = null; renderLingSetup(); } else endGame(G.opp === 'cpu' ? 'lose-quit' : (G.turn === 0 ? 'p2' : 'p1')); };
  startTimer();
}
function msgHTML(m) {
  if (m.k === 'sys') return `<div class="msg sys ${m.err ? 'err' : ''}"><div class="bub">${m.h}</div></div>`;
  const cls = m.k === 'me' ? 'me' : m.k === 'p2' ? 'p2' : '';
  const name = m.k === 'me' ? (G.opp === 'cpu' ? '你' : '甲方') : (G.opp === 'cpu' ? '对手' : '乙方');
  return `<div class="msg ${cls}"><div class="who">${name}</div><div class="bub">${m.segs.map(s => hl(s, G.ch)).join('，')}</div><div class="src" data-p="${m.pid}">${esc(srcText(P[m.pid]))} ›</div></div>`;
}
let timerT;
function startTimer() {
  clearInterval(timerT);
  if (!G.time || G.over || (G.opp === 'cpu' && G.turn === 1)) return;
  if (G.deadline == null) G.deadline = Date.now() + G.time * 1000;
  const tick = () => {
    const left = Math.max(0, (G.deadline - Date.now()) / 1000);
    const tn = $('#tn'), tc = $('#tc'); if (!tn) { clearInterval(timerT); return; }
    tn.textContent = Math.ceil(left); tc.setAttribute('stroke-dashoffset', String(138.2 * (1 - left / G.time)));
    $('#timer').classList.toggle('warn', left <= 5);
    if (left <= 0) { clearInterval(timerT); endGame(G.opp === 'cpu' ? 'lose-time' : (G.turn === 0 ? 'p2' : 'p1')); }
  };
  tick(); timerT = setInterval(tick, 200);
}
function sys(h, err) { G.log.push({ k: 'sys', h, err }); }
async function submit() {
  if (!G || G.over) return;
  const inp = $('#inp'); const raw = inp.value; const t = norm(raw);
  if (!t) return;
  const pos = posOf();
  const bad = msg => { const lg = $('#log'); lg.insertAdjacentHTML('beforeend', msgHTML({ k: 'sys', h: msg, err: 1 })); lg.scrollTop = lg.scrollHeight; inp.select(); };
  if (!t.includes(G.ch)) return bad(`“${esc(t)}”里没有「${esc(G.ch)}」字`);
  let f = findLine(t);
  if (!f && extState !== 'done') { inp.disabled = true; bad('正在翻检两万首唐宋诗词…'); await loadExt(); inp.disabled = false; f = findLine(t); }
  if (!f) return bad(`没在诗库里找到“${esc(t)}”，检查一下字，或者换一句`);
  if (pos && !f.segs.some(s => s[pos - 1] === G.ch)) return bad(`这一轮「${esc(G.ch)}」要在第 ${pos} 个字`);
  if (f.segs.some(s => G.used.has(s))) return bad(`“${esc(f.segs.find(s => G.used.has(s)))}”已经说过了`);
  f.segs.forEach(s => G.used.add(s));
  const me = G.opp === 'cpu' || G.turn === 0;
  G.log.push({ k: me ? 'me' : 'p2', segs: f.segs, pid: f.pid });
  if (G.opp === 'cpu' || G.turn === 0) { G.mine++; } else G.theirs++;
  f.segs.forEach(s => { if (s.includes(G.ch)) S.said[s] = (S.said[s] || 0) + 1; });
  S.lines++; save();
  G.round++; G.deadline = null; inp.value = '';
  if (G.opp === 'duo') { G.turn = 1 - G.turn; renderGame(); return; }
  G.turn = 1; renderGame();
  setTimeout(cpuMove, 650 + rnd(900));
}
function cpuCandidates(pos) {
  const deep = G.level >= 3;
  let c = segsWith(G.ch, deep && extState === 'done').filter(([s]) => !G.used.has(s) && validFor(s, pos));
  return c;
}
function cpuMove() {
  if (!G || G.over || G.turn !== 1) return;
  const pos = posOf();
  const c = cpuCandidates(pos);
  if (!c.length || G.theirs >= G.cpuLimit) { endGame('win'); return; }
  // prefer 5/7-char lines from 唐宋 for flavour
  const good = c.filter(([s, id]) => (s.length === 5 || s.length === 7) && P[id].d !== '先秦');
  const famed = good.filter(([s, id]) => P[id].core && P[id].s !== '全唐诗' && P[id].s !== '全宋诗' || /^全/.test(P[id].s) && P[id].core);
  const r = Math.random();
  const [s, id] = pick(famed.length && r < .7 ? famed : good.length && r < .92 ? good : c);
  G.used.add(s); G.theirs++; G.round++;
  G.log.push({ k: 'cpu', segs: [s], pid: id });
  G.turn = 0; G.deadline = null; renderGame();
}
function giveHint() {
  if (!G || !G.hints || G.over) return;
  const c = cpuCandidates(posOf()).filter(([s, id]) => P[id].core && (s.length === 5 || s.length === 7));
  const pool = c.length ? c : cpuCandidates(posOf());
  if (!pool.length) { $('#hintline').textContent = '似乎已经没有可说的了'; return; }
  const [s, id] = pick(pool);
  G.hints--;
  const keep = new Set([s.indexOf(G.ch), 0]);
  const mask = [...s].map((c, i) => keep.has(i) || c === G.ch ? c : '〇').join('');
  $('#hint').disabled = !G.hints; $('#hint').closest('.card').querySelector('h4').textContent = `提示 · 剩 ${G.hints} 次`;
  $('#hintline').innerHTML = `${esc(mask)}<div class="muted" style="font-size:12px;font-family:var(--sans);letter-spacing:0;margin-top:4px">出自 ${esc(P[id].a)}《${esc(P[id].t)}》</div>`;
}
function endGame(res) {
  if (!G || G.over) return;
  clearInterval(timerT);
  G.over = true; G.live = true;
  const ch = G.ch;
  if (G.opp === 'cpu') {
    S.games++; if (res === 'win') S.wins++;
    S.best[ch] = Math.max(S.best[ch] || 0, G.mine);
    markDay();
    const sample = shuffle(cpuCandidates(0).filter(([s]) => !G.used.has(s))).slice(0, 3);
    const msg = res === 'win' ? `对手接不上了——你赢了！本局你吟出 ${G.mine} 句。` : res === 'lose-time' ? `时间到。本局你吟出 ${G.mine} 句。` : `你认输了。本局你吟出 ${G.mine} 句。`;
    sys(`<b style="color:var(--zhu)">${msg}</b>${sample.length ? `<br><span style="font-size:13px">还可以说：${sample.map(([s]) => esc(s)).join('　')}</span>` : ''}`);
  } else {
    S.games++; markDay();
    sys(`<b style="color:var(--zhu)">${res === 'p1' ? '甲方' : '乙方'}胜！</b> 甲方 ${G.mine} 句，乙方 ${G.theirs} 句。`);
  }
  save(); renderGame();
}

/* ---------- 接句 / 填字 ---------- */
let pairs = null;
function buildPairs() {
  if (pairs) return pairs;
  pairs = [];
  for (let id = 0; id < coreN; id++) {
    const p = P[id]; if (p.d === '先秦' || p.s === '宋词三百首' || p.s === '南唐二主词' || p.s === '全宋词') continue;
    for (const l of p.lines) { const ss = l.split(SPLIT).map(norm).filter(Boolean); for (let i = 0; i + 1 < ss.length; i += 2) { const a = ss[i], b = ss[i + 1]; if (a.length === b.length && (a.length === 5 || a.length === 7)) pairs.push({ a, b, id }); } }
  }
  return pairs;
}
let Q = null;
function newQuiz(kind) {
  const ps = buildPairs();
  const qs = [];
  const used = new Set();
  while (qs.length < 10) {
    const pr = pick(ps); if (used.has(pr.a)) continue; used.add(pr.a);
    if (kind === 'jie') {
      const rev = Math.random() < .25;
      const ans = rev ? pr.a : pr.b, shown = rev ? pr.b : pr.a;
      const ds = new Set([ans]);
      let guard = 0;
      while (ds.size < 4 && guard++ < 500) { const o = pick(ps); const c = rev ? o.a : o.b; if (c.length === ans.length && o.id !== pr.id) ds.add(c); }
      qs.push({ pr, rev, shown, ans, opts: shuffle([...ds]) });
    } else {
      const seg = Math.random() < .5 ? 'a' : 'b';
      const s = pr[seg];
      const idxs = [...s].map((c, i) => i).filter(i => !'不之人一无有其以而我何此'.includes(s[i]));
      const k = pick(idxs.length ? idxs : [...s].map((c, i) => i));
      const ans = s[k];
      const ds = new Set([ans]); let guard = 0;
      while (ds.size < 4 && guard++ < 800) {
        const o = pick(ps); const c = pick([...o.a]);
        if (ds.has(c)) continue;
        const alt = s.slice(0, k) + c + s.slice(k + 1);
        if (segMap.has(alt)) continue;
        ds.add(c);
      }
      qs.push({ pr, seg, k, ans, opts: shuffle([...ds]) });
    }
  }
  Q = { kind, qs, i: 0, ok: 0, answered: false };
}
function renderQuiz(kind) {
  if (!Q || Q.kind !== kind) newQuiz(kind);
  if (Q.i >= Q.qs.length) return renderQuizDone();
  const q = Q.qs[Q.i];
  const p = P[q.pr.id];
  let up;
  if (kind === 'jie') up = q.rev ? `<span class="gap" style="width:${q.ans.length * 1.1}em">　</span>，${esc(q.shown)}` : `${esc(q.shown)}，<span class="gap" style="width:${q.ans.length * 1.1}em">　</span>`;
  else { const s = q.pr[q.seg]; const bl = esc(s.slice(0, q.k)) + `<span class="gap">？</span>` + esc(s.slice(q.k + 1)); up = q.seg === 'a' ? `${bl}，${esc(q.pr.b)}` : `${esc(q.pr.a)}，${bl}`; }
  view.innerHTML = `<div class="quiz">
    <div class="qhead"><h2 style="margin:0">${kind === 'jie' ? '上下句接龙' : '诗句填字'}</h2><span class="muted">第 ${Q.i + 1} / 10 题 · 答对 ${Q.ok}</span></div>
    <div class="prog"><i style="width:${Q.i * 10}%"></i></div>
    <div class="card qcard">
      <div class="ask">${kind === 'jie' ? (q.rev ? '选出它的上句' : '选出它的下句') : '空格处是哪个字'}</div>
      <div class="up">${up}</div>
      <div class="choices ${kind === 'tian' ? 'chars4' : ''}">${q.opts.map(o => `<button class="choice" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <div class="reveal" id="rev"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px"><button class="btn sm" id="restart">重新出题</button><button class="btn ink" id="next" hidden>${Q.i === 9 ? '看成绩' : '下一题'}</button></div>
  </div>`;
  Motion.enter($('.qcard', view)); Motion.stagger($('.choices', view), '.choice', 45);
  if (Q.i > 0 && !Motion.reduced) { const bar = $('.prog i', view); bar.style.width = (Q.i - 1) * 10 + '%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = Q.i * 10 + '%'; })); }
  $$('.choice', view).forEach(b => b.onclick = () => {
    if (Q.answered) return; Q.answered = true;
    const ok = b.dataset.o === q.ans;
    if (ok) Q.ok++;
    const st = S[kind]; st.n++; if (ok) st.ok++;
    if (!ok) { S.wrong.unshift({ a: q.pr.a, b: q.pr.b, id: p.a + '|' + p.t + '|' + p.lines[0] }); S.wrong = S.wrong.filter((w, i, arr) => arr.findIndex(x => x.a === w.a) === i).slice(0, 200); }
    else S.wrong = S.wrong.filter(w => w.a !== q.pr.a);
    save();
    $$('.choice', view).forEach(c => { c.disabled = true; if (c.dataset.o === q.ans) { c.classList.add('ok'); Motion.pulse(c); } else if (c === b) { c.classList.add('bad'); Motion.pulse(c, 'mo-shake'); } });
    Motion.enter($('#rev'));
    $('#rev').innerHTML = `<div class="full">${esc(q.pr.a)}，${esc(q.pr.b)}</div><span class="src" style="cursor:pointer;color:var(--ink3)" id="srcl">${esc(srcText(p))} ›</span>`;
    $('#srcl').onclick = () => showPoem(q.pr.id);
    $('#next').hidden = false; $('#next').focus();
  });
  $('#next').onclick = () => { Q.i++; Q.answered = false; if (Q.i >= 10) markDay(); renderQuiz(kind); };
  $('#restart').onclick = () => { newQuiz(kind); renderQuiz(kind); };
}
function renderQuizDone() {
  const kind = Q.kind;
  const words = ['再读读', '再读读', '再读读', '尚可', '尚可', '不错', '不错', '颇熟', '颇熟', '烂熟于心', '满腹诗书'];
  view.innerHTML = `<div class="quiz"><div class="card done"><div class="muted">本轮得分</div><div class="big">${Q.ok}<span style="font-size:24px;color:var(--ink3)"> / 10</span></div><h2>${words[Q.ok]}</h2>
   <div class="muted" style="margin-bottom:24px">答错的句子会收进“我的 · 生疏句”</div>
   <div style="display:flex;gap:12px;justify-content:center"><button class="btn pri" id="again">再来一轮</button><a class="btn" href="#/me">去看看</a></div></div></div>`;
  $('#again').onclick = () => { newQuiz(kind); renderQuiz(kind); };
  Motion.enter($('.done', view), 'mo-pop'); Motion.countUp(view, '.done .big', 700);
}

/* ---------- 诗库 ---------- */
const LIB = { q: '', src: '全部', n: 60, ext: false };
const SRC = ['全部', '唐诗三百首', '宋词三百首', '千家诗', '诗经', '南唐二主词', '曹操诗集', '名篇补遗', '收藏'];
function renderLib() {
  view.innerHTML = `
  <div class="lib-bar"><div class="search"><input id="q" placeholder="搜题目、作者或诗句，如：明月 / 李白 / 春江" value="${esc(LIB.q)}"></div>
  <label class="chip" style="cursor:pointer"><input type="checkbox" id="ext" ${LIB.ext ? 'checked' : ''} style="margin:0 6px 0 0;accent-color:#b23a2e">含两万首扩展诗库</label></div>
  <div class="filters">${SRC.map(s => `<button class="chip ${LIB.src === s ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
  <div class="muted" id="cnt" style="font-size:13px;margin-bottom:12px"></div>
  <div class="grid" id="grid"></div><div class="more" id="more"></div>`;
  const run = () => {
    const q = norm(LIB.q) || LIB.q.trim();
    let lim = LIB.ext && extState === 'done' ? P.length : coreN;
    const favIds = LIB.src === '收藏' ? new Set(S.fav.map(favPid)) : null;
    const res = [];
    for (let i = 0; i < lim; i++) {
      const p = P[i];
      if (favIds && !favIds.has(i)) continue;
      if (!favIds && LIB.src !== '全部') { if (LIB.src === '名篇补遗' ? !(p.core && /^全/.test(p.s)) : p.s !== LIB.src) continue; }
      if (q && !(p.t.includes(q) || p.a.includes(q) || p.segs.some(s => s.includes(q)) || p.lines.join('').includes(q))) continue;
      res.push(i);
    }
    $('#cnt').textContent = `共 ${res.length.toLocaleString()} 首${LIB.ext && extState === 'loading' ? '（扩展诗库载入中…）' : ''}`;
    $('#grid').innerHTML = res.length ? res.slice(0, LIB.n).map(i => { const p = P[i]; const seg = q ? (p.segs.find(s => s.includes(q)) || p.segs[0]) : p.segs.slice(0, 2).join('，'); return `<div class="card pc" data-i="${i}"><h3>${esc(p.t)}</h3><div class="au">${esc(p.a)}${p.d ? ' · ' + esc(p.d) : ''}</div><div class="ex">${q ? hl(seg, q) : esc(seg)}</div></div>`; }).join('') : `<div class="empty" style="grid-column:1/-1"><span class="ic">空</span>${LIB.src === '收藏' ? '还没有收藏，读到喜欢的诗点“收藏”即可' : '没有找到，换个词试试'}</div>`;
    $('#more').innerHTML = res.length > LIB.n ? `<button class="btn" id="mb">再看 ${Math.min(60, res.length - LIB.n)} 首</button>` : '';
    if ($('#mb')) $('#mb').onclick = () => { LIB.n += 60; run(); };
    $$('.pc', view).forEach(c => c.onclick = () => showPoem(+c.dataset.i, q.length === 1 ? q : ''));
    Motion.stagger($('#grid'), '.pc', 22, 14);
  };
  let deb; $('#q').oninput = e => { clearTimeout(deb); deb = setTimeout(() => { LIB.q = e.target.value; LIB.n = 60; run(); }, 180); };
  $('#ext').onchange = e => { LIB.ext = e.target.checked; if (LIB.ext) { loadExt().then(() => { if (route() === 'ku') run(); }); } run(); };
  $$('.filters .chip', view).forEach(b => b.onclick = () => { LIB.src = b.dataset.s; LIB.n = 60; renderLib(); });
  run();
}

/* ---------- 我的 ---------- */
function renderMe() {
  const rate = st => st.n ? Math.round(st.ok / st.n * 100) + '%' : '—';
  const bests = Object.entries(S.best).sort((a, b) => b[1] - a[1]);
  const said = Object.keys(S.said);
  const days = Object.keys(S.days).length;
  view.innerHTML = `
  <h2 style="margin-top:0">我的诗囊</h2>
  <div class="me-grid">
    <div class="card kpi"><b>${S.games}</b><span>飞花令对局 · 胜 ${S.wins}</span></div>
    <div class="card kpi"><b>${said.length}</b><span>吟出过的不同诗句</span></div>
    <div class="card kpi"><b>${rate(S.jie)}</b><span>接句正确率 · ${S.jie.n} 题</span></div>
    <div class="card kpi"><b>${rate(S.tian)}</b><span>填字正确率 · ${S.tian.n} 题</span></div>
  </div>
  <div class="sec-h"><h2>令字纪录</h2><span class="muted" style="font-size:13px">每个字单局最多吟出的句数 · 练习 ${days} 天</span></div>
  ${bests.length ? `<div class="rec-list">${bests.map(([c, n]) => `<div class="card rec"><div class="c">${esc(c)}</div><div class="n">${n} 句</div></div>`).join('')}</div>` : `<div class="card empty"><span class="ic">令</span>还没有对局记录</div>`}
  <div class="sec-h"><h2>生疏句</h2><span class="muted" style="font-size:13px">接句、填字答错的句子，答对后自动移出</span></div>
  ${S.wrong.length ? `<div class="grid">${S.wrong.slice(0, 60).map(w => `<div class="card pc" data-f="${esc(w.id)}"><div class="ex" style="-webkit-line-clamp:3">${esc(w.a)}，${esc(w.b)}</div><div class="au">${esc(w.id.split('|')[1])} · ${esc(w.id.split('|')[0])}</div></div>`).join('')}</div>` : `<div class="card empty"><span class="ic">净</span>暂无生疏句</div>`}
  <div class="sec-h"><h2>我的收藏</h2></div>
  ${S.fav.length ? `<div class="grid">${S.fav.map(k => { const [a, t, l] = k.split('|'); return `<div class="card pc" data-f="${esc(k)}"><h3>${esc(t)}</h3><div class="au">${esc(a)}</div><div class="ex">${esc(l)}</div></div>`; }).join('')}</div>` : `<div class="card empty"><span class="ic">藏</span>读到喜欢的诗，点“收藏”就会出现在这里</div>`}
  ${said.length ? `<div class="sec-h"><h2>吟过的诗句</h2></div><div class="card" style="padding:20px;font-family:var(--kai);font-size:17px;line-height:2;color:var(--ink2)">${said.slice(-120).reverse().map(esc).join('　')}</div>` : ''}
  <div style="margin-top:36px;text-align:center"><button class="btn sm" id="reset">清除本机记录</button></div>`;
  $$('.pc[data-f]', view).forEach(c => c.onclick = () => { const i = favPid(c.dataset.f); if (i >= 0) showPoem(i); else toast('这首在扩展诗库里，稍后再试'); });
  $('#reset').onclick = () => { if (confirm('清除本机上的全部对局、收藏与答题记录？')) { S = def(); save(); renderMe(); toast('已清除'); } };
}

/* ---------- router ---------- */
const route = () => (location.hash.replace(/^#\/?/, '').split('/')[0] || 'home');
function render() {
  const r = route();
  $$('[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === r || (r === 'tian' && a.dataset.r === 'jie' && a.closest('.tabbar'))));
  clearInterval(timerT);
  closeModal();
  if (r !== 'ling' && G && !G.over) { G = null; }
  ({ home: renderHome, ling: renderLingSetup, jie: () => renderQuiz('jie'), tian: () => renderQuiz('tian'), ku: renderLib, me: renderMe }[r] || renderHome)();
  window.scrollTo(0, 0);
  Motion.enter(view);
  if (r !== 'ku') Motion.stagger(view, '.card:not(.pc)', 45, 8);
  Motion.countUp(view, '.kpi b, .stat-row b, .done .big');
}
window.addEventListener('hashchange', render);
view.innerHTML = '<div class="loading">展卷中…</div>';
loadCore().then(() => {
  render();
  const foot = document.createElement('footer'); foot.className = 'foot';
  foot.innerHTML = `诗词文本整理自开源项目 <a href="https://github.com/chinese-poetry/chinese-poetry" target="_blank" rel="noopener">chinese-poetry</a>，个别字句与通行教材版本可能略有不同。<br>记录只保存在本机浏览器中。`;
  document.body.insertBefore(foot, $('#tabbar'));
}).catch(() => { view.innerHTML = '<div class="loading">诗卷没能打开，请刷新重试</div>'; });
Motion.pills([{ sel: '#nav', mode: 'pill' }, { sel: '#tabbar', mode: 'dot' }, { sel: '.setup .opts', keep: true }, { sel: '.filters', keep: true }, { sel: '.setup .chars', keep: true }, { sel: '.posbar', keep: true, mode: 'pill' }]);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
