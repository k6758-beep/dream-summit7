/* =====================================================================
 *  《夢想攻頂！正修冒險隊》遊戲引擎：game.js
 *  這支程式不寫死任何招生資訊，全部從 data/ 讀取：
 *    window.ADMISSION_DATA  管道、資格規則、日期、身分題目（data/admissions.js）
 *    window.CSU_WORLDS      未來城市與科系                （data/departments.js）
 *    window.STORY           旁白、關卡、徽章、背包裝備    （js/story.js）
 *    window.Scene           夢想之山地圖與動畫            （js/scene.js）
 *  資格判斷（match／elig）、推薦排序（recommend）、時程計算、攻略卡、
 *  暫存與續玩連結，都沿用《畢業之後 我的夢想之旅》的程式。
 * ===================================================================== */
(() => {
"use strict";
const D = window.ADMISSION_DATA, W = window.CSU_WORLDS, T = window.STORY, SC = window.Scene;
const PATHS = D.paths, PMAP = Object.fromEntries(PATHS.map(p => [p.id, p]));
const SAVE_KEY = "dream-summit-v1", VER = 5;
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = s => document.querySelector(s);
const stage = $("#stage");
/* RUN：每次「上一步」或重新開始都會 +1，舊流程裡還在等待的計時器就自動停下來 */
let RUN = 0;
const wait = ms => { const t = RUN; return new Promise(r => setTimeout(() => { if (t === RUN) r(); }, RM ? Math.min(ms, 80) : ms)); };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- 狀態與存檔 ----------------
 * S：目前的遊戲狀態（每一步開始前自動暫存在 localStorage）
 * H：走過的步驟紀錄（每一步開始前的 S 快照），「上一步」就是把快照拿回來重玩那一步
 */
const fresh = () => ({ v: VER, step: 0, done: false, name: "", avatar: "cap", p: {}, willing: [], main: "", backup: "", alt: "", known: false, world: "", saved: 0 });
let S = fresh(), H = [];
const H_MAX = 40;
const save = () => { S.saved = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify({ S, H: H.slice(-H_MAX) })); } catch (e) {} };
const load = () => { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.S && d.S.v === VER ? { S: d.S, H: Array.isArray(d.H) ? d.H : [] } : null; } catch (e) { return null; } };
const wipe = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

/* ---------------- 資料層：條件比對與資格判斷（與原版相同） ---------------- */
function match(cond, p) {
  if (!cond) return true;
  return Object.entries(cond).every(([k, want]) => {
    if (k === "any") return want.some(c => match(c, p));
    if (k === "not") return !match(want, p);
    const have = p[k];
    if (Array.isArray(want)) return want.includes(have);
    if (want && typeof want === "object") {
      if ("any" in want) return Array.isArray(have) && have.some(x => want.any.includes(x));
      if ("not" in want) return Array.isArray(want.not) ? !want.not.includes(have) : have !== want.not;
    }
    return have === want;
  });
}
function elig(id) {
  const P = PMAP[id];
  for (const r of P.rules || []) if (match(r.when, S.p)) return { st: r.st, why: r.why };
  return P.otherwise || { st: "y", why: "" };
}
const ST_TXT = { g: "可以走", y: "需要確認", r: "目前不符合" };
const ST_DOT = { g: "🟢", y: "🟡", r: "🔴" };
const passable = () => PATHS.filter(P => elig(P.id).st !== "r").map(P => P.id);

/* ---------------- 日期（以真實的今天計算） ----------------
 * 開啟遊戲時用伺服器回應的 Date 標頭核對手機日期；差太多時改用網路時間。
 * 測試用：網址加上 ?today=2027-03-01 可以模擬任何一天。 */
const SIM_DAY = (() => { const q = new URLSearchParams(location.search).get("today"); return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : ""; })();
let TODAY = (() => { const d = SIM_DAY ? new Date(SIM_DAY + "T00:00:00") : new Date(); d.setHours(0, 0, 0, 0); return d; })();
let CLOCK = SIM_DAY ? "sim" : "device";
async function syncClock() {
  if (SIM_DAY || !/^https?:/.test(location.protocol)) return;
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(location.href.split("#")[0], { method: "HEAD", cache: "no-store", signal: ctl.signal });
    clearTimeout(tm);
    const srv = new Date(r.headers.get("date") || "");
    if (isNaN(srv)) return;
    CLOCK = "net";
    if (Math.abs(srv - Date.now()) > 12 * 36e5) { const d = new Date(srv); d.setHours(0, 0, 0, 0); TODAY = d; CLOCK = "fixed"; }
  } catch (e) {}
}
const clockNote = () => ({ sim: "（模擬日期）", net: "（已和網路對時）", fixed: "（你的手機日期不準，已改用網路時間）", device: "（手機日期）" }[CLOCK]);
const toDate = s => s ? new Date(s + "T00:00:00") : null;
const md = d => `${d.getMonth() + 1}/${d.getDate()}`;
const daysBetween = (a, b) => Math.round((b - a) / 864e5);
const evRange = e => e.to ? `${md(toDate(e.from))}～${md(toDate(e.to))}` : md(toDate(e.from));
function nextEvent(P, ref = TODAY) {
  for (const e of P.events) {
    const s = toDate(e.from), en = toDate(e.to || e.from);
    if (ref < s) return { e, live: false, days: daysBetween(ref, s) };
    if (ref <= en) return { e, live: true, days: daysBetween(ref, en) };
  }
  return null;
}
const SY = D.meta.schoolYear, START = toDate(SY.start), GRAD = toDate(SY.graduation);
const MONTHS = Array.from({ length: 12 }, (_, i) => { const d = new Date(START.getFullYear(), START.getMonth() + i, 1); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
const monthIdx = d => Math.max(0, Math.min(11, (d.getFullYear() - START.getFullYear()) * 12 + d.getMonth() - START.getMonth()));
const GRAD_IDX = monthIdx(GRAD);
const tipFor = what => ((D.tips || []).find(t => new RegExp(t.match).test(what)) || {}).tip || "";
const myRoads = () => [S.main, S.backup, S.alt].filter(Boolean);
const ROLE = ["主攻", "備選", "備援"];
const briefingHTML = (ids, cls = "") => {
  const b = D.contact.briefing, need = ids.filter(id => PMAP[id] && PMAP[id].portfolio);
  return b && need.length ? `<div class="brief ${cls}">💡 ${need.map(id => PMAP[id].icon).join("")} ${esc(b.text)} <a href="${esc(b.url)}" target="_blank" rel="noopener">看說明會資訊 ›</a></div>` : "";
};
const QR = window.QR_CODES || {};
const qrHTML = (url, cap) => QR[url] ? `<figure class="qr"><div class="qrimg">${QR[url]}</div><figcaption>${esc(cap)}</figcaption></figure>` : "";
const deptLink = d => d.url || window.CSU_DEPT_FALLBACK || window.CSU_DEPT_LINK || D.contact.site;
function guideQRs() {
  const list = [], seen = new Set(), add = (u, cap) => { if (u && QR[u] && !seen.has(u)) { seen.add(u); list.push([u, cap]); } };
  myRoads().forEach((id, i) => { if (i < 2) add(PMAP[id].url, `${ROLE[i]}・${PMAP[id].road}`); });
  if (psActive() && PS.url) add(PS.url, `${PS.title}報名`);
  add(D.contact.line, "正修官方LINE@");
  if (list.length < 3) add(window.CSU_DEPT_LINK, "正修科系介紹");
  return list.slice(0, 4);
}
const allConfirmed = () => PATHS.every(P => P.status === "confirmed");
/* 每條路的「入口」：events 裡標 gate: true 的那一項；沒有標就用第一項。入口過了 = 今年已截止 */
const gateOf = P => P.events.find(e => e.gate) || P.events[0];
function roadTime(id, ref = TODAY) {
  const e = gateOf(PMAP[id]), s = toDate(e.from), en = toDate(e.to || e.from);
  if (ref > en) return { st: "missed", e, days: daysBetween(en, ref) };
  if (ref >= s) return { st: "open", e, days: daysBetween(ref, en) };
  return { st: "soon", e, days: daysBetween(ref, s) };
}
const missed = id => roadTime(id).st === "missed";
const SOON_DAYS = 30;
function timeBadge(id) {
  const t = roadTime(id);
  if (t.st === "missed") return `<em class="tbadge missed">⛔ 今年已截止（${md(toDate(t.e.to || t.e.from))}）</em>`;
  if (t.st === "open") return `<em class="tbadge open">🔥 ${esc(t.e.what)}中・剩 ${t.days} 天</em>`;
  if (t.days <= SOON_DAYS) return `<em class="tbadge soon">⏳ ${t.days} 天後開始${esc(t.e.what)}</em>`;
  return "";
}
const timeText = id => { const t = roadTime(id);
  return t.st === "missed" ? `今年已截止（${evRange(t.e)}）` : t.st === "open" ? `「${t.e.what}」進行中，剩 ${t.days} 天` : `${t.days} 天後開始「${t.e.what}」（${evRange(t.e)}）`; };
const dataExpired = () => PATHS.every(P => toDate(P.events[P.events.length - 1].to || P.events[P.events.length - 1].from) < TODAY);
const estNote = () => allConfirmed() ? "" : `<div class="note-est">📅 ${esc(D.meta.cycle)}：${esc(D.meta.note)}</div>`;

/* ---------------- 推薦排序（與原版相同） ---------------- */
function recommend() {
  const fit = id => { const t = PMAP[id].tags || []; return t.length && S.willing.length ? t.filter(x => S.willing.includes(x)).length / t.length : 0; };
  // later 的道路（例如進修部），玩家沒選相關意願時排到最後
  const pushBack = id => { const l = PMAP[id].later; return !!l && !(typeof l === "string" ? S.willing.includes(l) : fit(id)); };
  return passable().map(id => ({ id, s: (elig(id).st === "g" ? 2 : 1) + fit(id) * 3 - (pushBack(id) ? 10 : 0) - (missed(id) ? 20 : 0) })).sort((a, b) => b.s - a.s).map(x => x.id);
}
const liveRec = () => recommend().filter(id => !missed(id));

/* ---------------- 身分與徽章 ---------------- */
function idName() {
  const p = S.p;
  let n = p.vgen === "yes" ? "高職附設普通科" : { gen: "高中普通科", comp: "綜合高中", voc: "高職" }[p.type] || "高中職";
  if (p.type === "comp") n += p.track === "pro" ? "（專門學程）" : p.track === "aca" ? "（學術學程）" : "";
  if (p.art === "yes") n += "（藝術群）";
  return n + (p.grad === "past" ? "・已畢業" : p.grad === "now" ? "・應屆" : "");
}
const idDone = () => S.p.grad !== undefined;
const badgeOf = () => { const b = T.badges; return S.p.art === "yes" ? b.art : b[S.p.type] || b.unk; };

/* ---------------- 共用 UI ---------------- */
function toast(t) { const box = $("#toasts"); while (box.children.length >= 3) box.firstElementChild.remove(); const el = document.createElement("div"); el.className = "toast"; el.textContent = t; box.append(el); setTimeout(() => el.remove(), 2200); }
function setScene(html) { stage.innerHTML = `<div class="scr">${html}</div>`; stage.scrollTop = 0; $("#panel").scrollTop = 0; }
const STG = T.stages, LAST = STG.length - 1;
const ALT = [420, 1260, 2380, 3952];   // 海拔（山頂取玉山 3952 公尺）
let narrated = -1;                    // 這一關的旁白是否已經出現過
const stageHead = i => `<div class="stghead"><span class="stgico" aria-hidden="true">${STG[i].icon}</span><div><small>第 ${i + 1} 關・${esc(STG[i].title)}</small><b>${esc(STG[i].mission)}</b></div></div>`;
const narrBox = t => `<div class="narr"><span class="guide" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#FFC93C"/><circle cx="20" cy="22" r="11" fill="#FFD3B0"/><path d="M8 19 Q9 7 20 7 Q31 7 32 19 Q26 13 20 14 Q13 14 8 19Z" fill="#E8463C"/><circle cx="16" cy="22" r="1.6" fill="#1B1B3A"/><circle cx="24" cy="22" r="1.6" fill="#1B1B3A"/><path d="M16 27 Q20 30 24 27" stroke="#B0573A" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></span><p>${esc(t)}</p></div>`;
/* 選擇題：單選回傳 opts[i].v；multi 回傳選到的 v 陣列（值為 none 的選項與其他互斥） */
function choose(q, opts, cfg = {}) {
  const i = cfg.stage ?? curStage();
  const showNarr = narrated !== i; narrated = i;
  setScene(`${stageHead(i)}${showNarr && cfg.narr !== false ? narrBox(STG[i].narr) : ""}${cfg.top || ""}
    <h2 class="q">${esc(q)}</h2>${cfg.sub ? `<p class="qsub">${esc(cfg.sub)}</p>` : ""}
    <div class="opts ${cfg.cols ? "cols" : ""}" role="${cfg.multi ? "group" : "list"}">${opts.map((o, k) => `<button class="opt" data-k="${k}" ${cfg.multi ? `aria-pressed="${(cfg.preset || []).includes(o.v)}"` : ""}>
      <span class="ic" aria-hidden="true">${o.icon || ""}</span><span class="lb">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</span>${cfg.multi ? `<span class="tick" aria-hidden="true"></span>` : ""}</button>`).join("")}</div>
    ${cfg.multi ? `<button class="cta" data-ok ${(cfg.preset || []).length || cfg.allowEmpty ? "" : "disabled"}>${esc(cfg.okLabel || "確定")}</button>` : ""}
    ${cfg.foot || ""}`);
  const box = stage.querySelector(".opts"), ok = stage.querySelector("[data-ok]");
  const first = box.querySelector("button"); if (first) first.focus({ preventScroll: true });
  return new Promise(res => {
    const sel = () => [...box.querySelectorAll('[aria-pressed="true"]')].map(b => opts[+b.dataset.k].v);
    box.addEventListener("click", e => {
      const b = e.target.closest(".opt"); if (!b) return;
      const o = opts[+b.dataset.k];
      if (!cfg.multi) { b.classList.add("picked"); return res(o.v); }
      const on = b.getAttribute("aria-pressed") !== "true";
      if (on && o.v === "none") box.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-pressed", "false"));
      if (on && o.v !== "none") box.querySelectorAll(".opt").forEach(x => { if (opts[+x.dataset.k].v === "none") x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", String(on));
      if (ok) ok.disabled = !cfg.allowEmpty && !sel().length;
      cfg.onChange && cfg.onChange(sel());
    });
    if (ok) ok.onclick = () => res(sel());
  });
}

/* ---------------- HUD：關卡進度、海拔、工具列 ---------------- */
function curStage() { return S.done ? LAST : S.step < STEPS.length ? STEPS[S.step].stage : LAST; }
const canBack = () => H.some(e => STEPS[e.i] && !STEPS[e.i].auto);
function hud() {
  const c = curStage();
  $("#pips").innerHTML = STG.map((g, i) => `<li class="${i < c || S.done ? "done" : i === c ? "now" : ""}" title="第 ${i + 1} 關・${esc(g.title)}"><span aria-hidden="true">${i < c || S.done ? "✔" : g.icon}</span><b>${esc(g.title)}</b></li>`).join("");
  $("#alt").innerHTML = `<small>海拔</small><b>${(S.done ? ALT[LAST] : ALT[c]).toLocaleString()}</b><small>m</small>`;
  $("#btnBack").disabled = !canBack() || S.done;
}
function showHud(on) { $("#hud").hidden = !on; $("#alt").hidden = !on; document.body.classList.toggle("title", !on); if (on) hud(); }

/* 依目前進度擺好地圖（上一步、續玩、重新整理時用） */
function lightMap() {
  const m = {};
  for (const P of PATHS) {
    if (S.known) m[P.id] = elig(P.id).st;
    else if (idDone()) { const st = elig(P.id).st; m[P.id] = st === "r" ? "?" : st; }  // 只確認身分時，先亮可以走／待確認，不先判定不符合
    else m[P.id] = "?";
  }
  return m;
}
function syncScene(stepIdx) {
  SC.avatar(S.avatar);
  const c = S.done ? LAST : stepIdx < STEPS.length ? STEPS[stepIdx].stage : LAST;
  SC.place(c >= LAST ? "summit" : c === 2 ? "cliff" : c === 1 ? "camp" : "base");
  SC.badge(idDone() ? badgeOf().icon : "");
  SC.chest(S.known);
  SC.routes(lightMap());
  if (c === 2) SC.cable(myRoads());
}

/* ---------------- Overlay：圖鑑、未來城市、通用視窗 ---------------- */
const ov = $("#overlay");
function sheet(title, body, onClose) {
  ov.hidden = false;
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2><button class="x" aria-label="關閉">✕</button></header><div class="sb">${body}</div></div>`;
  const close = () => { ov.hidden = true; ov.innerHTML = ""; onClose && onClose(); };
  ov.querySelector(".x").onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.querySelector(".x").focus();
  return { el: ov.querySelector(".sb"), close, top: () => { ov.querySelector(".sheet").scrollTop = 0; } };
}
function closeOverlay() { ov.hidden = true; ov.innerHTML = ""; }

function roadRow(id, opt = {}) {
  const P = PMAP[id], e = S.known ? elig(id) : null, mis = missed(id);
  return `<button class="road${mis ? " is-missed" : ""}" style="--c:${P.color}" data-road="${id}">
    <span class="ic">${P.icon}</span><span class="t"><b>${opt.role ? `<span class="role">${opt.role}</span>` : ""}${esc(P.road)}</b><span>${esc(opt.why && e ? e.why : `${P.name}・${P.exam.label}`)}</span>${timeBadge(id)}</span>
    ${e ? `<span class="light ${e.st}" title="${ST_TXT[e.st]}" aria-label="${ST_TXT[e.st]}"></span>` : `<span class="light u" aria-hidden="true"></span>`}</button>`;
}

/* 可拖曳的一年時間軸（與原版相同） */
function yearTimeline(host, ids, cfg = {}) {
  const evs = ids.flatMap(id => PMAP[id].events.map(e => ({ P: PMAP[id], e, mi: monthIdx(toDate(e.from)) })));
  const cell = (id, mi) => PMAP[id].events.filter(e => monthIdx(toDate(e.from)) === mi)
    .map(e => `<span class="mk" style="--c:${PMAP[id].color}" title="${esc(e.what)}">${esc(e.what)}</span>`).join("");
  host.innerHTML = `<div class="ytl">
    <div class="ystrip" tabindex="0" aria-label="一年時間軸，可以左右拖曳">
      <div class="ygrid" style="grid-template-columns:86px repeat(12,112px)">
        <div class="yh lab">月份</div>${MONTHS.map((M, i) => `<button class="yh" data-mi="${i}">${M.m}月${i === GRAD_IDX ? " 🎓" : ""}</button>`).join("")}
        ${ids.map(id => `<div class="yl lab" style="--c:${PMAP[id].color}">${PMAP[id].icon} ${esc(PMAP[id].road.replace("之路", ""))}</div>${MONTHS.map((M, i) => `<div class="yc" data-mi="${i}">${cell(id, i)}</div>`).join("")}`).join("")}
      </div>
    </div>
    <div class="yslider-wrap"><span class="small">${MONTHS[0].m}月</span><input type="range" class="yslider" min="0" max="11" step="1" value="${cfg.idx || 0}" aria-label="拖曳選擇月份"><span class="small">${MONTHS[11].m}月</span></div>
    <div class="ymonth" aria-live="polite"></div></div>`;
  const strip = host.querySelector(".ystrip"), slider = host.querySelector(".yslider"), out = host.querySelector(".ymonth");
  const set = (i) => {
    i = +i; slider.value = i;
    host.querySelectorAll("[data-mi]").forEach(el => { const mi = +el.dataset.mi; el.classList.toggle("on", mi === i); el.classList.toggle("past", mi < i); });
    const col = host.querySelector(`.yh[data-mi="${i}"]`);
    if (col) strip.scrollTo({ left: col.offsetLeft - 86 - (strip.clientWidth - 86 - 112) / 2, behavior: RM ? "auto" : "smooth" });
    const list = evs.filter(x => x.mi === i).sort((a, b) => a.e.from.localeCompare(b.e.from));
    out.innerHTML = `<div class="ym-h">${MONTHS[i].y}年 ${MONTHS[i].m}月${i === GRAD_IDX ? "・🎓 畢業典禮" : ""}</div>` + (list.length ? list.map(x =>
      `<div class="ym-e" style="--c:${x.P.color}"><div class="dt">${evRange(x.e)}</div><div><b>${x.P.icon} ${esc(x.e.what)}</b> <span class="small muted">${esc(x.P.road)}</span>${tipFor(x.e.what) ? `<div class="tip">👉 ${esc(tipFor(x.e.what))}</div>` : ""}</div></div>`).join("")
      : `<div class="small muted">這個月，這些道路沒有重要時程。${i === GRAD_IDX ? "好好享受畢業典禮！" : ""}</div>`);
  };
  slider.addEventListener("input", () => set(slider.value));
  host.querySelectorAll(".yh[data-mi]").forEach(b => b.onclick = () => set(b.dataset.mi));
  let down = false, sx = 0, sl = 0;
  strip.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") return; down = true; sx = e.clientX; sl = strip.scrollLeft; strip.classList.add("drag"); });
  addEventListener("pointermove", e => { if (down) strip.scrollLeft = sl - (e.clientX - sx); });
  addEventListener("pointerup", () => { down = false; strip.classList.remove("drag"); });
  requestAnimationFrame(() => set(cfg.idx || 0));
  return { set };
}
/* 直式完整時間軸（以真實的今天計算） */
function eventListHTML(ids) {
  const all = ids.flatMap(id => PMAP[id].events.map(e => ({ P: PMAP[id], e }))).sort((a, b) => a.e.from.localeCompare(b.e.from));
  let marked = false;
  return `<div class="tlv">${all.map(({ P, e }) => {
    const s = toDate(e.from), en = toDate(e.to || e.from); let cls = "", tag = "";
    if (TODAY > en) { cls = "past"; tag = "已結束"; }
    else if (TODAY >= s) { cls = "now"; tag = `進行中・剩 ${daysBetween(TODAY, en)} 天`; }
    else { tag = `還有 ${daysBetween(TODAY, s)} 天`; if (!marked) { cls = "next"; marked = true; tag = "下一步・" + tag; } }
    return `<div class="tli ${cls}" style="--c:${P.color}"><div class="d">${evRange(e)}<span class="s">${tag}</span></div><div class="w">${P.icon} ${esc(e.what)} <span class="small muted">${esc(P.road)}</span></div>${tipFor(e.what) ? `<div class="h">👉 ${esc(tipFor(e.what))}</div>` : ""}</div>`;
  }).join("")}</div>`;
}
/* ---------------- 學生暨家長聯合說明會（admissions.js 的 contact.parentSession） ---------------- */
const PS = D.contact.parentSession;
const psEvent = () => PS && PS.date ? { from: PS.date, to: PS.to || "", what: PS.title } : null;
const psActive = () => { if (!PS) return false; const e = psEvent(); return !e || toDate(e.to || e.from) >= TODAY; };
/* 有日期時，把說明會當成一條「虛擬道路」放進時間軸（只給時間軸用，不影響資格與推薦） */
if (psEvent()) PMAP.__ps = { id: "__ps", icon: "👨‍👩‍👧", road: "聯合說明會", color: "#FFC93C", status: "confirmed", url: PS.url, events: [{ ...psEvent(), what: PS.title + (PS.place ? `（${PS.place}）` : "") }] };
const withPS = ids => PMAP.__ps && psActive() ? [...ids, "__ps"] : ids;
function parentHTML(cls = "") {
  if (!psActive()) return "";
  const e = psEvent(), d = e ? (TODAY < toDate(e.from) ? `還有 ${daysBetween(TODAY, toDate(e.from))} 天` : "就是今天！") : "";
  return `<div class="parent ${cls}"><div class="ps-ic" aria-hidden="true">👨‍👩‍👧</div><div><b>${esc(PS.title)}</b>
    ${e ? `<span class="ps-d">📅 ${evRange(e)}${PS.place ? `・${esc(PS.place)}` : ""}・${d}</span>` : ""}
    <p>${esc(PS.text)}</p>${PS.url ? `<a href="${esc(PS.url)}" target="_blank" rel="noopener">看說明會資訊・報名 ›</a>` : ""}</div></div>`;
}

/* ---------------- 加入手機行事曆 ----------------
 * 1. 下載 .ics 檔（iPhone、電腦、多數 Android 行事曆都能匯入，提前 3 天提醒）
 * 2. 每一筆都可以「＋Google 日曆」（Android 的 Google 日曆 App 不能直接匯入 .ics，用這個最穩）
 * 3. 在 LINE／FB／IG 內建瀏覽器裡無法下載檔案，會提示改用手機瀏覽器開啟 */
const UA = navigator.userAgent;
const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/.test(UA);
const IN_LINE = / Line\//i.test(UA), IN_APP = IN_LINE || /FBAN|FBAV|Instagram|MicroMessenger/i.test(UA);
const pad2 = n => String(n).padStart(2, "0"), ymd = d => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
function calEvents(ids) {
  const list = ids.flatMap(id => PMAP[id].events.map((e, k) => ({ P: PMAP[id], e, k, uid: `${id}-${k}` })));
  const pe = psEvent(); if (pe && psActive()) list.push({ P: { icon: "👨‍👩‍👧", road: "正修", url: PS.url, status: "confirmed" }, e: pe, k: 0, uid: "parent-session", ps: true });
  return list.filter(x => toDate(x.e.to || x.e.from) >= TODAY).sort((a, b) => a.e.from.localeCompare(b.e.from));
}
const evTitle = x => x.ps ? `${x.P.icon} ${x.e.what}` : `${x.P.icon} ${x.P.road}：${x.e.what}${x.e.confirmed || x.P.status === "confirmed" ? "" : "（推估）"}`;
const evDesc = x => x.ps ? `${PS.text}${PS.place ? "\n地點：" + PS.place : ""}\n${PS.url || ""}` : `${tipFor(x.e.what)}\n${x.e.confirmed || x.P.status === "confirmed" ? "" : D.meta.note + "\n"}${x.P.url}`;
const evEnd = e => { const d = toDate(e.to || e.from); d.setDate(d.getDate() + 1); return d; };   // 全天事件：結束日是隔天
function gcalURL(x) {
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(evTitle(x)) +
    `&dates=${ymd(toDate(x.e.from))}/${ymd(evEnd(x.e))}&details=` + encodeURIComponent(evDesc(x)) + (x.ps && PS.place ? "&location=" + encodeURIComponent(PS.place) : "");
}
/* iCalendar 每行最多 75 bytes，超過要折行（行首加空白），iPhone 行事曆對這點比較嚴格 */
function icsFold(line) {
  const enc = new TextEncoder(); let out = "", cur = "", n = 0, lim = 75;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > lim) { out += cur + "\r\n "; cur = ""; n = 1; lim = 75; } cur += ch; n += b; }
  return out + cur;
}
function buildICS(ids) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const escI = t => String(t).replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CSU//dream-summit//ZH-TW", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escI(`我的升學時間軸 ${D.meta.cycle}`)}`, "X-WR-TIMEZONE:Asia/Taipei"];
  const evs = calEvents(ids);
  evs.forEach(x => L.push("BEGIN:VEVENT", `UID:${x.uid}-${x.e.from}@dream-summit.csu`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(toDate(x.e.from))}`, `DTEND;VALUE=DATE:${ymd(evEnd(x.e))}`,
    `SUMMARY:${escI(evTitle(x))}`, `DESCRIPTION:${escI(evDesc(x))}`, ...(x.ps && PS.place ? [`LOCATION:${escI(PS.place)}`] : []), "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:升學提醒", "TRIGGER:-P3D", "END:VALARM", "END:VEVENT"));
  L.push("END:VCALENDAR");
  return { text: L.map(icsFold).join("\r\n") + "\r\n", count: evs.length };
}
function downloadICS(ids) {
  const { text, count } = buildICS(ids);
  if (!count) { toast("這些道路今年的時程都已經過了"); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  a.download = "我的升學時間軸.ics"; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(`📅 已下載 ${count} 筆行程，點開檔案就能加入行事曆`);
}
async function openInBrowser() {
  save();
  const base = location.href.split("#")[0].replace(/[?&]openExternalBrowser=1/, ""), sep = base.includes("?") ? "&" : "?";
  location.href = `${base}${sep}openExternalBrowser=1#save=${await makeCode()}`;
}
function openCalendar(ids) {
  const evs = calEvents(ids);
  const how = IS_IOS ? "iPhone：按下載後點「打開」，在預覽畫面點「加入全部」。"
    : IS_ANDROID ? "Android：下載後點開檔案選「行事曆」；如果沒有出現加入的選項，請用下方每一筆的「＋Google 日曆」。"
    : "電腦：下載後點兩下檔案，就會加入 Outlook、Apple 行事曆或 Google 日曆（匯入）。";
  const s = sheet("📅 加入手機行事曆", `${parentHTML()}
    ${IN_APP ? `<div class="inapp">⚠️ 你現在是在 ${IN_LINE ? "LINE" : "App"} 的內建瀏覽器，這裡不能下載行事曆檔。
      ${IN_LINE ? `<button class="cta" id="extOpen">🌐 用手機瀏覽器開啟（進度會一起帶過去）</button>` : `<br>請點右上角「⋯」選「用瀏覽器開啟」，或改用下方的「＋Google 日曆」。`}</div>` : ""}
    <button class="cta" id="icsDl" ${evs.length ? "" : "disabled"}>📥 下載行事曆檔（${evs.length} 筆・提前 3 天提醒）</button>
    <p class="small muted">${how}</p>
    ${allConfirmed() ? "" : `<p class="small muted">標「推估」的日期依去年簡章推算，正式日期以簡章為準，公告後請再確認一次。</p>`}
    <h3 class="subh">或一筆一筆加入 Google 日曆</h3>
    ${evs.length ? `<div class="gcal">${evs.map(x => `<div class="gc-r${x.ps ? " ps" : ""}" style="--c:${x.ps ? "#FFC93C" : x.P.color}"><div><span class="dt">${evRange(x.e)}</span><b>${esc(evTitle(x))}</b></div><a class="gc-a" href="${esc(gcalURL(x))}" target="_blank" rel="noopener">＋Google 日曆</a></div>`).join("")}</div>` : `<p class="muted">這些道路今年的時程都已經過了。</p>`}`);
  $("#icsDl").onclick = () => downloadICS(ids);
  if ($("#extOpen")) $("#extOpen").onclick = openInBrowser;
  return s;
}

/* 完整升學管道圖鑑：道路卡＋一年時間軸＋每條路的完整資訊 */
function openDex(focusId, tab = "cards") {
  const known = S.known, st = { tab, mine: false };
  const ids = () => PATHS.map(P => P.id).filter(id => !st.mine || elig(id).st !== "r");
  const tabs = () => `<div class="tabs"><button class="tab" data-t="cards" aria-pressed="${st.tab === "cards"}">📇 道路卡</button><button class="tab" data-t="cal" aria-pressed="${st.tab === "cal"}">📅 一年時間軸</button>${known ? `<button class="tab" data-m aria-pressed="${st.mine}">${st.mine ? "✅" : "☐"} 只看我能走的</button>` : ""}</div>`;
  const list = () => {
    if (st.tab === "cal") { s.el.innerHTML = `${estNote()}${tabs()}<p class="small muted" style="margin:0 0 6px">左右拖曳看整年；拉動下方滑桿，看每個月要做什麼。</p><div id="dexTl"></div>`; yearTimeline($("#dexTl"), ids(), { idx: monthIdx(TODAY) }); }
    else s.el.innerHTML = `${estNote()}${tabs()}<p class="small muted" style="margin:0 0 8px">共 ${PATHS.length} 條升學道路${known ? "　🟢可以走 🟡需要確認 🔴目前不符合" : "　完成寶物關後會顯示你的資格燈號"}</p><div class="roads">${ids().map(id => roadRow(id)).join("")}</div>`;
  };
  const s = sheet("🗺️ 完整升學管道圖鑑", "");
  const showDetail = id => {
    const P = PMAP[id], e = known ? elig(id) : null, nx = nextEvent(P);
    s.el.innerHTML = `<button class="opt quiet" data-back style="margin-bottom:10px">← 回到所有道路</button>
      <div class="card" style="border-left:8px solid ${P.color}"><h3>${P.icon} ${esc(P.road)}</h3><div class="meta">${esc(P.name)}</div></div>
      ${e ? `<div class="status"><span class="light ${e.st}"></span><span><b>${ST_TXT[e.st]}</b>　${esc(e.why)}</span></div>` : ""}
      <div class="status tstat ${roadTime(id).st}">📅 <span>今天 ${md(TODAY)}：<b>${esc(timeText(id))}</b>${missed(id) ? "<br>今年來不及了，不用再為它準備；下一學年度再留意。" : ""}</span></div>
      <div class="detail">
        <section><h4>適合誰</h4>${esc(P.who)}</section>
        <section><h4>基本條件</h4><ul>${P.conditions.map(c => `<li>${esc(c)}</li>`).join("")}</ul></section>
        <section><h4>要考試嗎？</h4><b>${esc(P.exam.label)}</b>　${esc(P.exam.detail)}</section>
        <section><h4>要準備什麼</h4><ul>${P.prep.map(c => `<li>${esc(c)}</li>`).join("")}</ul></section>
        <section><h4>重要時間 ${P.status !== "confirmed" ? `<span class="badge est">推估</span>` : ""}<span class="small muted" style="font-weight:400">　倒數以今天日期計算</span></h4>
          ${P.events.map(ev => { const past = toDate(ev.to || ev.from) < TODAY, isNext = nx && nx.e === ev;
            return `<div class="ev ${isNext ? "next" : ""} ${past ? "past" : ""}"><span class="dt">${evRange(ev)}</span><span>${esc(ev.what)}${ev.confirmed ? `<span class="badge">已公告</span>` : ""}${isNext ? `<span class="badge">${nx.live ? `進行中・剩 ${nx.days} 天` : `還有 ${nx.days} 天`}</span>` : ""}</span></div>`; }).join("")}</section>
        <section><h4>可能遇到的問題</h4><ul>${P.pitfalls.map(c => `<li>${esc(c)}</li>`).join("")}</ul></section>
        <section><h4>在正修</h4>${esc(P.csu)}${briefingHTML([id])}</section>
      </div>
      <a class="cta" href="${esc(P.url)}" target="_blank" rel="noopener">查看完整資訊（正式招生網站）</a>
      ${QR[P.url] ? `<div class="qrrow">${qrHTML(P.url, "用手機掃描，看完整資訊")}</div>` : ""}`;
    s.top();
  };
  s.el.addEventListener("click", ev => {
    const t = ev.target.closest("[data-t]"), m = ev.target.closest("[data-m]"), back = ev.target.closest("[data-back]"), b = ev.target.closest("[data-road]");
    if (t) { st.tab = t.dataset.t; list(); } else if (m) { st.mine = !st.mine; list(); } else if (back) list(); else if (b) showDetail(b.dataset.road);
  });
  if (focusId) showDetail(focusId); else list();
}
function worldHTML(w) {
  return `<p class="muted" style="margin:0 0 8px">${w.icon} ${esc(w.line)}</p><div class="roads">${w.depts.map(d =>
    `<div class="dept"><b>${esc(d.name)}</b>${d.check ? ` <span class="chip warn">資料確認中</span>` : ""}<p>${esc(d.learn)}</p><div class="jobs">${d.jobs.map(j => `<span class="chip">${esc(j)}</span>`).join("")}</div>
     <div style="margin-top:6px"><a href="${esc(deptLink(d))}" target="_blank" rel="noopener" class="small deptlink">了解這個系 ›</a></div></div>`).join("")}</div>`;
}
function openCity() {
  const link = window.CSU_DEPT_LINK || D.contact.site;
  const grid = () => `<p class="city-lead">選一個你有興趣的專業，看看正修有哪些科系</p><div class="worlds">${W.map(w =>
    `<button class="world ${S.world === w.id ? "on" : ""}" data-w="${w.id}"><span class="ic">${w.icon}</span><b>${esc(w.name)}</b><span>${w.depts.length} 個科系</span></button>`).join("")}</div>
    <a class="cta" href="${esc(link)}" target="_blank" rel="noopener">科系探索：把興趣與升學對焦</a>
    <figure class="cityart"><img src="assets/future-city.jpg" alt="正修各專業的學科交織：工程、科技、設計、餐旅、商管、照護、觀光與電競的人們" loading="lazy" width="384" height="575" onerror="this.parentNode.classList.add('noimg');this.remove()"></figure>`;
  const s = sheet("🔍 科系探索鏡：正修專業", grid());
  s.el.addEventListener("click", e => {
    const b = e.target.closest("[data-w]"), back = e.target.closest("[data-back]"), pick = e.target.closest("[data-pick]");
    if (back) { s.el.innerHTML = grid(); return; }
    if (pick) { S.world = pick.dataset.pick; save(); toast("🎯 已設成夢想方向"); s.el.innerHTML = grid(); return; }
    if (b) { const w = W.find(x => x.id === b.dataset.w); s.el.innerHTML = `<button class="opt quiet" data-back style="margin-bottom:10px">← 回到所有專業</button><h3 class="wh">${w.icon} ${esc(w.name)}</h3>${worldHTML(w)}
      <button class="cta ghost" data-pick="${w.id}">${S.world === w.id ? "✔ 這是我的夢想方向" : "設成我的夢想方向"}</button>`; s.top(); }
  });
}

/* ---------------- 🎒 背包：所有裝備隨時可用 ---------------- */
const LINKS = { dept: () => window.CSU_DEPT_LINK || D.contact.site, visit: () => D.contact.visit || D.contact.site, line: () => D.contact.line };
const EQ = id => T.equipment.find(e => e.id === id);
function useEquip(id) {
  const e = EQ(id); if (!e) return;
  const [kind, arg] = e.use.split(":");
  if (kind === "link") {
    if (arg === "line") return sheet(`${e.icon} ${e.item}`, `<p>有問題請提出！加入正修官方 LINE@（不是群組）將有一對一的專人回答。</p>
      <a class="cta line" href="${esc(LINKS.line())}" target="_blank" rel="noopener">💬 加入正修官方LINE${esc(D.contact.lineId)}</a>
      <a class="cta ghost" href="${esc(D.contact.telLink || "#")}">📞 ${esc(D.contact.tel)}</a>
      <div class="qrrow">${qrHTML(LINKS.line(), "正修官方LINE@")}</div>`);
    return window.open(LINKS[arg](), "_blank", "noopener");
  }
  if (kind === "dex") return openDex();
  if (kind === "city") return openCity();
  if (kind === "elig") return openElig();
  if (kind === "time") return openTime();
  if (kind === "seniors") return openSeniors();
}
const toolBtn = e => `<button class="tool" data-eq="${e.id}"><span class="ic">${e.icon}</span><span class="t"><b>${esc(e.item)}</b><span>${esc(e.label)}</span></span><span class="go">使用 ›</span></button>`;
function openBag() {
  const s = sheet("🎒 冒險背包", `<p class="small muted" style="margin:0 0 10px">每一件裝備都能隨時使用，玩完後也可以回來查。</p><div class="roads">${T.equipment.map(toolBtn).join("")}</div>`);
  s.el.addEventListener("click", ev => { const b = ev.target.closest("[data-eq]"); if (b) useEquip(b.dataset.eq); });
}
function openElig() {
  if (!S.known) return sheet("📜 資格卷軸", `<p>完成「寶物關」之後，卷軸上就會出現你每條路的資格燈號與原因。</p>`);
  const order = { g: 0, y: 1, r: 2 }, ids = PATHS.map(P => P.id).sort((a, b) => order[elig(a).st] - order[elig(b).st]);
  const s = sheet("📜 資格卷軸", `<p class="small muted" style="margin:0 0 8px">${esc(idName())}　🟢可以走 🟡需要確認 🔴目前不符合</p><div class="roads">${ids.map(id => roadRow(id, { why: true })).join("")}</div>
    <p class="small muted">${esc(D.meta.sameEducationNote)}</p>`);
  s.el.addEventListener("click", ev => { const b = ev.target.closest("[data-road]"); if (b) openDex(b.dataset.road); });
}
function openTime() {
  const ids = myRoads().length ? myRoads() : (S.known ? recommend().slice(0, 3) : PATHS.slice(0, 3).map(P => P.id));
  sheet("⏰ 時間警報器", `${parentHTML()}${estNote()}<p class="small muted" style="margin:0 0 6px">${myRoads().length ? "你選的攻頂路線" : "建議先看的道路"}：拖曳看整年，拉滑桿看每個月要做什麼。</p><div id="tmTl"></div>
    <button class="cta" id="tmIcs">📅 加入手機行事曆（提前 3 天提醒）</button>
    <h3 class="subh">完整時間軸</h3>${eventListHTML(withPS(ids))}`);
  yearTimeline($("#tmTl"), withPS(ids), { idx: monthIdx(TODAY) });
  $("#tmIcs").onclick = () => openCalendar(ids);
}
function openSeniors() {
  const s = sheet("🗺️ 學長姐的手繪地圖", `<div class="roads">${T.seniorStories.map(x => `<div class="card"><div class="face">${x.face}</div><div class="meta">${esc(x.who)}</div>
    <p class="quote">「${esc(x.text)}」</p>${x.paths.filter(id => PMAP[id]).map(id => `<button class="opt quiet" data-road="${id}">${PMAP[id].icon} 看看${esc(PMAP[id].road)}</button>`).join("")}</div>`).join("")}</div>`);
  s.el.addEventListener("click", ev => { const b = ev.target.closest("[data-road]"); if (b) openDex(b.dataset.road); });
}

/* ===================================================================
 *  主線四關
 *  每個 step 都可以「上一步」回來重選；auto: true = 展示畫面，上一步時跳過
 * =================================================================== */
const SKIP = "__skip__";
/* 第 1、2 關的單選題：直接讀 admissions.js 的 questions（含 when 條件與 set 改寫） */
function qStep(q, stg) {
  return { stage: stg, fn: async () => {
    if (q.when && !match(q.when, S.p)) return SKIP;
    const j = await choose(q.text, q.opts.map((o, i) => ({ ...o, v: i })), { stage: stg, cols: q.opts.length >= 4 });
    const o = q.opts[j]; S.p[q.id] = o.v; if (o.set) Object.assign(S.p, o.set);
    const L = T.loot[q.id]; if (L) { toast(`${L.icon} 取得${L.name}`); SC.burst("camp"); }
  } };
}
/* 第 2 關：把所有「可複選」的寶物題合併成一個寶箱畫面（各題仍分開存，none 只和同一題互斥） */
const MULTI = D.questions.filter(q => q.stage === "backpack" && q.multi);
async function stLoot() {
  const qs = MULTI.filter(q => !q.when || match(q.when, S.p)); if (!qs.length) return SKIP;
  const i = 1, showNarr = narrated !== i; narrated = i;
  setScene(`${stageHead(i)}${showNarr ? narrBox(STG[i].narr) : ""}<h2 class="q">打開寶箱：你有哪些戰績和特別經歷？</h2><p class="qsub">每一組都至少選一個；沒有就選「都沒有」，不確定也可以選。</p>
    ${qs.map(q => `<fieldset class="lootset" data-q="${q.id}"><legend>${T.loot[q.id] ? `${T.loot[q.id].icon} ` : ""}${esc(q.text)}</legend>
      <div class="opts cols">${q.opts.map((o, k) => `<button class="opt" data-k="${k}" aria-pressed="${(S.p[q.id] || []).includes(o.v)}"><span class="ic" aria-hidden="true">${o.icon}</span><span class="lb">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</span><span class="tick" aria-hidden="true"></span></button>`).join("")}</div></fieldset>`).join("")}
    <button class="cta" data-ok disabled>收進背包</button>`);
  const ok = stage.querySelector("[data-ok]");
  const val = q => [...stage.querySelectorAll(`[data-q="${q.id}"] [aria-pressed="true"]`)].map(b => q.opts[+b.dataset.k].v);
  const upd = () => { ok.disabled = !qs.every(q => val(q).length); };
  upd();
  await new Promise(res => {
    stage.querySelectorAll(".lootset").forEach(fs => fs.addEventListener("click", e => {
      const b = e.target.closest(".opt"); if (!b) return;
      const q = MULTI.find(x => x.id === fs.dataset.q), o = q.opts[+b.dataset.k], on = b.getAttribute("aria-pressed") !== "true";
      fs.querySelectorAll(".opt").forEach(x => { const v = q.opts[+x.dataset.k].v; if (on && (o.v === "none" ? v !== "none" : v === "none")) x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", String(on)); upd();
    }));
    ok.onclick = res;
  });
  qs.forEach(q => { S.p[q.id] = val(q); });
  toast(`${T.loot.skills.icon} 取得${T.loot.skills.name}・${T.loot.special.icon} ${T.loot.special.name}`);
  SC.burst("camp");
}
/* 第 2 關最後：願意準備的事（只影響推薦順序，不影響資格；可以不選） */
async function stWilling() {
  const top = `<div class="willpanel" id="wp" aria-live="polite"></div>`;
  const p = choose("想帶哪些攀登裝備上山？（可複選，也可以跳過）", D.willing.map(w => ({ v: w.id, icon: w.icon, label: w.label })),
    { stage: 1, multi: true, cols: true, allowEmpty: true, preset: S.willing, okLabel: "就帶這些，開寶箱！", sub: "選你願意多準備的事，路線推薦會跟著調整；不會影響資格判斷。", foot: top,
      onChange: sel => drawWill(sel) });
  const drawWill = sel => {
    const wp = $("#wp"); if (!wp) return;
    const roads = passable().filter(id => (PMAP[id].tags || []).some(t => sel.includes(t)));
    wp.innerHTML = sel.length ? `<div class="wp-h">對應到這些可能適合你的路線</div><div class="wp-roads">${roads.map(id => `<span class="wp-r" style="--c:${PMAP[id].color}">${PMAP[id].icon} ${esc(PMAP[id].road)}</span>`).join("") || `<span class="small">（和你目前的路線關係不大，也沒關係）</span>`}</div>` : "";
  };
  drawWill(S.willing);
  S.willing = await p;
  if (S.willing.length) toast(`${T.loot.willing.icon} 取得${T.loot.willing.name} ×${S.willing.length}`);
}

/* 關卡之間：獎勵＋下一關旁白（按鈕立即可按，動畫不擋操作） */
async function stageIntro(from, to) {
  narrated = to;
  let reward = "", go = `前往${STG[to].title}`;
  if (to === 1) {
    const b = badgeOf(), m = lightMap(), lit = Object.values(m).filter(x => x !== "?").length;
    SC.badge(b.icon); SC.routes(m); SC.walk("camp").then(() => SC.burst("camp"));
    reward = `<div class="reward"><div class="medal" aria-hidden="true">${b.icon}</div><div><small>取得角色徽章</small><b>${esc(b.name)}</b><span>${esc(idName())}</span></div></div>
      <p class="lit">山路兩側有 <b>${lit}</b> 條路線先亮了起來！完成寶物關，就能看清每條路線的資格。</p>`;
  } else if (to === 2) {
    S.known = true; save();
    const m = lightMap(), n = st => Object.values(m).filter(x => x === st).length;
    SC.routes(m); SC.walk("ledge").then(() => { SC.chest(true); SC.burst("ledge"); });
    reward = `<div class="reward chest"><div class="medal" aria-hidden="true">🧰</div><div><small>寶箱打開了！</small><b>路線解鎖成功</b><span>${esc(idName())}</span></div></div>
      <div class="tally"><span class="g">🟢 可以走 <b>${n("g")}</b></span><span class="y">🟡 需要進一步確認 <b>${n("y")}</b></span><span class="r">🔴 目前不符合 <b>${n("r")}</b></span></div>
      <p class="small muted">「需要進一步確認」不是不符合，只是還要向學校或正修確認一項條件。</p>`;
    go = "前往飛索台";
  } else if (from === null) {
    SC.focus(to === 1 ? "camp" : "cliff");
  }
  setScene(`${stageHead(to)}${reward}${narrBox(STG[to].narr)}<button class="cta" data-go>${esc(go)} ▶</button>`);
  const btn = stage.querySelector("[data-go]"); btn.focus({ preventScroll: true });
  await new Promise(r => btn.onclick = r);
}

/* 第 3 關：飛索與彈射選路 */
function routeCard(id, picks) {
  const P = PMAP[id], e = elig(id), mode = P.exam.need ? T.modes.exam : T.modes.noexam, k = picks.indexOf(id), dead = missed(id);
  return `<div class="route ${dead ? "dead" : ""}" style="--c:${P.color}">
    <button class="rpick" data-pick="${id}" aria-pressed="${k >= 0}" ${dead ? "disabled" : ""}>
      <span class="rmode ${P.exam.need ? "exam" : "free"}">${mode.icon} ${esc(mode.name)}・${esc(P.exam.label)}</span>
      <span class="rname"><span class="ric">${P.icon}</span><span>${esc(P.road)}<small>${esc(P.name)}</small></span></span>
      <span class="rst ${e.st}">${ST_DOT[e.st]} <b>${ST_TXT[e.st]}</b>　${esc(e.why)}</span>
      <span class="rprep"><b>下一步準備：</b>${esc(P.prep.slice(0, 2).join("、"))}${P.prep.length > 2 ? "…" : ""}</span>
      ${timeBadge(id)}
      <span class="rrole">${k >= 0 ? ROLE[k] : dead ? "今年已截止" : "點選加入"}</span>
    </button>
    <button class="rinfo" data-info="${id}" aria-label="${esc(P.road)}完整資訊">完整資訊</button></div>`;
}
async function stRoutes() {
  S.main = S.backup = S.alt = "";
  const i = 2, showNarr = narrated !== i; narrated = i;
  SC.walk("cliff");
  const live = liveRec(), main = live.slice(0, 4), more = live.slice(4), gone = passable().filter(missed);
  const picks = [];
  const render = (showMore) => {
    setScene(`${stageHead(i)}${showNarr ? narrBox(STG[i].narr) : ""}
      <h2 class="q">${live.length ? "點選想挑戰的路線（最多 3 條）" : "你可以走的路，今年都已經截止了"}</h2>
      <p class="qsub">${live.length ? "依序成為主攻、備選、備援；再點一次可以取消。🚡 飛索＝要考試，🚀 彈射台＝免考試。" : "建議先問學校老師或正修 LINE@，也可以直接攻頂看完整攻略卡。"}</p>
      <div class="slots">${ROLE.map((r, k) => { const id = picks[k]; return `<div class="slot ${id ? "on" : ""}" style="${id ? `--c:${PMAP[id].color}` : ""}"><small>${r}</small><b>${id ? `${PMAP[id].icon} ${esc(PMAP[id].road)}` : "？"}</b></div>`; }).join("")}</div>
      <div class="routes">${main.map(id => routeCard(id, picks)).join("")}</div>
      ${more.length || gone.length ? (showMore
        ? `<h3 class="subh">其他可以考慮的路線</h3><div class="routes">${more.map(id => routeCard(id, picks)).join("")}${gone.map(id => routeCard(id, picks)).join("")}</div>`
        : `<button class="cta ghost" data-more>🧭 查看其他路線（${more.length + gone.length}）</button>`) : ""}
      <p class="small muted">目前不符合的路線，可以在 <button class="linkbtn" data-dex>🗺️ 完整升學管道圖鑑</button> 看原因。</p>
      <div class="dock"><button class="cta" data-go ${picks.length ? "" : "disabled"}>🚀 彈射攻頂</button>${picks.length ? "" : `<button class="linkbtn" data-skip>先不選，直接攻頂看攻略卡</button>`}</div>`);
  };
  let showMore = false; render(false);
  await new Promise(res => {
    stage.onclick = e => {
      if (!stage.contains(e.target)) return;   // 上一個畫面的按鈕（已被換掉）冒泡上來的點擊，不算
      const pk = e.target.closest("[data-pick]"), inf = e.target.closest("[data-info]");
      if (inf) return openDex(inf.dataset.info);
      if (e.target.closest("[data-dex]")) return openDex();
      if (e.target.closest("[data-more]")) { showMore = true; const y = $("#panel").scrollTop; render(true); $("#panel").scrollTop = y; return; }
      if (e.target.closest("[data-go]") || e.target.closest("[data-skip]")) { stage.onclick = null; return res(); }
      if (pk && !pk.disabled) {
        const id = pk.dataset.pick, k = picks.indexOf(id);
        if (k >= 0) { picks.splice(k, 1); SC.cable(picks); toast("已取消這條路線"); }
        else if (picks.length >= 3) { toast("最多 3 條，先取消一條再選"); return; }
        else { picks.push(id); SC.zip(id).then(() => SC.cable(picks)); toast(`${T.modes[PMAP[id].exam.need ? "exam" : "noexam"].icon} ${ROLE[picks.length - 1]}：${PMAP[id].road}`); }
        const y = $("#panel").scrollTop; render(showMore); $("#panel").scrollTop = y;
      }
    };
  });
  [S.main, S.backup, S.alt] = [picks[0] || "", picks[1] || "", picks[2] || ""];
}
/* 第 4 關：彈射登頂、正修之門開啟（按鈕立刻可按） */
async function stSummit() {
  narrated = LAST;
  SC.summit();
  setScene(`${stageHead(LAST)}<div class="summitban" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${(i % 6) * 40}ms;--c:${["#FFC93C", "#19C6C0", "#FF6FB5", "#4C8DFF", "#9C6BFF", "#FF8A1F"][i % 6]}"></i>`).join("")}
      <div class="sb-av">${SC.avatarSVG(S.avatar)}</div><b>攻頂成功！</b><small>海拔 3,952 m・正修之門已開啟</small></div>${narrBox(STG[LAST].narr)}
    <button class="cta big" data-go>🏆 打開我的攻略卡</button>
    <button class="linkbtn replay" data-replay>🎆 再看一次攻頂動畫</button>`);
  stage.querySelector("[data-replay]").onclick = () => SC.celebrate();
  const b = stage.querySelector("[data-go]"); b.focus({ preventScroll: true });
  await new Promise(r => b.onclick = r);
}

const STEPS = [
  ...D.questions.filter(q => q.stage === "create").map(q => qStep(q, 0)),
  ...D.questions.filter(q => q.stage === "backpack" && !q.multi).map(q => qStep(q, 1)),
  { stage: 1, fn: stLoot },
  { stage: 1, fn: stWilling },
  { stage: 2, fn: stRoutes },
  { stage: 3, fn: stSummit, auto: true }
];

/* ===================================================================
 *  流程控制：run（往前走）、goBack（上一步）
 * =================================================================== */
async function run(from, opt = {}) {
  const my = ++RUN; closeOverlay(); showHud(true); syncScene(from); stage.onclick = null;
  let i = from;
  narrated = -1;
  if (opt.intro && i < STEPS.length && STEPS[i].stage > 0 && STEPS[i].stage < LAST) { S.step = i; hud(); await stageIntro(null, STEPS[i].stage); if (my !== RUN) return; }
  while (i < STEPS.length) {
    const st = STEPS[i];
    S.step = i; hud(); save();
    const snap = JSON.stringify(S);
    const r = await st.fn();
    if (my !== RUN) return;
    if (r !== SKIP) { H.push({ i, s: snap }); if (H.length > H_MAX) H.shift(); }
    i++;
    if (i < STEPS.length && STEPS[i].stage !== st.stage && STEPS[i].stage < LAST) {
      S.step = i; save(); hud();
      await stageIntro(st.stage, STEPS[i].stage);
      if (my !== RUN) return;
    }
  }
  S.done = true; S.step = STEPS.length; save();
  guideCard();
}
function goBack() {
  if (!canBack()) return;
  let e;
  while (H.length) { e = H.pop(); if (!STEPS[e.i].auto) break; }
  try { S = JSON.parse(e.s); } catch (err) { return; }
  S.done = false;
  toast("↩ 回到上一步，可以重新選擇");
  run(e.i);
}
/* 攻略卡上「重新選路線」：回到飛索選路（有紀錄就用當時的狀態） */
function replan() {
  const k = STEPS.findIndex(x => x.fn === stRoutes), at = H.findIndex(e => e.i === k);
  if (at >= 0) { try { S = JSON.parse(H[at].s); H = H.slice(0, at); } catch (e) {} }
  S.done = false; S.main = S.backup = S.alt = "";
  run(k);
}

/* ---------------- 暫存：本機自動存檔＋續玩連結 ---------------- */
const b64u = {
  enc: u8 => { let s = ""; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec: t => { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; const s = atob(t); return Uint8Array.from(s, c => c.charCodeAt(0)); }
};
async function pipe(u8, Stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream("deflate-raw"))).arrayBuffer()); }
async function makeCode() {
  const raw = new TextEncoder().encode(JSON.stringify({ S, H: H.slice(-H_MAX) }));
  if (window.CompressionStream) { try { return "z" + b64u.enc(await pipe(raw, CompressionStream)); } catch (e) {} }
  return "p" + b64u.enc(raw);
}
async function readCode(code) {
  code = String(code || "").trim().replace(/^.*#save=/, "");
  const kind = code[0], body = b64u.dec(code.slice(1));
  const u8 = kind === "z" ? await pipe(body, DecompressionStream) : body;
  const d = JSON.parse(new TextDecoder().decode(u8));
  const st = d && d.S ? d.S : d, hist = d && Array.isArray(d.H) ? d.H : [];
  if (!st || st.v !== VER) throw new Error("bad");
  return { S: st, H: hist };
}
const linkFor = code => location.href.split("#")[0] + "#save=" + code;
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = t; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {} ta.remove(); return ok;
  }
}
const timeTxt = ms => { if (!ms) return "還沒有"; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function whereTxt() { const c = curStage(); return S.done ? "已攻頂・攻略卡" : `第 ${c + 1} 關・${STG[c].title}`; }
function openSave() {
  const s = sheet("💾 暫存進度", `<div class="card"><div class="meta">目前進度</div><b>${esc(whereTxt())}</b>
      <div class="small muted">每走一步都會自動存在這台裝置。最後暫存：<span id="svT">${timeTxt(S.saved)}</span></div></div>
    <button class="cta" id="svNow">💾 立即暫存</button>
    <h3 class="subh">換手機、換電腦接著玩</h3>
    <p class="small muted" style="margin:0 0 8px">複製「續玩連結」傳到 LINE 或記事本，之後在任何裝置打開連結，就能從這裡繼續，「↩ 上一步」也一起帶走。</p>
    <p class="small muted" style="margin:0 0 8px">⚠️ 在 LINE、IG 裡直接開啟遊戲時，關掉視窗可能會清掉暫存，建議先複製續玩連結。</p>
    <button class="cta ghost" id="svLink">🔗 複製續玩連結</button>
    <input class="input" id="svOut" readonly hidden aria-label="續玩連結">
    <details class="svin"><summary>📥 我有續玩連結，要接著玩</summary>
      <textarea class="input" id="svIn" rows="3" placeholder="把續玩連結貼在這裡"></textarea>
      <button class="cta" id="svLoad">載入進度</button></details>
    <button class="cta ghost" id="svHome">🏠 回到標題畫面（進度會保留）</button>`);
  $("#svNow").onclick = () => { save(); $("#svT").textContent = timeTxt(S.saved); toast("💾 已暫存"); };
  $("#svLink").onclick = async () => { save(); const url = linkFor(await makeCode()); const out = $("#svOut"); out.hidden = false; out.value = url; out.select();
    toast(await copyText(url) ? "🔗 已複製續玩連結" : "請長按上方連結複製"); };
  $("#svLoad").onclick = async () => {
    try { const d = await readCode($("#svIn").value); s.close(); startFrom(d.S, d.H); }
    catch (e) { toast("⚠️ 連結不完整，請再複製一次"); }
  };
  $("#svHome").onclick = () => { save(); s.close(); title(); };
}
function startFrom(state, hist = []) {
  S = state; H = hist; save();
  toast("📥 已載入進度");
  if (S.done || S.step >= STEPS.length) { S.done = true; showHud(true); syncScene(STEPS.length); guideCard(); }
  else run(S.step, { intro: true });
}

/* 回來玩的人：先提醒「你的路線」今天的狀態 */
function remindHTML(sv) {
  let h = "";
  if (dataExpired()) h += `<div class="remind warn">⚠️ 這份招生資料（${esc(D.meta.cycle)}）的日期都已經過了，等學校更新下一學年度資料後再來玩，結果會更準。</div>`;
  if (!sv) return h;
  const ids = myRoads(); if (!ids.length) return h;
  const rows = ids.map((id, i) => { const t = roadTime(id); return `<div class="rm-r ${t.st}"><span>${ROLE[i]}・${PMAP[id].icon} ${esc(PMAP[id].road)}</span><b>${t.st === "missed" ? "⛔ 已截止" : t.st === "open" ? `🔥 報名中・剩 ${t.days} 天` : `⏳ ${t.days} 天後開始`}</b></div>`; }).join("");
  return h + `<div class="remind"><div class="rm-h">📅 今天 ${md(TODAY)}，你的攻頂路線</div>${rows}${ids.some(missed) ? `<div class="small">有路線已經截止了，打開攻略卡可以「重新選路線」。</div>` : ""}</div>`;
}

/* ===================================================================
 *  標題畫面
 * =================================================================== */
async function title() {
  const my = ++RUN; closeOverlay();
  const sv = load();
  S = sv ? sv.S : fresh(); H = sv ? sv.H : [];
  showHud(false); narrated = -1;
  SC.place("base"); SC.badge(""); SC.chest(false); SC.routes({}); SC.overview();
  const going = sv && !S.done && (S.step > 0 || H.length);
  setScene(`<header class="logo"><h1><span class="l1">夢想攻頂！</span><span class="l2">正修冒險隊</span></h1><p class="tag">${esc(T.tagline)}</p></header>
    ${narrBox(T.opening)}
    ${remindHTML(sv)}
    ${going || (sv && S.done) ? "" : `<fieldset class="avpick"><legend>選一位冒險者</legend><div class="avs" role="radiogroup" aria-label="選擇角色">${SC.AVATARS.map((a, i) => `<button class="av" role="radio" data-av="${a.id}" aria-checked="${i === 0}">${SC.avatarSVG(a.id)}<span>${esc(a.name)}</span></button>`).join("")}</div></fieldset>
    <label class="namebox"><span>冒險者代號（可不填）</span><input class="input" id="nm" maxlength="12" placeholder="例如：阿翔、小魚" autocomplete="off"></label>`}
    <div class="startbtns">${going
      ? `<button class="cta big" data-go="resume">繼續冒險（${esc(whereTxt())}）</button><button class="cta ghost" data-go="new">重新開始</button>`
      : sv && S.done ? `<button class="cta big" data-go="guide">查看我的攻略卡</button><button class="cta ghost" data-go="new">重新探索</button>`
      : `<button class="cta big" data-go="new">🧗 出發冒險</button>`}</div>
    <div class="route-preview" aria-label="四個關卡">${STG.map((g, i) => `<span><i aria-hidden="true">${g.icon}</i>${esc(g.title)}</span>`).join('<em aria-hidden="true"></em>')}</div>
    <p class="howto">4 關・約 3 分鐘。隨時可以 ↩ 上一步、💾 暫存、🎒 打開背包。</p>
    <div class="titlelinks"><button class="linkbtn" data-go="dex">🗺️ 先看完整升學管道圖鑑</button><a class="linkbtn" href="${esc(D.contact.site)}" target="_blank" rel="noopener">🏫 正修官方招生資訊</a><button class="linkbtn" data-go="code">📥 我有續玩連結</button></div>
    <p class="today">📅 今天 ${TODAY.getFullYear()}/${md(TODAY)} ${esc(clockNote())}・${esc(D.meta.cycle)}</p>`);
  const box = stage;
  let pickAv = "cap"; SC.avatar(going || (sv && S.done) ? S.avatar : pickAv);
  const avs = box.querySelector(".avs");
  if (avs) avs.addEventListener("click", e => { const b = e.target.closest("[data-av]"); if (!b) return;
    avs.querySelectorAll("[data-av]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
    pickAv = b.dataset.av; SC.avatar(pickAv); SC.burst("base"); SC.focus("base"); });
  box.querySelector(".startbtns button").focus({ preventScroll: true });
  for (;;) {
    const go = await new Promise(r => box.onclick = e => { const b = stage.contains(e.target) && e.target.closest("[data-go]"); if (b) r(b.dataset.go); });
    if (my !== RUN) return;
    if (go === "dex") { openDex(); continue; }
    if (go === "code") { openSave(); const d = ov.querySelector("details"); if (d) d.open = true; continue; }
    box.onclick = null;
    if (go === "new") { if ((going || (sv && S.done)) && !confirm("確定要重新開始嗎？目前的進度會被清除。")) { continue; } const nm = ($("#nm") || {}).value || ""; wipe(); S = fresh(); S.name = nm.trim(); S.avatar = pickAv; H = []; return run(0); }
    if (go === "guide") { showHud(true); syncScene(STEPS.length); return guideCard(); }
    if (go === "resume") { toast("歡迎回來！"); return run(S.step, { intro: true }); }
  }
}

/* ===================================================================
 *  🏆 我的攻頂攻略卡
 * =================================================================== */
/* 我要準備：依主攻、備選、備援分開；後面的道路只列「前面沒有的」項目 */
function prepGroups(ids) {
  const seen = new Set(), chosen = myRoads().length > 0, key = t => t.replace(/（.*?）/g, "").trim();
  let briefed = false;
  return ids.map((id, i) => {
    const P = PMAP[id], items = P.prep.filter(t => !seen.has(key(t))), shared = P.prep.length - items.length;
    P.prep.forEach(t => seen.add(key(t)));
    const brief = !!P.portfolio && !briefed; if (brief) briefed = true;
    return { id, P, role: chosen ? ROLE[i] : "建議", items, shared, first: i === 0, brief };
  });
}
function guideData() {
  const roads = myRoads();
  const ids = roads.length ? roads : (S.known ? liveRec().slice(0, 3) : []);
  const rank = id => { const k = roads.indexOf(id); return k < 0 ? 9 : k; };
  const consider = passable().filter(id => elig(id).st === "g" && !missed(id)).sort((a, b) => rank(a) - rank(b));
  const pending = passable().filter(id => elig(id).st === "y" && !missed(id)).sort((a, b) => rank(a) - rank(b));
  const gone = passable().filter(missed);
  const nx = ids.map(id => ({ P: PMAP[id], n: nextEvent(PMAP[id]) })).filter(x => x.n).sort((a, b) => a.n.days - b.n.days)[0];
  const next = nx ? `${nx.n.live ? `進行中・剩 ${nx.n.days} 天` : `${nx.n.days} 天後`}：${nx.P.icon} ${nx.P.road}「${nx.n.e.what}」（${evRange(nx.n.e)}）` : ids.length ? "本學年度時程已過，留意下一年度簡章" : "先打開圖鑑，挑一條路看看";
  return { roads, ids, consider, pending, gone, next, nx, badge: badgeOf(), w: W.find(x => x.id === S.world) };
}
const roleOf = id => { const k = myRoads().indexOf(id); return k >= 0 ? ROLE[k] : ""; };
function guideItem(id, kind) {
  const P = PMAP[id], e = elig(id), nx = nextEvent(P), r = roleOf(id);
  return `<div class="gitem ${kind}" style="--c:${P.color}">
    <div class="gi-h"><span class="ric">${P.icon}</span><div><b>${r ? `<span class="role">${r}</span>` : ""}${esc(P.road)}</b><small>${esc(P.name)}</small></div><span class="exam ${P.exam.need ? "need" : "free"}">${esc(P.exam.label)}</span></div>
    <div class="gi-b">${kind === "y" ? "🟡 <b>待確認：</b>" : "✔ "}${esc(e.why)}</div>
    <div class="gi-c"><b>主要條件：</b>${esc(P.conditions.join("；"))}</div>
    ${nx ? `<div class="gi-n">⏭️ ${nx.live ? `「${esc(nx.e.what)}」進行中，剩 ${nx.days} 天` : `${nx.days} 天後：${esc(nx.e.what)}（${evRange(nx.e)}）`}</div>` : ""}
    <button class="linkbtn" data-road="${id}">完整資訊 ›</button></div>`;
}
function guideCard() {
  RUN++; S.done = true; showHud(true); closeOverlay(); hud(); narrated = -1; stage.onclick = null;
  const g = guideData(), groups = prepGroups(g.ids);
  const gone = g.ids.filter(missed), urgent = g.ids.filter(id => { const t = roadTime(id); return t.st !== "missed" && t.days <= (t.st === "open" ? SOON_DAYS : 14); });
  const alert = gone.length || urgent.length ? `<div class="galert ${gone.length ? "warn" : ""}">
      <div class="ga-h">📅 今天 ${TODAY.getFullYear()}/${md(TODAY)} 的提醒</div>
      ${gone.map(id => `<div>⛔ ${PMAP[id].icon} ${esc(PMAP[id].road)}：${esc(timeText(id))}，不用再為它準備了。</div>`).join("")}
      ${urgent.map(id => `<div>🔥 ${PMAP[id].icon} ${esc(PMAP[id].road)}：${esc(timeText(id))}</div>`).join("")}</div>` : "";
  setScene(`<div class="guide" id="guide">
    <div class="g-top"><div class="g-medal" aria-hidden="true">${SC.avatarSVG(S.avatar)}<span class="g-badge">${g.badge.icon}</span></div><div><small>我的攻頂攻略卡</small><h2>${esc(S.name || "冒險者")}</h2><p>${esc(g.badge.name)}・${esc(idName())}</p></div></div>
    ${alert}
    <div class="g-plan">${ROLE.map((r, k) => { const id = g.roads[k]; return `<div class="slot ${id ? "on" : ""}" style="${id ? `--c:${PMAP[id].color}` : ""}"><small>${r}</small><b>${id ? `${PMAP[id].icon} ${esc(PMAP[id].road)}` : "—"}</b></div>`; }).join("")}</div>
    <div class="g-next"><b>⏭️ 下一步</b><span>${esc(g.next)}</span><small>以今天 ${md(TODAY)} 計算</small></div>
    ${parentHTML("in-card")}
    ${g.w ? `<div class="g-next"><b>🎯 夢想方向</b><span>${g.w.icon} ${esc(g.w.name)}</span></div>` : ""}
    <h3 class="gh">✅ 依目前資料可考慮的管道 <span class="cnt">${g.consider.length}</span></h3>
    ${g.consider.length ? g.consider.map(id => guideItem(id, "g")).join("") : `<p class="small muted">目前沒有確定可以走的路線，先看下方待確認的條件。</p>`}
    ${g.pending.length ? `<h3 class="gh">🟡 尚待確認的條件 <span class="cnt">${g.pending.length}</span></h3><p class="small muted">這些路線不是不符合，只是還有一項條件要向你的學校或正修招生處確認。</p>${g.pending.map(id => guideItem(id, "y")).join("")}` : ""}
    ${g.gone.length ? `<div class="gone small"><b>⛔ 今年已截止：</b>${g.gone.map(id => `${PMAP[id].icon}${esc(PMAP[id].road)}`).join("、")}</div>` : ""}
    <p class="small muted">${esc(D.meta.sameEducationNote)}</p>
    ${g.ids.length ? `<h3 class="gh">📋 我要準備</h3><p class="prep-lead">先把${groups[0].role === "建議" ? "第一條路" : "主攻"}準備好就好；其他道路只列出還需要「額外」準備的東西。</p>
    ${groups.map(gp => `<div class="pgroup ${gp.first ? "main" : "sub"}" style="--c:${gp.P.color}">
      <div class="pg-h"><span class="role">${gp.role}</span>${gp.P.icon} ${esc(gp.P.road)}${gp.first ? "" : `<span class="pg-n">${gp.items.length ? `再多 ${gp.items.length} 項` : "不用另外準備"}</span>`}</div>
      ${gp.items.length ? `<ul class="preps">${gp.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${gp.shared ? `<div class="pg-shared">✔ 另有 ${gp.shared} 項和前面的道路共用，不用重複準備</div>` : ""}
      ${gp.brief ? briefingHTML(g.ids, "in-paper") : ""}</div>`).join("")}
    <h3 class="gh">🗓️ 時間軸 ${allConfirmed() ? "" : `<span class="badge est">含推估</span>`}</h3>
    <div id="gTl"></div>${eventListHTML(withPS(g.ids))}
    <button class="cta small-cta" id="ics">📅 加入手機行事曆（提前 3 天提醒）</button>` : ""}
    <h3 class="gh">🎒 背包工具（隨時可用）</h3><div class="tools-grid">${T.equipment.map(e => `<button class="eqbtn" data-eq="${e.id}"><span>${e.icon}</span>${esc(e.item)}</button>`).join("")}</div>
    <p class="close">${esc(T.motto)}</p>
    ${guideQRs().length ? `<div class="qrrow">${guideQRs().map(([u, c]) => qrHTML(u, c)).join("")}</div>` : ""}
    <p class="foot">${esc(D.meta.cycle)}${allConfirmed() ? "" : "・日期含推估，以正式簡章為準"}　正修官方LINE${esc(D.contact.lineId)}・${esc(D.contact.tel)}</p></div>
    <div class="endbtns">
      <button class="cta ghost" id="replay">🎆 再看一次攻頂動畫</button>
      <button class="cta" id="dl">⬇️ 下載攻略卡圖片</button>
      <button class="cta ghost" id="dex">🗺️ 查看完整升學管道圖鑑</button>
      <a class="cta ghost" href="${esc(D.contact.site)}" target="_blank" rel="noopener">🏫 前往官方招生資訊</a>
      <button class="cta ghost" id="city">🏙️ 探索正修科系</button>
      <div class="row-btns"><button class="cta ghost" id="replan">✏️ 重新選路線</button><button class="cta ghost" id="again">🔄 重新探索</button></div>
    </div>`);
  if (g.ids.length) { yearTimeline($("#gTl"), withPS(g.ids), { idx: monthIdx(TODAY) }); $("#ics").onclick = () => openCalendar(g.ids); }
  stage.querySelectorAll("[data-eq]").forEach(b => b.onclick = () => useEquip(b.dataset.eq));
  stage.querySelectorAll(".gitem [data-road]").forEach(b => b.onclick = () => openDex(b.dataset.road));
  $("#dl").onclick = downloadCard;
  $("#replay").onclick = () => { SC.place("summit"); SC.celebrate(); if (matchMedia("(max-width:899px)").matches) $("#panel").scrollTo({ top: 0, behavior: "smooth" }); };
  $("#replan").onclick = replan; $("#dex").onclick = () => openDex(); $("#city").onclick = openCity;
  $("#again").onclick = () => { if (confirm("確定要重新探索嗎？目前的攻略會被清除。")) { wipe(); title(); } };
}

/* 攻略卡轉圖片（Canvas）：先畫內容，再依實際高度裝框 */
async function downloadCard() {
  const g = guideData(), Wd = 1080, pad = 84, c = document.createElement("canvas"), x = c.getContext("2d");
  c.width = Wd; c.height = 12000;
  const cs = getComputedStyle(document.body), disp = cs.getPropertyValue("--display"), sans = cs.getPropertyValue("--sans");
  const wrap = (t, maxW, font) => { x.font = font; const out = []; for (const para of String(t).split("\n")) { let line = ""; for (const ch of para) { if (x.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; } out.push(line); } return out; };
  const text = (t, X, y, font, color, lh, maxW = Wd - pad - X) => { const ls = wrap(t, maxW, font); x.font = font; x.fillStyle = color; ls.forEach((l, i) => x.fillText(l, X, y + i * lh)); return y + ls.length * lh; };
  const head = (t, y) => { x.textAlign = "left"; x.fillStyle = "#0E3B8C"; x.font = `900 40px ${disp}`; x.fillText(t, pad, y); x.fillStyle = "#FFC93C"; x.fillRect(pad, y + 14, 90, 6); return y + 64; };
  const ink = "#12305E", ink2 = "#4A5D85";
  const avImg = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(SC.avatarSVG(S.avatar)); });
  x.textAlign = "center"; x.font = `700 28px ${sans}`; x.fillStyle = "#B86E00"; x.fillText("夢想攻頂！正修冒險隊", Wd / 2, 106);
  // 角色頭像＋徽章
  x.beginPath(); x.arc(Wd / 2, 214, 84, 0, Math.PI * 2); const rg = x.createRadialGradient(Wd / 2 - 24, 190, 10, Wd / 2, 214, 84); rg.addColorStop(0, "#FFF6C9"); rg.addColorStop(1, "#FFC93C"); x.fillStyle = rg; x.fill();
  x.lineWidth = 8; x.strokeStyle = "#0E3B8C"; x.stroke();
  if (avImg) { x.save(); x.beginPath(); x.arc(Wd / 2, 214, 80, 0, Math.PI * 2); x.clip(); x.drawImage(avImg, Wd / 2 - 80, 140, 160, 176); x.restore(); }
  x.font = `48px ${sans}`; x.fillText(g.badge.icon, Wd / 2 + 70, 296);
  x.fillStyle = "#0E3B8C"; x.font = `900 66px ${disp}`; x.fillText("我的攻頂攻略卡", Wd / 2, 380);
  x.font = `600 34px ${sans}`; x.fillStyle = ink2; x.fillText(`${S.name || "冒險者"}・${g.badge.name}・${idName()}`, Wd / 2, 436);
  let y = 516; x.textAlign = "left";
  // 攻頂路線
  const slotW = (Wd - pad * 2 - 40) / 3;
  ROLE.forEach((r, k) => { const id = g.roads[k], X = pad + k * (slotW + 20);
    x.fillStyle = id ? PMAP[id].color : "#E6EEF9"; x.globalAlpha = id ? .16 : 1; x.fillRect(X, y - 44, slotW, 110); x.globalAlpha = 1;
    x.fillStyle = id ? PMAP[id].color : "#C9D5EA"; x.fillRect(X, y - 44, 8, 110);
    x.font = `700 24px ${sans}`; x.fillStyle = ink2; x.fillText(r, X + 24, y - 8);
    text(id ? `${PMAP[id].icon} ${PMAP[id].road}` : "—", X + 24, y + 34, `800 28px ${sans}`, ink, 34, slotW - 36); });
  y += 120;
  y = text(`⏭️ 下一步　${g.next}`, pad, y, `700 30px ${sans}`, ink, 42) + 30;
  if (psActive()) {
    const pe = psEvent(), top = y;
    y = text(`👨‍👩‍👧 ${PS.title}${pe ? `　📅 ${evRange(pe)}${PS.place ? "・" + PS.place : ""}` : ""}`, pad + 30, y + 12, `800 30px ${sans}`, "#7A4E00", 40);
    y = text(PS.text, pad + 30, y + 4, `26px ${sans}`, "#7A4E00", 36);
    if (PS.url) y = text(`報名・說明會資訊：${PS.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}${QR[PS.url] ? "（下方有 QR Code）" : ""}`, pad + 30, y + 4, `700 24px ${sans}`, "#8A4B00", 34);
    x.fillStyle = "#FFC93C"; x.fillRect(pad, top - 16, 10, y - top + 6); y += 40;
  }
  const block = (id, kind) => {
    const P = PMAP[id], e = elig(id), r = roleOf(id), top = y;
    y = text(`${P.icon} ${r ? `【${r}】` : ""}${P.road}（${P.name}）`, pad + 30, y, `800 32px ${sans}`, ink, 42);
    y = text(`${P.exam.label}｜${kind === "y" ? "待確認：" : ""}${e.why}`, pad + 30, y + 4, `28px ${sans}`, kind === "y" ? "#8A5A00" : "#1D6B4E", 38);
    y = text(`條件：${P.conditions.join("；")}`, pad + 30, y + 4, `24px ${sans}`, ink2, 34);
    x.fillStyle = P.color; x.fillRect(pad, top - 32, 10, y - top + 18); y += 34;
  };
  if (g.consider.length) { y = head("✅ 依目前資料可考慮的管道", y + 20); g.consider.forEach(id => block(id, "g")); }
  if (g.pending.length) { y = head("🟡 尚待確認的條件", y + 20); y = text("不是不符合，請向學校或正修招生處確認這一項條件。", pad, y, `26px ${sans}`, ink2, 36) + 20; g.pending.forEach(id => block(id, "y")); }
  if (g.gone.length) { y = text(`⛔ 今年已截止：${g.gone.map(id => PMAP[id].road).join("、")}`, pad, y + 10, `26px ${sans}`, "#B03A2E", 36) + 20; }
  if (g.ids.length) {
    y = head("📋 我要準備", y + 30);
    for (const gp of prepGroups(g.ids)) {
      const big = gp.first, fs = big ? 30 : 26, lh = big ? 42 : 36;
      x.fillStyle = gp.P.color; x.fillRect(pad, y - 30, 10, 40);
      y = text(`${gp.role}｜${gp.P.icon} ${gp.P.road}${gp.first ? "" : gp.items.length ? `（再多 ${gp.items.length} 項）` : "（不用另外準備）"}`, pad + 24, y, `800 ${big ? 32 : 28}px ${sans}`, ink, lh) + 4;
      for (const t of gp.items) { x.font = `${fs}px ${sans}`; x.fillStyle = ink; x.fillText("□", pad + 24, y); y = text(t, pad + 64, y, `${fs}px ${sans}`, big ? ink : ink2, lh) + 4; }
      if (gp.shared) y = text(`✔ 另有 ${gp.shared} 項和前面的道路共用`, pad + 24, y, `24px ${sans}`, "#1D6B4E", 34);
      if (gp.brief && D.contact.briefing) y = text(`💡 ${D.contact.briefing.text}`, pad + 24, y, `24px ${sans}`, "#8A5A00", 34);
      y += 22;
    }
    y = head(`🗓️ 時間軸${allConfirmed() ? "" : "（含推估）"}`, y + 30);
    const all = withPS(g.ids).flatMap(id => PMAP[id].events.map(e => ({ P: PMAP[id], e }))).sort((a, b) => a.e.from.localeCompare(b.e.from));
    for (const { P, e } of all) {
      const past = toDate(e.to || e.from) < TODAY;
      x.fillStyle = P.color; x.fillRect(pad, y - 26, 10, 34);
      x.fillStyle = past ? "#A3AEC4" : ink2; x.font = `800 28px ${sans}`; x.fillText(evRange(e), pad + 26, y);
      y = text(`${P.icon} ${e.what}`, pad + 250, y, `28px ${sans}`, past ? "#A3AEC4" : ink, 38) + 10;
    }
  }
  y += 40; x.textAlign = "center"; wrap(T.motto, Wd - pad * 2, `900 40px ${disp}`).forEach(l => { x.fillStyle = "#0E3B8C"; x.font = `900 40px ${disp}`; x.fillText(l, Wd / 2, y); y += 58; });
  const qrs = guideQRs(), imgs = await Promise.all(qrs.map(([u]) => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(QR[u]); })));
  if (qrs.length) {
    // 一列最多兩個 QR Code，間距拉開，避免手機相機同時掃到兩個
    const sz = 220, gap = 200, rowH = sz + 110; y += 10;
    for (let r = 0; r < qrs.length; r += 2) {
      const row = qrs.slice(r, r + 2), tot = row.length * sz + (row.length - 1) * gap; let qx = (Wd - tot) / 2;
      row.forEach(([u, cap], j) => { const im = imgs[r + j]; if (im) x.drawImage(im, qx, y, sz, sz); x.font = `24px ${sans}`; x.fillStyle = ink2;
        wrap(cap, sz + 60, `24px ${sans}`).forEach((l, k) => x.fillText(l, qx + sz / 2, y + sz + 36 + k * 30)); qx += sz + gap; });
      y += rowH;
    }
  }
  x.font = `24px ${sans}`; x.fillStyle = ink2;
  for (const l of [`${D.meta.cycle}${allConfirmed() ? "" : "・日期含推估，以正式簡章為準"}`, `正修官方LINE${D.contact.lineId}・${D.contact.tel}`]) { x.fillText(l, Wd / 2, y + 10); y += 36; }
  const Hh = y + 60, out = document.createElement("canvas"), o = out.getContext("2d");
  out.width = Wd; out.height = Hh;
  const gr = o.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, "#0B3A9A"); gr.addColorStop(1, "#19A7C6");
  o.fillStyle = gr; o.fillRect(0, 0, Wd, Hh); o.fillStyle = "#FFC93C"; o.fillRect(28, 28, Wd - 56, Hh - 56); o.fillStyle = "#FFFFFF"; o.fillRect(42, 42, Wd - 84, Hh - 84);
  o.drawImage(c, 0, 0);
  const a = document.createElement("a"); a.download = "我的攻頂攻略卡.png"; a.href = out.toDataURL("image/png"); a.click();
  toast("⬇️ 攻略卡圖片已下載");
}

/* ---------------- 啟動 ---------------- */
$("#btnDex").onclick = () => openDex();
$("#btnBag").onclick = openBag;
$("#btnBack").onclick = goBack;
$("#btnSave").onclick = openSave;
document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) { const x = ov.querySelector(".x"); if (x) x.click(); } });
async function boot() {
  if (!D || !W || !T || !SC) { stage.innerHTML = `<div class="card">資料檔沒有載入成功。請確認 data/admissions.js、data/departments.js、js/story.js、js/scene.js 都有上傳。</div>`; return; }
  SC.init($("#map"), PATHS);
  await syncClock();
  // 從「續玩連結」打開：載入進度後把網址上的進度碼清掉
  if (location.hash.startsWith("#save=")) {
    try { const d = await readCode(location.hash); S = d.S; H = d.H; save(); toast("📥 已載入續玩進度"); } catch (e) { toast("⚠️ 續玩連結不完整"); }
    history.replaceState(null, "", location.pathname + location.search);
  }
  await title();
}
boot();
})();
