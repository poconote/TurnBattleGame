import fs from "node:fs";

// HD-2D版『ドラゴンクエストIII そして伝説へ…』を基準にした初期データ生成。
// 習得Lvは賢さによる前後があるため最短Lvを採用する。
// Sources:
// https://www.dragonquest.jp/roto-trilogy/dq3/system/index.html
// https://jinsoku.net/dq3-hd2d/skills/spell_list.html
// https://jinsoku.net/dq3-hd2d/skills/skill_list.html
// https://hyperwiki.jp/dq3rhd2d/monster/

const file = new URL("../data/default-game-data.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const upsert = (items, item) => {
  const index = items.findIndex(current => current.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
};

const physical = (id, name, mpCost, target, multiplier, baseScore, options = {}) => ({
  id, name, type: "attack", mpCost, target, power: 0, powerMultiplier: multiplier,
  element: options.element || "", priority: options.priority || 0, baseScore,
  description: options.description || "",
  effects: Array.from({ length: options.hits || 1 }, () => ({
    kind: "damage", target: "selected", formula: "physical", damageClass: "physical",
    powerMultiplier: multiplier, element: options.element || null, varianceMin: 0.88, varianceMax: 1.12,
  })),
});
const magic = (id, name, mpCost, target, power, element, baseScore, options = {}) => ({
  id, name, type: options.type || "magic", mpCost, target, power,
  powerMultiplier: options.type === "attack" ? 1 : undefined,
  element, baseScore, description: options.description || "",
  effects: [{ kind: "damage", target: "selected", formula: "fixed", damageClass: options.damageClass || "magic", power, element, varianceMin: 0.9, varianceMax: 1.1 }],
});
const heal = (id, name, mpCost, target, power, baseScore = 20, description = "") => ({
  id, name, type: "heal", mpCost, target, power, baseScore, description,
  effects: [{ kind: "heal", target: "selected", power, varianceMin: 0.92, varianceMax: 1.08 }],
});
const statChange = (id, name, mpCost, target, stat, mode, value, duration, maxStacks, baseScore = 25, description = "") => ({
  id, name, type: "support", mpCost, target, power: value, baseScore, description,
  effectStat: stat, effectMode: mode, effectValue: value, duration, maxStacks,
  effects: [{ kind: "modifyStat", target: "selected", stat, mode, value, duration, maxStacks }],
});
const status = (id, name, mpCost, target, statusId, successRate, duration, baseScore = 35, options = {}) => ({
  id, name, type: "status", mpCost, target, successRate, baseScore, description: options.description || "",
  effects: [{ kind: "applyStatus", target: "selected", status: statusId, successRate, resistanceKey: statusId, duration, potency: options.potency ?? 1, tickRate: options.tickRate ?? 0.08 }],
});
const cure = (id, name, mpCost, target, statuses, description = "") => ({
  id, name, type: "cure", mpCost, target, baseScore: 20, description,
  effects: [{ kind: "cureStatus", target: "selected", statuses }],
});
const revive = (id, name, mpCost, successRate, hpRate, description = "") => ({
  id, name, type: "revive", mpCost, target: "allyOne", successRate, hpRate, baseScore: 55, description,
  effects: [{ kind: "revive", target: "selected", successRate, hpRate }],
});
const instant = (id, name, mpCost, target, successRate, baseScore = 50, description = "") => ({
  id, name, type: "instantDeath", mpCost, target, successRate, baseScore, description,
  effects: [{ kind: "instantDeath", target: "selected", successRate, resistanceKey: "instantDeath" }],
});
const utility = (id, name, mpCost, description) => ({
  id, name, type: "utility", mpCost, target: "self", baseScore: 0, battleUsable: false, description,
  effects: [{ kind: "noop", target: "caster" }],
});

const actions = [
  physical("attack", "こうげき", 0, "enemyOne", 1, 40),
  utility("ukegashi", "うけながし", 2, "物理攻撃を受け流す特技。攻撃先の変更は現在のシミュレーターでは未対応。"),
  utility("cover", "かばう", 1, "選んだ仲間への攻撃を肩代わりする特技。対象変更は現在未対応。"),
  physical("quickThrust", "しっぷう突き", 3, "enemyOne", 1, 43, { priority: 100, description: "最速で通常攻撃相当の物理ダメージ。" }),
  physical("doubleEdgedSlash", "もろば斬り", 6, "enemyOne", 1.6, 64, { description: "通常攻撃の約1.6倍。与えたダメージの約3割を受ける。" }),
  {
    id: "vitalThrust", name: "きゅうしょ突き", type: "instantDeath", mpCost: 4, target: "enemyOne", successRate: 0.18, baseScore: 46,
    description: "急所に当たれば即死。失敗時も通常攻撃の約半分のダメージ。",
    effects: [
      { kind: "damage", target: "selected", formula: "physical", damageClass: "physical", powerMultiplier: 0.5, element: null, varianceMin: 0.88, varianceMax: 1.12 },
      { kind: "instantDeath", target: "selected", successRate: 0.18, resistanceKey: "instantDeath" },
    ],
  },
  utility("standGround", "におうだち", 4, "味方全員への攻撃を肩代わりする特技。対象変更は現在未対応。"),
  physical("swordDance", "つるぎのまい", 10, "enemyOne", 0.6, 96, { hits: 4, description: "通常攻撃の約0.6倍を4回。" }),
  physical("metalSlash", "メタル斬り", 6, "enemyOne", 1.5, 62, { description: "メタル系への最低保証は未実装。物理1.5倍として計算。" }),
  physical("rainOfSwords", "さみだれけん", 8, "allEnemies", 1, 88, { description: "敵全体へ通常攻撃相当。" }),
  physical("fullForceSlash", "渾身斬り", 14, "enemyOne", 2.2, 112, { description: "敵単体へ通常攻撃の約2.2倍。" }),

  physical("flameSlash", "かえん斬り", 5, "enemyOne", 1.3, 54, { element: "fire", description: "通常攻撃の約1.3倍の炎属性物理ダメージ。" }),
  physical("lightningSlash", "いなずま斬り", 7, "enemyOne", 1.3, 56, { element: "zap", description: "通常攻撃の約1.3倍のデイン属性物理ダメージ。" }),
  physical("vacuumSlash", "しんくう斬り", 7, "enemyOne", 1.3, 56, { element: "wind", description: "通常攻撃の約1.3倍のバギ属性物理ダメージ。" }),
  physical("falconSlash", "はやぶさ斬り", 9, "enemyOne", 0.7, 74, { hits: 2, description: "通常攻撃の約0.7倍を2回。" }),
  magic("gigaSlash", "ギガスラッシュ", 38, "allEnemies", 250, "zap", 110, { type: "attack", damageClass: "skill", description: "敵全体へ約250のデイン属性固定特技ダメージ。" }),
  statChange("dodgeStep", "みかわしきゃく", 4, "self", "speed", "multiply", 1.4, 4, 1, 28, "回避率の代わりに素早さ上昇で近似。"),
  statChange("greatDefense", "大ぼうぎょ", 2, "self", "damageResistance", "multiply", 0.1, 1, 1, 42, "1ターンの被ダメージを約1/10にする。"),
  heal("meditation", "めいそう", 5, "self", 500, 50, "自分のHPを約500回復。"),

  magic("mera", "メラ", 2, "enemyOne", 11, "fire", 32),
  magic("merami", "メラミ", 6, "enemyOne", 65, "fire", 50),
  magic("merazoma", "メラゾーマ", 12, "enemyOne", 180, "fire", 70),
  magic("gira", "ギラ", 4, "allEnemies", 22, "fire", 40),
  magic("begirama", "ベギラマ", 6, "allEnemies", 40, "fire", 47),
  magic("begiragon", "ベギラゴン", 12, "allEnemies", 100, "fire", 65),
  magic("io", "イオ", 5, "allEnemies", 18, "bang", 39),
  magic("iora", "イオラ", 9, "allEnemies", 55, "bang", 52),
  magic("ionazun", "イオナズン", 18, "allEnemies", 140, "bang", 76),
  magic("hyado", "ヒャド", 3, "enemyOne", 30, "ice", 42),
  magic("hyadaruko", "ヒャダルコ", 6, "allEnemies", 45, "ice", 49),
  magic("hyadain", "ヒャダイン", 10, "allEnemies", 75, "ice", 58),
  magic("mahyado", "マヒャド", 14, "allEnemies", 100, "ice", 66),
  magic("bagi", "バギ", 4, "allEnemies", 20, "wind", 39),
  magic("bagima", "バギマ", 6, "allEnemies", 40, "wind", 47),
  magic("bagicross", "バギクロス", 10, "allEnemies", 105, "wind", 66),
  magic("dein", "デイン", 6, "enemyOne", 45, "zap", 48),
  magic("raidein", "ライデイン", 8, "enemyOne", 85, "zap", 58),
  magic("gigadein", "ギガデイン", 30, "allEnemies", 250, "zap", 105),

  heal("hoimi", "ホイミ", 3, "allyOne", 35),
  heal("behoimi", "ベホイミ", 5, "allyOne", 80),
  heal("behoimu", "ベホイム", 7, "allyOne", 170, 28),
  heal("behoma", "ベホマ", 9, "allyOne", 9999, 35, "味方1人のHPを全回復。"),
  heal("behomaler", "ベホマラー", 18, "allAllies", 85, 32),
  heal("behomazun", "ベホマズン", 62, "allAllies", 9999, 58, "味方全員のHPを全回復。"),

  statChange("scara", "スカラ", 3, "allyOne", "defense", "add", 40, 5, 2, 25, "味方1人の守備力を大きく上げる。"),
  statChange("sukurlt", "スクルト", 5, "allAllies", "defense", "add", 24, 5, 2, 25, "味方全員の守備力を上げる。"),
  statChange("baikilt", "バイキルト", 6, "allyOne", "attack", "multiply", 2, 5, 1, 28, "味方1人の攻撃力を2倍にする。"),
  statChange("piorim", "ピオリム", 3, "allAllies", "speed", "add", 28, 5, 1, 23, "味方全員の素早さを上げる。"),
  statChange("fubaha", "フバーハ", 8, "allAllies", "breathResistance", "multiply", 0.67, 5, 1, 30, "味方全員のブレス被ダメージを約33%軽減。"),
  statChange("magicBarrier", "マジックバリア", 6, "allAllies", "magicResistance", "multiply", 0.5, 5, 1, 31, "味方全員の呪文被ダメージを半減。"),
  statChange("mahocanta", "マホカンタ", 8, "allyOne", "magicResistance", "multiply", 0.25, 5, 1, 31, "呪文反射の代わりに呪文被ダメージ75%軽減で近似。"),
  statChange("astron", "アストロン", 6, "allAllies", "damageResistance", "multiply", 0.1, 3, 1, 18, "完全無効の代わりに被ダメージ90%軽減で近似。"),
  statChange("bomios", "ボミオス", 3, "allEnemies", "speed", "add", -35, 5, 1, 28, "敵全体の素早さを下げる。"),
  statChange("lukani", "ルカニ", 3, "enemyOne", "defense", "add", -60, 5, 1, 31, "敵1体の守備力を大きく下げる。"),
  statChange("lukanan", "ルカナン", 5, "allEnemies", "defense", "add", -35, 5, 1, 31, "敵全体の守備力を下げる。"),

  status("manusa", "マヌーサ", 4, "allEnemies", "blind", 0.65, 3, 35, { potency: 0.55 }),
  status("mahotoon", "マホトーン", 5, "allEnemies", "silence", 0.6, 3, 38),
  status("medapani", "メダパニ", 6, "enemyOne", "confusion", 0.6, 3, 41),
  status("lariho", "ラリホー", 3, "allEnemies", "sleep", 0.55, 3, 42),
  instant("nifuram", "ニフラム", 2, "allEnemies", 0.48, 38, "敵を光の彼方へ消す。経験値差は扱わず即死効果として計算。"),
  instant("bashirula", "バシルーラ", 7, "enemyOne", 0.42, 42, "敵を戦闘から排除。即死効果として計算。"),
  instant("zaki", "ザキ", 7, "enemyOne", 0.4, 50),
  instant("zaraki", "ザラキ", 10, "allEnemies", 0.3, 48),
  {
    ...instant("megante", "メガンテ", 1, "allEnemies", 0.125, -30, "敵全体へ即死判定後、使用者も戦闘不能になる。"),
    effects: [
      { kind: "instantDeath", target: "selected", successRate: 0.125, resistanceKey: "instantDeath" },
      { kind: "sacrifice", target: "caster" },
    ],
  },
  {
    id: "mahotra", name: "マホトラ", type: "support", mpCost: 0, target: "enemyOne", baseScore: 18,
    description: "敵1体からMPを約5～10吸収。",
    effects: [{ kind: "drainMp", target: "selected", power: 8, varianceMin: 0.65, varianceMax: 1.35 }],
  },

  cure("kiari", "キアリー", 3, "allyOne", ["poison"]),
  cure("kiariku", "キアリク", 6, "allyOne", ["paralysis"]),
  cure("zameha", "ザメハ", 3, "allAllies", ["sleep"]),
  cure("mahori", "マホリー", 4, "allyOne", ["silence"]),
  revive("zawo", "ザオ", 5, 0.4, 0.01, "味方1人をHP1相当で蘇生。成功率は固定近似。"),
  revive("zaoral", "ザオラル", 10, 0.5, 0.5, "味方1人をHP半分で蘇生。成功率は固定近似。"),
  revive("zaoriku", "ザオリク", 20, 1, 1, "味方1人をHP全快で確実に蘇生。"),

  utility("rura", "ルーラ", 0, "移動呪文のため戦闘では使用しない。"),
  utility("riremito", "リレミト", 0, "移動呪文のため戦闘では使用しない。"),
  utility("toheros", "トヘロス", 4, "移動中の遭遇抑制呪文。"),
  utility("toramana", "トラマナ", 2, "移動中のダメージ床無効化呪文。"),
  utility("inpass", "インパス", 3, "宝箱鑑定呪文。"),
  utility("ranaluta", "ラナルータ", 12, "昼夜変更呪文。"),
  utility("shanaku", "シャナク", 18, "呪われた装備を外す呪文。装備システムは未対応。"),
  utility("remuor", "レムオル", 15, "姿を消す移動用呪文。"),
  utility("abakam", "アバカム", 0, "扉を開く移動用呪文。"),
  utility("moshas", "モシャス", 12, "仲間の能力・呪文・特技のコピーは現在未対応。"),
  utility("dragonram", "ドラゴラム", 24, "ドラゴン変身と複数ターンの自動行動は現在未対応。"),
  utility("palpunte", "パルプンテ", 20, "16種類からのランダム効果は現在未対応。"),

  physical("heavyBlow", "強打", 0, "enemyOne", 1.18, 48),
  physical("poisonAttack", "毒攻撃", 0, "enemyOne", 0.9, 38),
  physical("petrifyingAttack", "石化攻撃", 0, "enemyOne", 0.8, 34),
  physical("paralyzingAttack", "マヒ攻撃", 0, "enemyOne", 0.85, 38),
  physical("sleepAttack", "眠り攻撃", 0, "enemyOne", 0.85, 38),
  magic("fireBreath", "かえんのいき", 0, "allEnemies", 35, "fire", 45, { damageClass: "breath" }),
  magic("fierceFire", "はげしいほのお", 0, "allEnemies", 90, "fire", 65, { damageClass: "breath" }),
  magic("iceBreath", "こごえるふぶき", 0, "allEnemies", 85, "ice", 65, { damageClass: "breath" }),
];

const addStatusEffect = (actionId, statusId, successRate, duration, options = {}) => {
  const action = actions.find(item => item.id === actionId);
  action.effects.push({ kind: "applyStatus", target: "selected", status: statusId, successRate, resistanceKey: statusId, duration, potency: options.potency ?? 1, tickRate: options.tickRate ?? 0.08 });
};
const addRecoil = (actionId, rate) => {
  const action = actions.find(item => item.id === actionId);
  action.recoilRate = rate;
  action.effects.push({ kind: "recoil", target: "caster", rate });
};
addRecoil("doubleEdgedSlash", 0.3);
addStatusEffect("poisonAttack", "poison", 0.45, 0, { tickRate: 0.08 });
addStatusEffect("petrifyingAttack", "petrify", 0.22, 0);
addStatusEffect("paralyzingAttack", "paralysis", 0.32, 4);
addStatusEffect("sleepAttack", "sleep", 0.35, 3);
actions.forEach(action => {
  if (action.powerMultiplier == null && action.type === "attack") action.powerMultiplier = 1;
  if (action.priority === 0) delete action.priority;
  if (action.powerMultiplier == null) delete action.powerMultiplier;
  if (!action.element) delete action.element;
  if (!action.description) delete action.description;
  upsert(data.actions, action);
});

const warriorLearning = {
  attack: 1, ukegashi: 1, cover: 3, quickThrust: 9, doubleEdgedSlash: 16, vitalThrust: 21,
  standGround: 25, swordDance: 37, metalSlash: 39, rainOfSwords: 43, fullForceSlash: 48,
};
const priestLearning = {
  attack: 1, hoimi: 1, nifuram: 2, manusa: 3, bagi: 4, lukani: 6, kiari: 7, lariho: 8,
  piorim: 9, zameha: 10, zawo: 10, mahotoon: 12, behoimi: 12, kiariku: 14,
  magicBarrier: 16, lukanan: 16, bagima: 18, bashirula: 20, behoimu: 22, zaki: 22,
  zaoral: 23, zaraki: 26, fubaha: 27, bagicross: 31, behoma: 32, behomaler: 33,
  megante: 33, zaoriku: 37,
};
const mageLearning = {
  attack: 1, mera: 1, scara: 2, hyado: 4, gira: 7, sukurlt: 8, riremito: 9, bomios: 10,
  io: 11, rura: 12, mahotra: 12, begirama: 13, mahori: 14, inpass: 15, merami: 16,
  toramana: 19, hyadaruko: 19, baikilt: 21, mahocanta: 22, iora: 23, ranaluta: 25,
  hyadain: 25, medapani: 27, begiragon: 29, shanaku: 30, remuor: 31, merazoma: 31,
  abakam: 33, mahyado: 34, moshas: 36, dragonram: 37, ionazun: 38, palpunte: 40,
};
const heroLearning = {
  attack: 1, mera: 2, hoimi: 3, nifuram: 6, riremito: 7, flameSlash: 8, gira: 9,
  astron: 11, lariho: 12, mahotoon: 12, dodgeStep: 13, zawo: 14, dein: 14, rura: 14,
  lightningSlash: 17, behoimi: 18, begirama: 18, toheros: 20, greatDefense: 22,
  vacuumSlash: 23, raidein: 24, zaoral: 25, iora: 26, meditation: 28, falconSlash: 30,
  begiragon: 32, behoma: 33, gigadein: 38, behomazun: 39, gigaSlash: 45,
};
const sageLearning = {
  attack: 1, mera: 1, hoimi: 1, scara: 2, nifuram: 2, manusa: 3, hyado: 4, bagi: 5,
  lukani: 6, gira: 7, kiari: 7, sukurlt: 8, lariho: 8, piorim: 9, riremito: 9,
  bomios: 10, zameha: 10, zawo: 10, io: 11, rura: 12, mahotra: 12, mahotoon: 12,
  begirama: 13, behoimi: 13, mahori: 14, inpass: 15, kiariku: 15, merami: 16,
  magicBarrier: 16, lukanan: 17, hyadaruko: 20, bagima: 20, bashirula: 20,
  toramana: 21, baikilt: 21, mahocanta: 22, zaki: 22, iora: 23, behoimu: 23,
  zaoral: 24, ranaluta: 25, hyadain: 26, zaraki: 26, medapani: 27, fubaha: 27,
  begiragon: 29, shanaku: 30, remuor: 31, merazoma: 31, bagicross: 31, behoma: 32,
  behomaler: 33, megante: 33, abakam: 34, mahyado: 36, moshas: 36, dragonram: 37,
  zaoriku: 37, ionazun: 38, palpunte: 40,
};

const interpolateStats = (from, to, count, exponent = 1) => Object.fromEntries(Array.from({ length: count }, (_, index) => {
  const level = index + 1;
  const t = count === 1 ? 1 : Math.pow(index / (count - 1), exponent);
  const stats = Object.fromEntries(Object.keys(from).map(key => [key, Math.round(from[key] + (to[key] - from[key]) * t)]));
  return [String(level), stats];
}));
const extendFrom20 = (jobId, target) => {
  const old = data.jobs.find(job => job.id === jobId);
  const stats = Object.fromEntries(Object.entries(old.levelStats).filter(([level]) => Number(level) <= 20).map(([level, value]) => [level, clone(value)]));
  const start = stats["20"];
  for (let level = 21; level <= 50; level += 1) {
    const t = Math.pow((level - 20) / 30, 0.96);
    stats[String(level)] = Object.fromEntries(Object.keys(start).map(key => [key, Math.round(start[key] + (target[key] - start[key]) * t)]));
  }
  return stats;
};
const makeJob = (id, name, icon, enabled, learning, levelStats, aiTraits) => ({
  id, name, icon, enabled, actions: Object.keys(learning), actionLevels: learning, aiTraits, level: 20, levelStats,
});
const warriorStats = extendFrom20("warrior", { maxHp: 620, maxMp: 170, attack: 380, defense: 330, speed: 180 });
const priestStats = extendFrom20("priest", { maxHp: 430, maxMp: 430, attack: 220, defense: 265, speed: 280 });
const mageStats = extendFrom20("mage", { maxHp: 360, maxMp: 520, attack: 160, defense: 210, speed: 340 });
const heroStats = {
  ...interpolateStats({ maxHp: 22, maxMp: 8, attack: 11, defense: 10, speed: 8 }, { maxHp: 145, maxMp: 85, attack: 74, defense: 65, speed: 58 }, 20, 1.05),
};
for (let level = 21; level <= 50; level += 1) {
  const from = heroStats["20"];
  const to = { maxHp: 560, maxMp: 380, attack: 350, defense: 300, speed: 270 };
  const t = Math.pow((level - 20) / 30, 0.97);
  heroStats[String(level)] = Object.fromEntries(Object.keys(from).map(key => [key, Math.round(from[key] + (to[key] - from[key]) * t)]));
}
const sageStats = {
  ...interpolateStats({ maxHp: 18, maxMp: 15, attack: 7, defense: 8, speed: 10 }, { maxHp: 110, maxMp: 120, attack: 45, defense: 48, speed: 75 }, 20, 1.04),
};
for (let level = 21; level <= 50; level += 1) {
  const from = sageStats["20"];
  const to = { maxHp: 460, maxMp: 540, attack: 245, defense: 275, speed: 320 };
  const t = Math.pow((level - 20) / 30, 0.97);
  sageStats[String(level)] = Object.fromEntries(Object.keys(from).map(key => [key, Math.round(from[key] + (to[key] - from[key]) * t)]));
}

[
  makeJob("warrior", "戦士", "戦", true, warriorLearning, warriorStats, { buffAffinity: { attack: 1.5, defense: 1.1, speed: 0.8 }, healPriority: 0.4, magicPriority: 0.3 }),
  makeJob("priest", "僧侶", "僧", true, priestLearning, priestStats, { buffAffinity: { attack: 0.25, defense: 1.2, speed: 1 }, healPriority: 1.35, magicPriority: 0.8 }),
  makeJob("mage", "魔法使い", "魔", true, mageLearning, mageStats, { buffAffinity: { attack: 0.3, defense: 0.9, speed: 1.2 }, healPriority: 0.5, magicPriority: 1.35 }),
  makeJob("hero", "勇者", "勇", false, heroLearning, heroStats, { buffAffinity: { attack: 1.35, defense: 1.2, speed: 1.1 }, healPriority: 1.05, magicPriority: 1.05 }),
  makeJob("sage", "賢者", "賢", false, sageLearning, sageStats, { buffAffinity: { attack: 0.85, defense: 1.15, speed: 1.15 }, healPriority: 1.25, magicPriority: 1.25 }),
].forEach(job => upsert(data.jobs, job));

const resistanceDefaults = { fire: 1, ice: 1, wind: 1, bang: 1, zap: 1, instantDeath: 0.5, poison: 0.8, blind: 0.8, petrify: 0.5, sleep: 0.75, silence: 0.75, paralysis: 0.7, confusion: 0.75 };
const enemyActionWeights = enemyActions => {
  if (enemyActions.length === 1) return { [enemyActions[0]]: 100 };
  if (!enemyActions.includes("attack")) return Object.fromEntries(enemyActions.map(actionId => [actionId, 100 / enemyActions.length]));
  const specialWeight = 40 / Math.max(1, enemyActions.length - 1);
  return Object.fromEntries(enemyActions.map(actionId => [actionId, actionId === "attack" ? 60 : specialWeight]));
};
const enemy = (id, name, icon, recommendedLevel, maxHp, maxMp, attack, defense, speed, enemyActions, resistances = {}) => ({
  id, name, icon, recommendedLevel, maxHp, maxMp, attack, defense, speed,
  actions: enemyActions, actionWeights: enemyActionWeights(enemyActions), resistances: { ...resistanceDefaults, ...resistances },
});
const enemyData = [
  enemy("slime", "スライム", "●", 2, 7, 1, 13, 18, 8, ["attack"], { fire: 1.2, ice: 0.9, instantDeath: 0.75 }),
  enemy("greatRaven", "おおがらす", "烏", 3, 12, 3, 14, 23, 9, ["attack"], { wind: 1.2, instantDeath: 0.75 }),
  enemy("hornedRabbit", "いっかくうさぎ", "兎", 2, 10, 4, 15, 24, 14, ["attack"], { instantDeath: 0.75 }),
  enemy("giantAnteater", "おおありくい", "食", 5, 14, 6, 17, 35, 8, ["attack"], { fire: 1.1 }),
  enemy("faceButterfly", "じんめんちょう", "蝶", 4, 13, 10, 16, 27, 10, ["attack", "manusa"], { fire: 1.15, wind: 0.8 }),
  enemy("frogger", "フロッガー", "蛙", 6, 18, 8, 21, 38, 14, ["attack", "heavyBlow"], { fire: 1.15, ice: 0.85 }),
  enemy("bubbleSlime", "バブルスライム", "毒", 5, 14, 7, 19, 34, 19, ["attack", "poisonAttack"], { fire: 1.2, ice: 0.9, poison: 0.15 }),
  enemy("enemyMage", "まほうつかい", "妖", 6, 27, 8, 23, 40, 18, ["attack", "mera"], { fire: 0.75, ice: 1.2, bang: 1.1, silence: 1.1 }),
  enemy("scorpionWasp", "さそりばち", "蜂", 6, 18, 5, 24, 33, 21, ["attack", "poisonAttack"], { fire: 1.15, wind: 1.2 }),
  enemy("healSlime", "ホイミスライム", "癒", 7, 30, 14, 20, 38, 17, ["attack", "hoimi"], { bang: 1.1 }),
  enemy("caterpillar", "キャタピラー", "虫", 9, 44, 14, 38, 58, 18, ["attack", "heavyBlow"], { fire: 1.25 }),
  enemy("killerBee", "キラービー", "殺", 10, 37, 10, 40, 56, 28, ["attack", "paralyzingAttack"], { fire: 1.15, wind: 1.2 }),
  enemy("armyCrab", "ぐんたいガニ", "蟹", 11, 35, 8, 37, 77, 23, ["attack"], { fire: 0.8, ice: 1.15, wind: 0.85, bang: 1.15 }),
  enemy("wanderingArmor", "さまようよろい", "鎧", 13, 56, 14, 53, 81, 34, ["attack", "heavyBlow"], { fire: 0.8, wind: 0.8, bang: 1.15, instantDeath: 0.25 }),
  enemy("mummy", "ミイラおとこ", "包", 17, 60, 4, 73, 80, 41, ["attack", "sleepAttack"], { fire: 1.25, instantDeath: 0.2, poison: 0.2 }),
  enemy("heatGizmo", "ヒートギズモ", "炎", 19, 76, 16, 75, 151, 48, ["attack", "gira"], { fire: 0.35, ice: 1.35, wind: 0.8, instantDeath: 0.2 }),
  enemy("killerApe", "キラーエイプ", "猿", 22, 118, 18, 111, 164, 59, ["attack", "heavyBlow"], { ice: 1.1, instantDeath: 0.18 }),
  enemy("slimeSnail", "スライムつむり", "殻", 21, 32, 45, 90, 250, 62, ["attack", "scara"], { fire: 0.65, ice: 0.65, instantDeath: 0.4 }),
  enemy("madOx", "マッドオックス", "牛", 22, 95, 36, 95, 144, 58, ["attack", "heavyBlow"], { ice: 1.15 }),
  enemy("metalSlime", "メタルスライム", "銀", 23, 4, 12, 40, 1536, 316, ["attack", "mera"], { fire: 0.05, ice: 0.05, wind: 0.05, bang: 0.05, zap: 0.05, instantDeath: 0.01, poison: 0.01, blind: 0.01, sleep: 0.01, silence: 0.01, paralysis: 0.01, confusion: 0.01 }),
  enemy("witch", "まじょ", "女", 24, 86, 72, 106, 160, 77, ["attack", "begirama", "mahotoon"], { fire: 0.75, ice: 1.15, silence: 0.45 }),
  enemy("hellArmor", "じごくのよろい", "獄", 25, 96, 13, 127, 248, 69, ["attack", "doubleEdgedSlash"], { fire: 0.7, wind: 0.75, bang: 1.15, instantDeath: 0.15 }),
  enemy("giantSquid", "だいおうイカ", "烏", 26, 216, 23, 134, 192, 50, ["attack", "heavyBlow"], { fire: 1.15, zap: 1.2 }),
  enemy("skyDragon", "スカイドラゴン", "竜", 27, 168, 29, 124, 179, 58, ["attack", "fireBreath"], { fire: 0.45, ice: 1.2, instantDeath: 0.18 }),
  enemy("toxicZombie", "どくどくゾンビ", "腐", 28, 128, 11, 134, 190, 95, ["attack", "poisonAttack"], { fire: 1.25, poison: 0.05, instantDeath: 0.12 }),
  enemy("eliminator", "エリミネーター", "斧", 29, 192, 18, 148, 170, 86, ["attack", "doubleEdgedSlash"], { ice: 1.1 }),
  enemy("iceMan", "ひょうがまじん", "氷", 30, 244, 48, 141, 276, 105, ["attack", "hyadaruko", "iceBreath"], { fire: 1.4, ice: 0.2, instantDeath: 0.15 }),
  enemy("skeletonSwordsman", "がいこつけんし", "骨", 31, 140, 54, 164, 182, 108, ["attack", "falconSlash"], { fire: 1.15, poison: 0.05 }),
  enemy("killerArmor", "キラーアーマー", "甲", 32, 112, 15, 140, 310, 106, ["attack", "vitalThrust"], { fire: 0.65, wind: 0.7, bang: 1.15, instantDeath: 0.1 }),
  enemy("frostGizmo", "フロストギズモ", "凍", 33, 128, 54, 163, 244, 147, ["attack", "hyadain"], { fire: 1.35, ice: 0.25, wind: 0.75 }),
  enemy("snowDragon", "スノードラゴン", "雪", 34, 216, 34, 181, 248, 130, ["attack", "iceBreath"], { fire: 1.3, ice: 0.35, instantDeath: 0.12 }),
  enemy("troll", "トロル", "巨", 34, 400, 25, 212, 220, 121, ["attack", "heavyBlow"], { sleep: 1.1, confusion: 1.1 }),
  enemy("tentaculus", "テンタクルス", "触", 35, 320, 17, 174, 260, 132, ["attack", "swordDance"], { zap: 1.2 }),
  enemy("kingMerman", "キングマーマン", "海", 36, 292, 36, 253, 309, 151, ["attack", "bagima", "behoimi"], { zap: 1.25, fire: 1.1 }),
  enemy("movingStatue", "うごくせきぞう", "像", 37, 312, 14, 242, 282, 122, ["attack", "heavyBlow"], { wind: 0.65, instantDeath: 0.04, poison: 0.05, sleep: 0.1 }),
  enemy("kingSquid", "クラーゴン", "蛸", 38, 720, 17, 265, 318, 133, ["attack", "swordDance"], { zap: 1.25, instantDeath: 0.08 }),
  enemy("shadowLord", "まおうのかげ", "影", 38, 208, 90, 187, 318, 148, ["attack", "zaki", "mahotoon"], { fire: 0.65, instantDeath: 0.03, poison: 0.05 }),
  enemy("skullgon", "スカルゴン", "骸", 39, 320, 42, 259, 336, 143, ["attack", "iceBreath"], { fire: 1.3, ice: 0.5, poison: 0.05 }),
  enemy("goldGolem", "おうごんまじん", "金", 40, 336, 63, 284, 378, 148, ["attack", "heavyBlow"], { bang: 1.15, instantDeath: 0.03, poison: 0.05 }),
  enemy("hydra", "ヒドラ", "蛇", 41, 320, 26, 258, 366, 156, ["attack", "fierceFire"], { fire: 0.45, ice: 1.2, instantDeath: 0.05 }),
  enemy("salamander", "サラマンダー", "焔", 42, 320, 31, 270, 346, 170, ["attack", "fierceFire"], { fire: 0.2, ice: 1.45, instantDeath: 0.04 }),
  enemy("archmage", "アークマージ", "賢", 43, 208, 300, 197, 311, 175, ["attack", "merazoma", "ionazun", "zaoriku"], { fire: 0.65, ice: 0.75, silence: 0.25, instantDeath: 0.03 }),
  enemy("greatDemon", "だいまじん", "魔", 43, 560, 27, 310, 374, 150, ["attack", "fullForceSlash"], { wind: 0.6, bang: 1.15, instantDeath: 0.02 }),
  enemy("trollKing", "トロルキング", "王", 44, 400, 81, 278, 310, 164, ["attack", "fullForceSlash"], { sleep: 0.65, confusion: 0.65 }),
  enemy("dragonZombie", "ドラゴンゾンビ", "屍", 44, 660, 49, 311, 326, 160, ["attack", "iceBreath", "petrifyingAttack"], { fire: 1.3, ice: 0.55, poison: 0.02, instantDeath: 0.02 }),
  enemy("swordoid", "ソードイド", "剣", 45, 381, 93, 285, 382, 180, ["attack", "swordDance", "rainOfSwords"], { fire: 0.8, instantDeath: 0.02 }),
  enemy("baramos", "バラモス", "魔", 45, 5400, 720, 261, 340, 145, ["attack", "merazoma", "ionazun", "fierceFire", "manusa", "medapani"], { fire: 0.5, ice: 1.2, wind: 1.2, bang: 0.65, zap: 1, instantDeath: 0, poison: 0, petrify: 0, sleep: 0.45, silence: 0.55, paralysis: 0.35, confusion: 0.55 }),
  enemy("metalChimera", "メタルキメラ", "鋼", 48, 240, 222, 307, 861, 281, ["attack", "fierceFire", "behoimi"], { fire: 0.1, ice: 0.1, wind: 0.1, bang: 0.1, zap: 0.1, instantDeath: 0, poison: 0, blind: 0.1, sleep: 0.1, silence: 0.1, paralysis: 0.1, confusion: 0.1 }),
  enemy("kingHydra", "キングヒドラ", "王", 48, 5800, 660, 393, 384, 184, ["attack", "fierceFire", "iceBreath"], { fire: 0.35, ice: 0.65, instantDeath: 0, poison: 0, petrify: 0, sleep: 0.25, silence: 0.4, paralysis: 0.2, confusion: 0.3 }),
  enemy("killerCrab", "キラークラブ", "蟹", 49, 330, 255, 301, 804, 233, ["attack", "sukurlt", "paralyzingAttack"], { fire: 0.65, ice: 0.75, wind: 0.6, bang: 1.3, zap: 1.15, instantDeath: 0.02 }),
  enemy("devilWizard", "デビルウィザード", "悪", 50, 580, 345, 305, 508, 239, ["attack", "merazoma", "mahyado", "ionazun", "mahotoon"], { fire: 0.55, ice: 0.55, wind: 0.65, bang: 0.65, silence: 0.15, instantDeath: 0 }),
  enemy("baramosBros", "バラモスブロス", "兄", 50, 4300, 500, 310, 340, 168, ["attack", "ionazun", "fierceFire"], { fire: 0.4, ice: 0.75, wind: 0.8, bang: 0.55, instantDeath: 0, poison: 0, petrify: 0, sleep: 0.2, silence: 0.3, paralysis: 0.15, confusion: 0.2 }),
];
enemyData.forEach(item => upsert(data.enemies, item));
data.enemies.forEach(item => {
  item.actionWeights = Object.fromEntries((item.actions || []).map(actionId => [actionId, Math.max(0, Number(item.actionWeights?.[actionId] ?? enemyActionWeights(item.actions)[actionId]))]));
});

const encounters = [
  { id: "seaPassage", name: "海辺の魔物", recommendedLevel: 21, members: [{ enemyId: "slimeSnail", count: 2 }, { enemyId: "killerApe", count: 1 }] },
  { id: "metalHunt", name: "メタルスライム狩り", recommendedLevel: 23, members: [{ enemyId: "metalSlime", count: 3 }] },
  { id: "upperWorld", name: "地獄のよろい隊", recommendedLevel: 25, members: [{ enemyId: "hellArmor", count: 2 }, { enemyId: "witch", count: 1 }] },
  { id: "openSea", name: "大海原", recommendedLevel: 27, members: [{ enemyId: "giantSquid", count: 1 }, { enemyId: "skyDragon", count: 1 }] },
  { id: "necrogondFoothills", name: "ネクロゴンド山麓", recommendedLevel: 30, members: [{ enemyId: "eliminator", count: 1 }, { enemyId: "toxicZombie", count: 1 }, { enemyId: "iceMan", count: 1 }] },
  { id: "necrogondCave", name: "ネクロゴンドの洞窟", recommendedLevel: 32, members: [{ enemyId: "killerArmor", count: 1 }, { enemyId: "skeletonSwordsman", count: 2 }] },
  { id: "snowField", name: "雪原の竜", recommendedLevel: 34, members: [{ enemyId: "snowDragon", count: 1 }, { enemyId: "frostGizmo", count: 2 }] },
  { id: "baramosCastle", name: "バラモス城", recommendedLevel: 36, members: [{ enemyId: "tentaculus", count: 1 }, { enemyId: "kingMerman", count: 1 }, { enemyId: "movingStatue", count: 1 }] },
  { id: "underworldGate", name: "アレフガルド入口", recommendedLevel: 38, members: [{ enemyId: "kingSquid", count: 1 }, { enemyId: "shadowLord", count: 1 }] },
  { id: "alephgardWild", name: "アレフガルド周辺", recommendedLevel: 40, members: [{ enemyId: "skullgon", count: 1 }, { enemyId: "goldGolem", count: 1 }, { enemyId: "hydra", count: 1 }] },
  { id: "zomaApproach", name: "ゾーマ城への道", recommendedLevel: 42, members: [{ enemyId: "salamander", count: 1 }, { enemyId: "archmage", count: 1 }, { enemyId: "greatDemon", count: 1 }] },
  { id: "zomaCastle", name: "ゾーマ城", recommendedLevel: 45, members: [{ enemyId: "dragonZombie", count: 1 }, { enemyId: "swordoid", count: 1 }, { enemyId: "trollKing", count: 1 }] },
  { id: "baramosBoss", name: "バラモス", recommendedLevel: 45, members: [{ enemyId: "baramos", count: 1 }] },
  { id: "metalTrial", name: "メタルキメラ隊", recommendedLevel: 48, members: [{ enemyId: "metalChimera", count: 1 }, { enemyId: "killerCrab", count: 2 }] },
  { id: "kingHydraBoss", name: "キングヒドラ", recommendedLevel: 48, members: [{ enemyId: "kingHydra", count: 1 }] },
  { id: "level50Trial", name: "Lv50試練", recommendedLevel: 50, members: [{ enemyId: "devilWizard", count: 1 }, { enemyId: "killerCrab", count: 1 }, { enemyId: "metalChimera", count: 1 }] },
  { id: "baramosBrosBoss", name: "バラモスブロス", recommendedLevel: 50, members: [{ enemyId: "baramosBros", count: 1 }] },
];
encounters.forEach(encounter => upsert(data.encounters, encounter));

data.ai.status = {
  ...data.ai.status,
  sleepValue: 82, silenceValue: 62, paralysisValue: 92, confusionValue: 76,
};
data.ai.cure = {
  ...data.ai.cure,
  sleepValue: 145, silenceValue: 105, paralysisValue: 165, confusionValue: 140,
};
data.ai.targetSelection = {
  ...data.ai.targetSelection,
  revivedTargetWeight: 0,
  reviveProtectionTurns: 1,
};
data.schemaVersion = 15;

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`schema=${data.schemaVersion} actions=${data.actions.length} jobs=${data.jobs.length} enemies=${data.enemies.length} encounters=${data.encounters.length}`);
