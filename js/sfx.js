// 音效：以真实录音采样为主（sfx/ 目录，来源见 sfx/CREDITS.txt，全部 CC0 / 公有领域 / MIT），
// 采样没加载好时退回到 Web Audio 合成音。
let ctx = null, master = null, verb = null, muted = false;
try { muted = localStorage.getItem('sfx-muted') === '1'; } catch (e) { }

export function initAudio(custom = null) {
  if (ctx && !custom) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC && !custom) return;
  ctx = custom || new AC(); muted = custom ? false : muted;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
  master.connect(comp); comp.connect(ctx.destination);
  // 简易混响：衰减噪声做冲激响应
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(master);
  if (!custom) loadBank();
}
export function setMuted(m) { muted = m; try { localStorage.setItem('sfx-muted', m ? '1' : '0'); } catch (e) { } if (master) master.gain.value = m ? 0 : 0.7; }
export function isMuted() { return muted; }

// ---------- 基础积木 ----------
let tOff = 0;
const now = () => ctx.currentTime + tOff;
export function _offset(t) { tOff = t; }
let gainMul = 1;
function env(g, t, a, peak, d, end = 0.0001) { peak = Math.min(1, peak * gainMul); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
function out(node, wet = 0) { node.connect(master); if (wet && verb) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(verb); } }
function tone({ type = 'sine', f0, f1 = f0, t = now(), a = 0.005, d = 0.2, vol = 0.3, wet = 0, detune = 0, filter = null }) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d);
  const g = ctx.createGain(); env(g, t, a, vol, d);
  let n = o; if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.setValueAtTime(filter.f0, t); if (filter.f1) f.frequency.exponentialRampToValueAtTime(filter.f1, t + a + d); f.Q.value = filter.q || 1; o.connect(f); n = f; }
  n.connect(g); out(g, wet); o.start(t); o.stop(t + a + d + 0.05);
}
function noise({ t = now(), a = 0.005, d = 0.3, vol = 0.3, type = 'bandpass', f0 = 1200, f1 = f0, q = 1, wet = 0 }) {
  const len = Math.ceil(ctx.sampleRate * (a + d + 0.05)); const b = ctx.createBuffer(1, len, ctx.sampleRate); const ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  const g = ctx.createGain(); env(g, t, a, vol, d);
  s.connect(f); f.connect(g); out(g, wet); s.start(t); s.stop(t + a + d + 0.05);
}
const thump = (t, f = 90, vol = 0.9, d = 0.45) => { tone({ type: 'sine', f0: f * 2, f1: f * 0.45, t, a: 0.004, d, vol }); noise({ t, d: 0.08, vol: vol * 0.35, type: 'lowpass', f0: 900 }); };

// ---------- 采样 ----------
const SAMPLES = ['place1', 'place2', 'thud', 'flip', 'flip2', 'slide', 'glitch1', 'glitch2', 'select', 'confirm', 'confirm2', 'error', 'bong', 'servo', 'servoDn', 'coin',
  'whoosh', 'whoosh2', 'punch', 'hit', 'impact', 'heavyHit', 'crunch', 'shunt', 'boomS', 'boomM', 'boomL', 'boomBig', 'nuke', 'debris', 'break', 'dmg', 'armor', 'glass',
  'gatling', 'blaster', 'laser', 'lance', 'rocket', 'drill', 'engine', 'afterburn', 'siren', 'scan', 'tractor', 'ionRain', 'ionHit', 'virus', 'plasma', 'swarm', 'inhibit',
  'thunder', 'magic', 'neutron', 'warpIn', 'warpOut', 'organIn', 'jumpIn', 'takeoff', 'launch', 'teleport'];
const buf = {};
let bankBase = 'sfx/';
export function setBankBase(b) { bankBase = b; }
function loadBank() {
  for (const n of SAMPLES) {
    if (buf[n]) continue;
    fetch(`${bankBase}${n}.mp3`).then(r => r.arrayBuffer()).then(a => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no))).then(b => { buf[n] = b; }).catch(() => { });
  }
}
export function bankReady() { return SAMPLES.every(n => buf[n]); }
// 播放一个采样：延迟 dt 秒、音量、变调（rate）、混响、可选低通
function smp(name, dt = 0, vol = 1, rate = 1, wet = 0.15, lp = 0) {
  const b = buf[name]; if (!b) return false;
  const t = now() + dt, src = ctx.createBufferSource(); src.buffer = b;
  src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.04);   // 每次略微变调，避免机械重复
  const g = ctx.createGain(); g.gain.value = Math.min(2, vol * gainMul);
  let n = src; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); n = f; }
  n.connect(g); out(g, wet); src.start(t); return true;
}
// 配方：[采样, 延迟, 音量, 变调, 混响, 低通]
function run(recipe) { if (!recipe || !recipe.every(r => buf[r[0]])) return false; for (const r of recipe) smp(...r); return true; }
const pick = (...xs) => xs[Math.floor(Math.random() * xs.length)];

// 出怪：拍牌声打底，按等级叠加分量，按职业加一点"味道"
function summonRecipe(card, cls) {
  const tier = card.tier || 1; cls = cls === undefined ? ({ g: 'gang', n: 'net', c: 'corp' })[card.id?.[0]] : cls;
  const r = [[pick('place1', 'place2'), 0, 1.8], ['slide', 0, 0.9, 0.9], ['thud', 0.01, 0.6, 1.2]];
  if (tier >= 2) r.push(['thud', 0.02, 1.0, 0.8], ['impact', 0.03, 0.55, 0.9, 0.2, 2500]);
  if (tier >= 3) r.push(['boomL', 0.05, 0.7, 0.8, 0.35, 1800], ['heavyHit', 0.0, 0.8, 0.85, 0.3]);
  const flavor = { gang: [['crunch', 0.08, 0.35, 1.1]], net: [['glitch1', 0.06, 0.6], ['glitch2', 0.12, 0.5]], corp: [['servo', 0.07, 0.45]] }[cls];
  if (flavor) r.push(...flavor);
  return r;
}
// 大怪和有特色的怪：专属配方（我方打出 / 翻开时）
const R_UNIT = {
  主脑: [['organIn', 0, 1.0, 1, 0.5], ['glitch1', 0.3, 0.8], ['glitch2', 0.45, 0.8], ['jumpIn', 0.5, 0.5, 1, 0.5], ['boomL', 0.05, 0.6, 0.7, 0.4, 1500]],
  深网之眼: [['scan', 0, 1.0, 0.8, 0.5], ['virus', 0.2, 0.6, 0.8, 0.4], ['glitch2', 0.5, 0.9], ['boomM', 0.1, 0.5, 0.7, 0.3, 1500]],
  重装机甲: [['heavyHit', 0, 1.1, 0.75, 0.3], ['impact', 0.35, 1.0, 0.7, 0.3], ['heavyHit', 0.7, 1.0, 0.7, 0.3], ['servo', 0.5, 0.6, 0.6]],
  帮派老大: [['siren', 0, 0.55, 1, 0.3], ['engine', 0.05, 0.8], ['heavyHit', 0.6, 0.9, 0.85], ['crunch', 0.65, 0.5]],
  公司执行官: [['warpIn', 0, 0.7, 1.2, 0.5], ['confirm2', 0.25, 0.8, 0.9, 0.4], ['coin', 0.5, 0.6], ['coin', 0.62, 0.5, 1.2]],
  天穹战甲: [['takeoff', 0, 0.9, 1, 0.4], ['boomL', 0.55, 0.9, 0.8, 0.4], ['servo', 0.7, 0.7, 0.7]],
  自爆无人机: [['launch', 0, 0.8, 1.3], ['place1', 0, 0.8]],
  义眼斥候: [['scan', 0, 0.6, 1.4], ['place2', 0, 0.9]],
  霓虹DJ: [['engine', 0, 0.5, 1.4], ['thud', 0.05, 0.9], ['thud', 0.3, 0.8], ['thud', 0.55, 0.8]],
  液压重拳手: [['heavyHit', 0, 0.9, 1.1], ['servoDn', 0.05, 0.6, 0.7]],
  回收者: [['crunch', 0, 0.7], ['drill', 0.1, 0.4, 1.2]],
  拆迁头目: [['heavyHit', 0, 0.9, 0.9], ['break', 0.15, 0.8], ['debris', 0.2, 0.6]],
  侦察无人机: [['launch', 0, 0.6, 1.5], ['select', 0.1, 0.5]],
  脚本小子: [['glitch1', 0, 0.9], ['glitch2', 0.08, 0.9], ['select', 0.12, 0.5, 1.2]],
  蠕虫程序: [['swarm', 0, 0.6, 1.3], ['glitch2', 0.1, 0.8]],
  幻影骑手: [['afterburn', 0, 0.6, 1.2], ['whoosh', 0.1, 0.7]],
  镜像AI: [['teleport', 0, 0.8], ['glitch1', 0.15, 0.8]],
  黑冰: [['glass', 0, 1.0, 0.7], ['ionHit', 0.05, 0.6, 1.1]],
  数据幽灵: [['warpOut', 0, 0.6, 1.4], ['glitch1', 0.1, 0.7]],
  回声程序: [['select', 0, 0.6], ['select', 0.15, 0.45], ['select', 0.3, 0.3]],
  量子刺客: [['teleport', 0, 0.8, 1.2], ['blaster', 0.15, 0.6, 1.3]],
  暗网中继: [['tractor', 0, 0.7, 0.8], ['glitch2', 0.2, 0.7]],
  防暴无人机: [['launch', 0, 0.6, 1.4], ['armor', 0.15, 0.6]],
  合规审计员: [['bong', 0, 0.7], ['coin', 0.1, 0.6]],
  企业狙击手: [['lance', 0, 0.7], ['place1', 0, 0.8]],
  安保机器人: [['servo', 0, 0.8, 0.8], ['impact', 0.1, 0.7]],
  公关经理: [['confirm', 0, 0.7], ['coin', 0.15, 0.4]],
  安保主管: [['bong', 0, 0.8], ['servo', 0.1, 0.6], ['thud', 0.2, 0.8]],
};
const R_EFF = {
  suppress: [['gatling', 0, 0.9], ['gatling', 0.18, 0.9, 0.95], ['gatling', 0.36, 0.9, 1.05], ['boomS', 0.6, 0.9]],
  upgrade: [['drill', 0, 0.8], ['servo', 0.5, 0.7], ['place2', 0.75, 1.0]],
  charge: [['engine', 0, 0.8, 1.15], ['whoosh', 0.6, 0.9]],
  draw2: [['flip', 0, 0.9], ['flip2', 0.18, 0.9]],
  heal: [['confirm', 0, 0.7], ['magic', 0.05, 0.4, 1.2, 0.5]],
  scrapDraw: [['crunch', 0, 0.9], ['drill', 0.1, 0.4], ['flip', 0.55, 0.8], ['flip2', 0.72, 0.8]],
  implant: [['drill', 0, 0.8, 0.9], ['crunch', 0.4, 0.7], ['servo', 0.7, 0.8]],
  meatBomb: [['siren', 0, 0.35, 1.3], ['boomL', 0.35, 1.1], ['debris', 0.45, 0.7]],
  gangUp: [['punch', 0, 1], ['punch', 0.09, 1, 0.9], ['impact', 0.18, 0.8], ['punch', 0.27, 1, 1.1], ['heavyHit', 0.38, 0.9]],
  rally: [['siren', 0, 0.45], ['engine', 0.1, 0.7, 1.1], ['whoosh2', 0.6, 0.8]],
  rocket: [['rocket', 0, 1.0], ['boomL', 0.8, 1.1], ['debris', 0.9, 0.6]],
  war: [['siren', 0, 0.6], ['engine', 0.2, 0.8], ['nuke', 0.7, 1.0]],
  expose: [['scan', 0, 1.0], ['glitch1', 0.5, 0.8], ['glitch2', 0.6, 0.8]],
  hijack: [['glitch1', 0, 0.9], ['tractor', 0.05, 0.9], ['glitch2', 0.6, 0.9]],
  purge: [['select', 0, 0.5, 1.5], ['select', 0.15, 0.5, 1.5], ['laser', 0.3, 0.9], ['boomS', 0.6, 0.6, 1.2]],
  reset: [['servoDn', 0, 0.8], ['servo', 0.4, 0.8]],
  reload: [['servoDn', 0, 0.7], ['servo', 0.25, 0.7], ['glitch1', 0.3, 0.7]],
  swarm: [['swarm', 0, 0.8], ['swarm', 0.15, 0.8, 1.15], ['glitch2', 0.2, 0.7]],
  ddos: [['ionRain', 0, 1.0], ['ionRain', 0.25, 0.9, 0.9], ['error', 0.5, 0.6]],
  spread: [['virus', 0, 0.9], ['glitch1', 0.3, 0.7], ['glitch2', 0.5, 0.7]],
  exploit: [['plasma', 0, 0.8], ['glitch1', 0.1, 0.8], ['shunt', 0.3, 0.7]],
  ramp: [['coin', 0, 0.8], ['coin', 0.12, 0.7, 1.12], ['confirm2', 0.2, 0.6]],
  armorUp: [['armor', 0, 0.8], ['glass', 0.05, 0.7, 0.8], ['servo', 0.1, 0.5]],
  strike: [['select', 0, 0.5, 1.4], ['lance', 0.2, 0.9], ['hit', 0.6, 0.8]],
  buyout: [['bong', 0, 0.9, 0.8], ['thunder', 0.1, 0.9], ['coin', 0.5, 0.6], ['coin', 0.6, 0.5, 1.15]],
  bounce: [['takeoff', 0, 0.7, 1.2], ['flip', 0.6, 0.8]],
  layoff: [['error', 0, 0.6], ['crunch', 0.15, 0.6], ['coin', 0.4, 0.7], ['coin', 0.5, 0.6, 1.12]],
  bonusAll: [['coin', 0, 0.8], ['coin', 0.1, 0.8, 1.12], ['coin', 0.2, 0.8, 1.25], ['confirm2', 0.3, 0.6]],
  quarantine: [['inhibit', 0, 0.9], ['glass', 0.15, 0.8], ['error', 0.3, 0.5]],
  lawsuit: [['bong', 0, 0.9, 0.7], ['thunder', 0.05, 0.8, 0.9], ['servoDn', 0.4, 0.7]],
  sweep: [['scan', 0, 0.9, 0.9], ['laser', 0.3, 0.7], ['boomS', 0.6, 0.6], ['boomS', 0.75, 0.6, 1.1], ['boomS', 0.9, 0.6, 0.9]],
  merger: [['servo', 0, 0.7], ['armor', 0.2, 0.8], ['confirm', 0.35, 0.5]],
};
const R_EV = {
  pump: [['thud', 0, 1, 0.6], ['thud', 0.16, 0.9, 0.6], ['thud', 0.5, 1, 0.6], ['thud', 0.66, 0.9, 0.6], ['engine', 0.1, 0.4, 1.3]],
  shield: [['armor', 0, 1.0], ['glass', 0.02, 0.7, 0.8]],
  revenge: [['boomM', 0, 1.0], ['boomM', 0.12, 0.9, 0.9]],
  standIn: [['punch', 0, 0.9], ['whoosh2', 0.05, 0.8]],
  cancel: [['inhibit', 0, 0.9], ['error', 0.1, 0.6], ['ionHit', 0.05, 0.6]],
  counter: [['neutron', 0, 0.8], ['glitch1', 0.2, 0.9], ['boomS', 0.4, 0.7]],
  jam: [['ionRain', 0, 0.9], ['glitch2', 0.1, 0.8], ['glitch1', 0.25, 0.8]],
  ghost: [['warpOut', 0, 0.8], ['glitch1', 0.2, 0.7]],
  riposte: [['shunt', 0, 0.9], ['hit', 0.15, 0.9]],
  evac: [['takeoff', 0, 0.8, 1.15], ['servo', 0.3, 0.5]],
  insure: [['bong', 0, 0.6], ['coin', 0.1, 0.7], ['flip', 0.3, 0.7]],
  phalanx: [['armor', 0, 0.8], ['armor', 0.12, 0.8, 0.9], ['armor', 0.24, 0.8, 0.8], ['impact', 0.3, 0.8]],
};
// 战斗与流程
const R_FX = {
  attack: [['whoosh', 0, 0.9], ['whoosh2', 0.02, 0.5, 0.9]],
  clash: [['impact', 0, 1.0], ['hit', 0.02, 0.7]],
  armorBlock: [['armor', 0, 1.0], ['glass', 0.02, 0.6, 0.9]],
  kill1: [['boomS', 0, 0.85], ['debris', 0.05, 0.4, 1.2]],
  kill2: [['boomM', 0, 0.95], ['debris', 0.05, 0.6]],
  kill3: [['boomBig', 0, 1.0], ['debris', 0.1, 0.8, 0.8]],
  damage: [['dmg', 0, 1.0], ['heavyHit', 0, 0.6, 0.8]],
  draw: [['flip', 0, 0.6, 1.1]],
  turn: [['bong', 0, 0.5, 0.9], ['select', 0.05, 0.35]],
};
export function fx(name, tier = 1) { if (!ctx || muted) return; const k = name === 'kill' ? 'kill' + Math.min(3, tier || 1) : name; try { run(R_FX[k]); } catch (e) { } }

// ---------- 通用：出怪（按费用） ----------
function summonGeneric(cost) {
  const t = now();
  if (cost <= 1) {
    tone({ type: 'square', f0: 520, f1: 880, t, d: 0.09, vol: 0.25, filter: { f0: 3000 } });
    tone({ type: 'triangle', f0: 880, t: t + 0.06, d: 0.14, vol: 0.25 });
    thump(t, 110, 0.6, 0.18);
  } else if (cost <= 3) {
    thump(t, 80, 0.9, 0.4);
    noise({ t, a: 0.02, d: 0.35, vol: 0.3, f0: 400, f1: 3000, q: 2 });
    [440, 554, 659].forEach((f, i) => tone({ type: 'sawtooth', f0: f, t: t + 0.05 + i * 0.07, d: 0.25, vol: 0.14, wet: 0.4, filter: { f0: 2500 } }));
  } else {
    thump(t, 60, 1.0, 0.9);
    noise({ t, a: 0.01, d: 0.9, vol: 0.32, type: 'lowpass', f0: 2400, f1: 200, wet: 0.5 });
    [[220, 277, 330, 440]].forEach(ch => ch.forEach(f => {
      tone({ type: 'sawtooth', f0: f, t: t + 0.08, a: 0.03, d: 1.1, vol: 0.08, wet: 0.7, detune: -8, filter: { f0: 400, f1: 3000, q: 3 } });
      tone({ type: 'sawtooth', f0: f, t: t + 0.08, a: 0.03, d: 1.1, vol: 0.08, wet: 0.7, detune: 8, filter: { f0: 400, f1: 3000, q: 3 } });
    }));
    tone({ type: 'sine', f0: 1760, f1: 3520, t: t + 0.1, d: 0.5, vol: 0.05, wet: 0.8 });
  }
}

// ---------- 大怪专属 ----------
const SIGNATURE = {
  // 主脑：合成器圣咏 + 数据琶音
  主脑() {
    const t = now();
    thump(t, 50, 1.0, 1.4);
    const chord = [130.8, 196, 261.6, 329.6, 392, 493.9];
    chord.forEach((f, i) => [-10, 0, 10].forEach(dt => tone({ type: 'sawtooth', f0: f, t: t + 0.05, a: 0.6, d: 2.2, vol: 0.045, detune: dt, wet: 0.9, filter: { f0: 300, f1: 4200, q: 4 } })));
    for (let i = 0; i < 16; i++) tone({ type: 'square', f0: [1047, 1319, 1568, 2093][i % 4] * (i > 7 ? 2 : 1), t: t + 0.4 + i * 0.07, d: 0.06, vol: 0.05, wet: 0.6, filter: { f0: 5000 } });
    noise({ t: t + 0.3, a: 0.8, d: 1.6, vol: 0.12, f0: 6000, q: 0.7, wet: 0.8 });
  },
  // 深网之眼：低频嗡鸣 + 诡异颤音 + 故障碎响
  深网之眼() {
    const t = now();
    tone({ type: 'sine', f0: 55, f1: 41, t, a: 0.3, d: 2.0, vol: 0.5, wet: 0.3 });
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 660; lfo.frequency.setValueAtTime(5, t); lfo.frequency.linearRampToValueAtTime(14, t + 1.8);
    lg.gain.value = 140; lfo.connect(lg); lg.connect(o.frequency); env(g, t + 0.15, 0.4, 0.12, 1.5); o.connect(g); out(g, 0.9);
    o.start(t + 0.15); lfo.start(t + 0.15); o.stop(t + 2.2); lfo.stop(t + 2.2);
    for (let i = 0; i < 9; i++) noise({ t: t + 0.4 + Math.random() * 1.4, d: 0.03 + Math.random() * 0.05, vol: 0.25, type: 'highpass', f0: 2000 + Math.random() * 5000 });
    tone({ type: 'sine', f0: 2600, f1: 900, t: t + 1.6, d: 0.5, vol: 0.06, wet: 0.9 });
  },
  // 重装机甲：两记重踏 + 金属撞击 + 液压嘶声
  重装机甲() {
    const t = now();
    [0, 0.55].forEach(dt => {
      thump(t + dt, 45, 1.0, 0.6);
      [1, 2.76, 5.4].forEach(r => tone({ type: 'square', f0: 180 * r, t: t + dt, d: 0.35, vol: 0.05, wet: 0.5, filter: { type: 'bandpass', f0: 1800, q: 6 } }));
    });
    noise({ t: t + 0.2, a: 0.05, d: 0.45, vol: 0.2, type: 'highpass', f0: 3000, f1: 6000 });
    noise({ t: t + 0.75, a: 0.05, d: 0.6, vol: 0.2, type: 'highpass', f0: 6000, f1: 2500 });
    tone({ type: 'sawtooth', f0: 70, f1: 110, t: t + 1.1, a: 0.1, d: 0.6, vol: 0.12, filter: { f0: 500 } });
  },
  // 帮派老大：低音下坠 + 失真强力和弦 + 警笛扫频
  帮派老大() {
    const t = now();
    tone({ type: 'sine', f0: 220, f1: 38, t, a: 0.01, d: 1.1, vol: 0.8 });
    const ws = ctx.createWaveShaper(); const cur = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cur[i] = Math.tanh(x * 6); } ws.curve = cur;
    const g = ctx.createGain(); env(g, t + 0.15, 0.01, 0.16, 1.2); ws.connect(g); out(g, 0.4);
    [82.4, 123.5, 164.8].forEach(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(ws); o.start(t + 0.15); o.stop(t + 1.5); });
    const s = ctx.createOscillator(), sg = ctx.createGain(); s.type = 'square';
    s.frequency.setValueAtTime(600, t + 0.3); s.frequency.linearRampToValueAtTime(1100, t + 0.7); s.frequency.linearRampToValueAtTime(600, t + 1.1); s.frequency.linearRampToValueAtTime(1100, t + 1.5);
    const sf = ctx.createBiquadFilter(); sf.frequency.value = 2000; env(sg, t + 0.3, 0.05, 0.05, 1.3); s.connect(sf); sf.connect(sg); out(sg, 0.5); s.start(t + 0.3); s.stop(t + 1.8);
  },
};

// ---------- 特殊怪专属（★/★★） ----------
Object.assign(SIGNATURE, {
  // 自爆无人机：加速的哔哔警报
  自爆无人机() { const t = now(); for (let i = 0; i < 6; i++) tone({ type: 'square', f0: 1400, t: t + 0.32 * Math.pow(0.75, i) * i, d: 0.05, vol: 0.14, filter: { f0: 4000 } }); thump(t + 0.9, 100, 0.4, 0.2); },
  // 义眼斥候：变焦对焦声
  义眼斥候() { const t = now(); tone({ type: 'sine', f0: 400, f1: 1600, t, a: 0.02, d: 0.25, vol: 0.18 }); [0.28, 0.36].forEach(dt => noise({ t: t + dt, d: 0.03, vol: 0.3, type: 'highpass', f0: 4000 })); },
  // 霓虹DJ：一小节鼓点 + 合成器
  霓虹DJ() { const t = now(); for (let i = 0; i < 4; i++) { thump(t + i * 0.18, 70, 0.7, 0.15); noise({ t: t + i * 0.18 + 0.09, d: 0.04, vol: 0.2, type: 'highpass', f0: 7000 }); } [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'sawtooth', f0: f, t: t + i * 0.18, d: 0.15, vol: 0.08, wet: 0.5, filter: { f0: 2500 } })); },
  // 回收者：废铁叮当
  回收者() { const t = now(); [0, 0.12, 0.2, 0.34].forEach((dt, i) => [1, 2.76, 5.4].forEach(r => tone({ type: 'triangle', f0: (300 + i * 70) * r, t: t + dt, d: 0.18, vol: 0.06, wet: 0.4 }))); noise({ t: t + 0.05, d: 0.3, vol: 0.15, type: 'bandpass', f0: 3000, q: 4 }); },
  // 侦察无人机：雷达扫描
  侦察无人机() { const t = now(); tone({ type: 'sine', f0: 1500, f1: 1450, t, a: 0.005, d: 0.6, vol: 0.2, wet: 0.8 }); tone({ type: 'sine', f0: 3000, f1: 2900, t: t + 0.35, a: 0.005, d: 0.4, vol: 0.08, wet: 0.8 }); noise({ t, a: 0.3, d: 0.3, vol: 0.08, type: 'bandpass', f0: 800, f1: 3000, q: 8 }); },
  // 脚本小子：键盘敲击 + 回车
  脚本小子() { const t = now(); for (let i = 0; i < 9; i++) noise({ t: t + i * 0.055 + Math.random() * 0.02, d: 0.025, vol: 0.25, type: 'bandpass', f0: 2500 + Math.random() * 2000, q: 3 }); tone({ type: 'square', f0: 880, f1: 1320, t: t + 0.55, d: 0.12, vol: 0.12, filter: { f0: 3000 } }); },
  // 蠕虫程序：扭动的数据蠕动
  蠕虫程序() { const t = now(); const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 180; l.frequency.value = 9; lg.gain.value = 90; l.connect(lg); lg.connect(o.frequency); const f = ctx.createBiquadFilter(); f.frequency.value = 1200; env(g, t, 0.05, 0.14, 0.7); o.connect(f); f.connect(g); out(g, 0.4); o.start(t); l.start(t); o.stop(t + 0.85); l.stop(t + 0.85); },
  // 幻影骑手：引擎轰鸣 + 呼啸而过
  幻影骑手() { const t = now(); tone({ type: 'sawtooth', f0: 60, f1: 240, t, a: 0.05, d: 0.6, vol: 0.15, filter: { f0: 600, f1: 2000 } }); noise({ t: t + 0.3, a: 0.2, d: 0.5, vol: 0.3, type: 'bandpass', f0: 600, f1: 4000, q: 1, wet: 0.5 }); },
  // 镜像AI：镜面闪光，上下对称的音
  镜像AI() { const t = now(); [880, 1320, 1760].forEach((f, i) => { tone({ type: 'sine', f0: f, f1: f * 1.5, t: t + i * 0.08, d: 0.4, vol: 0.1, wet: 0.9 }); tone({ type: 'sine', f0: f * 1.5, f1: f, t: t + i * 0.08, d: 0.4, vol: 0.1, wet: 0.9 }); }); },
});

// ---------- 每张效果牌各自的音效 ----------
const EFFECTS = {
  // 回血：温暖上行琶音 + 闪光
  heal() { const t = now(); [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'sine', f0: f, t: t + i * 0.08, a: 0.02, d: 0.5, vol: 0.16, wet: 0.8 })); tone({ type: 'triangle', f0: 262, t, a: 0.15, d: 0.8, vol: 0.12, wet: 0.6 }); noise({ t: t + 0.35, a: 0.2, d: 0.6, vol: 0.06, type: 'highpass', f0: 8000, wet: 0.9 }); },
  // 抽牌：两声翻牌
  draw2() { const t = now(); [0, 0.18].forEach(dt => { noise({ t: t + dt, d: 0.1, vol: 0.35, type: 'bandpass', f0: 3000, f1: 1200, q: 1.5 }); tone({ type: 'triangle', f0: 1200, f1: 1800, t: t + dt + 0.05, d: 0.08, vol: 0.1 }); }); },
  // 火力压制：机枪扫射 + 爆炸
  suppress() { const t = now(); for (let i = 0; i < 10; i++) { noise({ t: t + i * 0.06, d: 0.04, vol: 0.4, type: 'bandpass', f0: 1500, q: 1 }); thump(t + i * 0.06, 140, 0.3, 0.05); } thump(t + 0.7, 55, 1.0, 0.6); noise({ t: t + 0.7, d: 0.7, vol: 0.3, type: 'lowpass', f0: 1800, f1: 150, wet: 0.5 }); },
  // 黑市改装：电钻 + 咔嚓上锁
  upgrade() { const t = now(); tone({ type: 'sawtooth', f0: 300, f1: 900, t, a: 0.05, d: 0.45, vol: 0.12, filter: { type: 'bandpass', f0: 1500, q: 3 } }); [0.55, 0.62].forEach(dt => [1, 2.76].forEach(r => tone({ type: 'square', f0: 600 * r, t: t + dt, d: 0.06, vol: 0.1, filter: { f0: 4000 } }))); tone({ type: 'sine', f0: 1568, t: t + 0.7, d: 0.4, vol: 0.12, wet: 0.7 }); },
  // 超频冲锋：引擎过载 + 冲刺
  charge() { const t = now(); tone({ type: 'sawtooth', f0: 80, f1: 600, t, a: 0.3, d: 0.25, vol: 0.16, filter: { f0: 500, f1: 4000, q: 4 } }); noise({ t: t + 0.4, a: 0.02, d: 0.35, vol: 0.35, type: 'bandpass', f0: 4000, f1: 500, q: 1 }); thump(t + 0.45, 90, 0.6, 0.25); },
  // 全网入侵：声呐扫描 + 一连串警报
  expose() { const t = now(); tone({ type: 'sine', f0: 1200, f1: 400, t, a: 0.005, d: 0.8, vol: 0.2, wet: 0.9 }); for (let i = 0; i < 5; i++) tone({ type: 'square', f0: 660 + i * 110, t: t + 0.3 + i * 0.07, d: 0.06, vol: 0.08, filter: { f0: 3000 } }); },
  // 劫持：故障 + 上锁 + 控制权转移的下行音
  hijack() { const t = now(); for (let i = 0; i < 6; i++) noise({ t: t + i * 0.05, d: 0.03, vol: 0.3, type: 'highpass', f0: 2000 + Math.random() * 4000 }); [0.35, 0.42].forEach(dt => tone({ type: 'square', f0: 1800, t: t + dt, d: 0.04, vol: 0.15, filter: { f0: 5000 } })); [988, 784, 659, 494].forEach((f, i) => tone({ type: 'sawtooth', f0: f, t: t + 0.5 + i * 0.09, d: 0.2, vol: 0.1, wet: 0.5, filter: { f0: 2500 } })); },
  // 定点清除：锁定滴滴 + 激光
  purge() { const t = now(); [0, 0.12, 0.24].forEach(dt => tone({ type: 'sine', f0: 2000, t: t + dt, d: 0.06, vol: 0.15 })); tone({ type: 'sawtooth', f0: 3000, f1: 200, t: t + 0.4, a: 0.005, d: 0.35, vol: 0.18, wet: 0.5, filter: { f0: 6000, f1: 800, q: 4 } }); thump(t + 0.45, 80, 0.6, 0.3); },
  // 系统重启：断电下滑 + 开机音
  reset() { const t = now(); tone({ type: 'sine', f0: 880, f1: 80, t, a: 0.01, d: 0.4, vol: 0.15 }); [523, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + 0.6 + i * 0.1, d: 0.35, vol: 0.12, wet: 0.7 })); },
};

// ---------- 每张事件牌各自的音效 ----------
const EVENTS = {
  pump() { const t = now(); [0, 0.18, 0.5, 0.68].forEach(dt => thump(t + dt, 60, 0.7, 0.12)); tone({ type: 'sawtooth', f0: 200, f1: 800, t: t + 0.4, a: 0.3, d: 0.2, vol: 0.1, filter: { f0: 3000 } }); },
  shield() { const t = now(); noise({ t, a: 0.05, d: 0.4, vol: 0.25, type: 'bandpass', f0: 300, f1: 2500, q: 2 }); tone({ type: 'sine', f0: 1319, t: t + 0.3, d: 0.6, vol: 0.18, wet: 0.9 }); tone({ type: 'sine', f0: 1976, t: t + 0.3, d: 0.6, vol: 0.1, wet: 0.9 }); },
  revenge() { const t = now(); [0, 0.08].forEach(dt => { thump(t + dt, 120, 0.6, 0.15); noise({ t: t + dt, d: 0.12, vol: 0.3, type: 'highpass', f0: 2000 }); }); thump(t + 0.35, 45, 1.0, 0.8); },
  cancel() { const t = now(); tone({ type: 'sawtooth', f0: 110, t, a: 0.01, d: 0.5, vol: 0.18, filter: { f0: 900 } }); tone({ type: 'sawtooth', f0: 116, t, a: 0.01, d: 0.5, vol: 0.18, filter: { f0: 900 } }); tone({ type: 'square', f0: 330, f1: 220, t: t + 0.5, d: 0.25, vol: 0.12, filter: { f0: 1500 } }); },
  counter() { const t = now(); for (let i = 0; i < 4; i++) tone({ type: 'square', f0: 2400, t: t + i * 0.12, d: 0.02, vol: 0.12 }); thump(t + 0.55, 70, 0.9, 0.4); noise({ t: t + 0.55, d: 0.4, vol: 0.3, type: 'lowpass', f0: 3000, f1: 300 }); },
  jam() { const t = now(); noise({ t, a: 0.01, d: 0.6, vol: 0.3, type: 'bandpass', f0: 1000, q: 0.5 }); for (let i = 0; i < 5; i++) tone({ type: 'square', f0: 200 + Math.random() * 1500, t: t + i * 0.1, d: 0.05, vol: 0.08 }); },
};

// ---------- 企业安保 ----------
Object.assign(SIGNATURE, {
  // 公司执行官：电梯到达的叮 + 管弦乐式铜管和弦
  公司执行官() { const t = now(); tone({ type: 'sine', f0: 1319, t, d: 0.5, vol: 0.2, wet: 0.7 }); tone({ type: 'sine', f0: 1047, t: t + 0.18, d: 0.6, vol: 0.2, wet: 0.7 });
    thump(t + 0.45, 60, 0.9, 0.7); [196, 247, 294, 392].forEach(f => [-6, 6].forEach(dt => tone({ type: 'sawtooth', f0: f, t: t + 0.45, a: 0.08, d: 1.3, vol: 0.07, detune: dt, wet: 0.7, filter: { f0: 600, f1: 2600, q: 2 } }))); },
  // 天穹战甲：推进器点火 + 装甲合拢 + 能量充满
  天穹战甲() { const t = now(); noise({ t, a: 0.3, d: 0.5, vol: 0.35, type: 'bandpass', f0: 300, f1: 2500, q: 1, wet: 0.4 }); thump(t + 0.75, 50, 1.0, 0.8);
    [0.8, 0.9, 1.0].forEach(dt => [1, 2.76].forEach(r => tone({ type: 'square', f0: 220 * r, t: t + dt, d: 0.12, vol: 0.08, filter: { type: 'bandpass', f0: 2000, q: 5 } })));
    tone({ type: 'sine', f0: 300, f1: 2400, t: t + 1.0, a: 0.4, d: 0.4, vol: 0.12, wet: 0.8 }); },
  // 防暴无人机：护盾展开
  防暴无人机() { const t = now(); tone({ type: 'sine', f0: 400, f1: 1200, t, a: 0.02, d: 0.3, vol: 0.2, wet: 0.6 }); noise({ t: t + 0.05, d: 0.3, vol: 0.2, type: 'bandpass', f0: 2500, q: 4, wet: 0.5 }); },
  // 合规审计员：盖章 + 收银机叮
  合规审计员() { const t = now(); thump(t, 160, 0.6, 0.08); noise({ t, d: 0.05, vol: 0.4, type: 'lowpass', f0: 1500 }); tone({ type: 'triangle', f0: 2637, t: t + 0.2, d: 0.4, vol: 0.18, wet: 0.5 }); tone({ type: 'triangle', f0: 3520, t: t + 0.28, d: 0.4, vol: 0.12, wet: 0.5 }); },
  // 企业狙击手：上膛 + 一枪
  企业狙击手() { const t = now(); [0, 0.12].forEach(dt => noise({ t: t + dt, d: 0.04, vol: 0.4, type: 'bandpass', f0: 3000, q: 3 })); noise({ t: t + 0.45, d: 0.25, vol: 0.6, type: 'lowpass', f0: 5000, f1: 400, wet: 0.6 }); thump(t + 0.45, 120, 0.6, 0.2); },
  // 公关经理：柔和提示音 + 掌声
  公关经理() { const t = now(); [784, 988].forEach((f, i) => tone({ type: 'sine', f0: f, t: t + i * 0.12, d: 0.3, vol: 0.18, wet: 0.6 })); for (let i = 0; i < 12; i++) noise({ t: t + 0.3 + Math.random() * 0.5, d: 0.03, vol: 0.18, type: 'bandpass', f0: 1500, q: 1 }); },
});
Object.assign(EFFECTS, {
  // 企业预算：硬币落下 + 上行提示
  ramp() { const t = now(); [0, 0.07, 0.13].forEach((dt, i) => tone({ type: 'triangle', f0: 2093 + i * 300, t: t + dt, d: 0.15, vol: 0.15 })); tone({ type: 'sine', f0: 523, f1: 1047, t: t + 0.25, d: 0.35, vol: 0.15, wet: 0.6 }); },
  // 护盾部署：能量护罩嗡的一声合拢
  armorUp() { const t = now(); tone({ type: 'sawtooth', f0: 110, f1: 220, t, a: 0.15, d: 0.4, vol: 0.12, filter: { f0: 400, f1: 2500, q: 6 } }); tone({ type: 'sine', f0: 1760, t: t + 0.45, d: 0.5, vol: 0.12, wet: 0.9 }); },
  // 精准打击：瞄准滴 + 一发穿透
  strike() { const t = now(); tone({ type: 'sine', f0: 2400, t, d: 0.08, vol: 0.15 }); noise({ t: t + 0.25, d: 0.2, vol: 0.5, type: 'highpass', f0: 1500, f1: 6000 }); thump(t + 0.27, 100, 0.6, 0.2); },
  // 恶意收购：碎纸机 + 低沉落锤
  buyout() { const t = now(); noise({ t, a: 0.05, d: 0.6, vol: 0.35, type: 'bandpass', f0: 800, q: 2 }); for (let i = 0; i < 8; i++) thump(t + i * 0.07, 200, 0.2, 0.04); thump(t + 0.75, 40, 1.0, 0.9); tone({ type: 'sawtooth', f0: 98, t: t + 0.75, d: 0.9, vol: 0.12, wet: 0.6, filter: { f0: 700 } }); },
});
Object.assign(EVENTS, {
  riposte() { const t = now(); noise({ t, d: 0.08, vol: 0.4, type: 'highpass', f0: 3000 }); tone({ type: 'sawtooth', f0: 1200, f1: 300, t: t + 0.08, d: 0.25, vol: 0.15, filter: { f0: 4000 } }); thump(t + 0.3, 80, 0.8, 0.3); },
  evac() { const t = now(); tone({ type: 'sine', f0: 300, f1: 2000, t, a: 0.02, d: 0.4, vol: 0.18, wet: 0.7 }); noise({ t, a: 0.1, d: 0.4, vol: 0.2, type: 'bandpass', f0: 1000, f1: 6000, q: 2 }); },
  insure() { const t = now(); [1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + i * 0.1, d: 0.3, vol: 0.16, wet: 0.5 })); noise({ t: t + 0.2, d: 0.15, vol: 0.25, type: 'bandpass', f0: 3000, f1: 1200, q: 1.5 }); },
});

Object.assign(EFFECTS, {
  // 帮派战争：战鼓 + 怒吼般的失真和弦 + 警笛
  war() { const t = now(); for (let i = 0; i < 6; i++) thump(t + i * 0.16, 55, 0.9, 0.18);
    const ws = ctx.createWaveShaper(); const cur = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cur[i] = Math.tanh(x * 8); } ws.curve = cur;
    const g = ctx.createGain(); env(g, t + 0.95, 0.02, 0.18, 1.3); ws.connect(g); out(g, 0.5);
    [73.4, 110, 146.8].forEach(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(ws); o.start(t + 0.95); o.stop(t + 2.4); });
    noise({ t: t + 0.95, a: 0.05, d: 1.2, vol: 0.3, type: 'lowpass', f0: 3000, f1: 300, wet: 0.6 }); tone({ type: 'square', f0: 700, f1: 1200, t: t + 1.1, a: 0.3, d: 0.8, vol: 0.06, wet: 0.6, filter: { f0: 2500 } }); },
  scrapDraw() { const t = now(); noise({ t, d: 0.3, vol: 0.3, type: 'bandpass', f0: 2000, q: 3 }); [0.3, 0.45].forEach(dt => noise({ t: t + dt, d: 0.08, vol: 0.3, type: 'bandpass', f0: 3000, f1: 1200, q: 1.5 })); },
  gangUp() { const t = now(); for (let i = 0; i < 7; i++) thump(t + i * 0.08 + Math.random() * 0.03, 90 + Math.random() * 60, 0.5, 0.1); thump(t + 0.7, 50, 1.0, 0.5); },
  rally() { const t = now(); [0, 0.15, 0.3].forEach(dt => thump(t + dt, 60, 0.7, 0.15)); [392, 494, 587, 784].forEach((f, i) => tone({ type: 'sawtooth', f0: f, t: t + 0.4 + i * 0.05, d: 0.4, vol: 0.08, wet: 0.5, filter: { f0: 3000 } })); },
  rocket() { const t = now(); noise({ t, a: 0.3, d: 0.3, vol: 0.3, type: 'bandpass', f0: 500, f1: 3000, q: 2 }); thump(t + 0.6, 40, 1.0, 0.8); noise({ t: t + 0.6, d: 0.8, vol: 0.4, type: 'lowpass', f0: 3000, f1: 200, wet: 0.6 }); },
  meatBomb() { const t = now(); for (let i = 0; i < 4; i++) tone({ type: 'square', f0: 1200, t: t + i * 0.12, d: 0.04, vol: 0.12 }); thump(t + 0.55, 45, 1.0, 0.7); noise({ t: t + 0.55, d: 0.6, vol: 0.35, type: 'lowpass', f0: 2500, f1: 200 }); },
  implant() { EFFECTS.upgrade(); },
  bounce() { const t = now(); tone({ type: 'sine', f0: 1600, f1: 400, t, d: 0.35, vol: 0.15, wet: 0.6 }); EFFECTS.draw2 && noise({ t: t + 0.35, d: 0.1, vol: 0.3, type: 'bandpass', f0: 3000, f1: 1200, q: 1.5 }); },
  layoff() { const t = now(); noise({ t, d: 0.5, vol: 0.3, type: 'bandpass', f0: 900, q: 2 }); [0.5, 0.57].forEach(dt => tone({ type: 'triangle', f0: 2637, t: t + dt, d: 0.15, vol: 0.12 })); },
  bonusAll() { const t = now(); [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + i * 0.07, d: 0.35, vol: 0.14, wet: 0.6 })); noise({ t: t + 0.3, d: 0.5, vol: 0.1, type: 'highpass', f0: 6000, wet: 0.8 }); },
  quarantine() { const t = now(); tone({ type: 'square', f0: 220, t, d: 0.5, vol: 0.12, filter: { f0: 1200 } }); [0.55, 0.62].forEach(dt => noise({ t: t + dt, d: 0.05, vol: 0.35, type: 'bandpass', f0: 1500, q: 4 })); },
  lawsuit() { const t = now(); thump(t, 200, 0.7, 0.1); thump(t + 0.25, 200, 0.7, 0.1); thump(t + 0.5, 90, 0.9, 0.3); },
  sweep() { const t = now(); tone({ type: 'sine', f0: 200, f1: 2000, t, a: 0.4, d: 0.3, vol: 0.12, wet: 0.6 }); noise({ t: t + 0.6, d: 0.7, vol: 0.4, type: 'bandpass', f0: 3000, f1: 300, q: 0.7, wet: 0.5 }); },
  merger() { EFFECTS.armorUp(); },
});
Object.assign(EVENTS, {
  standIn() { const t = now(); noise({ t, d: 0.1, vol: 0.35, type: 'highpass', f0: 2500 }); thump(t + 0.1, 100, 0.7, 0.2); tone({ type: 'sawtooth', f0: 300, f1: 150, t: t + 0.15, d: 0.3, vol: 0.1, filter: { f0: 1200 } }); },
  phalanx() { const t = now(); for (let i = 0; i < 4; i++) thump(t + i * 0.09, 130, 0.5, 0.08); tone({ type: 'sine', f0: 880, t: t + 0.4, d: 0.4, vol: 0.12, wet: 0.7 }); },
});

Object.assign(SIGNATURE, {
  数据幽灵() { const t = now(); tone({ type: 'sine', f0: 1800, f1: 300, t, d: 0.4, vol: 0.15, wet: 0.8 }); for (let i = 0; i < 4; i++) noise({ t: t + 0.1 + i * 0.06, d: 0.03, vol: 0.25, type: 'highpass', f0: 4000 }); },
  回声程序() { const t = now(); [0, 0.18, 0.36, 0.54].forEach((dt, i) => tone({ type: 'triangle', f0: 1047, t: t + dt, d: 0.15, vol: 0.18 * Math.pow(0.6, i), wet: 0.8 })); },
  量子刺客() { const t = now(); noise({ t, a: 0.01, d: 0.25, vol: 0.4, type: 'highpass', f0: 5000, f1: 1500 }); tone({ type: 'sine', f0: 400, f1: 1600, t: t + 0.05, d: 0.3, vol: 0.15, wet: 0.7 }); tone({ type: 'sine', f0: 1600, f1: 400, t: t + 0.05, d: 0.3, vol: 0.1, wet: 0.7 }); },
  暗网中继() { const t = now(); tone({ type: 'sawtooth', f0: 55, t, a: 0.2, d: 0.8, vol: 0.12, filter: { f0: 300 } }); for (let i = 0; i < 6; i++) tone({ type: 'square', f0: [660, 880, 990][i % 3], t: t + 0.2 + i * 0.09, d: 0.05, vol: 0.08, filter: { f0: 3000 } }); },
});
Object.assign(EFFECTS, {
  reload() { const t = now(); tone({ type: 'sine', f0: 900, f1: 200, t, d: 0.25, vol: 0.15 }); noise({ t: t + 0.28, d: 0.05, vol: 0.4, type: 'bandpass', f0: 2500, q: 3 }); tone({ type: 'sine', f0: 300, f1: 1500, t: t + 0.35, d: 0.3, vol: 0.18, wet: 0.6 }); },
  allDown() { const t = now(); for (let i = 0; i < 5; i++) tone({ type: 'sine', f0: 1600 - i * 250, f1: 200, t: t + i * 0.07, d: 0.25, vol: 0.1, wet: 0.7 }); noise({ t, a: 0.2, d: 0.5, vol: 0.12, type: 'lowpass', f0: 2000, f1: 300, wet: 0.6 }); },
  chain() { const t = now(); for (let i = 0; i < 6; i++) { noise({ t: t + i * 0.11, d: 0.06, vol: 0.3, type: 'bandpass', f0: 2500, f1: 800, q: 2 }); tone({ type: 'triangle', f0: 660 * Math.pow(1.122, i), t: t + i * 0.11, d: 0.12, vol: 0.12 }); } thump(t + 0.7, 70, 0.8, 0.4); },
  exposeKill() { const t = now(); tone({ type: 'sine', f0: 1200, f1: 400, t, d: 0.5, vol: 0.15, wet: 0.8 }); noise({ t: t + 0.4, d: 0.2, vol: 0.4, type: 'highpass', f0: 2000 }); },
  exploit() { const t = now(); for (let i = 0; i < 8; i++) noise({ t: t + i * 0.05, d: 0.03, vol: 0.3, type: 'highpass', f0: 2000 + Math.random() * 4000 }); tone({ type: 'sawtooth', f0: 2000, f1: 100, t: t + 0.45, d: 0.4, vol: 0.15, filter: { f0: 4000, f1: 500, q: 4 } }); thump(t + 0.5, 70, 0.7, 0.3); },
});
Object.assign(EVENTS, {
  ghost() { const t = now(); noise({ t, a: 0.05, d: 0.5, vol: 0.2, type: 'bandpass', f0: 4000, f1: 800, q: 2, wet: 0.8 }); tone({ type: 'sine', f0: 880, f1: 1320, t, d: 0.5, vol: 0.12, wet: 0.9 }); tone({ type: 'sine', f0: 1320, f1: 880, t, d: 0.5, vol: 0.12, wet: 0.9 }); },
});

Object.assign(EFFECTS, {
  swarm() { const t = now(); for (let i = 0; i < 10; i++) tone({ type: 'square', f0: 300 + Math.random() * 900, t: t + i * 0.04, d: 0.05, vol: 0.06, filter: { f0: 2500 } }); thump(t + 0.45, 120, 0.5, 0.15); thump(t + 0.6, 120, 0.5, 0.15); },
  ddos() { const t = now(); for (let i = 0; i < 14; i++) noise({ t: t + i * 0.04, d: 0.025, vol: 0.3, type: 'bandpass', f0: 1800, q: 3 }); tone({ type: 'sawtooth', f0: 400, f1: 60, t: t + 0.55, d: 0.5, vol: 0.15, filter: { f0: 1500 } }); },
  spread() { const t = now(); noise({ t, a: 0.3, d: 0.6, vol: 0.2, type: 'bandpass', f0: 400, f1: 3000, q: 3, wet: 0.6 }); [440, 466, 494, 523].forEach((f, i) => tone({ type: 'sawtooth', f0: f, t: t + i * 0.1, d: 0.5, vol: 0.06, wet: 0.6, filter: { f0: 1500 } })); },
});

export const hasSignature = name => !!SIGNATURE[name];

// ---------- 效果牌（按费用） ----------
function effectSfx(cost) {
  const t = now();
  if (cost <= 1) {
    tone({ type: 'sine', f0: 1200, f1: 2400, t, d: 0.14, vol: 0.3, wet: 0.5 });
    tone({ type: 'sine', f0: 1800, f1: 3600, t: t + 0.07, d: 0.18, vol: 0.22, wet: 0.6 });
  } else if (cost === 2) {
    noise({ t, a: 0.05, d: 0.4, vol: 0.4, f0: 300, f1: 5000, q: 3 });
    tone({ type: 'sawtooth', f0: 300, f1: 1500, t, a: 0.02, d: 0.35, vol: 0.18, wet: 0.5, filter: { f0: 800, f1: 4000, q: 5 } });
    [1568, 2093, 2637].forEach((f, i) => tone({ type: 'triangle', f0: f, t: t + 0.25 + i * 0.05, d: 0.22, vol: 0.16, wet: 0.7 }));
    thump(t + 0.2, 100, 0.5, 0.25);
  } else {
    noise({ t, a: 0.15, d: 0.5, vol: 0.28, f0: 200, f1: 6000, q: 4, wet: 0.4 });
    tone({ type: 'sawtooth', f0: 110, f1: 1760, t, a: 0.15, d: 0.4, vol: 0.12, filter: { f0: 300, f1: 5000, q: 8 } });
    thump(t + 0.55, 70, 0.8, 0.5);
    tone({ type: 'square', f0: 880, f1: 110, t: t + 0.55, d: 0.6, vol: 0.08, wet: 0.7, filter: { f0: 2500 } });
  }
}

// ---------- 其它 ----------
function revealSfx() { const t = now(); noise({ t, d: 0.16, vol: 0.6, f0: 2500, f1: 800, q: 1 }); tone({ type: 'triangle', f0: 660, f1: 990, t, d: 0.14, vol: 0.35 }); }
function eventSfx() { const t = now(); [0, 0.16].forEach(dt => tone({ type: 'square', f0: 988, t: t + dt, d: 0.12, vol: 0.16, filter: { f0: 3000 } })); tone({ type: 'sine', f0: 1976, t: t + 0.32, d: 0.3, vol: 0.14, wet: 0.7 }); }

const BOOST = { 防暴无人机: 1.3, 公关经理: 1.3, armorUp: 1.5, evac: 1.4, 侦察无人机: 2.6, 蠕虫程序: 2.2, 幻影骑手: 2, 回收者: 1.6, 脚本小子: 1.6, expose: 2.2, reset: 1.7, draw2: 1.4, jam: 2.4, cancel: 1.8 };
export function play(kind, card, opts = {}) {
  if (!ctx || muted) return;
  // 优先用录音采样；对手暗出只放通用拍牌声，不泄露身份
  try {
    const secret = kind === 'summon' && opts.hidden && !opts.mine;
    let ok = false;
    if (kind === 'summon' || kind === 'reveal') ok = (!secret && run(R_UNIT[card.name])) || (kind === 'reveal' ? run([['flip', 0, 0.9], ['place2', 0.05, 0.7]].concat(summonRecipe(card).slice(2))) : run(summonRecipe(card, secret ? null : undefined)));
    else if (kind === 'effect') ok = run(R_EFF[card.eff]);
    else if (kind === 'event') ok = run(R_EV[card.ev]);
    if (ok) return;
  } catch (e) { }
  gainMul = BOOST[card.name] || BOOST[card.eff] || BOOST[card.ev] || 1;
  try {
    if (kind === 'summon') {
      // 明出，或是我方自己打出的：放专属音效；对手暗出只放通用音效，不泄露身份
      if (SIGNATURE[card.name] && (!opts.hidden || opts.mine)) SIGNATURE[card.name]();
      else summonGeneric(card.cost);
    } else if (kind === 'reveal') {
      if (SIGNATURE[card.name]) SIGNATURE[card.name](); else revealSfx();
    } else if (kind === 'effect') { if (EFFECTS[card.eff]) EFFECTS[card.eff](); else effectSfx(card.cost); }
    else if (kind === 'event') { if (EVENTS[card.ev]) EVENTS[card.ev](); else eventSfx(); }
  } catch (e) { /* 音效失败不影响游戏 */ }
  gainMul = 1;
}

// 结算音乐：胜利是上行大和弦 + 合成器琶音，失败是下行的故障嗡鸣
export function jingle(win) {
  if (!ctx || muted) return;
  try {
    const t = now();
    if (win) {
      thump(t, 70, 0.9, 0.7);
      noise({ t, d: 0.5, vol: 0.35, f0: 600, f1: 6000, q: 0.8, wet: 0.5 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'sawtooth', f0: f, t: t + 0.12 + i * 0.07, d: 0.18, vol: 0.12, filter: { f0: 3500 } }));
      [261.6, 329.6, 392, 523.3].forEach(f => tone({ type: 'sawtooth', f0: f, t: t + 0.5, a: 0.04, d: 1.8, vol: 0.09, wet: 0.8, filter: { f0: 2400 } }));
      tone({ type: 'sine', f0: 1047, t: t + 0.5, a: 0.02, d: 1.6, vol: 0.12, wet: 0.9 });
    } else {
      thump(t, 55, 0.8, 0.9);
      tone({ type: 'sawtooth', f0: 220, f1: 55, t, a: 0.01, d: 1.4, vol: 0.18, filter: { f0: 900 }, wet: 0.5 });
      [0, 0.18, 0.36].forEach((dt, i) => tone({ type: 'square', f0: 330 - i * 60, t: t + 0.3 + dt, d: 0.14, vol: 0.08, filter: { f0: 1600 } }));
      noise({ t: t + 0.2, d: 0.9, vol: 0.18, type: 'lowpass', f0: 1500, f1: 200 });
    }
  } catch (e) { }
}
