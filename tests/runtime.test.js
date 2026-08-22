"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

class FakeClassList { add() {} remove() {} toggle() {} }
class FakeElement {
  constructor(selector = "") {
    this.selector = selector;
    this.value = "";
    this.dataset = {};
    this.classList = new FakeClassList();
    this.children = [];
    this.disabled = false;
    this.scrollHeight = 0;
    this.scrollTop = 0;
    this.textContent = "";
    this._innerHTML = "";
  }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this.textContent || this._innerHTML; }
  addEventListener() {}
  appendChild(child) { this.children.push(child); }
  querySelectorAll() { return []; }
  click() {}
}

const elements = new Map();
const storage = new Map();
const documentStub = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
    return elements.get(selector);
  },
  querySelectorAll() { return []; },
  createElement() { return new FakeElement(); },
  addEventListener(event, callback) { if (event === "DOMContentLoaded") callback(); },
};
const context = {
  console, document: documentStub, setTimeout, clearTimeout, Promise, Math,
  confirm: () => true,
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  },
};
context.window = context;
vm.createContext(context);

const battleUiSource = fs.readFileSync(path.join(__dirname, "..", "js", "battle-ui.js"), "utf8");
if (!battleUiSource.includes('addEventListener("click", showCandidateSettings)') || battleUiSource.includes('addEventListener("mouseenter", showCandidateSettings)')) {
  throw new Error("AI診断の候補がクリック選択だけで切り替わる設定になっていません。");
}
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
if (!indexSource.includes('<details class="action-settings-details">') || !indexSource.includes('id="action-setting-rows"')) throw new Error("技の設定値が折りたたみ表示になっていません。");

vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "default-data.js"), "utf8"), context, { filename: "default-data.js" });
context.DQ.setDefaultGameData(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "default-game-data.json"), "utf8")));
for (const file of ["data-store.js", "models.js", "battle-ai.js", "battle.js", "battle-ui.js", "editor-ui.js", "main.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context, { filename: file });
}

(async () => {
  const battle = context.dqBattle;
  if (!battle || battle.turn !== 1 || battle.characters.length !== 6) throw new Error("選択した敵グループで戦闘画面を初期化できませんでした。");
  battle.encounterId = "resistanceLab";
  battle.reset();
  if (battle.characters.length !== 6) throw new Error("3体編成へ切り替えられませんでした。");
  battle.pause = () => Promise.resolve();
  await battle.stepAction();
  if (battle.actionQueue.length !== 5) throw new Error("STEPで1人分だけ進みませんでした。");

  const priest = battle.getCharacter("priest");
  const warrior = battle.getCharacter("warrior");
  const mage = battle.getCharacter("mage");
  const warriorCard = battle.ui.card(warrior);
  if (!warriorCard.includes("status-popover") || !warriorCard.includes("攻撃力") || !warriorCard.includes("使える技") || !warriorCard.includes("炎斬り")) {
    throw new Error("戦闘カードにステータスと習得済みの技が表示されませんでした。");
  }
  const slimeCard = battle.ui.card(battle.getCharacter("slime"));
  if (!slimeCard.includes("弱点・耐性倍率") || !slimeCard.includes("×1.25") || !slimeCard.includes("弱点")) {
    throw new Error("敵カードに属性の弱点・耐性倍率が表示されませんでした。");
  }
  warrior.currentHp = warrior.maxHp - 1;
  priest.currentHp = Math.floor(priest.maxHp * 0.47);
  mage.currentHp = Math.floor(mage.maxHp * 0.26);
  battle.getLiving("ally").forEach(ally => { ally.buffs.defense.value = 18; ally.buffs.defense.turns = 2; ally.buffs.defense.stacks = 1; });
  battle.actionQueue = [];
  const healDecision = battle.ai.decide(priest);
  const heals = healDecision.candidates.filter(candidate => candidate.action.type === "heal");
  if (heals.length !== 6 || heals.some(candidate => candidate.targets.length !== 1)) throw new Error("単体回復が対象別に評価されていません。");
  if (healDecision.selected.action.type !== "heal") throw new Error("重傷者がいるのに回復が選択されませんでした。");

  battle.characters.filter(enemy => enemy.side === "enemy").forEach(enemy => { enemy.maxHp = Math.max(200, enemy.maxHp); enemy.currentHp = enemy.maxHp; enemy.alive = true; enemy.resistances.fire = 1.25; });
  if (mage.actions.includes("baikilt")) throw new Error("Lv20でLv21習得のバイキルトを使用できてしまいます。");
  mage.level = 7;
  mage.actions = mage.allActions.filter(actionId => Number(mage.actionLevels[actionId] ?? 1) <= mage.level);
  const magicDecision = battle.ai.decide(mage);
  const hyadoCandidate = magicDecision.candidates.find(candidate => candidate.action.id === "hyado");
  if (!hyadoCandidate?.settings || hyadoCandidate.settings.element !== "ice" || !hyadoCandidate.settings.outcomes.length || hyadoCandidate.settings.outcomes[0].expectedDamage !== battle.estimateMagicDamage(hyadoCandidate.action, hyadoCandidate.targets[0])) {
    throw new Error("AI診断へ魔法の属性倍率・予想ダメージ設定が渡されませんでした。");
  }
  const hyadoSettings = battle.ui.actionSettingRows(hyadoCandidate);
  if (!hyadoSettings.includes("基礎威力") || !hyadoSettings.includes("属性倍率") || !hyadoSettings.includes("予想ダメージ")) {
    throw new Error("AI診断に技の威力・属性倍率・予想ダメージが表示されませんでした。");
  }
  const resistedHyado = magicDecision.candidates.find(candidate => candidate.action.id === "hyado" && candidate.targets[0]?.templateId === "slime");
  if (!resistedHyado || !battle.ui.actionSettingRows(resistedHyado).includes("resistant-setting")) {
    throw new Error("AI診断の耐性倍率に赤色表示用の状態が設定されませんでした。");
  }
  const giraScore = magicDecision.candidates.find(candidate => candidate.action.id === "gira")?.finalScore;
  const meraScore = Math.max(...magicDecision.candidates.filter(candidate => candidate.action.id === "mera").map(candidate => candidate.finalScore));
  if (!(giraScore > meraScore)) throw new Error("敵3体へのギラが単体メラより高く評価されませんでした。");
  battle.getLiving("enemy").forEach(enemy => { enemy.resistances.fire = battle.data.enemies.find(template => template.id === enemy.templateId).resistances.fire; });
  mage.level = 21;
  mage.actions = mage.allActions.filter(actionId => Number(mage.actionLevels[actionId] ?? 1) <= mage.level);
  const advancedDecision = battle.ai.decide(mage);
  const baikiltCandidates = advancedDecision.candidates.filter(candidate => candidate.action.id === "baikilt");
  const baikiltWarrior = baikiltCandidates.find(candidate => candidate.targets[0]?.id === "warrior");
  const baikiltPriest = baikiltCandidates.find(candidate => candidate.targets[0]?.id === "priest");
  if (!baikiltWarrior || !baikiltPriest || baikiltWarrior.finalScore <= baikiltPriest.finalScore + 100) throw new Error("バイキルトで戦士の職業適性が優先されませんでした。");
  const flameSlash = battle.getAction("flameSlash");
  const normalAttack = battle.getAction("attack");
  const slime = battle.getCharacter("slime");
  const golem = battle.getCharacter("golem");
  if (!warrior.actions.includes("flameSlash") || warrior.maxMp < flameSlash.mpCost) throw new Error("戦士が炎斬りを使用できません。");
  if (battle.estimatePhysicalDamage(warrior, slime, flameSlash) <= battle.estimatePhysicalDamage(warrior, slime, normalAttack)) throw new Error("炎弱点に炎斬りの属性倍率が反映されませんでした。");
  if (battle.estimatePhysicalDamage(warrior, golem, flameSlash) >= battle.estimatePhysicalDamage(warrior, golem, normalAttack)) throw new Error("炎耐性に炎斬りの属性倍率が反映されませんでした。");
  const warriorDecision = battle.ai.decide(warrior);
  const flameScores = warriorDecision.candidates.filter(candidate => candidate.action.id === "flameSlash");
  const flameSlime = flameScores.find(candidate => candidate.targets[0]?.templateId === "slime");
  const flameGolem = flameScores.find(candidate => candidate.targets[0]?.templateId === "golem");
  if (!flameSlime || !flameGolem || flameSlime.finalScore <= flameGolem.finalScore) throw new Error(`AIが炎斬りの対象に弱点を優先しませんでした（${flameScores.map(candidate => candidate.targets[0]?.templateId).join(",")}）。`);
  const editor = context.dqEditor;
  editor.open();
  editor.tab = "actions";
  editor.selectedIndex = editor.draft.actions.findIndex(action => action.id === "baikilt");
  editor.draft.jobs.find(job => job.id === "warrior").levelStats["1"].maxHp = 999;
  editor.assignAction(editor.draft.jobs.find(job => job.id === "warrior"), "baikilt", true);
  const turnBeforeSave = battle.turn;
  editor.saveOnly();
  if (!battle.getCharacter("warrior").actions.includes("baikilt") || battle.turn !== turnBeforeSave) throw new Error("技を保存して現在の戦士へ割り当てられませんでした。");
  if (editor.store.getData().jobs.find(job => job.id === "warrior").levelStats["1"].maxHp === 999) throw new Error("個別保存で別項目の未保存変更まで保存されました。");
  const baikilt = battle.getAction("baikilt");
  battle.executeSupport(mage, baikilt, [warrior]);
  if (warrior.effectiveAttack !== warrior.attack * 2 || warrior.buffs.attack.turns !== 4) throw new Error("バイキルトの攻撃力倍率が反映されませんでした。");
  if (battle.ai.decide(mage).selected.action.id === "baikilt") throw new Error("戦士強化後も低適性職へバイキルトを使用しようとしました。");
  const actionCount = editor.draft.actions.length;
  editor.duplicate();
  if (editor.draft.actions.length !== actionCount + 1) throw new Error("技を複製できませんでした。");
  editor.save();
  if (battle.turn !== 1) throw new Error("編集内容を戦闘へ反映できませんでした。");
  editor.open();
  editor.tab = "jobs";
  editor.selectedIndex = editor.draft.jobs.findIndex(job => job.id === "warrior");
  const warriorDraft = editor.draft.jobs[editor.selectedIndex];
  warriorDraft.levelStats["5"] = { maxHp: 260, maxMp: 0, attack: 82, defense: 65, speed: 38 };
  warriorDraft.level = 5;
  editor.saveOnly();
  if (battle.getCharacter("warrior").level !== 20) throw new Error("Lv個別保存で進行中キャラクターが作り直されました。");
  battle.reset();
  if (battle.getCharacter("warrior").level !== 5 || battle.getCharacter("warrior").maxHp !== 260 || battle.getCharacter("warrior").attack !== 82) {
    throw new Error("保存したLv別ステータスが次の戦闘へ反映されませんでした。");
  }
  battle.setEncounter("slimePair");
  const duplicateSlimes = battle.characters.filter(unit => unit.side === "enemy");
  if (duplicateSlimes.length !== 2 || new Set(duplicateSlimes.map(unit => unit.id)).size !== 2 || duplicateSlimes.some(unit => unit.templateId !== "slime")) {
    throw new Error("同じ敵を複数体含む敵グループを生成できませんでした。");
  }
  if (editor.store.getData().selectedEncounterId !== "slimePair") throw new Error("選択した敵グループを保存できませんでした。");
  console.log("Runtime, editor, encounters, duplicate enemies, levels, STEP, and AI scoring: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
