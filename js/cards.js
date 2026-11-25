// 卡牌数据（v0.5：费用制）
export const VARS = { cf: 1, k1: 1, k3: 1, lawCost: 2, bonusCost: 2, chainCost: 2, exploitPer: 3, ekCost: 1, qPw: 5, dgDraw: 1, allDownDraw: 2, echoPw: 3, relayPw: 5, wormVirus: false, ddosCost: 1, rocketPw: 7, qCap: 6 };
export const MAX_COPIES = 2;
export const TIER_COST = { 1: 1, 2: 3, 3: 5 };
const U = (id, name, tier, power, o = {}) => ({ id, name, typ: 'unit', tier, power, cost: o.cost ?? TIER_COST[tier], kw: o.kw || [], reveal: o.reveal || null, grow: o.grow || 0, weakBlock: o.weakBlock || 0, cont: o.cont || null, death: o.death || null, req: o.req || null, text: o.text || '', img: o.img || false });
const E = (id, name, eff, cost, text, o = {}) => ({ id, name, typ: 'effect', eff, cost, text, tier: 0, power: 0, kw: [], img: o.img || false });
const V = (id, name, ev, cost, timing, text, o = {}) => ({ id, name, typ: 'event', ev, cost, timing, text, tier: 0, power: 0, kw: [], img: o.img || false });

export const KW = {
  '超频': '每回合可以攻击两次。',
  '堡垒': '拦截时战力 +2。',
  '病毒': '战斗中，必定消灭对方怪物，无视装甲。',
  '装甲': '第一次被消灭时，改为留在场上。',
  '隐身': '被明置的怪物拦截时，拦截方本场战力 −3。',
};

export const REQ_TEXT = {
  sacRandom: '召唤条件：随机吃掉你场上另一只怪物。',
  grave2: '召唤条件：你的弃牌堆里至少有 2 只怪物。',
  hidden2: '召唤条件：你场上至少有 2 只暗置怪物。',
  sacTier2: '召唤条件：吃掉你场上一只 ★★ 怪物。',
  up2: '召唤条件：你场上至少有 2 只明置怪物。',
  payLife: '召唤条件：支付 2 点生命（生命要多于 2）。',
};

export const CLASSES = {
  gang: {
    key: 'gang', name: '义体帮', color: '#ff3cbe', color2: '#ff9a3c',
    cards: () => [
      U('g01', '街头混混', 1, 2, { kw: ['超频'], img: true }),
      U('g02', '改装打手', 1, 3, { cont: 'pack', text: '常驻：只要你场上还有其他怪物，它的战力 +2。', img: true }),
      U('g03', '自爆无人机', 1, 1, { death: 'boom', text: '被消灭时：对手失去 1 点生命。', img: true }),
      U('g04', '装甲流浪汉', 1, 2, { kw: ['装甲'], img: true }),
      U('g05', '义眼斥候', 1, 1, { reveal: 'draw', text: '翻开时：抽 1 张牌。', img: true }),
      U('g06', '钢拳保镖', 2, 6, { kw: ['堡垒'], img: true }),
      U('g07', '双刃改造者', 2, 6, { kw: ['超频'], img: true }),
      U('g08', '霓虹DJ', 2, 4, { cont: 'drum', text: '明置时：你的其他怪物战力 +1。', img: true }),
      U('g09', '液压重拳手', 2, 7, { img: true }),
      U('g10', '回收者', 2, 4, { reveal: 'salvage', text: '翻开时：从你的弃牌堆拿回一张怪物牌到手上。', img: true }),
      U('g11', '重装机甲', 3, 9, { kw: VARS.mechFort === false ? [] : ['堡垒'], req: 'sacRandom', img: true }),
      U('g12', '帮派老大', 3, 8, { kw: VARS.bossArmor ? ['超频', '装甲'] : ['超频'], reveal: 'boss', req: 'grave2', text: '翻开时：消灭对手一只战力 ≤4 的明置怪物。', img: true }),
      E('g13', '火力压制', 'suppress', 2, '翻开对手一只怪物（不触发技能），如果它战力 ≤4 就消灭它。', { img: true }),
      E('g14', '黑市改装', 'upgrade', 1, '你的一只怪物永久战力 +2。', { img: true }),
      E('g15', '超频冲锋', 'charge', 1, '你的一只怪物本回合多攻击一次，刚上场的也可以攻击。', { img: true }),
      E('g16', '招兵买马', 'draw2', 2, '抽 2 张牌。', { img: true }),
      E('g17', '维修站', 'heal', 2, '恢复 2 点生命（不超过上限）。', { img: true }),
      V('g18', '肾上腺素', 'pump', 1, '拦截宣告后', '你参战的怪物本场战力 +3。', { img: true }),
      V('g19', '紧急护甲', 'shield', 1, '你将失去生命时', '防止这次伤害。', { img: true }),
      V('g20', '同归于尽', 'revenge', 2, '你的怪物在战斗中被消灭、对方却活下来时', '把对方那只也消灭。', { img: true }),
      U('g21', '炮灰小弟', 1, 1, { death: 'draw1', text: '被消灭或被吃掉时：抽 1 张牌。', img: true }),
      U('g22', '拆迁头目', 2, 5, { reveal: 'demo', text: '翻开时：可以吃掉你的一只 ★ 怪物，消灭对手一只战力 ≤5 的怪物。', img: true }),
      E('g23', '拆解回收', 'scrapDraw', 1, '吃掉你的一只怪物，抽 2 张牌。', { img: true }),
      E('g24', '义体移植', 'implant', 1, '吃掉你的一只 ★ 怪物，你的另一只怪物战力永久 +3。', { img: true }),
      E('g25', '人肉炸弹', 'meatBomb', 2, '吃掉你的一只怪物：对手一只怪物战力永久 −（被吃怪物的战力 +2），降到 0 或以下就消灭它。', { img: true }),
      E('g26', '围殴', 'gangUp', VARS.gangUpCost ?? 3, '对手一只怪物被翻开；如果你场上所有怪物的战力之和大于它的战力，就消灭它。之后你的怪物本回合都不能攻击。', { img: true }),
      E('g27', '帮派集结', 'rally', VARS.rallyCost ?? 2, '你的所有怪物本回合战力 +2，刚上场的也可以攻击。', { img: true }),
      E('g28', '穿甲火箭', 'rocket', VARS.rocketCost ?? 4, '消灭对手一只 ★★★ 怪物（明置暗置都行），或一只战力 ≥7 的明置怪物。', { img: true }),
      V('g29', '小弟顶上', 'standIn', 1, '你的一只怪物将被消灭时', '改为吃掉你的另一只 ★ 怪物，原来那只留在场上。', { img: true }),
      E('g30', '帮派战争', 'war', 6, `先：你可以吃掉任意只你的 ★ 怪物，每吃一只，对手一只怪物战力永久 −${VARS.warHit ?? 4}（降到 0 或以下就消灭）。\n然后：你剩下的所有怪物本回合战力 +${VARS.warBuff ?? 3}，都可以攻击（刚上场的也行）。`, { img: true }),
    ],
  },
  net: {
    key: 'net', name: '幽灵网络', color: '#5aebff', color2: '#a064ff',
    cards: () => [
      U('n01', '侦察无人机', 1, 1, { reveal: 'peek', text: '翻开时：翻开对手一只暗置怪物（不触发它的技能）。', img: true }),
      U('n02', '病毒注入者', 1, 2, { kw: ['病毒'], img: true }),
      U('n03', '光学迷彩刺客', 1, 3, { kw: ['隐身'], img: true }),
      U('n04', '脚本小子', 1, 1, { reveal: 'whisper', text: '翻开时：对手随机弃 1 张手牌。', img: true }),
      U('n05', '防火墙守卫', 1, 3, { kw: ['堡垒'], img: true }),
      U('n06', '蠕虫程序', 2, 4, { kw: ['病毒'], img: true }),
      U('n07', '幻影骑手', 2, 5, { kw: ['隐身'], reveal: 'rehide', text: '翻开时（不在战斗中）：可以把你另一只明置怪物翻回暗置。', img: true }),
      U('n08', '夜行刺客', 2, 7, { kw: ['隐身'], img: true }),
      U('n09', '镜像AI', 2, 4, { cont: 'mirror', text: '常驻：战斗中，它的战力等于对方怪物的战力。', img: true }),
      U('n10', '黑冰', 2, 5, { kw: ['堡垒'], img: true }),
      U('n11', '深网之眼', 3, 8, { cost: 6, reveal: 'abyss', req: 'hidden2', weakBlock: 2, text: '翻开时：消灭对手任意两只暗置怪物。\n拦截时战力 −2。', img: true }),
      U('n12', '主脑', 3, VARS.brainPw ?? 9, { req: 'sacTier2', grow: VARS.brainEvery ?? 2, text: '常驻：每过 2 个你的回合，战力永久 +1。', img: true }),
      E('n13', '全网入侵', 'expose', 1, '翻开对手所有暗置怪物（不触发技能）。', { img: true }),
      E('n14', '劫持', 'hijack', 3, '获得对手一只战力 ≤4 的明置怪物的控制权。', { img: true }),
      E('n15', '数据窃取', 'draw2', 2, '抽 2 张牌。', { img: true }),
      E('n16', '定点清除', 'purge', 2, '消灭对手一只 ★ 怪物（明置暗置都行）。', { img: true }),
      E('n17', '系统重启', 'reset', 1, '把你的一只明置怪物翻回暗置，它下次翻开时技能会再触发一次。', { img: true }),
      V('n18', '防火墙', 'cancel', 2, '对手宣告攻击后', '取消这次攻击。', { img: true }),
      V('n19', '逻辑炸弹', 'counter', 2, '对手打出效果牌时', '让它无效。', { img: true }),
      V('n20', '数据干扰', 'jam', 1, '拦截宣告后', '对方参战的怪物本场战力 −3。', { img: true }),
      U('n21', '数据幽灵', 1, VARS.dgPw ?? 1, { reveal: 'flipDown', text: VARS.dgDraw ? '翻开时：抽 1 张牌，并可以把你另一只明置怪物翻回暗置（战斗中也可以）。' : '翻开时：把你另一只明置怪物翻回暗置（战斗中也可以）。', img: true }),
      U('n22', '回声程序', 1, VARS.echoPw ?? 2, { reveal: 'echo', text: '翻开时：再触发一次你另一只明置怪物的翻开效果。', img: true }),
      U('n23', '量子刺客', 2, VARS.qPw ?? 4, { kw: ['隐身'], cont: 'flipPump', text: '常驻：你每翻开一只其他怪物，它战力永久 +1（最多 +6，即战力 11）。', img: true }),
      U('n24', '暗网中继', 2, VARS.relayPw ?? 4, { cont: 'relay', text: '明置时：你每回合开始，可以把你另一只明置怪物翻回暗置。', img: true }),
      E('n25', '重新加载', 'reload', 1, '把你的一只明置怪物翻回暗置，再立刻翻开它（翻开效果再触发一次）。', { img: true }),
      E('n26', '蜂群协议', 'swarm', VARS.swarmCost ?? 2, `在你场上放入 ${VARS.swarmN ?? 2} 只暗置的【蠕虫碎片】（★ 战力 1${VARS.wormVirus === false ? '' : '，病毒'}）。`, { img: true }),
      E('n27', 'DDoS攻击', 'ddos', VARS.ddosCost ?? 2, `对手下回合少 ${VARS.ddosAmt ?? 2} 点能量。`, { img: true }),
      E('n28', '病毒扩散', 'spread', VARS.spreadCost ?? 3, '你的所有怪物本回合获得【病毒】。', { img: true }),
      E('n29', '漏洞利用', 'exploit', 2, `翻开对手一只怪物（不触发技能）；本回合你每翻开过一只怪物，它战力永久 −${VARS.exploitPer ?? 2}，降到 0 或以下就消灭它。`, { img: true }),
      V('n30', '幻影残像', 'ghost', 1, '你的怪物在战斗中将被消灭时', '改为把它翻回暗置，留在场上。', { img: true }),
    ],
  },
};

CLASSES.corp = {
  key: 'corp', name: '企业安保', color: '#f2c440', color2: '#9fd0ff',
  cards: () => [
    U('c01', '保安巡逻员', 1, VARS.k1 ? 3 : 2, { kw: ['堡垒'], img: true }),
    U('c02', '防暴无人机', 1, 1, { reveal: 'shieldAlly', text: '翻开时：你的另一只怪物获得【装甲】。', img: true }),
    U('c03', '合规审计员', 1, 1, { reveal: 'energy', text: '翻开时：你本回合获得 1 点能量。', img: true }),
    U('c04', '公司新人', 1, 3, { kw: ['堡垒'], img: true }),
    U('c05', '电磁警卫', 1, 2, { kw: ['装甲'], img: true }),
    U('c06', '精英保镖', 2, 5, { kw: ['装甲'], img: true }),
    U('c07', '企业狙击手', 2, 4, { reveal: 'snipe', text: '翻开时：对手一只明置怪物战力永久 −2。', img: true }),
    U('c08', '安保机器人', 2, VARS.k3 ? 7 : 6, { kw: ['堡垒'], img: true }),
    U('c09', '公关经理', 2, 4, { reveal: 'heal1', text: '翻开时：你恢复 1 点生命。', img: true }),
    U('c10', '重装突击兵', 2, 7, { img: true }),
    U('c11', '公司执行官', 3, 8, { req: 'up2', reveal: 'execBuff', text: '翻开时：你的其他怪物战力永久 +1。', img: true }),
    U('c12', '天穹战甲', 3, 9, { kw: ['装甲'], req: 'payLife', img: true }),
    E('c13', '企业预算', 'ramp', 1, '你的能量上限永久 +1（可超过 8），并抽 1 张牌。', { img: true }),
    E('c14', '护盾部署', 'armorUp', 1, '你的一只怪物获得【装甲】（用过的也重新生效）。', { img: true }),
    E('c15', '精准打击', 'strike', 1, '对手一只怪物战力永久 −3，降到 0 或以下就消灭它。', { img: true }),
    E('c16', '恶意收购', 'buyout', 5, '消灭对手一只 ★★ 或 ★★★ 怪物（明置暗置都行）。', { img: true }),
    E('c17', '医疗套件', 'heal', VARS.k2 ? 1 : 2, '恢复 2 点生命（不超过上限）。', { img: true }),
    V('c18', '反击协议', 'riposte', 2, '你的怪物拦截并活下来、攻击方也还活着时', '消灭攻击方。', { img: true }),
    V('c19', '紧急撤离', 'evac', 1, '你的怪物将被消灭时（不含召唤代价）', '改为把它收回手上。', { img: true }),
    V('c20', '保险理赔', 'insure', 1, '你的怪物被消灭后', '抽 1 张牌并恢复 1 点生命。', { img: true }),
    U('c21', '临时工', 1, 2, { death: 'draw1', text: '被消灭或被吃掉时：抽 1 张牌。', img: true }),
    U('c22', '安保主管', 2, 5, { reveal: 'smallBuff', text: '翻开时：你的所有 ★ 怪物战力永久 +2。', img: true }),
    E('c23', '资产重组', 'bounce', VARS.cf ? 0 : 1, '把你的一只怪物收回手上，抽 1 张牌。', { img: true }),
    E('c24', '裁员优化', 'layoff', 0, VARS.cf ? '吃掉你的一只 ★ 怪物，本回合获得 2 点能量，并抽 1 张牌。' : '吃掉你的一只 ★ 怪物，本回合获得 2 点能量。', { img: true }),
    E('c25', '绩效奖金', 'bonusAll', VARS.bonusCost ?? 3, '你的所有怪物战力永久 +1。', { img: true }),
    E('c26', '隔离协议', 'quarantine', 2, '对手一只怪物永久不能攻击（仍然可以拦截）。', { img: true }),
    E('c27', '律师函', 'lawsuit', VARS.lawCost ?? 3, '对手一只 ★★ 或 ★★★ 怪物被翻开，战力永久变为 3。', { img: true }),
    E('c28', '清场程序', 'sweep', VARS.sweepCost ?? 4, VARS.cf ? '翻开对手所有怪物，消灭其中战力 ≤4 的。' : '翻开对手所有怪物，消灭其中战力 ≤3 的。', { img: true }),
    E('c29', '战略合作', 'merger', 2, '吃掉你的一只怪物，你的另一只怪物战力永久 +2 并获得【装甲】。', { img: true }),
    V('c30', '集体拦截', 'phalanx', VARS.cf ? 0 : 1, '你的怪物拦截宣告后', '你场上每有一只其他怪物，它本场战力 +1。', { img: true }),
  ],
};

export const TOKENS = {
  worm: () => ({ id: 'nt1', name: '蠕虫碎片', typ: 'unit', tier: 1, power: 1, cost: 1, kw: VARS.wormVirus === false ? [] : ['病毒'], reveal: null, grow: 0, weakBlock: 0, cont: null, death: null, req: null, text: '由【蜂群协议】放入场上的衍生物。', img: false, token: true }),
};

export const TIER = {
  1: { stars: '★', name: '青铜', color: '#e8a050' },
  2: { stars: '★★', name: '白银', color: '#dce6f2' },
  3: { stars: '★★★', name: '黄金', color: '#f2c440' },
};

export function cardText(c) {
  const parts = [];
  if (c.req) parts.push(REQ_TEXT[c.req]);
  for (const k of c.kw) parts.push(`【${k}】${KW[k]}`);
  if (c.typ === 'event') parts.push(`时机：${c.timing}。\n${c.text}`);
  else if (c.text) parts.push(c.text);
  return parts.join('\n');
}

// 卡组：20 张各 1 张 + 10 张重复（由平衡测试决定）
export const DUPES = {
  gang: ['g12', 'g08', 'g06', 'g10', 'g09', 'g03', 'g02', 'g07', 'g05', 'g26'],
  corp: ['c11', 'c12', 'c08', 'c17', 'c18', 'c10', 'c19', 'c01', 'c06', 'c16'],
  net: ['n06', 'n09', 'n02', 'n10', 'n08', 'n14', 'n07', 'n03', 'n11', 'n04'],
};
export function buildDeck(k, dupes = DUPES[k]) {
  const out = CLASSES[k].cards().filter(c => (!(VARS.noNew || []).includes(k) || +c.id.slice(1) <= 20) && !(VARS.ban || []).includes(c.id));
  dupes = dupes.filter(id => !(VARS.ban || []).includes(id));
  for (const id of dupes) out.push(CLASSES[k].cards().find(c => c.id === id));
  return out;
}
