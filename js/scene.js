/* =====================================================================
 *  夢想之山：scene.js
 *  純 SVG 繪製的 3D 卡通風山脈地圖、角色、飛索、彈射與正修之門。
 *  不使用任何外部圖片，所以不會有圖片載入失敗的問題。
 *  遊戲引擎（game.js）只透過 window.Scene 的幾個方法控制畫面：
 *    Scene.init(el, paths)      建立地圖
 *    Scene.place(node)          角色直接站到某個營地（不播動畫）
 *    Scene.walk(node)           角色走到某個營地
 *    Scene.routes(map)          路線浮島亮燈 { pathId: "g" | "y" | "r" | "?" }
 *    Scene.zip(pathId)          從飛索台滑到某條路線的浮島
 *    Scene.summit()             彈射登頂、正修之門開啟，接著播放攻頂慶祝
 *    Scene.celebrate()          重播攻頂慶祝（鏡頭推近、光束、歡呼、煙火、彩帶、登頂緞帶）
 *    Scene.avatar(id)           換角色（AVATARS 裡的 id）；Scene.avatarSVG(id) 產生角色頭像
 *    Scene.badge(icon)          角色胸口與營地旗子顯示徽章
 *    Scene.chest(open)          寶箱開／關
 *    Scene.burst(node|pathId)   閃光特效
 *  所有動畫都不會擋住操作；系統設定「減少動態效果」時直接跳到結果。
 * ===================================================================== */
(() => {
"use strict";
const NS = "http://www.w3.org/2000/svg";
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const WW = 600, WH = 900;                       // 世界座標大小
/* 營地位置（世界座標，角色腳底） */
const NODES = {
  base:   { x: 132, y: 836 },
  camp:   { x: 392, y: 724 },
  ledge:  { x: 196, y: 590 },
  cliff:  { x: 330, y: 446 },
  summit: { x: 300, y: 214 }
};
const ORDER = ["base", "camp", "ledge", "cliff", "summit"];
/* 山路：每段之間的轉折點，讓角色沿著山路走 */
const TRAIL = {
  "base-camp":   [[132, 836], [210, 812], [300, 790], [372, 752], [392, 724]],
  "camp-ledge":  [[392, 724], [350, 680], [270, 650], [214, 620], [196, 590]],
  "ledge-cliff": [[196, 590], [222, 540], [280, 510], [318, 478], [330, 446]],
  "cliff-summit":[[330, 446], [300, 380], [286, 310], [300, 214]]
};


/* ---------------- 可挑選的冒險者角色 ----------------
 * 改顏色、髮型或配件只要改這裡；id 會存進玩家進度。 */
const AVATARS = [
  { id: "cap",    name: "紅帽探險家", skin: "#FFD3B0", hair: "#3B2418", style: "cap",      hat: "#E8463C", jacket: "#1E5BD8", light: "#4C8DFF", scarf: "#19C6C0", pack: "#E6A100" },
  { id: "twin",   name: "雙馬尾登山客", skin: "#FFDDC2", hair: "#2A1A14", style: "pigtails", jacket: "#F2689B", light: "#FF9CC0", scarf: "#FFC93C", pack: "#19C6C0", ribbon: "#FFC93C" },
  { id: "brain",  name: "眼鏡學霸",   skin: "#F6CBA5", hair: "#16161F", style: "short",    jacket: "#2A3F8F", light: "#4A62C4", scarf: "#FFC93C", pack: "#E8463C", glasses: true },
  { id: "sport",  name: "熱血運動員", skin: "#E8B48A", hair: "#2B1B10", style: "spiky",    jacket: "#FF8A1F", light: "#FFB066", scarf: "#1E5BD8", pack: "#1E5BD8", band: "#E8463C" },
  { id: "artist", name: "創意設計師", skin: "#FFD9BE", hair: "#6B3A1E", style: "long",     jacket: "#8E5BE8", light: "#B48CFF", scarf: "#19C6C0", pack: "#FFC93C", beret: "#E8463C" },
  { id: "gamer",  name: "電競玩家",   skin: "#F3C7A3", hair: "#1A2240", style: "bob",      jacket: "#1B2B55", light: "#2F4A8A", scarf: "#19C6C0", pack: "#19C6C0", headset: "#19C6C0" }
];
const avOf = id => AVATARS.find(a => a.id === id) || AVATARS[0];
function heroSVG(a) {
  const back = a.style === "long" ? `<path d="M-11 -42 Q-12 -55 0 -55 Q12 -55 11 -42 L12 -24 Q0 -20 -12 -24Z" fill="${a.hair}"/>` : "";
  const hair = {
    cap: `<path d="M-10 -41 Q-11 -53 0 -53 Q11 -53 10 -43 Q6 -48 -1 -47 Q-6 -46 -10 -41Z" fill="${a.hair}"/><path d="M-10 -45 Q-2 -54 9 -48 L11 -45 Q2 -49 -9 -42Z" fill="${a.hat}"/><rect x="5" y="-48" width="9" height="3" rx="1.5" fill="#C9302A"/>`,
    pigtails: `<path d="M-10 -40 Q-11 -53 0 -53 Q11 -53 10 -41 Q5 -47 -2 -46 Q-7 -45 -10 -40Z" fill="${a.hair}"/><ellipse cx="-12.5" cy="-35" rx="4" ry="6" fill="${a.hair}"/><ellipse cx="12.5" cy="-35" rx="4" ry="6" fill="${a.hair}"/><circle cx="-11" cy="-41" r="2.2" fill="${a.ribbon}"/><circle cx="11" cy="-41" r="2.2" fill="${a.ribbon}"/>`,
    short: `<path d="M-10 -40 Q-11 -53 1 -53 Q11 -52 10 -42 Q7 -47 0 -46 L-4 -44 Q-8 -44 -10 -40Z" fill="${a.hair}"/>`,
    spiky: `<path d="M-10 -41 L-10 -50 L-6 -48 L-4 -56 L0 -50 L4 -56 L6 -49 L11 -52 L10 -42 Q4 -46 -10 -41Z" fill="${a.hair}"/>`,
    long: `<path d="M-10 -40 Q-11 -53 0 -53 Q11 -53 10 -40 Q8 -47 1 -47 Q-5 -46 -10 -40Z" fill="${a.hair}"/>`,
    bob: `<path d="M-11 -34 Q-13 -54 0 -54 Q13 -54 11 -34 L8 -34 Q9 -45 1 -46 Q-8 -45 -7 -34Z" fill="${a.hair}"/>`
  }[a.style] || "";
  const extra = (a.glasses ? `<circle cx="3" cy="-39" r="2.8" fill="none" stroke="#16161F" stroke-width="1.1"/><circle cx="8.6" cy="-39" r="2.8" fill="none" stroke="#16161F" stroke-width="1.1"/><path d="M5.8 -39 L5.8 -39.4" stroke="#16161F" stroke-width="1.1"/>` : "")
    + (a.band ? `<rect x="-10.5" y="-47" width="21" height="3.6" rx="1.8" fill="${a.band}"/><path d="M-10 -46 L-15 -43 L-14 -48Z" fill="${a.band}"/>` : "")
    + (a.beret ? `<ellipse cx="-1" cy="-51.5" rx="11" ry="4.6" fill="${a.beret}"/><circle cx="-1" cy="-56.5" r="1.6" fill="${a.beret}"/>` : "")
    + (a.headset ? `<path d="M-10 -42 Q-10 -56 0 -56 Q10 -56 10 -42" fill="none" stroke="#10182E" stroke-width="2.4"/><rect x="-12.5" y="-44" width="5" height="8" rx="2.5" fill="${a.headset}"/><path d="M-10 -37 Q-6 -31 0 -33" stroke="#10182E" stroke-width="1.4" fill="none"/>` : "");
  return `${back}
      <rect x="-6" y="-12" width="5" height="12" rx="2" fill="#203A7A"/><rect x="1" y="-12" width="5" height="12" rx="2" fill="#203A7A"/>
      <rect x="-7.5" y="-3" width="7" height="4" rx="2" fill="#FFC93C"/><rect x="0.5" y="-3" width="7" height="4" rx="2" fill="#FFC93C"/>
      <rect x="-13" y="-30" width="11" height="17" rx="4" fill="${a.pack}"/><rect x="-12" y="-27" width="9" height="5" rx="2" fill="#fff" opacity=".35"/>
      <rect x="-8" y="-31" width="16" height="20" rx="6" fill="${a.jacket}"/><path d="M-8 -26 Q-8 -31 -2 -31 L-2 -11 L-8 -11Z" fill="${a.light}"/>
      <g class="armUp" style="display:${hangOn ? "" : "none"}"><path d="M4 -28 L9 -46" stroke="${a.jacket}" stroke-width="5" stroke-linecap="round"/><path d="M-4 -28 L-1 -46" stroke="${a.jacket}" stroke-width="5" stroke-linecap="round"/><circle cx="9.5" cy="-47.5" r="2.6" fill="${a.skin}"/><circle cx="-1" cy="-47.5" r="2.6" fill="${a.skin}"/></g>
      <g class="armDown" style="display:${hangOn ? "none" : ""}"><path d="M7 -27 L11 -17" stroke="${a.jacket}" stroke-width="5" stroke-linecap="round"/><circle cx="11.5" cy="-15.5" r="2.6" fill="${a.skin}"/></g>
      <path d="M-8 -30 Q0 -26 8 -30 L8 -27 Q0 -23 -8 -27Z" fill="${a.scarf}"/><path class="scarf" d="M-6 -28 Q-16 -30 -22 -24 Q-15 -25 -8 -25Z" fill="${a.scarf}"/>
      <circle class="heroBadge" cx="3" cy="-19" r="4" fill="url(#gGold)" stroke="#fff" stroke-width="1" opacity="${badgeOn ? 1 : 0}"/>
      <circle cx="0" cy="-40" r="10" fill="${a.skin}"/><circle cx="-3" cy="-43" r="3.5" fill="#fff" opacity=".22"/>
      ${hair}
      <circle cx="3" cy="-39" r="1.5" fill="#1B1B3A"/><circle cx="7.5" cy="-39" r="1.5" fill="#1B1B3A"/><path d="M3 -35 Q5.5 -33 8 -35" stroke="#B0573A" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <circle cx="9" cy="-36" r="1.6" fill="#FF8A8A" opacity=".45"/>${extra}`;
}
/* 給標題畫面、攻略卡用的角色頭像（獨立的小 SVG） */
function avatarSVG(id, cls = "") {
  const a = avOf(id);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="-20 -60 40 44" aria-hidden="true">${heroSVG({ ...a }).replace(/class="heroBadge"[^/]*\/>/, "/>")}</svg>`;
}
let hangOn = false, badgeOn = false, avatarId = "cap";
let svg, cam = { x: WW / 2, y: WH - 220 }, cur = "base", heroPos = { ...NODES.base }, ISL = {}, PATHS = [];
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.append(n); return n; };
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
let tweenId = 0;
function tween(ms, fn, ez = ease, free = false) {
  const my = free ? -1 : ++tweenId;
  return new Promise(res => {
    if (RM || ms <= 0) { fn(1); return res(); }
    const t0 = performance.now();
    const step = now => {
      if (my !== -1 && my !== tweenId) { fn(1); return res(); }   // 被新動畫取代：直接到終點
      const t = Math.min(1, (now - t0) / ms); fn(ez(t));
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

/* ---------------- 鏡頭：手機只看角色附近，桌面看整座山 ---------------- */
let camTween = 0;
function viewFor(cx, cy, z = 1) {
  const box = svg.getBoundingClientRect(); const a = box.width / Math.max(1, box.height) || .7;
  // 直式或接近正方形的畫面（桌面、標題畫面）看整座山；扁長的手機地圖則放大跟著角色
  let vh = (a < 1.25 ? WH : Math.min(WH, WW * 1.12 / a)) / z, vw = vh * a;
  const minX = vw > WW ? -(vw - WW) / 2 : 0, maxX = vw > WW ? minX : WW - vw;
  const maxY = Math.max(0, WH - vh), minY = z > 1 ? -220 : 0;   // 慶祝時鏡頭可以往上看到天空裡的煙火
  return { x: Math.max(minX, Math.min(maxX, cx - vw / 2)), y: Math.max(minY, Math.min(maxY, cy - vh * .55)), w: vw, h: vh };
}
function setView(v) { svg.setAttribute("viewBox", `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`); }
function look(x, y, ms = 700, z = 1) {
  cam = { x, y, z };
  const to = viewFor(x, y, z), vb = svg.viewBox.baseVal, from = { x: vb.x, y: vb.y, w: vb.width || to.w, h: vb.height || to.h };
  const my = ++camTween;
  if (RM || ms <= 0 || !vb.width) return setView(to);
  const t0 = performance.now();
  const step = now => { if (my !== camTween) return; const t = ease(Math.min(1, (now - t0) / ms));
    setView({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t });
    if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------------- 繪圖 ---------------- */
const DEFS = `
<defs>
  <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0B3A9A"/><stop offset=".38" stop-color="#2A86EA"/><stop offset=".72" stop-color="#7FD3F7"/><stop offset="1" stop-color="#D4F6FF"/></linearGradient>
  <radialGradient id="gSun" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#FFFBE6"/><stop offset=".22" stop-color="#FFE38A" stop-opacity=".95"/><stop offset=".55" stop-color="#FFC93C" stop-opacity=".35"/><stop offset="1" stop-color="#FFC93C" stop-opacity="0"/></radialGradient>
  <linearGradient id="gLit" x1="0" y1="0" x2=".7" y2="1">
    <stop offset="0" stop-color="#6FE3D6"/><stop offset=".45" stop-color="#2FAFC9"/><stop offset="1" stop-color="#1F74C2"/></linearGradient>
  <linearGradient id="gShade" x1="1" y1="0" x2=".2" y2="1">
    <stop offset="0" stop-color="#2B6CC4"/><stop offset=".6" stop-color="#1B4F9E"/><stop offset="1" stop-color="#143C80"/></linearGradient>
  <linearGradient id="gFar1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AD7F7"/><stop offset="1" stop-color="#5FA9E8"/></linearGradient>
  <linearGradient id="gFar2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5C9FE6"/><stop offset="1" stop-color="#3876CF"/></linearGradient>
  <linearGradient id="gSnow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBEBFF"/></linearGradient>
  <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0A8"/><stop offset=".35" stop-color="#FFD042"/><stop offset=".75" stop-color="#F2A10F"/><stop offset="1" stop-color="#C77A00"/></linearGradient>
  <linearGradient id="gGoldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C77A00"/><stop offset=".3" stop-color="#FFE27A"/><stop offset=".55" stop-color="#FFC531"/><stop offset="1" stop-color="#B86E00"/></linearGradient>
  <radialGradient id="gPortal" cx=".5" cy=".7" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#B9FBFF"/><stop offset=".8" stop-color="#2BD4E0"/><stop offset="1" stop-color="#1590C9"/></radialGradient>
  <linearGradient id="gGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8CEB7E"/><stop offset="1" stop-color="#2FB06A"/></linearGradient>
  <linearGradient id="gRock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5873D6"/><stop offset="1" stop-color="#2C3E8F"/></linearGradient>
  <linearGradient id="gTrail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset="1" stop-color="#FFDB86"/></linearGradient>
  <radialGradient id="gGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF6C9" stop-opacity=".95"/><stop offset="1" stop-color="#FFC93C" stop-opacity="0"/></radialGradient>
  <radialGradient id="gGlowT" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#C9FFFB" stop-opacity=".95"/><stop offset="1" stop-color="#19C6C0" stop-opacity="0"/></radialGradient>
  <filter id="fShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0A2A66" flood-opacity=".35"/></filter>
  <filter id="fSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>`;

function cloud(x, y, s, cls = "") {
  return `<g class="cloud ${cls}" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="14" rx="66" ry="14" fill="#9CCBF2" opacity=".55"/>
    <circle cx="-38" cy="2" r="22" fill="#fff"/><circle cx="-6" cy="-12" r="30" fill="#fff"/><circle cx="28" cy="-2" r="24" fill="#fff"/><circle cx="52" cy="8" r="15" fill="#fff"/>
    <rect x="-58" y="2" width="122" height="18" rx="9" fill="#fff"/>
    <path d="M-58 12 Q0 26 62 14 L62 20 Q0 34 -58 20Z" fill="#D7ECFF"/></g>`;
}
function tree(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="2" rx="12" ry="3.5" fill="#0D3A7A" opacity=".3"/>
    <rect x="-2.5" y="-14" width="5" height="16" rx="2" fill="#8A5A33"/>
    <circle cx="0" cy="-24" r="13" fill="#27A866"/><circle cx="-6" cy="-29" r="8" fill="#5BD68A"/><circle cx="-8" cy="-31" r="3" fill="#B9F5C9" opacity=".8"/></g>`;
}
function pine(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="1" rx="9" ry="3" fill="#0D3A7A" opacity=".3"/>
    <path d="M0 -40 L13 -8 L-13 -8Z" fill="#1E9A66"/><path d="M0 -40 L0 -8 L-13 -8Z" fill="#46C985"/><rect x="-2" y="-9" width="4" height="10" fill="#7A4E2B"/></g>`;
}
function crystal(x, y, s = 1, c = "#7FF3F0") {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -26 L8 -8 L0 0 L-8 -8Z" fill="${c}"/><path d="M0 -26 L0 0 L-8 -8Z" fill="#fff" opacity=".45"/>
    <path d="M10 -14 L15 -4 L10 0 L5 -4Z" fill="${c}" opacity=".85"/></g>`;
}

function draw(host) {
  host.innerHTML = "";
  svg = el("svg", { viewBox: `0 0 ${WW} ${WH}`, preserveAspectRatio: "xMidYMid slice", role: "img", "aria-label": "夢想之山：角色從山腳出發，經過營地、寶物平台、飛索台，最後抵達山頂的正修之門" }, host);
  svg.innerHTML = DEFS + `
  <rect x="-800" y="-400" width="2200" height="1500" fill="url(#gSky)"/>
  <g class="rays" style="transform-origin:300px 150px">${Array.from({ length: 10 }, (_, i) => `<path d="M300 150 L${300 + Math.cos(i * .63) * 900} ${150 + Math.sin(i * .63) * 900} L${300 + Math.cos(i * .63 + .16) * 900} ${150 + Math.sin(i * .63 + .16) * 900}Z" fill="#FFF3C4" opacity=".08"/>`).join("")}</g>
  <circle cx="300" cy="150" r="250" fill="url(#gSun)"/>
  <g class="stars" fill="#fff">${[[60, 40], [140, 90], [470, 60], [540, 130], [90, 170], [420, 20], [230, 30], [560, 30]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.6 : 2.4}" opacity=".7"/>`).join("")}</g>
  ${cloud(80, 120, .7, "c1")}${cloud(520, 200, .85, "c2")}${cloud(-40, 330, .9, "c3")}
  <path d="M-800 700 L-500 560 L-300 620 L-120 470 L20 560 L120 500 L210 600 L380 610 L500 470 L640 560 L760 480 L900 590 L1100 520 L1400 640 L1400 1100 L-800 1100Z" fill="url(#gFar1)" opacity=".85"/>
  <path d="M-800 700 L-500 560 L-430 600 L-300 620 L-120 470 L-90 520 L20 560 L120 500 L210 600" fill="none" stroke="#E6F8FF" stroke-width="3" opacity=".55"/>
  <path d="M-800 820 L-560 680 L-380 760 L-200 640 L-40 740 L80 680 L140 740 L460 760 L560 660 L700 740 L860 650 L1000 760 L1400 700 L1400 1100 L-800 1100Z" fill="url(#gFar2)"/>

  <!-- 主峰：受光面＋背光面，做出立體 -->
  <g class="peak">
    <path d="M-60 900 L60 760 L120 700 L170 610 L214 540 L238 420 L262 330 L270 236 L300 232 L330 236 L346 330 L372 380 L392 470 L330 520 L300 600 L262 700 L250 800 L240 900Z" fill="url(#gLit)"/>
    <path d="M330 236 L346 330 L372 380 L392 470 L430 520 L470 600 L520 690 L580 760 L660 900 L240 900 L250 800 L262 700 L300 600 L330 520 L392 470Z" fill="url(#gShade)"/>
    <path d="M270 236 L262 330 L238 420 L214 540 L170 610 L120 700 L60 760" fill="none" stroke="#B8FFF5" stroke-width="4" stroke-linecap="round" opacity=".55"/>
    <path d="M330 236 L346 330 L372 380 L392 470 L330 520 L300 600 L262 700 L250 800" fill="none" stroke="#0F3672" stroke-width="3" opacity=".35"/>
    <path d="M150 650 L190 640 L176 680Z M420 560 L470 590 L430 600Z M110 760 L160 744 L140 790Z M480 700 L540 730 L500 744Z" fill="#0F3672" opacity=".22"/>
    <path d="M262 330 L270 236 L330 236 L346 330 L330 300 L316 330 L300 296 L286 334 L274 302Z" fill="url(#gSnow)"/>
  </g>
  <!-- 山腰的平台 -->
  <g filter="url(#fShadow)">
    <path d="M70 846 Q132 820 200 846 Q132 866 70 846Z" fill="url(#gGrass)"/>
    <path d="M330 734 Q392 706 456 734 Q392 754 330 734Z" fill="url(#gGrass)"/>
    <path d="M130 600 Q196 572 262 600 Q196 622 130 600Z" fill="url(#gGrass)"/>
    <path d="M270 456 Q330 430 392 456 Q330 478 270 456Z" fill="#8FE6D6"/>
  </g>
  ${tree(60, 836, 1.1)}${tree(214, 842, .9)}${pine(250, 830, 1)}${pine(470, 730, 1.1)}${tree(336, 730, .85)}${pine(140, 600, .9)}${tree(262, 596, .8)}
  ${pine(30, 790, .8)}${tree(520, 800, 1.2)}${pine(560, 820, 1)}${crystal(400, 460, .9)}${crystal(262, 462, .7, "#FFE38A")}${crystal(160, 700, .8)}

  <!-- 山路 -->
  <path id="trailShadow" d="${trailD()}" fill="none" stroke="#B9770C" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
  <path id="trail" d="${trailD()}" fill="none" stroke="url(#gTrail)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path id="trailDone" d="${trailD()}" fill="none" stroke="#FFC93C" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 9999"/>
  <path d="${trailD()}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2 12" stroke-linecap="round" opacity=".9"/>

  <!-- 營地 -->
  <g id="nBase" transform="translate(${NODES.base.x - 44} ${NODES.base.y})">
    <path d="M-22 0 L0 -36 L22 0Z" fill="#FFB31F"/><path d="M0 -36 L22 0 L4 0Z" fill="#E08A00"/><path d="M-6 0 L0 -14 L6 0Z" fill="#7A3F00"/>
    <g transform="translate(34 2)"><ellipse cx="0" cy="0" rx="9" ry="3" fill="#6B3B12"/><path class="fire" d="M0 -16 Q7 -8 4 -2 Q0 1 -4 -2 Q-7 -8 0 -16Z" fill="#FF8A1F"/><path d="M0 -10 Q3 -5 2 -2 Q0 0 -2 -2 Q-3 -5 0 -10Z" fill="#FFE38A"/></g></g>
  <g id="nCamp" transform="translate(${NODES.camp.x + 34} ${NODES.camp.y})">
    <rect x="-2" y="-62" width="4" height="62" rx="2" fill="#8A5A33"/>
    <path class="flag" d="M2 -60 Q22 -64 38 -56 Q22 -48 2 -44Z" fill="url(#gGold)" stroke="#B86E00" stroke-width="1.5"/>
    <text id="campBadge" x="20" y="-48" font-size="13" text-anchor="middle">❔</text></g>
  <g id="nLedge" transform="translate(${NODES.ledge.x - 46} ${NODES.ledge.y})" filter="url(#fShadow)">
    <circle class="chestglow" cx="0" cy="-16" r="30" fill="url(#gGlow)" opacity="0"/>
    <rect x="-17" y="-20" width="34" height="20" rx="3" fill="#B65A1A"/><rect x="-17" y="-20" width="34" height="20" rx="3" fill="none" stroke="#FFC93C" stroke-width="3"/>
    <g id="chestLid"><path d="M-18 -20 Q0 -36 18 -20Z" fill="#D16F22" stroke="#FFC93C" stroke-width="3"/></g>
    <rect x="-3.5" y="-24" width="7" height="9" rx="1.5" fill="#FFE38A"/></g>
  <g id="nCliff" transform="translate(${NODES.cliff.x + 46} ${NODES.cliff.y - 2})">
    <ellipse cx="0" cy="0" rx="20" ry="7" fill="#0E3B8C"/><ellipse class="pad" cx="0" cy="-2" rx="16" ry="5.5" fill="#19C6C0"/>
    <path d="M-7 -3 L0 -6 L7 -3 M-7 0 L0 -3 L7 0" stroke="#fff" stroke-width="1.6" fill="none"/>
    <rect x="-38" y="-58" width="5" height="58" rx="2" fill="#3A4E9E"/><circle cx="-35.5" cy="-58" r="5" fill="url(#gGold)"/></g>

  <!-- 山頂：金色階梯平台＋正修之門 -->
  <g id="summit" transform="translate(300 214)">
    <circle class="sumglow" cx="0" cy="-70" r="120" fill="url(#gGlow)" opacity=".7"/>
    <ellipse cx="0" cy="14" rx="94" ry="20" fill="#0E3B8C" opacity=".35" filter="url(#fSoft)"/>
    <ellipse cx="0" cy="8" rx="88" ry="18" fill="#C77A00"/><ellipse cx="0" cy="2" rx="88" ry="18" fill="url(#gGoldH)"/>
    <ellipse cx="0" cy="-6" rx="70" ry="14" fill="#D98A00"/><ellipse cx="0" cy="-10" rx="70" ry="14" fill="url(#gGoldH)"/>
    <g id="gate">
      <path d="M-46 -12 L-46 -112 Q0 -160 46 -112 L46 -12Z" fill="url(#gPortal)"/>
      <g id="doorL"><path d="M-46 -12 L-46 -112 Q-24 -135 0 -136 L0 -12Z" fill="url(#gGold)" stroke="#B86E00" stroke-width="2"/><circle cx="-8" cy="-60" r="3" fill="#7A4300"/><path d="M-36 -24 L-36 -100 M-24 -24 L-24 -110" stroke="#FFF0A8" stroke-width="2" opacity=".6"/></g>
      <g id="doorR"><path d="M46 -12 L46 -112 Q24 -135 0 -136 L0 -12Z" fill="url(#gGold)" stroke="#B86E00" stroke-width="2"/><circle cx="8" cy="-60" r="3" fill="#7A4300"/><path d="M36 -24 L36 -100 M24 -24 L24 -110" stroke="#C77A00" stroke-width="2" opacity=".5"/></g>
      <path d="M-62 -10 L-62 -118 Q0 -186 62 -118 L62 -10 L46 -10 L46 -112 Q0 -160 -46 -112 L-46 -10Z" fill="url(#gGoldH)" stroke="#9A5A00" stroke-width="2"/>
      <rect x="-70" y="-14" width="22" height="10" rx="2" fill="#C77A00"/><rect x="48" y="-14" width="22" height="10" rx="2" fill="#C77A00"/>
      <circle cx="0" cy="-170" r="12" fill="url(#gGold)" stroke="#9A5A00" stroke-width="2"/><path d="M-5 -170 L0 -177 L5 -170 L0 -163Z" fill="#19C6C0"/>
      <rect x="-34" y="-196" width="68" height="22" rx="11" fill="#0E3B8C" stroke="#FFC93C" stroke-width="2.5"/>
      <text x="0" y="-180" font-size="13" font-weight="900" text-anchor="middle" fill="#FFE38A" letter-spacing="2">正修之門</text>
      <g class="pennant" transform="translate(-74 -14)"><rect x="-1.5" y="-70" width="3" height="70" fill="#7A4E2B"/><path d="M1 -68 L24 -60 L1 -52Z" fill="#19C6C0"/></g>
      <g class="pennant" transform="translate(74 -14)"><rect x="-1.5" y="-70" width="3" height="70" fill="#7A4E2B"/><path d="M-1 -68 L-24 -60 L-1 -52Z" fill="#2A86EA"/></g>
    </g>
  </g>
  <g id="islands"></g>
  <g id="cables"></g>
  <g id="hero" filter="url(#fShadow)">
    <ellipse class="hshadow" cx="0" cy="0" rx="11" ry="3.4" fill="#0A2A66" opacity=".35"/>
    <g id="heroBody" transform="scale(1.25)">${heroSVG(avOf(avatarId))}    </g></g>
  <g id="fx"></g>
  ${cloud(110, 900, 1.3, "c4")}${cloud(470, 880, 1.5, "c5")}`;
  ISL = {};
  buildIslands();
}
function trailD() {
  const pts = ORDER.slice(0, -1).flatMap((k, i) => TRAIL[`${k}-${ORDER[i + 1]}`].slice(i ? 1 : 0));
  return "M" + pts.map(p => p.join(" ")).join(" L");
}
/* 路線浮島：依管道數平均排在山的左右兩側 */
function islandPos(i, n) {
  const half = Math.ceil(n / 2), left = i < half, k = left ? i : i - half, cnt = left ? half : n - half;
  const y = 250 + k * (300 / Math.max(1, cnt - 1 || 1)) + (left ? 0 : 24);
  const x = left ? 74 + (k % 2) * 34 : 526 - (k % 2) * 34;
  return { x, y };
}
function buildIslands() {
  const g = svg.querySelector("#islands"); g.innerHTML = "";
  PATHS.forEach((P, i) => {
    const { x, y } = islandPos(i, PATHS.length);
    const n = el("g", { class: "isl st-u", transform: `translate(${x} ${y})`, "data-id": P.id }, g);
    n.innerHTML = `<g class="bob" style="animation-delay:${-i * .7}s">
      <circle class="halo" cx="0" cy="-8" r="34" fill="url(#gGlow)"/>
      <path d="M-30 0 Q-24 30 0 44 Q24 30 30 0Z" fill="url(#gRock)"/><path d="M-30 0 Q-24 30 0 44 L0 0Z" fill="#7C95F0" opacity=".35"/>
      <ellipse cx="0" cy="0" rx="31" ry="9" fill="url(#gGrass)"/><ellipse cx="-6" cy="-2" rx="16" ry="3.5" fill="#B9F5C9" opacity=".6"/>
      <circle class="ring" cx="0" cy="-20" r="15" fill="#fff" stroke="${P.color}" stroke-width="3.5"/>
      <text class="ico" x="0" y="-15" font-size="16" text-anchor="middle">${P.icon}</text>
      <text class="qm" x="0" y="-14" font-size="14" font-weight="900" text-anchor="middle" fill="#0E3B8C">?</text>
      <circle class="dot" cx="12" cy="-31" r="5.5" stroke="#fff" stroke-width="2"/></g>`;
    ISL[P.id] = { x, y, node: n };
  });
}

/* ---------------- 角色移動 ---------------- */
function setHero(x, y, rot = 0) { heroPos = { x, y }; svg.querySelector("#hero").setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})`); }
function hang(on) { hangOn = on; svg.querySelector("#hero .armUp").style.display = on ? "" : "none"; svg.querySelector("#hero .armDown").style.display = on ? "none" : ""; svg.querySelector(".hshadow").style.opacity = on ? 0 : ""; }
function avatar(id) { avatarId = avOf(id).id; if (svg) svg.querySelector("#heroBody").innerHTML = heroSVG(avOf(avatarId)); }
function progress(node) {
  const idx = ORDER.indexOf(node), tr = svg.querySelector("#trailDone"), len = tr.getTotalLength();
  // 已走過的山路變成金色
  let done = 0; for (let i = 0; i < idx; i++) done += segLen(ORDER[i], ORDER[i + 1]);
  tr.setAttribute("stroke-dasharray", `${Math.min(done, len)} 9999`);
}
const segLen = (a, b) => { const p = TRAIL[`${a}-${b}`]; let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
function place(node) {
  partyId++; if (svg) svg.querySelectorAll(".party").forEach(n => n.remove());
  cur = node; const p = NODES[node]; hang(false); clearCables(); setHero(p.x, p.y); progress(node); look(p.x, p.y, 0);
  gateOpen(node === "summit");
}
async function walk(node) {
  const a = ORDER.indexOf(cur), b = ORDER.indexOf(node);
  if (a === b) { place(node); return; }
  if (b < a || b - a > 1 || cur === "cliff" && heroOff()) { place(node); return; }
  const pts = TRAIL[`${cur}-${node}`]; cur = node; hang(false); clearCables();
  const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
  look(NODES[node].x, NODES[node].y, 900);
  await tween(900, t => {
    let d = t * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
    const f = L[i] ? d / L[i] : 1, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
    setHero(x, y - Math.abs(Math.sin(t * Math.PI * 7)) * 5);
  }, t => t);
  setHero(NODES[node].x, NODES[node].y); progress(node);
}
const heroOff = () => Math.hypot(heroPos.x - NODES[cur].x, heroPos.y - NODES[cur].y) > 4;

/* ---------------- 路線浮島亮燈 ---------------- */
function routes(map) {
  for (const id in ISL) { const st = map[id] || "u"; ISL[id].node.setAttribute("class", `isl st-${st === "?" ? "u" : st}`); }
}
/* 飛索：從飛索台拉一條纜繩到浮島，角色掛在滑輪上滑過去 */
function clearCables() { const c = svg && svg.querySelector("#cables"); if (c) c.innerHTML = ""; }
function cableTo(id, keep) {
  const c = svg.querySelector("#cables"), I = ISL[id], A = { x: NODES.cliff.x + 10, y: NODES.cliff.y - 60 }, B = { x: I.x, y: I.y - 38 };
  if (!keep) c.innerHTML = "";
  const midY = Math.max(A.y, B.y) + 24, d = `M${A.x} ${A.y} Q${(A.x + B.x) / 2} ${midY} ${B.x} ${B.y}`;
  el("path", { d, stroke: "#0E3B8C", "stroke-width": 3.5, fill: "none", opacity: .55 }, c);
  el("path", { d, stroke: "#FFE38A", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "6 6", class: "cable" }, c);
  return { A, B, midY };
}
async function zip(id) {
  if (!ISL[id]) return;
  const { A, B, midY } = cableTo(id);
  const qx = (A.x + B.x) / 2, q = t => ({ x: (1 - t) ** 2 * A.x + 2 * (1 - t) * t * qx + t * t * B.x, y: (1 - t) ** 2 * A.y + 2 * (1 - t) * t * midY + t * t * B.y });
  hang(true); look(B.x, B.y, 800);
  const roller = el("circle", { r: 4.5, fill: "url(#gGold)", stroke: "#9A5A00", "stroke-width": 1.5 }, svg.querySelector("#cables"));
  await tween(800, t => { const p = q(t); roller.setAttribute("cx", p.x); roller.setAttribute("cy", p.y); setHero(p.x, p.y + 46, (B.x > A.x ? 1 : -1) * 8 * Math.sin(t * Math.PI)); });
  hang(false); setHero(B.x, B.y - 4); burst(B.x, B.y - 20, "#FFE38A");
}
/* 登頂：從目前位置彈射成拋物線飛上山頂 */
async function summit() {
  const A = { ...heroPos }, B = NODES.summit, top = Math.min(A.y, B.y) - 140;
  clearCables(); hang(true); look(B.x, B.y, 900);
  if (Math.hypot(A.x - NODES.cliff.x, A.y - NODES.cliff.y) < 6) burst(NODES.cliff.x + 46, NODES.cliff.y - 6, "#7FF3F0");
  // 彈射時拖出一道金色光尾
  const fx = svg.querySelector("#fx"), trailP = el("path", { fill: "none", stroke: "#FFE38A", "stroke-width": 5, "stroke-linecap": "round", opacity: .8, filter: "url(#fSoft)" }, fx);
  const pts = [];
  await tween(950, t => { const x = A.x + (B.x - A.x) * t, y = (1 - t) ** 2 * A.y + 2 * (1 - t) * t * top + t * t * B.y; setHero(x, y, t * 360);
    pts.push(`${x.toFixed(1)} ${(y - 30).toFixed(1)}`); trailP.setAttribute("d", "M" + pts.slice(-14).join(" L")); }, easeOut);
  trailP.remove();
  hang(false); cur = "summit"; setHero(B.x, B.y); progress("summit");
  burst(B.x, B.y - 40, "#FFE38A", 22);
  gateOpen(true, true);
  celebrate();
}
/* 攻頂慶祝：鏡頭推近、正修之門放光、角色歡呼跳躍、煙火、彩帶與「登頂」緞帶。
 * 全部是背景動畫，不會擋住任何按鈕；可以重播。 */
let partyId = 0;
function celebrate() {
  if (!svg || RM) return;
  const my = ++partyId, B = NODES.summit, fx = svg.querySelector("#fx");
  svg.querySelectorAll(".party").forEach(n => n.remove());
  const party = el("g", { class: "party" }, fx);
  const alive = () => my === partyId && party.isConnected;
  look(B.x, B.y - 90, 1100, 1.6);
  // 1. 門內放出旋轉光束
  const beams = el("g", { class: "beams", transform: `translate(${B.x} ${B.y - 70})` }, party);
  beams.innerHTML = `<g class="spin">${Array.from({ length: 12 }, (_, i) => `<path d="M0 0 L${Math.cos(i * .5236) * 260} ${Math.sin(i * .5236) * 260} L${Math.cos(i * .5236 + .12) * 260} ${Math.sin(i * .5236 + .12) * 260}Z" fill="${i % 2 ? "#FFF3C4" : "#B9FBFF"}"/>`).join("")}</g><circle r="46" fill="url(#gGlow)"/>`;
  svg.querySelector("#hero").before(party);   // 光束、煙火、彩帶都在角色後面
  tween(700, t => beams.setAttribute("opacity", t * .55), easeOut, true);
  // 2. 角色歡呼跳三下
  hang(true);
  tween(1500, t => { if (!alive()) return; const j = Math.abs(Math.sin(t * Math.PI * 3)); setHero(B.x, B.y - j * 18, Math.sin(t * Math.PI * 6) * 6); }, t => t, true)
    .then(() => { if (alive()) { setHero(B.x, B.y); hang(false); } });
  // 3. 「登頂」緞帶
  const rib = el("g", { transform: `translate(${B.x} ${B.y - 236})`, opacity: 0 }, fx);
  rib.innerHTML = `<path d="M-92 -4 L-112 10 L-92 22 Z M92 -4 L112 10 L92 22 Z" fill="#C77A00"/>
    <rect x="-96" y="-16" width="192" height="34" rx="8" fill="url(#gGold)" stroke="#9A5A00" stroke-width="2"/>
    <text x="0" y="8" text-anchor="middle" font-size="20" font-weight="900" fill="#0E3B8C" letter-spacing="3">🏆 登頂 3952m</text>`;
  rib.classList.add("party");
  tween(600, t => { rib.setAttribute("opacity", Math.min(1, t * 2)); rib.setAttribute("transform", `translate(${B.x} ${B.y - 236}) scale(${.4 + .6 * t})`); }, t => 1 - Math.pow(1 - t, 3) * Math.cos(t * 9) , true);
  // 4. 煙火：兩波，每波 5 發
  const COLORS = ["#FFC93C", "#19C6C0", "#FF6FB5", "#4C8DFF", "#FFFFFF", "#9C6BFF"];
  const firework = (x0, x1, y1, color, delay) => setTimeout(() => {
    if (!alive()) return;
    const rk = el("circle", { r: 3, fill: "#FFF6C9" }, party), y0 = B.y + 10;
    tween(650, t => { rk.setAttribute("cx", x0 + (x1 - x0) * t); rk.setAttribute("cy", y0 + (y1 - y0) * t); }, easeOut, true).then(() => {
      rk.remove(); if (!alive()) return;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n, r = 40 + Math.random() * 22, c = i % 4 ? color : "#fff";
        const sp = el("circle", { r: 2.6, fill: c }, party);
        tween(1100, t => { sp.setAttribute("cx", x1 + Math.cos(a) * r * t); sp.setAttribute("cy", y1 + Math.sin(a) * r * t + 26 * t * t); sp.setAttribute("opacity", 1 - t); sp.setAttribute("r", 2.8 - 1.6 * t); }, easeOut, true).then(() => sp.remove());
      }
      const flash = el("circle", { cx: x1, cy: y1, r: 4, fill: color, opacity: .7 }, party);
      tween(400, t => { flash.setAttribute("r", 4 + 26 * t); flash.setAttribute("opacity", .7 * (1 - t)); }, easeOut, true).then(() => flash.remove());
    });
  }, delay);
  for (let w = 0; w < 2; w++) for (let k = 0; k < 5; k++) {
    const x1 = B.x - 150 + k * 75 + (Math.random() * 30 - 15), y1 = B.y - 190 - Math.random() * 80;
    firework(B.x + (Math.random() * 60 - 30), x1, y1, COLORS[(k + w * 2) % COLORS.length], 500 + w * 1300 + k * 220);
  }
  // 5. 彩帶從畫面上方飄落
  for (let i = 0; i < 46; i++) setTimeout(() => {
    if (!alive()) return;
    const v = svg.viewBox.baseVal, x = v.x + Math.random() * v.width, sx = (Math.random() - .5) * 60, rot = Math.random() * 720;
    const cf = el("rect", { width: 5, height: 9, rx: 1.5, fill: COLORS[i % COLORS.length] }, party);
    tween(2600 + Math.random() * 1200, t => { cf.setAttribute("transform", `translate(${x + sx * Math.sin(t * 6)} ${v.y - 20 + (v.height + 40) * t}) rotate(${rot * t})`); cf.setAttribute("opacity", t > .85 ? (1 - t) / .15 : 1); }, t => t, true).then(() => cf.remove());
  }, 300 + i * 45);
  // 6. 慶祝結束：鏡頭拉回、光束保留微光
  setTimeout(() => { if (!alive()) return; look(B.x, B.y, 1200); tween(900, t => beams.setAttribute("opacity", .55 - .3 * t), ease, true); }, 4600);
}
function gateOpen(open, anim) {
  const L = svg.querySelector("#doorL"), R = svg.querySelector("#doorR");
  if (!anim) { L.setAttribute("transform", open ? "translate(-34 0) scale(.3 1)" : ""); R.setAttribute("transform", open ? "translate(34 0) scale(.3 1)" : ""); svg.querySelector("#summit").classList.toggle("open", open); return; }
  svg.querySelector("#summit").classList.add("open");
  tween(700, t => { L.setAttribute("transform", `translate(${-34 * t} 0) scale(${1 - .7 * t} 1)`); R.setAttribute("transform", `translate(${34 * t} 0) scale(${1 - .7 * t} 1)`); }, ease, true);
}
function badge(icon) {
  svg.querySelector("#campBadge").textContent = icon || "❔";
  badgeOn = !!icon; svg.querySelector("#hero .heroBadge").setAttribute("opacity", icon ? 1 : 0);
}
function chest(open) {
  svg.querySelector("#chestLid").setAttribute("transform", open ? "translate(0 -20) rotate(-28) translate(0 20)" : "");
  svg.querySelector("#nLedge .chestglow").setAttribute("opacity", open ? 1 : 0);
}
function burst(x, y, color = "#FFE38A", n = 14) {
  if (RM) return;
  const fx = svg.querySelector("#fx");
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 2 * i / n + Math.random() * .4, r = 26 + Math.random() * 30;
    const s = el("path", { d: "M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5Z", fill: i % 3 ? color : "#fff" }, fx);
    tween(650 + Math.random() * 250, t => { s.setAttribute("transform", `translate(${x + Math.cos(a) * r * t} ${y + Math.sin(a) * r * t - 18 * t}) scale(${1.4 - t})`); s.setAttribute("opacity", 1 - t); }, easeOut, true).then(() => s.remove()); // 特效不打斷角色動畫
  }
}
function burstAt(key) { const p = NODES[key] || ISL[key]; if (p) burst(p.x, p.y - 30); }

let resizeT;
const relook = () => { clearTimeout(resizeT); resizeT = setTimeout(() => svg && look(cam.x, cam.y, 0, cam.z || 1), 60); };
addEventListener("resize", relook);

window.Scene = {
  init(host, paths) { PATHS = paths; draw(host); place("base"); if (window.ResizeObserver) new ResizeObserver(relook).observe(host); },
  place, walk, routes, zip, summit, celebrate, badge, chest, avatar, burst: burstAt,
  AVATARS, avatarSVG,
  cable(ids) { if (cur === "summit") return; clearCables(); ids.forEach(id => ISL[id] && cableTo(id, true)); },
  overview() { look(WW / 2, WH / 2, 600); },
  focus(node) { const p = NODES[node] || ISL[node]; if (p) look(p.x, p.y, 600); }
};
})();
