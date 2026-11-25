import * as THREE from 'three';
import TABLE from './table-data.js';
import { CLASSES, TIER, KW, REQ_TEXT, cardText } from './cards.js';
import { Game } from './engine.js';
import * as SFX from './sfx.js';

const $ = s => document.querySelector(s);
const CW = 530, CH = 742;
const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
const SERIF = '"Noto Serif SC","Songti SC","SimSun",serif';

// ---------------- 卡面绘制 ----------------
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrap(g, text, x, y, maxW, lh) {
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW && line) { g.fillText(line, x, y); y += lh; line = ch; }
      else line += ch;
    }
    g.fillText(line, x, y); y += lh + 6;
  }
  return y;
}
function glowStroke(g, color, w, blur) { g.save(); g.shadowColor = color; g.shadowBlur = blur; g.strokeStyle = color; g.lineWidth = w; g.stroke(); g.restore(); }

const backCache = new Map();
function drawBack(clsKey, tier) {
  const key = clsKey + tier; if (backCache.has(key)) return backCache.get(key);
  const cls = CLASSES[clsKey];
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, CW, CH); grd.addColorStop(0, '#0a0c18'); grd.addColorStop(1, { gang: '#1d0818', net: '#071624', corp: '#1a160a' }[clsKey]);
  rr(g, 6, 6, CW - 12, CH - 12, 30); g.fillStyle = grd; g.fill();
  g.save(); g.clip(); g.globalAlpha = .13; g.strokeStyle = cls.color; g.lineWidth = 2;
  for (let i = -CH; i < CW + CH; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - CH * .6, CH); g.stroke(); }
  g.restore();
  const tc = tier ? TIER[tier].color : cls.color;
  rr(g, 6, 6, CW - 12, CH - 12, 30); glowStroke(g, tc, 7, 18);
  rr(g, 28, 28, CW - 56, CH - 56, 20); glowStroke(g, cls.color, 2, 10);
  g.beginPath(); g.arc(CW / 2, CH / 2 - 20, 150, 0, Math.PI * 2); glowStroke(g, tc, 5, 20);
  g.beginPath(); g.arc(CW / 2, CH / 2 - 20, 122, 0, Math.PI * 2); glowStroke(g, cls.color, 2, 8);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (tier) {
    g.fillStyle = tc; g.shadowColor = tc; g.shadowBlur = 20; g.font = `bold ${tier === 3 ? 62 : 74}px ${FONT}`;
    g.fillText(TIER[tier].stars, CW / 2, CH / 2 - 40); g.shadowBlur = 0;
    g.font = `bold 38px ${SERIF}`; g.fillText(TIER[tier].name, CW / 2, CH / 2 + 50);
  } else {
    g.fillStyle = cls.color; g.font = `bold 54px ${SERIF}`; g.fillText(cls.name, CW / 2, CH / 2 - 20);
  }
  g.fillStyle = '#e9ecf5'; g.font = `bold 34px ${SERIF}`; g.fillText('暗 出 场', CW / 2, CH - 120);
  g.fillStyle = '#9aa3b8'; g.font = `22px ${FONT}`; g.fillText(tier ? `战力 ${{ 1: '1–3', 2: '4–7', 3: '8–10' }[tier]}` : cls.name, CW / 2, CH - 80);
  backCache.set(key, cv); return cv;
}

function drawPlaceholder(card, clsKey) {
  const cls = CLASSES[clsKey];
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const g = cv.getContext('2d');
  const typeColor = card.typ === 'event' ? '#ffd166' : card.typ === 'effect' ? '#9fe7ff' : cls.color;
  rr(g, 6, 6, CW - 12, CH - 12, 30); g.fillStyle = '#0b0d16'; g.fill();
  rr(g, 6, 6, CW - 12, CH - 12, 30); glowStroke(g, cls.color, 6, 16);
  // 插画区
  rr(g, 36, 100, CW - 72, 330, 16);
  const ag = g.createLinearGradient(0, 100, 0, 430); ag.addColorStop(0, { gang: '#2a0f25', net: '#0d2033', corp: '#2a2410' }[clsKey]); ag.addColorStop(1, '#090b14'); g.fillStyle = ag; g.fill();
  g.save(); g.clip(); g.globalAlpha = .18; g.strokeStyle = typeColor; g.lineWidth = 2;
  for (let i = 0; i < CW + 400; i += 22) { g.beginPath(); g.moveTo(i, 100); g.lineTo(i - 330, 430); g.stroke(); }
  g.restore();
  rr(g, 36, 100, CW - 72, 330, 16); glowStroke(g, typeColor, 3, 10);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = typeColor; g.shadowColor = typeColor; g.shadowBlur = 24;
  g.font = `bold 110px ${FONT}`;
  g.fillText(card.typ === 'event' ? '⚡' : card.typ === 'effect' ? '◆' : TIER[card.tier].stars, CW / 2, 250);
  g.shadowBlur = 0; g.fillStyle = 'rgba(233,236,245,.45)'; g.font = `22px ${FONT}`; g.fillText('插画待生成', CW / 2, 390);
  // 左上
  if (card.typ === 'unit') {
    g.beginPath(); g.arc(80, 70, 50, 0, Math.PI * 2); g.fillStyle = '#0b0d16'; g.fill(); glowStroke(g, '#5aebff', 5, 12);
    g.fillStyle = '#fff'; g.font = `bold 62px ${FONT}`; g.fillText(card.power, 80, 74);
    rr(g, CW - 200, 36, 164, 58, 14); g.fillStyle = '#0b0d16'; g.fill(); glowStroke(g, TIER[card.tier].color, 3, 10);
    g.fillStyle = TIER[card.tier].color; g.font = `bold 34px ${FONT}`; g.fillText(TIER[card.tier].stars, CW - 118, 66);
  } else {
    rr(g, 34, 30, 92, 62, 12); g.fillStyle = '#0b0d16'; g.fill(); glowStroke(g, typeColor, 4, 10);
    g.fillStyle = typeColor; g.font = `bold 36px ${FONT}`; g.fillText(card.typ === 'event' ? '⚡' : '◆', 80, 62);
    rr(g, CW - 200, 36, 164, 58, 14); g.fillStyle = '#0b0d16'; g.fill(); glowStroke(g, typeColor, 3, 10);
    g.fillStyle = typeColor; g.font = `bold 30px ${FONT}`; g.fillText(card.typ === 'event' ? '事件' : '效果', CW - 118, 66);
  }
  // 费用
  drawCost(g, card.cost, CW / 2, 62);
  // 名称
  rr(g, 36, 450, CW - 72, 72, 14); g.fillStyle = '#10131f'; g.fill(); glowStroke(g, cls.color, 3, 10);
  g.fillStyle = '#fff'; g.font = `bold 42px ${SERIF}`; g.shadowColor = cls.color; g.shadowBlur = 14; g.fillText(card.name, CW / 2, 488); g.shadowBlur = 0;
  // 文字
  rr(g, 36, 538, CW - 72, 170, 14); g.fillStyle = '#10131f'; g.fill(); glowStroke(g, '#5aebff', 2, 6);
  g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#e9ecf5'; g.font = `24px ${FONT}`;
  wrap(g, cardText(card) || '无技能。', 58, 556, CW - 116, 32);
  return cv;
}

function drawCost(g, cost, x, y) {
  g.save(); g.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g[k ? 'lineTo' : 'moveTo'](x + 38 * Math.cos(a), y + 38 * Math.sin(a)); }
  g.closePath(); g.fillStyle = '#0a2a4a'; g.fill(); g.shadowColor = '#5ab4ff'; g.shadowBlur = 14; g.lineWidth = 5; g.strokeStyle = '#6cc2ff'; g.stroke();
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `bold 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(cost, x, y + 2); g.restore();
}
const faceURL = new Map(), faceTex = new Map(), backTex = new Map();
const BACK_IMG = { corp: true };
const texLoader = new THREE.TextureLoader();
function prepTex(t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function faceOf(card, clsKey) {
  if (!faceURL.has(card.id)) {
    if (card.img) { faceURL.set(card.id, `cards/${card.id}.jpg`); faceTex.set(card.id, prepTex(texLoader.load(`cards/${card.id}.jpg`))); }
    else { const cv = drawPlaceholder(card, clsKey); faceURL.set(card.id, cv.toDataURL('image/jpeg', .9)); faceTex.set(card.id, prepTex(new THREE.CanvasTexture(cv))); }
  }
  return { url: faceURL.get(card.id), tex: faceTex.get(card.id) };
}
function backOf(clsKey, tier) {
  const k = clsKey + tier;
  if (!backTex.has(k)) backTex.set(k, prepTex(BACK_IMG[clsKey] ? texLoader.load(`cards/back_${clsKey}${tier}.jpg`) : new THREE.CanvasTexture(drawBack(clsKey, tier))));
  return backTex.get(k);
}
const badgeCache = new Map();
function badgeTex(text, color, bg = '#0b0d16') {
  const k = text + color + bg; if (badgeCache.has(k)) return badgeCache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fillStyle = bg; g.fill(); g.lineWidth = 8; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.font = `bold ${text.length > 1 ? 56 : 70}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68);
  const t = prepTex(new THREE.CanvasTexture(cv)); badgeCache.set(k, t); return t;
}

// ---------------- 3D 场景 ----------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05060b');
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(0.2, 1, 0.5); scene.add(dl);
const dyn = new THREE.Group(); scene.add(dyn);

let SLOTS = null, lifeMeshes = [[], []];
const VIEW0 = { yaw: 0, polar: Math.atan2(0.37, 0.93), zoom: 1 };
const view = { ...VIEW0 };
function fitCamera() {
  const W = innerWidth, H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H;
  // 可用区域：避开右侧日志和底部手牌
  const logW = (W > 900 && H >= 560 && !$('#log').classList.contains('hidden')) ? 330 : 0;
  const compact = H < 560;
  const top = compact ? 40 : 60, bottom = compact ? 92 : W > 900 ? 215 : 150;
  const aw = W - logW - 24, ah = H - top - bottom;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max(0.355 * W / (t * camera.aspect * aw), 0.235 * H / (t * ah));
  const r = d * view.zoom;
  camera.position.set(r * Math.sin(view.polar) * Math.sin(view.yaw), r * Math.cos(view.polar), r * Math.sin(view.polar) * Math.cos(view.yaw));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
  const cx = 12 + aw / 2, cy = top + ah / 2;
  camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  camera.updateProjectionMatrix();
}
addEventListener('resize', fitCamera);

function slotCenter(obj) { const b = new THREE.Box3().setFromObject(obj); const c = new THREE.Vector3(); b.getCenter(c); return { x: c.x, z: c.z, y: b.max.y, w: b.max.x - b.min.x, h: b.max.z - b.min.z }; }

// 牌桌：由转换好的几何数据直接搭建（不再需要 GLTF 加载器）
async function buildTable() {
  const tex = await new THREE.TextureLoader().loadAsync('assets/playmat.jpg');
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mats = TABLE.materials.map(m => new THREE.MeshStandardMaterial({
    name: m.name, side: THREE.DoubleSide, metalness: m.metal, roughness: m.rough,
    color: new THREE.Color().setRGB(...m.base, THREE.LinearSRGBColorSpace),
    emissive: new THREE.Color().setRGB(...m.emis, THREE.LinearSRGBColorSpace), emissiveIntensity: m.es,
    map: m.map ? tex : null, emissiveMap: m.emap ? tex : null,
  }));
  const root = new THREE.Group(); root.name = 'Playmat root';
  for (const n of TABLE.nodes) {
    const meshes = n.prims.map(p => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.u, 2));
      g.setIndex(p.i);
      return new THREE.Mesh(g, mats[p.m]);
    });
    let obj;
    if (meshes.length === 1) obj = meshes[0]; else { obj = new THREE.Group(); meshes.forEach(m => obj.add(m)); }
    obj.name = n.name; root.add(obj);
  }
  return { scene: root };
}

async function loadTable() {
  const gltf = await buildTable();
  scene.add(gltf.scene); scene.updateMatrixWorld(true);
  const S = side => {
    const pre = side === 0 ? 'Street Chrome' : 'Netrunner';
    const get = n => gltf.scene.getObjectByName(`${pre} ${n}`.replace(/ /g, "_")) || gltf.scene.getObjectByName(`${pre} ${n}`);
    const lifes = [1, 2, 3].map(i => get(`life node ${i}`));
    lifes.forEach(o => o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.userData.e0 = m.material.emissive.clone(); m.userData.c0 = m.material.color.clone(); } }));
    lifeMeshes[side] = lifes;
    return { cards: [1, 2, 3, 4, 5, 6].map(i => slotCenter(get(`card slot ${i}`))), deck: slotCenter(get('deck slot')), discard: slotCenter(get('discard slot')), event: slotCenter(get('event slot')) };
  };
  SLOTS = [S(0), S(1)];
}

// ---------------- 场上对象 ----------------
const CARD_W = 0.060, CARD_H = 0.084;
const planeGeo = new THREE.PlaneGeometry(1, 1);
let pickables = [];
function addPlane(tex, x, y, z, w, h, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: tex || null, color: opts.color ?? 0xffffff, transparent: true, opacity: opts.opacity ?? 1, depthWrite: !opts.additive, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
  const m = new THREE.Mesh(planeGeo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(w, h, 1);
  if (opts.rotZ) m.rotation.z = opts.rotZ;
  dyn.add(m); return m;
}
function glowTex() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 80, 10, 64, 80, 80); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.6, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 160); return new THREE.CanvasTexture(cv);
}
const GLOW = glowTex();

// ---------------- UI 状态 ----------------
let game = null, humanCls = 'gang', aiCls = 'net';
let pending = null;          // {type:'idle'|'target'|'block', cands, resolve}
let highlightSet = new Set();
let hoverObj = null;
let drag = null;            // {cr, sx, sy, pos, moved}
const animOff = new Map();  // uid -> {x,z}
const DIVIDE_Z = -0.005;    // 小于它就是对面半场
const labelsEl = $('#labels');

function visibleToHuman(cr) { return cr.owner === 0 || cr.up || cr.known; }

function sync() {
  if (!game || !SLOTS) return;
  while (dyn.children.length) { const m = dyn.children.pop(); m.material.dispose(); if (m.isLine) m.geometry.dispose(); }
  pickables = []; labelsEl.innerHTML = '';
  const candSet = new Set(handDrag && handDrag.cands ? handDrag.cands : pending && pending.cands ? pending.cands : []);
  for (const side of [0, 1]) {
    const P = game.p[side], S = SLOTS[side];
    P.board.forEach((cr, i) => {
      const s0 = S.cards[i]; if (!s0) return;
      let s = s0;
      const off = animOff.get(cr.uid); if (off) s = { ...s0, x: s0.x + off.x, z: s0.z + off.z };
      const y = s.y + 0.0015 + (drag && drag.cr === cr ? 0.012 : 0) + (off ? 0.008 : 0);
      const lift = hoverObj && hoverObj.cr === cr ? 0.004 : 0;
      const isCand = candSet.has(cr), isHi = highlightSet.has(cr.uid) || (handDrag && handDrag.over === cr);
      const ready = !handDrag && pending && pending.type === 'idle' && cr.owner === 0 && cr.attacksLeft > 0;
      if (isCand || isHi || ready) addPlane(GLOW, s.x, y, s.z, CARD_W * 1.45, CARD_H * 1.35, { color: isHi ? 0xff7a3c : ready ? 0x7dff9a : 0x5aebff, additive: true, opacity: ready ? .6 : .95 });
      const vis = visibleToHuman(cr);
      const tex = vis ? faceOf(cr.card, P.cls).tex : backOf(P.cls, cr.card.tier);
      const m = addPlane(tex, s.x, y + 0.0004 + lift, s.z, CARD_W, CARD_H, { color: vis && !cr.up ? 0x8a8f9c : 0xffffff });
      m.userData = { cr }; pickables.push(m);
      if (vis) {
        const pw = game.staticPw(cr), base = cr.card.power;
        addPlane(badgeTex(String(pw), pw > base ? '#7dff9a' : '#ffffff'), s.x - CARD_W * 0.36, y + 0.0009 + lift, s.z - CARD_H * 0.38, 0.019, 0.019);
      }
      if (!cr.up) addPlane(badgeTex('暗', '#ffd166'), s.x + CARD_W * 0.36, y + 0.0009 + lift, s.z + CARD_H * 0.38, 0.017, 0.017);
      if (cr.armorUsed) addPlane(badgeTex('伤', '#ff7b9c'), s.x - CARD_W * 0.36, y + 0.0009 + lift, s.z + CARD_H * 0.38, 0.016, 0.016);
    });
    // 牌库
    const d = S.deck, dh = Math.min(P.deck.length, 15);
    for (let k = 0; k < Math.max(1, dh); k++) if (P.deck.length) addPlane(backOf(P.cls, 0), d.x, d.y + 0.0006 + k * 0.0004, d.z, d.h * 0.66, d.h * 0.92, { color: k === dh - 1 ? 0xffffff : 0x666666 });
    label(`牌库 ${P.deck.length}`, d.x, d.y, d.z + d.h * 0.62 * (side === 0 ? 1 : -1));
    // 弃牌
    const g = S.discard;
    if (P.grave.length) { const c = P.grave[P.grave.length - 1]; const m = addPlane(faceOf(c, P.cls).tex, g.x, g.y + 0.001, g.z, g.h * 0.66, g.h * 0.92); m.userData = { pile: side }; pickables.push(m); }
    label(`弃牌 ${P.grave.length}`, g.x, g.y, g.z + g.h * 0.62 * (side === 0 ? 1 : -1));
    // 事件位：最近打出的效果/事件
    const e = S.event;
    if (P.lastPlayed) { const m = addPlane(faceOf(P.lastPlayed, P.cls).tex, e.x, e.y + 0.001, e.z, e.h * 0.62, e.h * 0.87, { rotZ: Math.PI / 2 }); m.userData = { card: P.lastPlayed, cls: P.cls }; pickables.push(m); }
    // 生命
    const per = P.maxLife / lifeMeshes[side].length;
    lifeMeshes[side].forEach((o, i) => o.traverse(m => {
      if (!m.isMesh) return; const f = Math.max(0, Math.min(1, (P.life - i * per) / per));
      m.material.emissive.copy(m.userData.e0).multiplyScalar(0.05 + 2.15 * f);
      m.material.color.copy(m.userData.c0).multiplyScalar(0.15 + 0.85 * f);
    }));
    const ln = S.cards[0]; label(`生命 ${P.life}/${P.maxLife} · 能量 ${P.mana}/${Math.max(P.mana, P.maxMana)}`, ln.x - 0.09, ln.y, side === 0 ? 0.03 : -0.03);
  }
  if (drag && drag.pos && drag.moved) {
    const from = SLOTS[0].cards[game.p[0].board.indexOf(drag.cr)];
    if (from) {
      const hot = drag.pos.z < DIVIDE_Z;
      if (hot) addPlane(GLOW, 0, 0.0035, -0.11, 0.62, 0.14, { color: 0xff5a3c, additive: true, opacity: .35 });
    }
  }
  // HUD
  const A = game.p[1], H = game.p[0];
  plate($('#hud-ai'), A, false); plate($('#hud-you'), H, true);
  renderHand();
  placeLabels();
}
const lastLife = new WeakMap();
function plate(el, P, me) {
  const C = CLASSES[P.cls], cap = Math.max(P.mana, P.maxMana), maxL = P.maxLife || 6, life = Math.max(0, P.life);
  let lp = '', mp = '';
  for (let i = 0; i < maxL; i++) lp += `<i class="${i < life ? 'on' : ''}"></i>`;
  for (let i = 0; i < cap; i++) mp += `<i class="${i < P.mana ? 'on' : ''}"></i>`;
  el.style.setProperty('--acc', C.color); el.style.setProperty('--acc2', C.color2 || C.color);
  el.innerHTML = `<div class="pl-top"><span class="pl-tag">${me ? 'P1 // 你' : 'P2 // 对手'}</span><span class="pl-cls">${C.name}</span>`
    + `<span class="pl-n">${me ? '牌库' : '手牌'}<b>${me ? P.deck.length : P.hand.length}</b></span></div>`
    + `<div class="pl-row"><span class="k">HP</span><span class="pips life">${lp}</span><b class="v">${life}</b></div>`
    + `<div class="pl-row"><span class="k">EN</span><span class="pips mana">${mp || '<em>—</em>'}</span><b class="v">${P.mana}<small>/${cap}</small></b></div>`;
  const prev = lastLife.get(P);
  if (prev !== undefined && life !== prev) { el.classList.remove('hit', 'heal'); void el.offsetWidth; el.classList.add(life < prev ? 'hit' : 'heal'); }
  lastLife.set(P, life);
}
const lblList = [];
function label(text, x, y, z) { const el = document.createElement('div'); el.className = 'lbl'; el.textContent = text; el.dataset.p = JSON.stringify([x, y, z]); labelsEl.appendChild(el); }
function placeLabels() {
  for (const el of labelsEl.children) {
    const [x, y, z] = JSON.parse(el.dataset.p); const v = new THREE.Vector3(x, y, z).project(camera);
    el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  }
}

function canPlay(c) {
  if (!pending || pending.type !== 'idle') return false;
  if (c.typ === 'unit') return game.canSummon(0, c);
  if (c.typ === 'effect') return game.effPlayable(0, c);
  return false;
}
function renderHand() {
  const el = $('#hand'); el.innerHTML = '';
  for (const c of game.p[0].hand) {
    const d = document.createElement('div'); d.className = 'hc';
    d.style.backgroundImage = `url("${faceOf(c, game.p[0].cls).url}")`;
    const ok = canPlay(c);
    if (handDrag && handDrag.moved && handDrag.card === c) d.classList.add('dragging');
    if (pending && pending.type === 'idle') d.classList.add(ok ? 'can' : 'no');
    const cb = document.createElement('span'); cb.className = 'cost' + (c.cost > game.p[0].mana ? ' poor' : ''); cb.textContent = c.cost; d.appendChild(cb);
    if (c.typ === 'event') { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '时机出现时提示'; d.appendChild(t); }
    else if (c.req) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '有召唤条件'; d.appendChild(t); }
    d.onmouseenter = () => { if (lastPtr !== 'touch') showPreview({ card: c, cls: game.p[0].cls }); };
    d.onmouseleave = hidePreview;
    d.onpointerdown = ev => startHandDrag(c, ev);
    el.appendChild(d);
  }
}

// ---------------- 预览 ----------------
function showPreview(o) {
  const pv = $('#preview'); let html = '', url = '';
  if (o.cr) {
    const cr = o.cr, P = game.p[cr.owner];
    if (visibleToHuman(cr)) {
      url = faceOf(cr.card, P.cls).url;
      html = `<b>${cr.card.name}</b>　${TIER[cr.card.tier].stars}\n当前战力 ${game.staticPw(cr)}（原始 ${cr.card.power}）${cr.owner === 0 ? (cr.attacksLeft > 0 ? `\n· 本回合还能攻击 ${cr.attacksLeft} 次` : '\n· 本回合不能再攻击') : ''}${cr.blocksLeft > 0 ? '' : '\n· 本回合已经拦截过'}${cr.up ? '' : '\n· 暗置中' + (cr.owner === 0 ? '（对手看不到）' : '（你已知道身份）')}${cr.armorUsed ? '\n· 装甲已用掉' : ''}\n${cardText(cr.card) || '无技能。'}`;
    } else {
      url = BACK_IMG[P.cls] ? `cards/back_${P.cls}${cr.card.tier}.jpg` : drawBack(P.cls, cr.card.tier).toDataURL(); const t = TIER[cr.card.tier];
      html = `<b>对手的暗置怪物</b>\n等级 ${t.stars}（${t.name}），战力在 ${{ 1: '1–3', 2: '4–7', 3: '8–10' }[cr.card.tier]} 之间。`;
    }
  } else if (o.card) {
    url = faceOf(o.card, o.cls).url;
    html = `<b>${o.card.name}</b>　${o.card.cost} 能量 · ${o.card.typ === 'unit' ? TIER[o.card.tier].stars + ' 战力 ' + o.card.power : o.card.typ === 'effect' ? '效果牌' : '事件牌'}\n${cardText(o.card) || '无技能。'}`;
  } else if (o.pile !== undefined) {
    const P = game.p[o.pile]; const c = P.grave[P.grave.length - 1]; url = faceOf(c, P.cls).url;
    html = `<b>${o.pile === 0 ? '你的' : '对手的'}弃牌堆（${P.grave.length}）</b>\n${P.grave.map(x => x.name).join('、')}`;
  }
  pv.querySelector('.img').style.backgroundImage = `url("${url}")`;
  pv.querySelector('.info').innerHTML = html; pv.style.display = 'block';
}
function hidePreview() { $('#preview').style.display = 'none'; }

// ---------------- 交互 ----------------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(ev) {
  mouse.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData : null;
}
// ---------------- 箭头 ----------------
const arrowSvg = $('#arrow'), arrowPath = $('#arrow-path'), arrowHead = $('#arrow-head');
function showArrow(x1, y1, x2, y2, hot = false) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1);
  const cx = mx, cy = my - Math.min(160, len * 0.35);
  arrowPath.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
  const ang = Math.atan2(y2 - cy, x2 - cx) * 180 / Math.PI;
  arrowHead.setAttribute('transform', `translate(${x2},${y2}) rotate(${ang})`);
  arrowSvg.classList.toggle('hot', hot); arrowSvg.style.display = 'block';
}
function hideArrow() { arrowSvg.style.display = 'none'; }
function toScreen(p) { const v = new THREE.Vector3(p.x, p.y ?? 0.003, p.z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }
function crScreen(cr) { const s = SLOTS[cr.owner].cards[game.p[cr.owner].board.indexOf(cr)]; return s ? toScreen(s) : null; }
function faceScreen(side) { const r = SLOTS[side].cards; return toScreen({ x: (r[2].x + r[3].x) / 2, y: r[0].y, z: r[0].z }); }
async function flashArrow(from, to, ms = 700, hot = true) { if (!from || !to) return; showArrow(from[0], from[1], to[0], to[1], hot); await new Promise(r => setTimeout(r, ms)); hideArrow(); }

// ---------------- 手牌拖动 ----------------
let handDrag = null;   // {card, el, sx, sy, moved, cands, over}
function handOrigin(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + 8]; }
function startHandDrag(c, ev) {
  if (!pending || pending.type !== 'idle' || ev.button !== 0) return;
  const t = c.typ === 'effect' ? game.effTargets(0, c) : null;
  const r = ev.currentTarget.getBoundingClientRect();
  handDrag = { card: c, rect: r, ox: r.left + r.width / 2, oy: r.top + 8, sx: ev.clientX, sy: ev.clientY, moved: false, cands: t || null, over: null };
  if (ev.pointerType === 'touch') { const hd = handDrag; hd.lp = setTimeout(() => { if (handDrag === hd && !hd.moved) { hd.preview = true; showPreview({ card: c, cls: game.p[0].cls }); } }, 420); }
}
addEventListener('pointermove', ev => {
  if (!handDrag) return;
  if (!handDrag.moved && Math.hypot(ev.clientX - handDrag.sx, ev.clientY - handDrag.sy) > 8) { handDrag.moved = true; clearTimeout(handDrag.lp); closePop(); hidePreview(); }
  if (!handDrag.moved) return;
  const c = handDrag.card, u = pick(ev);
  handDrag.over = u && u.cr && handDrag.cands && handDrag.cands.includes(u.cr) ? u.cr : nearestCand(ev, handDrag.cands);
  const onTable = ev.clientY < $('#hand').getBoundingClientRect().top - 10;
  const ok = canPlay(c) && (c.typ === 'unit' || handDrag.cands === null ? onTable : !!handDrag.over);
  showArrow(handDrag.ox, handDrag.oy, ev.clientX, ev.clientY, ok);
  if (c.typ === 'event') setHint('事件牌不用主动打出：时机出现时会弹窗问你。');
  else if (!canPlay(c)) setHint(game.whyNot(0, c));
  else if (c.typ === 'unit') setHint(onTable ? `松开：召唤【${c.name}】（${c.cost} 能量）` : '拖到牌桌上松开，召唤这只怪物');
  else if (handDrag.cands === null) setHint(onTable ? `松开：打出【${c.name}】` : '拖到牌桌上松开，打出这张效果牌');
  else setHint(handDrag.over ? `松开：对【${handDrag.over.card.name === undefined ? '' : (visibleToHuman(handDrag.over) ? handDrag.over.card.name : '暗置怪物')}】打出【${c.name}】` : game.effPrompt(c) + '（拖到发光的目标上）');
  sync();
});
addEventListener('pointerup', ev => {
  if (!handDrag) return;
  const d = handDrag; handDrag = null; hideArrow(); clearTimeout(d.lp);
  if (d.preview && !d.moved) { hidePreview(); sync(); return; }
  if (!d.moved) { onHandClick(d.card, { currentTarget: { getBoundingClientRect: () => d.rect } }); return; }   // 没拖动就当点击
  suppressClick = true; setTimeout(() => suppressClick = false, 50);
  const c = d.card;
  const onTable = ev.clientY < $('#hand').getBoundingClientRect().top - 10;
  if (!pending || pending.type !== 'idle') { sync(); return; }
  if (c.typ === 'event' || !canPlay(c)) { flash(game.whyNot(0, c)); sync(); return; }
  if (c.typ === 'unit') {
    if (!onTable) { idleHint(); sync(); return; }
    openPop(ev.clientX, ev.clientY + 40, `召唤【${c.name}】（${TIER[c.tier].stars} 战力 ${c.power} · ${c.cost} 能量）${c.req ? '\n' + REQ_TEXT[c.req] : ''}`, [
      { label: '暗出（只露等级）', primary: true, onclick: () => finishIdle({ type: 'unit', card: c, up: false }) },
      { label: '明出（立刻翻开）', onclick: () => finishIdle({ type: 'unit', card: c, up: true }) },
      { label: '取消', onclick: () => { idleHint(); } },
    ]);
  } else if (d.cands === null) {
    if (onTable) finishIdle({ type: 'eff', card: c, arg: null }); else idleHint();
  } else {
    if (d.over) finishIdle({ type: 'eff', card: c, arg: d.over });
    else if (!onTable) idleHint();   // 拖回手牌区 = 取消
    else onHandClick(c, { currentTarget: { getBoundingClientRect: () => d.rect } });   // 没对准：改成点选目标
  }
  sync();
});
let suppressClick = false;
function nearestCand(ev, cands) {
  if (!cands || !cands.length) return null;
  let best = null, bd = Math.max(110, innerHeight * 0.13);
  for (const cr of cands) { const s = crScreen(cr); if (!s) continue; const d = Math.hypot(s[0] - ev.clientX, s[1] - ev.clientY); if (d < bd) { bd = d; best = cr; } }
  return best;
}
function finishIdle(act) { if (pending && pending.type === 'idle') { const res = pending.resolve; clearPending(); res(act); } }

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.004);
function groundPoint(ev) {
  mouse.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const p = new THREE.Vector3(); return ray.ray.intersectPlane(dragPlane, p) ? p : null;
}
let orbit = null;
// ---- 触屏：双指旋转/缩放，长按看大图 ----
let lastPtr = 'mouse';
addEventListener('pointerdown', ev => { lastPtr = ev.pointerType; }, true);
const touches = new Map(); let pinch = null, lpTimer = 0, lpShown = false, lpStart = null;
function pinchState() { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
canvas.addEventListener('pointerdown', ev => {
  if (ev.pointerType !== 'touch') return;
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  clearTimeout(lpTimer); lpShown = false;
  if (touches.size >= 2) {
    if (drag) { drag = null; hideArrow(); if (pending?.type === 'idle') idleHint(); }
    const st = pinchState(); pinch = { ...st, yaw: view.yaw, polar: view.polar, zoom: view.zoom };
    ev.stopImmediatePropagation(); return;
  }
  lpStart = { x: ev.clientX, y: ev.clientY };
  const e0 = { clientX: ev.clientX, clientY: ev.clientY };
  lpTimer = setTimeout(() => { const u = pick(e0); if (u && (u.cr || u.card)) { lpShown = true; drag = null; hideArrow(); showPreview(u); } }, 450);
}, true);
canvas.addEventListener('pointermove', ev => {
  if (ev.pointerType !== 'touch' || !touches.has(ev.pointerId)) return;
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (lpStart && Math.hypot(ev.clientX - lpStart.x, ev.clientY - lpStart.y) > 10) clearTimeout(lpTimer);
  if (pinch && touches.size >= 2) {
    const st = pinchState();
    view.yaw = pinch.yaw - (st.mx - pinch.mx) * 0.008;
    view.polar = Math.min(1.25, Math.max(0.05, pinch.polar - (st.my - pinch.my) * 0.006));
    view.zoom = Math.min(1.8, Math.max(0.55, pinch.zoom * pinch.d / st.d));
    fitCamera(); ev.stopImmediatePropagation(); return;
  }
  if (lpShown) ev.stopImmediatePropagation();
}, true);
function touchEnd(ev) {
  if (ev.pointerType !== 'touch') return;
  touches.delete(ev.pointerId); clearTimeout(lpTimer);
  if (pinch) { if (touches.size < 2) pinch = null; ev.stopImmediatePropagation(); if (!touches.size) { suppressClick = true; setTimeout(() => suppressClick = false, 80); } return; }
  if (lpShown) { lpShown = false; hidePreview(); hoverObj = null; suppressClick = true; setTimeout(() => suppressClick = false, 80); ev.stopImmediatePropagation(); return; }
  if (hoverObj) { hoverObj = null; hidePreview(); }
}
canvas.addEventListener('pointerup', touchEnd, true);
canvas.addEventListener('pointercancel', touchEnd, true);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom = Math.min(1.8, Math.max(0.55, view.zoom * (e.deltaY > 0 ? 1.08 : 0.93))); fitCamera(); }, { passive: false });
canvas.addEventListener('pointerdown', ev => {
  closePop();
  if (ev.button === 2) { orbit = { x: ev.clientX, y: ev.clientY, yaw: view.yaw, polar: view.polar }; canvas.setPointerCapture(ev.pointerId); return; }
  if (ev.button !== 0) return;
  const u = pick(ev);
  if (u && u.cr && pending && pending.type === 'idle' && u.cr.owner === 0 && u.cr.attacksLeft <= 0) { flash(game.turns && game.p[0].board.includes(u.cr) ? `【${u.cr.card.name}】本回合不能攻击（刚上场，或已经攻击过）。` : ''); return; }
  if (u && u.cr && pending && pending.type === 'idle' && u.cr.owner === 0) {
    drag = { cr: u.cr, sx: ev.clientX, sy: ev.clientY, pos: null, moved: false };
    canvas.setPointerCapture(ev.pointerId); hidePreview();
  }
});
canvas.addEventListener('pointermove', ev => {
  if (orbit) {
    view.yaw = orbit.yaw - (ev.clientX - orbit.x) * 0.006;
    view.polar = Math.min(1.25, Math.max(0.05, orbit.polar - (ev.clientY - orbit.y) * 0.005));
    fitCamera(); return;
  }
  if (drag) {
    if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 6) drag.moved = true;
    if (drag.moved) {
      drag.pos = groundPoint(ev);
      const from = crScreen(drag.cr); if (from) showArrow(from[0], from[1], ev.clientX, ev.clientY, !!(drag.pos && drag.pos.z < DIVIDE_Z));
      setHint(drag.pos && drag.pos.z < DIVIDE_Z ? `松开：用【${drag.cr.card.name}】发起攻击` : '拖到对面半场松开，发起攻击');
      sync();
    }
    canvas.style.cursor = 'grabbing'; return;
  }
  const u = pick(ev);
  if (u !== hoverObj) { hoverObj = u; if (u) showPreview(u); else hidePreview(); sync(); }
  canvas.style.cursor = u && u.cr && (pending?.cands || []).includes(u.cr) ? 'pointer' : u && u.cr && pending?.type === 'idle' && u.cr.owner === 0 ? 'grab' : 'default';
});
canvas.addEventListener('pointerup', ev => {
  if (orbit && ev.button === 2) { orbit = null; return; }
  if (ev.button !== 0) return;
  if (drag) {
    const d = drag; drag = null; canvas.style.cursor = 'default'; hideArrow();
    if (d.moved && d.pos && d.pos.z < DIVIDE_Z && pending && pending.type === 'idle') {
      const r = pending.resolve; clearPending(); r({ type: 'atk', cr: d.cr }); return;
    }
    sync();
    if (!d.moved) flash('按住你的怪物，拖到对面半场松开，就能发起攻击。');
    else if (pending?.type === 'idle') idleHint();
    return;
  }
  if (!pending || (pending.type !== 'target' && pending.type !== 'block')) return;
  const u = pick(ev);
  const cr = u && u.cr && pending.cands.includes(u.cr) ? u.cr : nearestCand(ev, pending.cands);
  if (cr) { const r = pending.resolve; clearPending(); r(cr); }
});
canvas.addEventListener('pointercancel', () => { drag = null; orbit = null; hideArrow(); sync(); });
$('#btn-view').onclick = () => { Object.assign(view, VIEW0); fitCamera(); };

// 撞击动画：攻击方冲向拦截者（或对方生命区）再弹回
function tween(ms, f) { return new Promise(res => { const t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / ms); f(k); sync(); if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
async function lunge(A, B) {
  if (!SLOTS) return;
  SFX.fx('attack');
  const from = SLOTS[A.owner].cards[game.p[A.owner].board.indexOf(A)]; if (!from) return;
  let to;
  if (B && game.p[B.owner].board.includes(B)) to = SLOTS[B.owner].cards[game.p[B.owner].board.indexOf(B)];
  else { const r = SLOTS[1 - A.owner].cards; to = { x: (r[2].x + r[3].x) / 2, z: r[0].z }; }
  const dx = (to.x - from.x) * 0.82, dz = (to.z - from.z) * 0.82;
  const sa = crScreen(A), sb = B && game.p[B.owner].board.includes(B) ? crScreen(B) : faceScreen(1 - A.owner);
  if (A.owner === 1) await flashArrow(sa, sb, 650);
  await tween(260, k => { const e = k * k; animOff.set(A.uid, { x: dx * e, z: dz * e }); });
  await tween(240, k => { const e = 1 - (1 - k) * (1 - k); animOff.set(A.uid, { x: dx * (1 - e), z: dz * (1 - e) }); });
  animOff.delete(A.uid); sync();
}

const IDLE_HINT = '你的回合：花能量出牌，把绿光怪物拖到对面攻击；做完点「结束回合」。';
function idleHint() { setHint(IDLE_HINT, [{ label: '结束回合', primary: true, onclick: endTurn }]); }
function endTurn() { if (pending && pending.type === 'idle') { const r = pending.resolve; clearPending(); r({ type: 'end' }); } }
function setHint(text, btns = []) {
  const h = $('#hint'); if (!text) { h.classList.remove('show'); return; }
  $('#hint-text').textContent = text; const b = $('#hint-btns'); b.innerHTML = '';
  for (const x of btns) { const e = document.createElement('button'); e.className = 'btn' + (x.primary ? ' primary' : ''); e.textContent = x.label; e.onclick = x.onclick; b.appendChild(e); }
  h.classList.add('show');
}
function clearPending() { pending = null; setHint(null); sync(); }

const pop = $('#pop');
function closePop() { pop.style.display = 'none'; }
function openPop(x, y, title, items) {
  pop.innerHTML = `<div class="t">${title}</div>`;
  for (const it of items) { const b = document.createElement('button'); b.className = 'btn' + (it.primary ? ' primary' : ''); b.textContent = it.label; b.onclick = () => { closePop(); it.onclick(); }; pop.appendChild(b); }
  pop.style.display = 'flex';
  const r = pop.getBoundingClientRect();
  pop.style.left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
  pop.style.top = Math.max(8, y - r.height - 20) + 'px';
}

async function onHandClick(c, ev) {
  if (!pending || pending.type !== 'idle') return;
  if (c.typ === 'event') { flash('事件牌不用主动打出：时机出现时会弹窗问你。'); return; }
  if (!canPlay(c)) { flash(game.whyNot(0, c)); return; }
  const r = ev.currentTarget.getBoundingClientRect();
  if (c.typ === 'unit') {
    openPop(r.left + r.width / 2, r.top, `${c.name}（${TIER[c.tier].stars} 战力 ${c.power} · ${c.cost} 能量）${c.req ? '\n' + REQ_TEXT[c.req] : ''}`, [
      { label: '暗出（只露等级）', primary: true, onclick: () => finish({ type: 'unit', card: c, up: false }) },
      { label: '明出（立刻翻开）', onclick: () => finish({ type: 'unit', card: c, up: true }) },
      { label: '取消', onclick: () => { } },
    ]);
  } else {
    const t = game.effTargets(0, c);
    if (t === null) {
      openPop(r.left + r.width / 2, r.top, `${c.name}（${c.cost} 能量）`, [{ label: '打出', primary: true, onclick: () => finish({ type: 'eff', card: c, arg: null }) }, { label: '取消', onclick: () => { } }]);
    } else {
      const idleResolve = pending.resolve;
      const target = await chooseTarget(game.effPrompt(c), t, true, '取消');
      if (target) { idleResolve({ type: 'eff', card: c, arg: target }); }
      else { pending = { type: 'idle', resolve: idleResolve }; idleHint(); sync(); }
    }
  }
  function finish(act) { if (pending && pending.type === 'idle') { const res = pending.resolve; clearPending(); res(act); } }
}

const CINE = { n12: 1, n11: 1, g11: 1, g12: 1, c11: 1, c12: 1, g30: 1, g28: 1, g26: 1, n14: 1, n28: 1, c16: 1, c28: 1 };
let cineOn = true; try { cineOn = localStorage.getItem('cine-off') !== '1'; } catch (e) { }
function playCine(card) {
  if (!cineOn || !CINE[card.id]) return Promise.resolve();
  return new Promise(res => {
    const box = $('#cine'), v = $('#cine-v'); let done = false;
    const end = () => { if (done) return; done = true; box.classList.remove('show'); v.pause(); res(); };
    v.src = `anim/${card.id}.mp4`; v.currentTime = 0; box.classList.add('show');
    v.onended = end; box.onclick = end; v.onerror = end; setTimeout(end, 4500);
    const p = v.play(); if (p && p.catch) p.catch(end);
  });
}
const cinePre = new Set();
function preloadCine(...cls) {
  for (const id of Object.keys(CINE)) if (cls.some(k => id[0] === k[0]) && !cinePre.has(id)) {
    cinePre.add(id); const l = document.createElement('link'); l.rel = 'preload'; l.as = 'video'; l.href = `anim/${id}.mp4`; document.head.appendChild(l);
  }
}
const cineBtn = document.getElementById('btn-cine');
if (cineBtn) { const upd = () => cineBtn.textContent = '动画：' + (cineOn ? '开' : '关'); upd();
  cineBtn.onclick = () => { cineOn = !cineOn; try { localStorage.setItem('cine-off', cineOn ? '0' : '1'); } catch (e) { } upd(); }; }
let toastTimer = null;
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
let flashTimer = null;
function flash(t) { setHint(t); clearTimeout(flashTimer); flashTimer = setTimeout(() => { if (pending?.type === 'idle') idleHint(); else if (!pending) setHint(null); }, 1800); }

function chooseTarget(prompt, cands, optional, skipLabel = '跳过') {
  return new Promise(resolve => {
    pending = { type: 'target', cands, resolve };
    setHint(prompt, optional ? [{ label: skipLabel, onclick: () => { clearPending(); resolve(null); } }] : []);
    sync();
  });
}

function ask(title, text, buttons, card = null, cls = null) {
  return new Promise(resolve => {
    $('#ask-title').textContent = title; $('#ask-text').textContent = text;
    const img = $('#ask-img');
    if (card) { img.style.display = 'block'; img.style.backgroundImage = `url("${faceOf(card, cls || ({ g: 'gang', n: 'net', c: 'corp' }[card.id[0]])).url}")`; } else img.style.display = 'none';
    const b = $('#ask-btns'); b.innerHTML = '';
    for (const x of buttons) { const e = document.createElement('button'); e.className = 'btn' + (x.primary ? ' primary' : ''); e.textContent = x.label; e.onclick = () => { $('#ask').classList.remove('show'); resolve(x.value); }; b.appendChild(e); }
    $('#ask').classList.add('show');
  });
}

// ---------------- 引擎回调 ----------------
const UI = {
  log(t, kind = '') {
    const d = document.createElement('div'); d.className = 'l ' + kind; d.textContent = t;
    const box = $('#loglines'); box.appendChild(d); box.scrollTop = 1e9;
  },
  async sync() { sync(); },
  delay: ms => new Promise(r => setTimeout(r, ms)),
  highlight(list) { highlightSet = new Set(list.map(c => c.uid)); sync(); },
  turnStart(a) {
    if (a === 0) $('#hand').classList.add('mine'); else $('#hand').classList.remove('mine');
    const b = $('#banner'); b.innerHTML = a === 0 ? '<small>YOUR TURN</small>你的回合' : '<small>ENEMY TURN</small>对手回合'; b.className = ''; void b.offsetWidth; b.className = (a === 0 ? 'you' : 'ai') + ' flip'; if (a === 0) SFX.fx('turn');
    UI.log(`—— 第 ${game.turns} 手 · ${a === 0 ? '你' : '对手'} ——`, 'turn');
  },
  getAction() {
    return new Promise(resolve => { pending = { type: 'idle', resolve }; idleHint(); sync(); });
  },
  chooseTarget(prompt, cands, optional) { return chooseTarget(prompt, cands, optional); },
  chooseBlock(A, board) {
    return new Promise(resolve => {
      pending = { type: 'block', cands: board, resolve };
      const who = A.up || A.known ? `【${A.card.name}】（战力 ${game.staticPw(A)}）` : `一只暗置 ${TIER[A.card.tier].stars} 怪物`;
      setHint(`对手用${who}攻击你：点你的一只怪物拦截，或者不拦截（失去 1 点生命）。`, [{ label: '不拦截', onclick: () => { clearPending(); resolve(null); } }]);
      sync();
    });
  },
  ask(title, text, buttons, card) { return ask(title, text, buttons, card, null); },
  lunge(A, B) { return lunge(A, B); },
  sfx(kind, card, opts) { SFX.play(kind, card, opts); },
  fx(name, tier) { SFX.fx(name, tier); },
  toast(text) { toast(text); },
  cinematic(card) { return playCine(card); },
  async aim(a, target) { const S = SLOTS[a].event; await flashArrow(toScreen(S), crScreen(target), 800); },
};

// 每局一个 UI 绑定：旧对局一旦被替换就停在原地
let currentToken = null;
function makeUI(token) {
  const never = new Promise(() => { });
  const live = () => token === currentToken;
  const ui = {};
  for (const [k, f] of Object.entries(UI)) ui[k] = (...a) => live() ? f(...a) : (k === 'log' || k === 'highlight' || k === 'turnStart' ? undefined : never);
  return ui;
}

// ---------------- 主流程 ----------------
let lastPick = null;
async function newGame(cls, opp = 'random') {
  lastPick = [cls, opp];
  humanCls = cls; aiCls = opp === 'random' ? ['gang', 'net', 'corp'][Math.floor(Math.random() * 3)] : opp;
  $('#loglines').innerHTML = ''; pending = null; highlightSet = new Set(); setHint(null);
  const token = {}; currentToken = token;
  preloadCine(humanCls, aiCls);
  game = new Game(humanCls, aiCls, makeUI(token), ['human', 'ai']);
  const first = Math.random() < .5 ? 0 : 1;
  UI.log(`你是【${CLASSES[humanCls].name}】，对手是【${CLASSES[aiCls].name}】。${first === 0 ? '你先手' : '对手先手'}。`, 'turn');
  sync();
  const myGame = game;
  const stats = trackStats(game);
  const w = await game.run(first);
  if (myGame !== game) return;
  setHint(null);
  showResult(w, game, stats);
}

// ---- 对局统计 + 结算画面 ----
function trackStats(g) {
  const st = [0, 1].map(() => ({ kills: 0, dmg: 0, played: 0, credit: {} }));
  let pair = null;
  const res0 = g.resolve.bind(g); g.resolve = (A, ...r) => { pair = [A, r[1]]; return res0(A, ...r); };
  const k0 = g.kill.bind(g);
  g.kill = async (cr, why = '', pierce) => {
    const o = cr.owner, before = g.p[o].board.includes(cr);
    const r = await k0(cr, why, pierce);
    if (before && !g.p[o].board.includes(cr)) {
      st[1 - o].kills++;
      let src = why;
      if (why === '战斗' && pair) { const f = pair[0] === cr ? pair[1] : pair[0]; if (f && f.owner !== o) src = f.card.id; else src = ''; }
      else { const c = CLASSES[g.p[1 - o].cls].cards().find(x => x.name === why); src = c ? c.id : ''; }
      if (src) st[1 - o].credit[src] = (st[1 - o].credit[src] || 0) + 1;
    }
    return r;
  };
  const d0 = g.damage.bind(g);
  g.damage = async (i, n, why) => { const b = g.p[i].life; try { return await d0(i, n, why); } finally { st[1 - i].dmg += Math.max(0, b - g.p[i].life); } };
  const pu = g.playUnit.bind(g), pe = g.playEffect.bind(g);
  g.playUnit = (a, ...r) => { st[a].played++; return pu(a, ...r); };
  g.playEffect = (a, ...r) => { st[a].played++; return pe(a, ...r); };
  return st;
}
const RES_COL = { gang: '#ff3cbe', net: '#5aebff', corp: '#f2c440' };
const RES_LINE = {
  win: { gang: '这条街，归我们了。', net: '入侵完成，痕迹已抹除。', corp: '威胁已清除，合同已履行。' },
  lose: { gang: '帮派被打散了。', net: '连接中断，信号丢失。', corp: '防线失守，资产受损。' },
};
function showResult(w, g, st) {
  const r = w === 0 ? 'win' : w === 1 ? 'lose' : 'draw', me = g.p[0], op = g.p[1];
  const end = $('#end'); end.dataset.r = r; end.classList.remove('show');
  const artCls = r === 'lose' ? op.cls : me.cls;
  end.style.setProperty('--acc', r === 'lose' ? '#ff3b5c' : RES_COL[me.cls]);
  $('#res-img').src = `art/end_${artCls}.jpg`;
  $('#res-cls').textContent = `${CLASSES[me.cls].name} VS ${CLASSES[op.cls].name}`;
  const big = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }[r];
  $('#res-big').textContent = big; $('#res-big').dataset.t = big;
  $('#end-title').textContent = { win: '胜 利', lose: '失 败', draw: '平 局' }[r];
  $('#end-text').textContent = r === 'draw' ? '双方同时倒下。' : RES_LINE[r][me.cls] + (r === 'win' ? `对手生命归零，你还剩 ${Math.max(0, me.life)} 点。` : `你在第 ${Math.ceil(g.turns / 2)} 回合倒下。`);
  const s = st[0], rounds = Math.ceil(g.turns / 2);
  const tiles = [['回合', 'ROUNDS', rounds, ''], ['剩余生命', 'HP LEFT', Math.max(0, me.life), `/${me.maxLife || 6}`], ['消灭怪物', 'KILLS', s.kills, ''], ['造成伤害', 'DAMAGE', s.dmg, '']];
  $('#res-stats').innerHTML = tiles.map(([k, e, v, sm]) => `<div class="st cut"><div class="e">${e}</div><div class="v" data-v="${v}">0<small>${sm}</small></div><div class="k">${k}</div></div>`).join('');
  const best = Object.entries(s.credit).sort((a, b) => b[1] - a[1])[0];
  let mvp = '';
  if (best) {
    const c = CLASSES[me.cls].cards().find(x => x.id === best[0]);
    if (c) mvp = `<div class="mini" style="background-image:url(${faceOf(c, me.cls).url})"></div><div><div class="t">MVP // 关键牌</div><b>${c.name}</b><span>本局消灭 ${best[1]} 只怪物 · 你共打出 ${s.played} 张牌</span></div>`;
  }
  $('#res-mvp').innerHTML = mvp;
  void end.offsetWidth; end.classList.add('show');
  SFX.jingle?.(r === "win");
  setTimeout(() => {
    for (const el of document.querySelectorAll('#res-stats .v')) {
      const target = +el.dataset.v, small = el.querySelector('small').outerHTML, t0 = performance.now();
      const step = now => { const p = Math.min(1, (now - t0) / 700); el.innerHTML = Math.round(target * (1 - (1 - p) ** 3)) + small; if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }, 1000);
}

if (innerHeight < 560) $('#log').classList.add('hidden');
function syncMuteBtn() { $('#btn-sfx').textContent = SFX.isMuted() ? '音效：关' : '音效：开'; }
syncMuteBtn();
$('#btn-sfx').onclick = () => { SFX.initAudio(); SFX.setMuted(!SFX.isMuted()); syncMuteBtn(); };
let pickMe = 'gang', pickOpp = 'random';
document.querySelectorAll('#pick-opp .opp').forEach(b => b.onclick = () => { pickOpp = b.dataset.cls; document.querySelectorAll('#pick-opp .opp').forEach(x => x.classList.toggle('sel', x === b)); });
$('#btn-start').onclick = () => { SFX.initAudio(); $('#start').classList.remove('show'); newGame(pickMe, pickOpp); };
document.querySelectorAll('.cls').forEach(b => b.onclick = () => {
  pickMe = b.dataset.cls; document.querySelectorAll('#pick-me .cls').forEach(x => x.classList.toggle('sel', x === b)); return;
  SFX.initAudio(); $('#start').classList.remove('show'); newGame(b.dataset.cls); });
$('#end-again').onclick = () => { $('#end').classList.remove('show'); $('#start').classList.add('show'); };
$('#end-rematch').onclick = () => { $('#end').classList.remove('show'); if (lastPick) newGame(...lastPick); else $('#start').classList.add('show'); };
$('#btn-new').onclick = () => { $('#ask').classList.remove('show'); currentToken = null; game = null; pending = null; setHint(null); $('#start').classList.add('show'); };
$('#btn-rules').onclick = () => $('#rules').classList.add('show');
$('#rules-close').onclick = () => $('#rules').classList.remove('show');
$('#btn-log').onclick = () => { $('#log').classList.toggle('hidden'); fitCamera(); };
$('#kwlist').innerHTML = Object.entries(KW).map(([k, v]) => `<li><b>${k}</b>：${v}</li>`).join('');
addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

(async () => {
  fitCamera();
  try { await loadTable(); } catch (e) { $('#loading').textContent = '牌桌模型加载失败：' + e.message; return; }
  $('#loading').style.display = 'none';
  renderer.setAnimationLoop(() => { renderer.render(scene, camera); placeLabels(); });
})();
window.__dbg = { get game() { return game; }, get pending() { return pending; },
  pickAt(x, y) { const u = pick({ clientX: x, clientY: y }); return u ? (u.cr ? u.cr.card.name + '@' + u.cr.owner : JSON.stringify(Object.keys(u))) : null; },
  face(cls, id) { const c = CLASSES[cls].cards().find(x => x.id === id); return faceOf(c, cls).url; },
  scr(side, i) { const s = SLOTS[side].cards[i]; const v = new THREE.Vector3(s.x, s.y, s.z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; } };
