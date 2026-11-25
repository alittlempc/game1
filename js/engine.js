// 规则引擎 v0.5（费用制）+ AI
import { CLASSES, TIER, buildDeck, VARS, TOKENS } from './cards.js';

export const MAX_BOARD = 6;
export const VARS_E = {};
export const DEFAULT_CFG = { life: 6, manaCap: 8, hand: [4, 4], firstDraw: false, coin: true, secondStart: 1, firstOne: 0, maxTurns: 80, thr: 0.2 };
export class GameOver extends Error { constructor(w) { super('over'); this.winner = w; } }

let UID = 0;
class Cr {
  constructor(card, owner, up) {
    this.uid = ++UID; this.card = card; this.owner = owner; this.up = up; this.known = up;
    this.armorUsed = false; this.bonus = 0; this.kw = new Set(card.kw);
    this.attacksLeft = 0; this.blocksLeft = 1; this.tmp = 0; this.noAttack = false; this.born = -1;
  }
}
function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

export class Game {
  constructor(cls0, cls1, ui, agents = ['human', 'ai'], rnd = Math.random, cfg = {}) {
    this.ui = ui; this.agents = agents; this.rnd = rnd; this.cfg = { ...DEFAULT_CFG, ...cfg };
    this.p = [cls0, cls1].map((k, i) => { const list = buildDeck(k, (this.cfg.dupes || {})[i === 0 ? 'p0' : 'p1'] || (this.cfg.dupesByCls || {})[k]); return { cls: k, list: list.map(c => c.name), hand: [], deck: shuffle(list, rnd), grave: [], board: [], life: this.cfg.life, maxLife: this.cfg.life, mana: 0, maxMana: 0, evUsed: false, lastPlayed: null }; });
    this.turns = 0; this.cur = 0; this.over = false; this.winner = null;
  }
  isAI(i) { return this.agents[i] === 'ai'; }
  name(i) { return this.agents[i] === 'human' ? '你' : '对手'; }
  L(t, kind) { this.ui.log(t, kind); }
  async pause(ms = 550) { await this.ui.sync(); if (this.ui.delay) await this.ui.delay(ms); }

  // ---------- 信息推断 ----------
  belief(viewer, cr) {
    if (cr.owner === viewer || cr.known) return [cr.card];
    const o = this.p[cr.owner]; const pool = new Map();
    const byName = Object.fromEntries(CLASSES[o.cls].cards().map(c => [c.name, c]));
    for (const nm of o.list) { const c = byName[nm]; if (c.typ === 'unit' && c.tier === cr.card.tier) pool.set(nm, { c, n: (pool.get(nm)?.n || 0) + 1 }); }
    for (const x of o.board) if (x.known && pool.has(x.card.name)) pool.get(x.card.name).n--;
    for (const c of o.grave) if (pool.has(c.name)) pool.get(c.name).n--;
    const res = []; for (const { c, n } of pool.values()) for (let k = 0; k < n; k++) res.push(c);
    return res.length ? res : [cr.card];
  }

  // ---------- 战力 ----------
  staticPw(cr, card = cr.card) {
    let pw = card.power + cr.bonus + (cr.tmp || 0);
    for (const o of this.p[cr.owner].board) if (o !== cr && o.up && o.card.cont === 'drum') pw += 1;
    if (card.cont === 'pack' && this.p[cr.owner].board.length > 1) pw += 2;
    return pw;
  }
  resolve(A, Acard, B, Bcard, bWasUp, amod = 0, bmod = 0) {
    const akw = new Set([...Acard.kw, ...[...A.kw].filter(k => !A.card.kw.includes(k))]);
    const bkw = new Set([...Bcard.kw, ...[...B.kw].filter(k => !B.card.kw.includes(k))]);
    let pa = this.staticPw(A, Acard) + amod;
    let pb = this.staticPw(B, Bcard) + bmod + (bkw.has('堡垒') ? 2 : 0);
    pb -= Bcard.weakBlock || 0;
    if (akw.has('隐身') && bWasUp) pb -= 3;
    if (Acard.cont === 'mirror') pa = pb;
    if (Bcard.cont === 'mirror') pb = pa;
    return { ad: bkw.has('病毒') || pb >= pa, bd: akw.has('病毒') || pa >= pb, pa, pb };
  }
  val(card) { if (card.typ !== 'unit') return 1.0; let v = 0.6 + card.power / 3; if (card.death === 'boom') v -= 0.8; return v; }
  dmgVal(life) { return life <= 1 ? 100 : 0.6 + 3 / life; }
  pairEv(viewer, A, B, Acard, Bcard, bUp, amod = 0, bmod = 0) {
    const { ad, bd } = this.resolve(A, Acard, B, Bcard, bUp, amod, bmod);
    const dl = this.p[B.owner].life;
    const aArm = Acard.kw.includes('装甲') && !A.armorUsed, bArm = Bcard.kw.includes('装甲') && !B.armorUsed;
    let e = 0;
    if (bd) e += bArm ? 0.3 : this.val(Bcard);
    if (ad) e -= aArm ? 0.3 : this.val(Acard);
    if (ad && Acard.death === 'boom' && !aArm) e += this.dmgVal(dl);
    return viewer === A.owner ? e : -e;
  }
  blockers(d) { return this.p[d].board.filter(o => o.blocksLeft > 0); }
  aiChooseBlock(d, A) {
    const mult = A.attacksLeft >= 1 && A.kw.has('超频') && (A.known || A.up) ? 1.5 : 1;
    let best = [-this.dmgVal(this.p[d].life) * mult, null];
    for (const B of this.blockers(d)) {
      const ev = avg(this.belief(d, A).map(Ac => this.pairEv(d, A, B, Ac, B.card, B.up)));
      if (ev > best[0]) best = [ev, B];
    }
    return best[1];
  }
  attackEv(a, A) {
    const d = 1 - a;
    const opts = [-this.dmgVal(this.p[d].life)];
    for (const B of this.blockers(d)) opts.push(avg(this.belief(a, B).map(Bc => this.pairEv(d, A, B, A.card, Bc, B.up))));
    return -Math.max(...opts);
  }

  // ---------- 能量 / 抽牌 ----------
  async draw(i, n = 1) {
    const P = this.p[i];
    for (let k = 0; k < n; k++) {
      if (!P.deck.length) { this.L(`${this.name(i)}的牌库空了，疲劳`); await this.damage(i, 1, '牌库耗尽'); continue; }
      const c = P.deck.pop();
      if (P.hand.length >= 10) { P.grave.push(c); this.L(`${this.name(i)}手牌已满，【${c.name}】被弃掉`); }
      else P.hand.push(c);
    }
  }
  pay(i, n) { this.p[i].mana -= n; }

  // ---------- 召唤条件 ----------
  reqOk(a, c) {
    const P = this.p[a];
    switch (c.req) {
      case 'sacRandom': return P.board.length >= 1;
      case 'grave2': return P.grave.filter(x => x.typ === 'unit').length >= 2;
      case 'hidden2': return P.board.filter(o => !o.up).length >= 2;
      case 'sacTier2': return P.board.some(o => o.card.tier === 2);
      case 'up2': return P.board.filter(o => o.up).length >= 2;
      case 'payLife': return P.life > (this.cfg.payLife ?? 2);
      default: return true;
    }
  }
  canSummon(a, c) {
    const P = this.p[a];
    if (c.cost > P.mana || !this.reqOk(a, c)) return false;
    const frees = c.req === 'sacRandom' || c.req === 'sacTier2';
    return P.board.length < MAX_BOARD || frees;
  }
  whyNot(a, c) {
    const P = this.p[a];
    if (c.typ === 'event') return '事件牌在时机出现时才能打出。';
    if (c.cost > P.mana) return `能量不够：需要 ${c.cost}，你只有 ${P.mana}。`;
    if (c.typ === 'unit') {
      if (!this.reqOk(a, c)) return { sacRandom: '场上需要另一只怪物给它吃。', grave2: '你的弃牌堆里还不到 2 只怪物。', hidden2: '你场上还不到 2 只暗置怪物。', sacTier2: '你场上没有 ★★ 怪物可以吃。', up2: '你场上还不到 2 只明置怪物。', payLife: '你的生命不够支付（要多于 2）。' }[c.req];
      return '场上最多 6 只怪物。';
    }
    return '现在没有合适的目标。';
  }
  async sacrifice(cr, why = '作为召唤代价') {
    const pl = this.p[cr.owner];
    if (!pl.board.includes(cr)) return;
    pl.board.splice(pl.board.indexOf(cr), 1); pl.grave.push(cr.card);
    this.L(`${this.name(cr.owner)}的【${cr.card.name}】被吃掉，${why}`, 'kill');
    await this.pause(300);
    if (cr.card.death === 'boom') await this.damage(1 - cr.owner, 1, '自爆无人机');
    if (cr.card.death === 'draw1') { await this.draw(cr.owner, 1); this.L(`【${cr.card.name}】：${this.name(cr.owner)}抽 1 张牌`); }
  }
  canAttackNow(o) { return !o.noAttack; }
  freeAttack(P) { for (const o of P.board) if (!o.noAttack && o.attacksLeft === 0 && o.born === this.turns) o.attacksLeft = o.kw.has('超频') ? 2 : 1; }
  smallest(list) { return list.reduce((m, o) => this.val(o.card) < this.val(m.card) ? o : m); }

  // ---------- 事件 ----------
  findEv(i, ev) {
    const P = this.p[i]; if (P.evUsed) return null;
    return P.hand.find(c => c.typ === 'event' && c.ev === ev && c.cost <= P.mana) || null;
  }
  useEv(i, c) {
    const P = this.p[i]; P.hand.splice(P.hand.indexOf(c), 1); P.grave.push(c); P.evUsed = true; P.lastPlayed = c; this.pay(i, c.cost);
    this.L(`⚡ ${this.name(i)}打出事件【${c.name}】（${c.cost} 能量）`, 'event');
    this.ui.sfx?.('event', c);
  }
  async offerEv(i, ev, question, aiWants) {
    const c = this.findEv(i, ev); if (!c) return false;
    let use;
    if (this.isAI(i)) use = aiWants;
    else use = await this.ui.ask(`事件【${c.name}】· ${c.cost} 能量`, `${question}\n你现在有 ${this.p[i].mana} 点能量。`, [{ label: '使用', value: true, primary: true }, { label: '不用', value: false }], c);
    if (use) { this.useEv(i, c); await this.pause(400); }
    return use;
  }

  // ---------- 揭示 ----------
  async reveal(cr, inCombat = false, enemy = null, quiet = false) {
    if (cr.up || !this.p[cr.owner].board.includes(cr)) return;
    cr.up = true; cr.known = true;
    if (!quiet) { this.ui.sfx?.('reveal', cr.card); if (cr.card.tier === 3 && this.isAI(cr.owner) && this.ui.cinematic) await this.ui.cinematic(cr.card); else if (cr.card.cost >= 5) await this.pause(700); }
    this.L(`${this.name(cr.owner)}的【${cr.card.name}】翻开（战力 ${cr.card.power}）`);
    const P = this.p[cr.owner]; P.flips = (P.flips || 0) + 1;
    for (const o of P.board) if (o !== cr && o.card.cont === 'flipPump' && (!VARS.qCap || o.bonus < VARS.qCap)) { o.bonus += 1; if (o.up || o.owner === 0) this.L(`【${o.card.name}】随翻面成长：战力 +1 → ${this.staticPw(o)}`, 'effect'); }
    await this.pause(350);
    await this.trigger(cr, inCombat, enemy);
  }
  goodReveal(cr) { return !!cr.card.reveal && ['whisper', 'peek', 'abyss', 'boss', 'draw', 'salvage', 'snipe', 'heal1', 'shieldAlly', 'demo', 'smallBuff', 'energy', 'execBuff'].concat(['flipDown', 'echo']).includes(cr.card.reveal); }
  flipScore(cr) { const r = cr.card.reveal; return { abyss: 2.2, boss: 1.6, whisper: 1.3, demo: 1.3, snipe: 1.0, execBuff: 1.0, salvage: 0.9, smallBuff: 0.8, draw: 0.7, heal1: 0.7, peek: 0.5, shieldAlly: 0.6, energy: 0.4, echo: 0.6, flipDown: 0.3 }[r] || 0; }
  async chooseFrom(i, cands, prompt, aiPick, optional = false) {
    if (!cands.length) return null;
    if (this.isAI(i)) return aiPick(cands);
    if (cands.length === 1 && !optional) return cands[0];
    return await this.ui.chooseTarget(prompt, cands, optional);
  }
  async trigger(cr, inCombat, enemy) {
    const me = cr.owner, op = 1 - me, P = this.p[me], O = this.p[op];
    const r = cr.card.reveal;
    if (r === 'boss') {
      const t = O.board.filter(o => o.up && this.staticPw(o) <= 4 && o !== enemy);
      const v = await this.chooseFrom(me, t, '帮派老大：选择要消灭的对手明置怪物（战力 ≤4）', c => c.reduce((a, b) => this.val(b.card) > this.val(a.card) ? b : a));
      if (v) await this.kill(v, '帮派老大');
    } else if (r === 'draw') {
      if (P.deck.length) { await this.draw(me); this.L(`义眼斥候：${this.name(me)}抽 1 张牌`); }
    } else if (r === 'salvage') {
      const t = P.grave.filter(c => c.typ === 'unit');
      if (t.length) {
        let c;
        if (this.isAI(me)) c = t.reduce((a, b) => b.power > a.power ? b : a);
        else c = await this.ui.ask('回收者', '从弃牌堆拿回哪张怪物牌？', t.map(x => ({ label: `${x.name}（${TIER[x.tier].stars} ${x.power}）`, value: x })));
        P.grave.splice(P.grave.indexOf(c), 1); P.hand.push(c); this.L(`回收者：${this.name(me)}拿回【${c.name}】`);
      }
    } else if (r === 'peek') {
      const t = O.board.filter(o => !o.up && o !== enemy);
      const v = await this.chooseFrom(me, t, '侦察无人机：选择对手一只暗置怪物翻开', c => c.reduce((a, b) => b.card.tier > a.card.tier ? b : a));
      if (v) { v.up = v.known = true; this.L(`侦察：翻开${this.name(op)}的【${v.card.name}】`); }
    } else if (r === 'whisper') {
      if (O.hand.length) { const c = O.hand[Math.floor(this.rnd() * O.hand.length)]; O.hand.splice(O.hand.indexOf(c), 1); O.grave.push(c); this.L(`脚本小子：${this.name(op)}弃掉【${c.name}】`); }
    } else if (r === 'abyss') {
      for (let k = 0; k < 2; k++) {
        const t = O.board.filter(o => !o.up && o !== enemy);
        const v = await this.chooseFrom(me, t, `深网之眼：选择对手一只暗置怪物消灭（第 ${k + 1}/2 只）`, c => c.reduce((a, b) => b.card.tier > a.card.tier ? b : a));
        if (!v) break;
        v.up = v.known = true; await this.kill(v, '深网之眼');
      }
    } else if (r === 'flipDown') {
      if (VARS.dgDraw) await this.draw(me, 1);
      const t = P.board.filter(o => o !== cr && o.up);
      let v;
      if (this.isAI(me)) { const g = t.filter(o => this.flipScore(o) >= 0.7); v = g.length ? g.reduce((a, b) => this.flipScore(b) > this.flipScore(a) ? b : a) : null; }
      else v = await this.chooseFrom(me, t, '数据幽灵：可以把你另一只明置怪物翻回暗置（可跳过）', null, true);
      if (v) { v.up = false; this.L(`数据幽灵：${this.name(me)}把【${v.card.name}】翻回暗置`); }
    } else if (r === 'echo') {
      const t = P.board.filter(o => o !== cr && o.up && o.card.reveal && o.card.reveal !== 'echo');
      const v = await this.chooseFrom(me, t, '回声程序：选择你另一只明置怪物，再触发一次它的翻开效果', x => x.reduce((a, b) => this.flipScore(b) > this.flipScore(a) ? b : a));
      if (v) { this.L(`回声程序：再次触发【${v.card.name}】的翻开效果`, 'effect'); await this.trigger(v, inCombat, enemy); }
    } else if (r === 'demo') {
      const smalls = P.board.filter(o => o !== cr && o.card.tier === 1);
      const tg = O.board.filter(o => o !== enemy && this.belief(me, o).every(x => true));
      if (smalls.length && tg.length) {
        let go;
        if (this.isAI(me)) go = tg.some(o => o.up && this.staticPw(o) <= 5 && this.val(o.card) > 1.6) || tg.some(o => !o.up && o.card.tier <= 2);
        else go = await this.ui.ask('拆迁头目', '要吃掉你的一只 ★ 怪物，消灭对手一只战力 ≤5 的怪物吗？', [{ label: '要', value: true, primary: true }, { label: '不要', value: false }]);
        if (go) {
          const s = await this.chooseFrom(me, smalls, '拆迁头目：选择要吃掉的 ★ 怪物', x => this.smallest(x));
          const v = await this.chooseFrom(me, tg, '拆迁头目：选择对手一只怪物（战力 ≤5 才会被消灭）', x => x.reduce((a, b) => (b.up ? this.val(b.card) : 1.5) > (a.up ? this.val(a.card) : 1.5) ? b : a));
          await this.sacrifice(s, '为拆迁头目开路');
          v.up = v.known = true;
          if (this.staticPw(v) <= 5) await this.kill(v, '拆迁头目'); else this.L(`【${v.card.name}】战力 ${this.staticPw(v)}，太高了没能消灭`);
        }
      }
    } else if (r === 'smallBuff') {
      for (const o of P.board) if (o.card.tier === 1) o.bonus += 2;
      this.L(`安保主管：${this.name(me)}的所有 ★ 怪物战力永久 +2`);
    } else if (r === 'shieldAlly') {
      const t = P.board.filter(o => o !== cr && (!o.kw.has('装甲') || o.armorUsed));
      const v = await this.chooseFrom(me, t, '防暴无人机：选择你的一只怪物获得装甲', c => c.reduce((a, b) => this.val(b.card) > this.val(a.card) ? b : a));
      if (v) { v.kw.add('装甲'); v.armorUsed = false; this.L(`【${v.card.name}】获得装甲`); }
    } else if (r === 'energy') {
      if (this.cur === me) { P.mana += 1; this.L(`合规审计员：${this.name(me)}获得 1 点能量`); }
    } else if (r === 'snipe') {
      const t = O.board.filter(o => o.up && o !== enemy);
      const v = await this.chooseFrom(me, t, '企业狙击手：选择对手一只明置怪物，战力永久 −2', c => c.reduce((a, b) => this.staticPw(b) > this.staticPw(a) ? b : a));
      if (v) { v.bonus -= 2; this.L(`【${v.card.name}】战力 −2 → ${this.staticPw(v)}`); if (this.staticPw(v) <= 0) await this.kill(v, '狙击'); }
    } else if (r === 'heal1') {
      if (P.life < P.maxLife) { P.life += 1; this.L(`公关经理：${this.name(me)}恢复 1 点生命 → ${P.life}`); }
    } else if (r === 'execBuff') {
      for (const o of P.board) if (o !== cr) o.bonus += 1;
      this.L(`公司执行官：${this.name(me)}的其他怪物战力永久 +1`);
    } else if (r === 'rehide' && !inCombat) {
      const good = ['whisper', 'peek', 'abyss', 'boss', 'draw', 'salvage'];
      const t = P.board.filter(o => o.up && o !== cr);
      let v;
      if (this.isAI(me)) v = t.filter(o => good.includes(o.card.reveal))[0] || null;
      else v = await this.chooseFrom(me, t, '幻影骑手：可以把你另一只明置怪物翻回暗置（可跳过）', null, true);
      if (v) { v.up = false; this.L(`幻影骑手：${this.name(me)}把【${v.card.name}】翻回暗置`); }
    }
    await this.pause(250);
  }

  async damage(i, n, why = '') {
    const P = this.p[i];
    if (await this.offerEv(i, 'shield', `你将失去 ${n} 点生命${why ? `（${why}）` : ''}。使用【紧急护甲】防止？`, P.life - n <= 0 || P.life <= 3)) return;
    P.life -= n; this.ui.fx?.('damage'); this.L(`${this.name(i)}失去 ${n} 点生命 → ${P.life}${why ? ' ' + why : ''}`, 'dmg');
    await this.pause(300);
    this.checkOver();
  }
  checkOver() {
    const a = this.p[0].life <= 0, b = this.p[1].life <= 0;
    if (a || b) throw new GameOver(a && b ? 1 - this.cur : a ? 1 : 0);
  }
  async kill(cr, why = '', pierce = false) {
    const pl = this.p[cr.owner];
    if (!pl.board.includes(cr)) return false;
    if (pierce && cr.kw.has('装甲') && !cr.armorUsed) this.L(`病毒穿透了【${cr.card.name}】的装甲`);
    if (!pierce && cr.kw.has('装甲') && !cr.armorUsed) { cr.armorUsed = true; this.ui.fx?.('armorBlock'); this.L(`【${cr.card.name}】装甲抵挡了这次消灭`); return false; }
    if (why === '战斗' && await this.offerEv(cr.owner, 'ghost', `你的【${cr.card.name}】将在战斗中被消灭。使用【幻影残像】把它翻回暗置、留在场上？`, this.val(cr.card) >= 1.6)) {
      cr.up = false; this.L(`幻影残像：【${cr.card.name}】翻回暗置，躲过了消灭`); await this.pause(300); return false;
    }
    {
      const subs = pl.board.filter(o => o !== cr && o.card.tier === 1);
      if (subs.length && await this.offerEv(cr.owner, 'standIn', `你的【${cr.card.name}】将被消灭。使用【小弟顶上】改为吃掉你的另一只 ★ 怪物？`, this.val(cr.card) >= 2.2)) {
        const v = await this.chooseFrom(cr.owner, subs, '小弟顶上：选择替它牺牲的 ★ 怪物', x => this.smallest(x));
        await this.sacrifice(v, `替【${cr.card.name}】挡下了这次消灭`); return false;
      }
    }
    if (await this.offerEv(cr.owner, 'evac', `你的【${cr.card.name}】将被消灭。使用【紧急撤离】把它收回手上？`, this.val(cr.card) >= 2.2)) {
      pl.board.splice(pl.board.indexOf(cr), 1); pl.hand.push(cr.card); this.L(`【${cr.card.name}】紧急撤离，回到${this.name(cr.owner)}手上`); await this.pause(300); return true;
    }
    pl.board.splice(pl.board.indexOf(cr), 1); if (!cr.card.token) pl.grave.push(cr.card);
    this.ui.fx?.('kill', cr.card.tier);
    this.L(`${this.name(cr.owner)}的【${cr.card.name}】被消灭${why ? '（' + why + '）' : ''}`, 'kill');
    await this.pause(250);
    if (cr.card.death === 'boom') await this.damage(1 - cr.owner, 1, '自爆无人机');
    if (cr.card.death === 'draw1') { await this.draw(cr.owner, 1); this.L(`【${cr.card.name}】：${this.name(cr.owner)}抽 1 张牌`); }
    if (await this.offerEv(cr.owner, 'insure', `你的【${cr.card.name}】被消灭了。使用【保险理赔】抽 1 张牌并恢复 1 点生命？`, pl.deck.length > 2)) { await this.draw(cr.owner, 1); pl.life = Math.min(pl.maxLife, pl.life + 1); this.L(`保险理赔：${this.name(cr.owner)}恢复 1 点生命 → ${pl.life}`); }
    return true;
  }

  // ---------- 效果牌 ----------
  effTargets(a, c) {
    const P = this.p[a], O = this.p[1 - a];
    switch (c.eff) {
      case 'suppress': return O.board.slice();
      case 'upgrade': return P.board.slice();
      case 'charge': return P.board.slice();
      case 'hijack': return P.board.length < MAX_BOARD ? O.board.filter(o => o.up && this.staticPw(o) <= 4) : [];
      case 'purge': return O.board.filter(o => o.card.tier === 1);
      case 'reset': return P.board.filter(o => o.up);
      case 'armorUp': return P.board.filter(o => !o.kw.has('装甲') || o.armorUsed);
      case 'strike': return O.board.slice();
      case 'buyout': return O.board.filter(o => o.card.tier === 2 || (c.cost >= 5 && o.card.tier === 3));
      case 'scrapDraw': return P.board.slice();
      case 'implant': return P.board.filter(o => P.board.some(s => s !== o && s.card.tier === 1));
      case 'meatBomb': return P.board.length ? O.board.slice() : [];
      case 'gangUp': return P.board.length ? O.board.slice() : [];
      case 'rocket': return O.board.filter(o => o.card.tier === 3 || (VARS.rocketPw && this.staticPw(o) >= VARS.rocketPw && (o.up || o.known)));
      case 'bounce': return P.board.slice();
      case 'layoff': return P.board.filter(o => o.card.tier === 1);
      case 'quarantine': return O.board.filter(o => !o.noAttack);
      case 'lawsuit': return O.board.filter(o => o.card.tier >= 2);
      case 'merger': return P.board.length >= 2 ? P.board.slice() : [];
      case 'reload': return P.board.filter(o => o.up && o.card.reveal);
      case 'swarm': return null;
      case 'ddos': return null;
      case 'spread': return null;
      case 'exposeKill': return O.board.filter(o => !o.up);
      case 'exploit': return O.board.slice();
      default: return null;
    }
  }
  effPlayable(a, c) {
    if (c.cost > this.p[a].mana) return false;
    const t = this.effTargets(a, c);
    if (t === null) { if (c.eff === 'rally' || c.eff === 'bonusAll') return this.p[a].board.length > 0; if (c.eff === 'sweep') return this.p[1 - a].board.length > 0; if (c.eff === 'war') return this.p[a].board.length > 0; if (c.eff === 'swarm') return this.p[a].board.length < MAX_BOARD; if (c.eff === 'spread') return this.p[a].board.length > 0; if (c.eff === 'ddos') return true; if (c.eff === 'draw2') return this.p[a].deck.length > 0; if (c.eff === 'expose') return this.p[1 - a].board.some(o => !o.up); if (c.eff === 'heal') return this.p[a].life < this.p[a].maxLife; return true; }
    return t.length > 0;
  }
  effPrompt(c) {
    return { suppress: '火力压制：选择对手一只怪物', upgrade: '黑市改装：选择你的一只怪物', charge: '超频冲锋：选择你的一只怪物，本回合多攻击一次', hijack: '劫持：选择对手一只战力 ≤4 的明置怪物', purge: '定点清除：选择对手一只 ★ 怪物', reset: '系统重启：选择你的一只明置怪物', armorUp: '护盾部署：选择你的一只怪物', strike: '精准打击：选择对手一只怪物', buyout: '恶意收购：选择对手一只 ★★ 或 ★★★ 怪物', scrapDraw: '拆解回收：选择你要吃掉的一只怪物', implant: '义体移植：选择要强化的你的怪物', meatBomb: '人肉炸弹：选择对手一只怪物', gangUp: '围殴：选择对手一只怪物', rocket: '穿甲火箭：选择对手一只 ★★★ 或战力 ≥7 的怪物', bounce: '资产重组：选择你要收回的一只怪物', layoff: '裁员优化：选择你要吃掉的一只 ★ 怪物', quarantine: '隔离协议：选择对手一只怪物', lawsuit: '律师函：选择对手一只 ★★ 或 ★★★ 怪物', merger: '战略合作：选择要强化的你的怪物', reload: '重新加载：选择你的一只明置怪物', exposeKill: '暴露漏洞：选择对手一只暗置怪物', exploit: '漏洞利用：选择对手一只怪物' }[c.eff];
  }
  aiEffectScore(a, c) {
    const P = this.p[a], O = this.p[1 - a];
    switch (c.eff) {
      case 'suppress': {
        const t = O.board.filter(o => (!o.up && o.card.tier <= 2) || (o.up && this.staticPw(o) <= 4)); if (!t.length) return [0, null];
        const pk = o => { const b = this.belief(a, o); return avg(b.map(x => (x.power + o.bonus) <= 4 ? 1 : 0)) * avg(b.map(x => this.val(x))); };
        const o = t.reduce((x, y) => pk(y) > pk(x) ? y : x); return [pk(o) * 1.3, o];
      }
      case 'upgrade': if (!P.board.length) return [0, null]; return [1.0, P.board.reduce((x, y) => y.card.power > x.card.power ? y : x)];
      case 'charge': {
        const t = P.board.filter(o => o.attacksLeft === 0); if (!t.length) return [0, null];
        const o = t.reduce((x, y) => this.attackEv(a, y) > this.attackEv(a, x) ? y : x);
        return [this.attackEv(a, o) + 0.3, o];
      }
      case 'draw2': return [P.deck.length ? (P.hand.length <= 3 ? 1.5 : 1.0) : 0, null];
      case 'heal': return [P.life <= P.maxLife - 2 ? 1.8 : P.life < P.maxLife ? 0.8 : 0, null];
      case 'expose': return [0.6 * O.board.filter(o => !o.up).length, null];
      case 'hijack': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; const o = t.reduce((x, y) => this.val(y.card) > this.val(x.card) ? y : x); return [2 * this.val(o.card), o]; }
      case 'purge': { const t = O.board.filter(o => o.card.tier === 1); if (!t.length) return [0, null]; return [1.6, t.reduce((x, y) => (y.up ? this.val(y.card) : 1.2) > (x.up ? this.val(x.card) : 1.2) ? y : x)]; }
      case 'ramp': return [P.maxMana < 6 ? 1.4 : 0.3, null];
      case 'reload': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; const o = t.reduce((x, y) => this.flipScore(y) > this.flipScore(x) ? y : x); const s = this.flipScore(o); if (o.card.reveal === 'abyss' && !O.board.some(q => !q.up)) return [0, null]; if (o.card.reveal === 'boss' && !O.board.some(q => q.up && this.staticPw(q) <= 4)) return [0, null]; return [s * 1.2 + 0.3, o]; }
      case 'swarm': { const free = MAX_BOARD - P.board.length; return [free >= (VARS.swarmN ?? 2) ? 1.5 : free >= 1 ? 0.7 : 0, null]; }
      case 'ddos': return [O.maxMana >= 3 ? 1.1 + (O.hand.some(h => h.cost >= 5) ? 0.4 : 0) : 0.2, null];
      case 'spread': { const att = P.board.filter(o => o.attacksLeft > 0 && !o.kw.has('病毒')); const tgt = O.board.length; return [att.length >= 2 && tgt ? 0.55 * Math.min(att.length, tgt) + 0.2 : 0, null]; }
      case 'exploit': { const f = (P.flips || 0) * (VARS.exploitPer ?? 2); if (!f || !O.board.length) return [0, null]; const sc = o => avg(this.belief(a, o).map(x => (x.power + o.bonus) <= f ? this.val(x) * 1.2 : 0.1)); const o = O.board.reduce((x, y) => sc(y) > sc(x) ? y : x); return [sc(o), o]; }
      case 'scrapDraw': { const t = P.board.filter(o => o.card.tier === 1 && (o.noAttack || this.turns > 8)); if (!t.length || P.deck.length < 3) return [0, null]; const o = this.smallest(t); return [2.0 - this.val(o.card), o]; }
      case 'implant': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; const o = t.reduce((x, y) => this.val(y.card) > this.val(x.card) ? y : x); const s = this.smallest(P.board.filter(q => q !== o && q.card.tier === 1)); return [1.4 - this.val(s.card) * 0.4 + (o.attacksLeft > 0 ? 0.3 : 0), o]; }
      case 'meatBomb': {
        if (!P.board.length || !O.board.length) return [0, null];
        const s = this.smallest(P.board), dmg = this.staticPw(s) + 2;
        const sc = o => avg(this.belief(a, o).map(x => (x.power + o.bonus) <= dmg ? this.val(x) : 0.2));
        const o = O.board.reduce((x, y) => sc(y) > sc(x) ? y : x); return [sc(o) - this.val(s.card) * 0.6, o];
      }
      case 'gangUp': {
        if (!O.board.length) return [0, null];
        const sum = P.board.reduce((s, o) => s + this.staticPw(o), 0), lost = P.board.filter(o => o.attacksLeft > 0).length * 0.35;
        const sc = o => avg(this.belief(a, o).map(x => sum > x.power + o.bonus ? this.val(x) : 0));
        const o = O.board.reduce((x, y) => sc(y) > sc(x) ? y : x); return [sc(o) * 1.1 - lost, o];
      }
      case 'rally': { const n = P.board.filter(o => !o.noAttack).length; return [n >= 2 ? 0.5 * n - 0.2 : 0, null]; }
      case 'rocket': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; return [3.0, t.reduce((x, y) => this.val(y.card) > this.val(x.card) ? y : x)]; }
      case 'war': {
        const smalls = P.board.filter(o => o.card.tier === 1).length, n = P.board.length;
        return [n >= 2 ? 0.9 * Math.min(smalls, O.board.length) + 0.6 * (n - Math.min(smalls, O.board.length)) + (O.board.length === 0 ? 1.5 : 0) : 0, null];
      }
      case 'bounce': { const t = P.board.filter(o => o.armorUsed || o.bonus < 0 || (o.up && ['whisper', 'peek', 'abyss', 'heal1', 'snipe', 'shieldAlly', 'smallBuff', 'energy'].includes(o.card.reveal))); if (!t.length) return [0, null]; return [1.0, t[0]]; }
      case 'layoff': { const t = this.effTargets(a, c); if (!t.length || this.turns < 6 || P.board.length < 3) return [0, null]; const o = this.smallest(t); const big = P.hand.find(h => h.typ !== 'event' && h.cost > P.mana && h.cost <= P.mana + 2 && h.cost >= 4); return [big ? 2.2 - this.val(o.card) * 0.4 : 0, o]; }
      case 'bonusAll': return [P.board.length >= 3 ? 0.45 * P.board.length : 0, null];
      case 'quarantine': { const t = O.board.filter(o => !o.noAttack && (o.up ? this.staticPw(o) >= 6 : o.card.tier >= 2)); if (!t.length) return [0, null]; return [1.6, t.reduce((x, y) => this.staticPw(y) > this.staticPw(x) ? y : x)]; }
      case 'lawsuit': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; const o = t.reduce((x, y) => (y.card.tier * 3 + (y.up ? this.staticPw(y) : 0)) > (x.card.tier * 3 + (x.up ? this.staticPw(x) : 0)) ? y : x); return [o.card.tier === 3 ? 2.2 : 1.2, o]; }
      case 'sweep': { const lim = VARS.cf ? 4 : 3; const k = O.board.reduce((s, o) => s + avg(this.belief(a, o).map(x => (x.power + o.bonus + (o.tmp || 0)) <= lim ? this.val(x) : 0)), 0); return [k >= 2.4 ? k * 0.9 : 0, null]; }
      case 'merger': { if (P.board.length < 2) return [0, null]; const o = P.board.reduce((x, y) => this.val(y.card) > this.val(x.card) ? y : x); const s = this.smallest(P.board.filter(q => q !== o)); return [1.3 - this.val(s.card) * 0.5, o]; }
      case 'armorUp': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; const o = t.reduce((x, y) => this.val(y.card) > this.val(x.card) ? y : x); return [0.5 + this.val(o.card) * 0.3, o]; }
      case 'strike': {
        const t = O.board; if (!t.length) return [0, null];
        const sc = o => { const b = this.belief(a, o); return avg(b.map(x => (x.power + o.bonus - 3) <= 0 ? this.val(x) * 1.2 : 0.45)); };
        const o = t.reduce((x, y) => sc(y) > sc(x) ? y : x); return [sc(o) + 0.3, o];
      }
      case 'buyout': { const t = this.effTargets(a, c); if (!t.length) return [0, null]; return [2.4, t.reduce((x, y) => this.val(y.card) > this.val(x.card) ? y : x)]; }
      case 'reset': {
        const t = P.board.filter(o => o.up); if (!t.length) return [0, null];
        const g = t.filter(o => ['whisper', 'peek', 'abyss', 'rehide'].includes(o.card.reveal));
        return g.length ? [1.3, g[0]] : [0.4, t[0]];
      }
    }
    return [0, null];
  }
  async playEffect(a, c, arg) {
    const P = this.p[a], O = this.p[1 - a];
    P.hand.splice(P.hand.indexOf(c), 1); P.lastPlayed = c; this.pay(a, c.cost);
    this.ui.sfx?.('effect', c);
    if (this.ui.cinematic) await this.ui.cinematic(c);
    this.L(`${this.name(a)}打出效果【${c.name}】（${c.cost} 能量）${arg ? ' → ' + this.label(arg) : ''}`, 'effect');
    if (arg && this.isAI(a) && this.ui.aim) await this.ui.aim(a, arg);
    await this.pause(450);
    if (await this.offerEv(1 - a, 'counter', `对手打出效果【${c.name}】。使用【逻辑炸弹】让它无效？`, c.cost >= 2 || c.eff === 'hijack')) { P.grave.push(c); this.L(`【${c.name}】被逻辑炸弹抵消`); this.ui.toast?.(`【${c.name}】被对方的【逻辑炸弹】抵消了`); await this.pause(700); return; }
    P.grave.push(c);
    switch (c.eff) {
      case 'suppress':
        if (O.board.includes(arg)) {
          arg.up = arg.known = true;
          const pw = this.staticPw(arg);
          this.L(`火力压制翻开了【${arg.card.name}】，战力 ${pw}`);
          this.ui.highlight?.([arg]); this.ui.toast?.(`火力压制翻开：【${arg.card.name}】战力 ${pw}${pw <= 4 ? '，消灭！' : '，太高了，没能消灭'}`);
          await this.pause(1100); this.ui.highlight?.([]);
          if (pw <= 4) await this.kill(arg, '火力压制'); else this.L(`【${arg.card.name}】战力太高，没能消灭`);
        } break;
      case 'upgrade': if (P.board.includes(arg)) { arg.bonus += 2; this.L(`【${arg.card.name}】永久战力 +2`); } break;
      case 'charge': if (P.board.includes(arg)) { arg.attacksLeft += 1; this.L(`【${arg.card.name}】本回合多攻击一次`); } break;
      case 'draw2': await this.draw(a, 2); break;
      case 'heal': P.life = Math.min(P.maxLife, P.life + 2); this.L(`${this.name(a)}恢复生命 → ${P.life}`); break;
      case 'expose': { const t = O.board.filter(o => !o.up); for (const o of t) o.up = o.known = true; this.L('对手所有暗置怪物被翻开'); this.ui.highlight?.(t); await this.pause(1000); this.ui.highlight?.([]); break; }
      case 'hijack':
        if (O.board.includes(arg) && P.board.length < MAX_BOARD) { O.board.splice(O.board.indexOf(arg), 1); arg.owner = a; arg.attacksLeft = 0; P.board.push(arg); this.L(`劫持了【${arg.card.name}】`); } break;
      case 'purge': if (O.board.includes(arg)) { arg.up = arg.known = true; this.ui.highlight?.([arg]); await this.pause(900); this.ui.highlight?.([]); await this.kill(arg, '定点清除'); } break;
      case 'reset': if (P.board.includes(arg)) { arg.up = false; this.L(`【${arg.card.name}】翻回暗置`); } break;
      case 'scrapDraw': if (P.board.includes(arg)) { await this.sacrifice(arg, '拆解回收'); await this.draw(a, 2); this.L(`${this.name(a)}抽 2 张牌`); } break;
      case 'implant': if (P.board.includes(arg)) {
        const t = P.board.filter(o => o !== arg && o.card.tier === 1);
        const s = await this.chooseFrom(a, t, '义体移植：选择要吃掉的 ★ 怪物', x => this.smallest(x));
        if (s) { await this.sacrifice(s, '义体移植'); arg.bonus += 3; this.L(`【${arg.card.name}】战力永久 +3 → ${this.staticPw(arg)}`); }
      } break;
      case 'meatBomb': if (O.board.includes(arg) && P.board.length) {
        const s = await this.chooseFrom(a, P.board.slice(), '人肉炸弹：选择要吃掉的你的怪物', x => this.smallest(x));
        const dmg = this.staticPw(s) + 2; await this.sacrifice(s, '化作人肉炸弹');
        if (O.board.includes(arg)) { arg.bonus -= dmg; arg.up = arg.known = true; const pw = this.staticPw(arg); this.L(`人肉炸弹：【${arg.card.name}】战力 −${dmg} → ${pw}`); this.ui.highlight?.([arg]); await this.pause(800); this.ui.highlight?.([]); if (pw <= 0) await this.kill(arg, '人肉炸弹'); }
      } break;
      case 'gangUp': if (O.board.includes(arg)) {
        arg.up = arg.known = true;
        const sum = P.board.reduce((s, o) => s + this.staticPw(o), 0), pw = this.staticPw(arg);
        this.L(`围殴：你方战力合计 ${sum}，对上【${arg.card.name}】战力 ${pw}`); this.ui.highlight?.([arg, ...P.board]); await this.pause(900); this.ui.highlight?.([]);
        for (const o of P.board) o.attacksLeft = 0;
        if (sum > pw) await this.kill(arg, '围殴'); else this.L('人数不够，没打过');
      } break;
      case 'rally': for (const o of P.board) o.tmp = (o.tmp || 0) + 2; this.freeAttack(P); this.L(`帮派集结：${this.name(a)}的所有怪物本回合战力 +2`); break;
      case 'rocket': if (O.board.includes(arg)) { arg.up = arg.known = true; this.ui.highlight?.([arg]); await this.pause(800); this.ui.highlight?.([]); await this.kill(arg, '穿甲火箭'); } break;
      case 'war': {
        this.L('帮派战争！', 'effect');
        for (let guard = 0; guard < 6; guard++) {
          const smalls = P.board.filter(o => o.card.tier === 1);
          if (!smalls.length || !O.board.length) break;
          let s;
          if (this.isAI(a)) s = O.board.some(o => avg(this.belief(a, o).map(x => x.power + o.bonus <= 4 ? 1 : 0)) > 0.5 || this.val(o.card) >= 2.5) ? this.smallest(smalls) : null;
          else s = await this.ui.chooseTarget('帮派战争：选一只你的 ★ 怪物吃掉（对手一只怪物 −4），或者点「跳过」进入总攻', smalls, true);
          if (!s) break;
          const v = await this.chooseFrom(a, O.board.slice(), '帮派战争：选择对手一只怪物，战力永久 −4', x => x.reduce((m, o) => { const f = q => avg(this.belief(a, q).map(y => (y.power + q.bonus <= 4 ? 2 : 0) + y.power * 0.1)); return f(o) > f(m) ? o : m; }));
          await this.sacrifice(s, '为帮派战争献身');
          if (O.board.includes(v)) { v.bonus -= 4; v.up = v.known = true; const pw = this.staticPw(v); this.L(`【${v.card.name}】战力 −4 → ${pw}`); if (pw <= 0) await this.kill(v, '帮派战争'); }
        }
        for (const o of P.board) o.tmp = (o.tmp || 0) + 3;
        this.freeAttack(P); this.L(`${this.name(a)}剩下的所有怪物本回合战力 +3，全员可以攻击`);
        break;
      }
      case 'bounce': if (P.board.includes(arg)) { P.board.splice(P.board.indexOf(arg), 1); P.hand.push(arg.card); this.L(`【${arg.card.name}】收回手上`); await this.draw(a, 1); } break;
      case 'layoff': if (P.board.includes(arg)) { await this.sacrifice(arg, '裁员优化'); P.mana += 2; this.L(`${this.name(a)}本回合获得 2 点能量`); if (VARS.cf) await this.draw(a, 1); } break;
      case 'bonusAll': for (const o of P.board) o.bonus += 1; this.L(`绩效奖金：${this.name(a)}的所有怪物战力永久 +1`); break;
      case 'quarantine': if (O.board.includes(arg)) { arg.noAttack = true; arg.attacksLeft = 0; this.L(`${this.label(arg)}被隔离，永久不能攻击`); } break;
      case 'lawsuit': if (O.board.includes(arg)) { arg.up = arg.known = true; arg.bonus = 3 - arg.card.power; this.L(`律师函：【${arg.card.name}】战力永久变为 ${this.staticPw(arg)}`); this.ui.highlight?.([arg]); await this.pause(800); this.ui.highlight?.([]); } break;
      case 'sweep': {
        for (const o of O.board) o.up = o.known = true;
        const lim = VARS.cf ? 4 : 3; const t = O.board.filter(o => this.staticPw(o) <= lim); this.ui.highlight?.(O.board.slice()); await this.pause(900); this.ui.highlight?.([]);
        this.L(`清场程序：翻开对手所有怪物，消灭 ${t.length} 只`); for (const o of t) await this.kill(o, '清场程序');
        break;
      }
      case 'merger': if (P.board.includes(arg)) {
        const t = P.board.filter(o => o !== arg);
        const s = await this.chooseFrom(a, t, '战略合作：选择要吃掉的你的怪物', x => this.smallest(x));
        if (s) { await this.sacrifice(s, '战略合作'); arg.bonus += 2; arg.kw.add('装甲'); arg.armorUsed = false; this.L(`【${arg.card.name}】战力永久 +2 并获得装甲`); }
      } break;
      case 'reload': if (P.board.includes(arg)) { arg.up = false; this.L(`重新加载：【${arg.card.name}】翻回暗置后立刻翻开`); await this.pause(300); await this.reveal(arg); } break;
      case 'swarm': { let n = 0; for (let k = 0; k < (VARS.swarmN ?? 2) && P.board.length < MAX_BOARD; k++) { const t = new Cr(TOKENS.worm(), a, false); t.born = this.turns; P.board.push(t); n++; } this.L(`蜂群协议：${this.name(a)}放入 ${n} 只暗置的 ★ 怪物${a === 0 ? '（蠕虫碎片）' : ''}`); break; }
      case 'ddos': O.ddos = (O.ddos || 0) + (VARS.ddosAmt ?? 2); this.L(`DDoS 攻击：${this.name(1 - a)}下回合少 ${VARS.ddosAmt ?? 2} 点能量`); break;
      case 'spread': for (const o of P.board) if (!o.kw.has('病毒')) { o.kw.add('病毒'); (o.tmpKws ||= []).push('病毒'); } this.L(`病毒扩散：${this.name(a)}的所有怪物本回合获得【病毒】`); break;
      case 'exploit': if (O.board.includes(arg)) { const f = (P.flips || 0) * (VARS.exploitPer ?? 2); arg.up = arg.known = true; arg.bonus -= f; const pw = this.staticPw(arg); this.L(`漏洞利用：本回合翻开过 ${P.flips || 0} 只，【${arg.card.name}】战力 −${f} → ${pw}`); this.ui.highlight?.([arg]); await this.pause(800); this.ui.highlight?.([]); if (pw <= 0) await this.kill(arg, '漏洞利用'); } break;
      case 'ramp': P.capBonus = (P.capBonus || 0) + 1; P.maxMana += 1; this.L(`${this.name(a)}能量上限 +1 → ${P.maxMana}`); await this.draw(a, 1); break;
      case 'armorUp': if (P.board.includes(arg)) { arg.kw.add('装甲'); arg.armorUsed = false; this.L(`【${arg.card.name}】获得装甲`); } break;
      case 'strike':
        if (O.board.includes(arg)) { arg.bonus -= 3; arg.up = arg.known = true; const pw = this.staticPw(arg); this.L(`精准打击：【${arg.card.name}】战力 −3 → ${pw}`); this.ui.highlight?.([arg]); await this.pause(800); this.ui.highlight?.([]); if (pw <= 0) await this.kill(arg, '精准打击'); } break;
      case 'buyout': if (O.board.includes(arg)) { arg.up = arg.known = true; this.ui.highlight?.([arg]); await this.pause(800); this.ui.highlight?.([]); await this.kill(arg, '恶意收购'); } break;
    }
  }
  label(cr) {
    if (cr.up || cr.known || cr.owner === 0) return `【${cr.card.name}】`;
    return `暗置${TIER[cr.card.tier].stars}`;
  }

  // ---------- 攻击 ----------
  async chooseBlock(d, A) {
    if (this.isAI(d)) return this.aiChooseBlock(d, A);
    const b = this.blockers(d); if (!b.length) return null;
    return await this.ui.chooseBlock(A, b);
  }
  async doAttack(a, A) {
    const d = 1 - a;
    A.attacksLeft--;
    try {
      this.L(`${this.name(a)}用${this.label(A)}发动攻击`, 'attack');
      this.ui.highlight?.([A]);
      await this.pause(450);
      const aiCancel = this.aiChooseBlock(d, A) === null && (this.p[d].life <= 2 || A.up && this.staticPw(A) >= 7);
      if (await this.offerEv(d, 'cancel', `对手的${this.label(A)}正在攻击你。使用【防火墙】取消这次攻击？`, aiCancel)) { this.L('攻击被防火墙取消'); return; }
      const B = await this.chooseBlock(d, A);
      const bUp = B ? B.up : null;
      if (B) B.blocksLeft--;
      this.L(B ? `${this.name(d)}用${this.label(B)}拦截` : `${this.name(d)}不拦截`);
      this.ui.highlight?.(B ? [A, B] : [A]);
      await this.pause(300);
      if (this.ui.lunge) await this.ui.lunge(A, B);
      let amod = 0, bmod = 0;
      if (B) {
        for (const [side, meA] of [[a, true], [d, false]]) {
          for (const ev of ['pump', 'jam']) {
            if (!this.findEv(side, ev)) continue;
            let aiWants = false;
            if (this.isAI(side)) {
              const nm = k => meA
                ? avg(this.belief(a, B).map(Bc => this.pairEv(a, A, B, A.card, Bc, bUp, amod + (ev === 'pump' ? 3 : 0) * k, bmod + (ev === 'jam' ? -3 : 0) * k)))
                : avg(this.belief(d, A).map(Ac => this.pairEv(d, A, B, Ac, B.card, bUp, amod + (ev === 'jam' ? -3 : 0) * k, bmod + (ev === 'pump' ? 3 : 0) * k)));
              aiWants = nm(1) - nm(0) > 0.8;
            }
            const mine = meA ? A : B, theirs = meA ? B : A;
            const q = ev === 'pump' ? `你的【${mine.card.name}】本场战力 +3？` : `对方的${this.label(theirs)}本场战力 −3？`;
            if (await this.offerEv(side, ev, q, aiWants)) {
              if (meA) { amod += ev === 'pump' ? 3 : 0; bmod += ev === 'jam' ? -3 : 0; }
              else { bmod += ev === 'pump' ? 3 : 0; amod += ev === 'jam' ? -3 : 0; }
            }
          }
        }
      }
      if (B) {
        const others = this.p[d].board.filter(o => o !== B).length;
        if (others > 0) {
          let aiWants = false;
          if (this.isAI(d)) { const nm = k => avg(this.belief(d, A).map(Ac => this.pairEv(d, A, B, Ac, B.card, bUp, amod, bmod + others * k))); aiWants = nm(1) - nm(0) > 0.6; }
          if (await this.offerEv(d, 'phalanx', `你的【${B.card.name}】本场战力 +${others}（场上其他怪物各 +1）？`, aiWants)) bmod += others;
        }
      }
      await this.reveal(A, true, B);
      if (B) await this.reveal(B, true, A);
      if (!this.p[a].board.includes(A)) return;
      if (B && !this.p[d].board.includes(B)) { this.L('拦截者已离场，攻击落空'); return; }
      if (!B) await this.damage(d, 1);
      else {
        const { ad, bd, pa, pb } = this.resolve(A, A.card, B, B.card, bUp, amod, bmod);
        this.L(`交战：${A.card.name} ${pa} vs ${B.card.name} ${pb}`); this.ui.fx?.('clash');
        await this.pause(350);
        const pierceOn = !this.cfg.noPierce;
        const bk = bd ? await this.kill(B, '战斗', pierceOn && A.kw.has('病毒')) : false;
        const ak = ad ? await this.kill(A, '战斗', pierceOn && !(VARS_E.pierceAtk) && B.kw.has('病毒')) : false;
        if (ak && !bd && this.p[d].board.includes(B))
          if (await this.offerEv(a, 'revenge', `你的【${A.card.name}】倒下了，对方【${B.card.name}】还活着。使用【同归于尽】把它也消灭？`, this.val(B.card) >= 1.8)) await this.kill(B, '同归于尽');
        if (!bk && this.p[d].board.includes(B) && this.p[a].board.includes(A))
          if (await this.offerEv(d, 'riposte', `你的【${B.card.name}】挡住了攻击，对方【${A.card.name}】还在场上。使用【反击协议】消灭它？`, this.val(A.card) >= 1.5)) await this.kill(A, '反击协议');
        if (bk && !ad && this.p[a].board.includes(A))
          if (await this.offerEv(d, 'revenge', `你的【${B.card.name}】倒下了，对方【${A.card.name}】还活着。使用【同归于尽】把它也消灭？`, this.val(A.card) >= 1.8)) await this.kill(A, '同归于尽');
      }
    } finally { this.ui.highlight?.([]); }
  }

  // ---------- 出怪 ----------
  aiUnitScore(a, c) {
    const O = this.p[1 - a], P = this.p[a];
    const r = c.reveal; let up = false; let sc = 0.8 + c.cost * 0.45 + c.power * 0.08 + this.rnd() * 0.3;
    const good = ['whisper', 'peek', 'abyss', 'boss', 'draw', 'salvage'];
    if (r === 'boss' && O.board.some(o => o.up && this.staticPw(o) <= 4)) { up = true; sc += 2; }
    if (r === 'abyss' && O.board.some(o => !o.up)) { up = true; sc += 1 + O.board.filter(o => !o.up).length; }
    if (r === 'whisper' && O.hand.length) { up = true; sc += 0.8; }
    if (r === 'peek' && O.board.some(o => !o.up)) { up = true; sc += 0.4; }
    if (r === 'draw' && P.deck.length) { up = true; sc += 0.5; }
    if (r === 'salvage' && P.grave.some(x => x.typ === 'unit')) { up = true; sc += 0.8; }
    if (c.cont === 'drum' && P.board.length >= 2) { up = true; sc += 0.6; }
    if (r === 'rehide' && P.board.some(o => o.up && good.includes(o.card.reveal))) { up = true; sc += 0.8; }
    if (c.req === 'sacRandom') sc -= avg(P.board.map(o => this.val(o.card)));
    if (c.req === 'sacTier2') sc -= Math.min(...P.board.filter(o => o.card.tier === 2).map(o => this.val(o.card)));
    if (c.req === 'hidden2') up = false;
    if (r === 'flipDown' && P.board.some(o => o.up && this.flipScore(o) >= 0.7)) { up = true; sc += 0.6; }
    if (r === 'echo' && P.board.some(o => o.up && this.flipScore(o) >= 0.9 && o.card.reveal !== 'echo')) { up = true; sc += 0.8 + Math.max(...P.board.filter(o => o.up).map(o => this.flipScore(o))); }
    if (c.cont === 'relay') { up = true; sc += P.board.some(o => o.up && this.flipScore(o) >= 0.7) ? 0.8 : 0.2; }
    if (r === 'demo' && P.board.some(o => o.card.tier === 1) && O.board.some(o => (o.up && this.staticPw(o) <= 5) || (!o.up && o.card.tier <= 2))) { up = true; sc += 1.2; }
    if (r === 'smallBuff') { const k = P.board.filter(o => o.card.tier === 1).length; if (k >= 2) { up = true; sc += 0.5 * k; } }
    if (r === 'shieldAlly' && P.board.some(o => !o.kw.has('装甲') || o.armorUsed)) { up = true; sc += 0.6; }
    if (r === 'energy') { up = true; sc += 0.5; }
    if (r === 'snipe' && O.board.some(o => o.up)) { up = true; sc += 0.9; }
    if (r === 'heal1' && P.life < P.maxLife) { up = true; sc += 0.7; }
    if (r === 'execBuff' && P.board.length >= 2) { up = true; sc += 0.4 * P.board.length; }
    if (c.req === 'payLife') sc -= P.life <= 4 ? 3 : 0.8;
    return [sc, up];
  }
  async playUnit(a, c, up) {
    const P = this.p[a];
    P.hand.splice(P.hand.indexOf(c), 1); this.pay(a, c.cost);
    if (c.req === 'sacRandom') {
      const v = P.board[Math.floor(this.rnd() * P.board.length)]; await this.sacrifice(v);
    } else if (c.req === 'sacTier2') {
      const t = P.board.filter(o => o.card.tier === 2);
      const v = await this.chooseFrom(a, t, `召唤【${c.name}】：选择要吃掉的一只 ★★ 怪物`, x => x.reduce((m, o) => this.val(o.card) < this.val(m.card) ? o : m));
      await this.sacrifice(v);
    }
    if (c.req === 'payLife') { const pl = this.cfg.payLife ?? 2; P.life -= pl; this.L(`${this.name(a)}支付 ${pl} 点生命 → ${P.life}`, 'dmg'); }
    const cr = new Cr(c, a, false); cr.born = this.turns; P.board.push(cr);
    this.ui.sfx?.('summon', c, { hidden: !up, mine: !this.isAI(a) });
    if (c.tier === 3 && (up || !this.isAI(a)) && this.ui.cinematic) await this.ui.cinematic(c);
    const reqNote = c.req ? '（满足召唤条件）' : '';
    this.L(up ? `${this.name(a)}明出【${c.name}】（${c.cost} 能量）${reqNote}` : `${this.name(a)}暗出一只 ${TIER[c.tier].stars} 怪物（${c.cost} 能量）${a === 0 ? `：${c.name}` : ''}${reqNote}`, 'play');
    await this.pause(c.cost >= 5 ? (up ? 1600 : 900) : c.cost >= 3 ? 600 : 400);
    if (up) await this.reveal(cr, false, null, true);
  }

  // ---------- 回合 ----------
  async startTurn(a) {
    this.cur = a; const P = this.p[a];
    this.p[0].evUsed = this.p[1].evUsed = false;
    P.maxMana = Math.min(this.cfg.manaCap + (P.capBonus || 0), P.maxMana + 1); P.mana = P.maxMana;
    if (this.turns === 2 && this.cfg.coin) { P.mana += 1; this.L(`后手从 2 费开始：${this.name(a)}本回合能量 2`); }
    for (const pl of this.p) for (const o of pl.board) { o.tmp = 0; for (const k of o.tmpKws || []) if (!o.card.kw.includes(k)) o.kw.delete(k); o.tmpKws = []; }
    for (const o of P.board) o.attacksLeft = o.noAttack ? 0 : o.kw.has('超频') ? 2 : 1;
    P.flips = 0;
    if (P.ddos) { P.mana = Math.max(0, P.mana - P.ddos); this.L(`DDoS：${this.name(a)}本回合少 ${P.ddos} 点能量 → ${P.mana}`, 'dmg'); P.ddos = 0; }
    if (P.board.some(o => o.up && o.card.cont === 'relay')) {
      const t = P.board.filter(o => o.up && o.card.cont !== 'relay');
      let v;
      if (this.isAI(a)) { const g = t.filter(o => this.flipScore(o) >= 0.7); v = g.length ? g.reduce((x, y) => this.flipScore(y) > this.flipScore(x) ? y : x) : null; }
      else if (t.length) v = await this.chooseFrom(a, t, '暗网中继：可以把你一只明置怪物翻回暗置（可跳过）', null, true);
      if (v) { v.up = false; this.L(`暗网中继：${this.name(a)}把【${v.card.name}】翻回暗置`); }
    }
    for (const o of P.board) if (o.card.grow) {
      o.age = (o.age || 0) + 1;
      if (o.age % o.card.grow === 0) { o.bonus += 1; if (o.up || o.owner === 0) this.L(`【${o.card.name}】成长：战力 +1 → ${this.staticPw(o)}`, 'effect'); }
    }
    for (const o of this.p[1 - a].board) o.blocksLeft = 1;
    this.ui.turnStart?.(a);
    if (this.turns > 1 || this.cfg.firstDraw) await this.draw(a);
    await this.pause(300);
  }
  aiNextAction(a) {
    const P = this.p[a];
    let best = null;
    const consider = (sc, act) => { if (sc > 0 && (!best || sc > best[0])) best = [sc, act]; };
    for (const c of P.hand) {
      if (c.typ === 'effect' && this.effPlayable(a, c)) { const [sc, arg] = this.aiEffectScore(a, c); consider(sc - c.cost * 0.2 - 0.3, { type: 'eff', card: c, arg }); }
      if (c.typ === 'unit' && this.canSummon(a, c)) { const [sc, up] = this.aiUnitScore(a, c); consider(sc, { type: 'unit', card: c, up }); }
    }
    if (best) return best[1];
    let atk = null;
    for (const A of P.board) if (A.attacksLeft > 0) { const ev = this.attackEv(a, A); if (!atk || ev > atk[0]) atk = [ev, A]; }
    if (atk && (atk[0] > this.cfg.thr || this.blockers(1 - a).length === 0)) return { type: 'atk', cr: atk[1] };
    return { type: 'end' };
  }
  async takeTurn(a) {
    await this.startTurn(a);
    for (let guard = 0; guard < 40; guard++) {
      let act;
      if (this.isAI(a)) { await this.pause(450); act = this.aiNextAction(a); }
      else act = await this.ui.getAction(this);
      if (act.type === 'end') break;
      if (act.type === 'atk') await this.doAttack(a, act.cr);
      else if (act.type === 'eff') await this.playEffect(a, act.card, act.arg);
      else await this.playUnit(a, act.card, act.up);
      this.checkOver();
    }
    await this.pause(200);
  }
  async run(first) {
    this.p[first].hand = this.p[first].deck.splice(-this.cfg.hand[0]);
    this.p[1 - first].hand = this.p[1 - first].deck.splice(-this.cfg.hand[1]);
    // 后手从 2 费开始：第一回合能量上限就是 2
    this.p[1 - first].maxMana = Math.max(0, (this.cfg.secondStart || 1) - 1);
    // 先手起手 1 费卡：firstOne = 保证的 1 费卡数量（小数部分是再多保证一张的概率）
    const fo = this.cfg.firstOne || 0, need = Math.floor(fo) + (this.rnd() < fo % 1 ? 1 : 0);
    const P0 = this.p[first];
    for (let k = P0.hand.filter(c => c.cost === 1).length; k < need; k++) {
      const di = P0.deck.findIndex(c => c.cost === 1 && c.typ !== 'event'); if (di < 0) break;
      const hi = P0.hand.findIndex(c => c.cost !== 1); if (hi < 0) break;
      const out = P0.hand[hi]; P0.hand[hi] = P0.deck[di]; P0.deck[di] = out;
      const j = Math.floor(this.rnd() * P0.deck.length); [P0.deck[di], P0.deck[j]] = [P0.deck[j], P0.deck[di]];
    }
    let a = first;
    try {
      while (this.turns < this.cfg.maxTurns) { this.turns++; await this.takeTurn(a); a = 1 - a; }
      this.winner = -1;
    } catch (e) { if (e instanceof GameOver) this.winner = e.winner; else throw e; }
    this.over = true; await this.ui.sync();
    return this.winner;
  }
}
