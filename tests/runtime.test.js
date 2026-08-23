"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  toggle(value) { this.values.has(value) ? this.values.delete(value) : this.values.add(value); }
  contains(value) { return this.values.has(value); }
}
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
    this.style = {};
  }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this.textContent || this._innerHTML; }
  addEventListener() {}
  appendChild(child) { this.children.push(child); }
  querySelectorAll() { return []; }
  click() {}
  focus() { documentStub.activeElement = this; }
  getBoundingClientRect() { return this.rect || { left: 200, top: 100, width: 480, height: 700 }; }
}

const elements = new Map();
const storage = new Map();
const documentStub = {
  activeElement: null,
  body: new FakeElement("body"),
  documentElement: { clientWidth: 1200, clientHeight: 800 },
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
const stylesSource = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
if (!indexSource.includes('id="character-detail-overlay"') || !indexSource.includes('id="character-detail-close"') || !indexSource.includes('id="character-detail-content"')) throw new Error("キャラクター詳細モーダルがありません。");
if (!battleUiSource.includes("event.target === this.detailOverlay") || !battleUiSource.includes('event.key === "Escape"')) throw new Error("キャラクター詳細を枠外クリックまたはEscで閉じられません。");
if (!stylesSource.includes(".character-detail-content { min-height: 0; overflow-y: auto;")) throw new Error("キャラクター詳細の内部スクロールが設定されていません。");
if (!stylesSource.includes("width: min(480px, 100%)")) throw new Error("キャラクター詳細の初期幅がコンパクトになっていません。");
if (/\.character-detail-overlay\s*\{[^}]*backdrop-filter/.test(stylesSource) || !battleUiSource.includes('addEventListener("pointerdown"') || !battleUiSource.includes("startCharacterDetailDrag")) throw new Error("背景をぼかさずキャラクター詳細をドラッグできる設定になっていません。");
if (!indexSource.includes('<details class="action-settings-details">') || !indexSource.includes('id="action-setting-rows"')) throw new Error("技の設定値が折りたたみ表示になっていません。");
if (!indexSource.includes('id="result-continue"') || !indexSource.includes('id="result-encounter"') || !indexSource.includes('id="result-recovery"')) throw new Error("戦闘結果画面に連戦・回復操作がありません。");
if (!indexSource.includes('js/battle-events.js') || !indexSource.includes('js/status-engine.js') || indexSource.indexOf('js/status-engine.js') > indexSource.indexOf('js/effect-engine.js')) throw new Error("状態異常の依存順でスクリプトを読み込めません。");
const editorUiSource = fs.readFileSync(path.join(__dirname, "..", "js", "editor-ui.js"), "utf8");
if (!editorUiSource.includes('data-effect-action="add"') || !editorUiSource.includes('data-effect-path=')) throw new Error("複数効果エディターが実装されていません。");

vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "default-data.js"), "utf8"), context, { filename: "default-data.js" });
context.DQ.setDefaultGameData(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "default-game-data.json"), "utf8")));
for (const file of ["action-schema.js", "data-store.js", "models.js", "battle-events.js", "status-engine.js", "target-resolver.js", "effect-engine.js", "action-executor.js", "battle-ai.js", "battle.js", "battle-ui.js", "editor-ui.js", "main.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context, { filename: file });
}

(async () => {
  const battle = context.dqBattle;
  if (!battle || battle.turn !== 1 || battle.characters.length !== 6) throw new Error("選択した敵グループで戦闘画面を初期化できませんでした。");
  battle.encounterId = "resistanceLab";
  battle.reset();
  if (battle.characters.length !== 6) throw new Error("3体編成へ切り替えられませんでした。");
  const originalPartyOrder = [...battle.data.partyOrder];
  battle.data.partyOrder = ["mage", "priest", "warrior", "hero", "sage"];
  battle.reset();
  if (battle.getLiving("ally").map(actor => actor.templateId).join(",") !== "mage,priest,warrior"
    || battle.getLiving("ally").map(actor => actor.formationIndex).join(",") !== "0,1,2") {
    throw new Error("編集した戦闘参加順を前衛・中衛・後衛へ反映できませんでした。");
  }
  battle.data.partyOrder = originalPartyOrder;
  battle.reset();
  battle.pause = () => Promise.resolve();
  {
    const randomEnemy = battle.getCharacter("enemyMage");
    const [front, middle, back] = battle.getLiving("ally");
    randomEnemy.actionWeights = { attack: 60, mera: 40 };
    const normalAttack = battle.ai.decideEnemy(randomEnemy, 0.1, 0);
    const specialAttack = battle.ai.decideEnemy(randomEnemy, 0.99, 0.99);
    if (normalAttack.selected?.action.id !== "attack" || specialAttack.selected?.action.id !== "mera") {
      throw new Error("敵が評価点ではなく設定ウェイトで使用可能な技を抽選できませんでした。");
    }
    if (battle.ai.decideEnemy(randomEnemy, 0.1, 0).selected.targets[0] !== front
      || battle.ai.decideEnemy(randomEnemy, 0.1, 0.6).selected.targets[0] !== middle
      || battle.ai.decideEnemy(randomEnemy, 0.1, 0.99).selected.targets[0] !== back) {
      throw new Error("敵の単体攻撃対象に前衛5・中衛3・後衛1のランダムウェイトが反映されませんでした。");
    }
    front.reviveProtectionUntilTurn = battle.turn + 1;
    if (battle.ai.decideEnemy(randomEnemy, 0.1, 0).selected.targets[0] !== middle || battle.ai.enemyFormationWeight(front) !== 0) {
      throw new Error("蘇生直後の味方を敵の単体攻撃抽選から保護できませんでした。");
    }
    front.reviveProtectionUntilTurn = 0;
  }
  await battle.stepAction();
  if (battle.actionQueue.length !== 5) throw new Error("STEPで1人分だけ進みませんでした。");
  if (battle.actionQueue.some(item => item.decision) || battle.characters.filter(actor => actor.lastDecision).length !== 1) {
    throw new Error("全員の行動をターン開始時に決めず、行動直前に1人ずつ判断する処理になっていません。");
  }

  const priest = battle.getCharacter("priest");
  const warrior = battle.getCharacter("warrior");
  const mage = battle.getCharacter("mage");
  const enemyActor = battle.getLiving("enemy")[0];
  const enemyAttack = battle.getAction("attack");
  const facadeOnlyAttack = JSON.parse(JSON.stringify(enemyAttack));
  facadeOnlyAttack.powerMultiplier = 99;
  const effectMultiplier = facadeOnlyAttack.effects.find(effect => effect.kind === "damage").powerMultiplier;
  const expectedFacadeIndependentDamage = Math.max(1, Math.round(warrior.effectiveAttack * effectMultiplier - enemyActor.effectiveDefense * 0.48));
  if (battle.estimatePhysicalDamage(warrior, enemyActor, facadeOnlyAttack) !== expectedFacadeIndependentDamage) {
    throw new Error("ダメージ計算がeffectsではなく旧形式の項目を参照しています。");
  }
  const editedMera = JSON.parse(JSON.stringify(battle.getAction("mera")));
  editedMera.power = 123;
  context.DQ.ActionSchema.syncEffectFromLegacy(editedMera, "power");
  if (editedMera.effects.find(effect => effect.kind === "damage").power !== 123 || editedMera.power !== 123) {
    throw new Error("技エディターの旧形式項目をeffectsへ同期できませんでした。");
  }
  const tiedAllyTargets = [warrior, priest, mage].map(target => ({ score: 50, targets: [target] }));
  if (battle.ai.chooseBestTargetOption(enemyActor, enemyAttack, tiedAllyTargets, 0).targets[0] !== warrior
    || battle.ai.chooseBestTargetOption(enemyActor, enemyAttack, tiedAllyTargets, 0.99).targets[0] !== mage) {
    throw new Error("同点時の敵対象選択に前衛5・中衛3・後衛1のウェイトが反映されませんでした。");
  }
  if (warrior.formationIndex !== 0 || priest.formationIndex !== 1 || mage.formationIndex !== 2) {
    throw new Error("味方の前衛・中衛・後衛が戦闘開始時に設定されませんでした。");
  }
  warrior.currentHp = 1;
  priest.lastDecision = null;
  battle.actionQueue = [{ actor: priest, initiative: 0 }];
  await battle.stepAction();
  if (priest.lastDecision?.selected?.action.type !== "heal") {
    throw new Error("行動直前に発生した瀕死状態を見て回復行動を選べませんでした。");
  }
  const slowInitiative = battle.rollInitiative(warrior, 0);
  const fastInitiative = battle.rollInitiative(warrior, 1);
  if (slowInitiative !== warrior.effectiveSpeed * 0.75 || fastInitiative !== warrior.effectiveSpeed * 1.25) {
    throw new Error("行動順へ設定した素早さ乱数倍率が反映されませんでした。");
  }
  const warriorCard = battle.ui.card(warrior);
  const warriorDetail = battle.ui.statusDetail(warrior);
  if (!warriorCard.includes('data-character-id="warrior"') || warriorCard.includes("status-popover") || !warriorDetail.includes("攻撃力") || !warriorDetail.includes("使える技") || !warriorDetail.includes("もろば斬り") || !warriorDetail.includes("前衛") || !warriorDetail.includes("狙われやすさ")) {
    throw new Error("戦闘カードのクリック用情報またはキャラクター詳細が正しく生成されませんでした。");
  }
  const slimeDetail = battle.ui.statusDetail(battle.getCharacter("slime"));
  if (!slimeDetail.includes("弱点・耐性倍率") || !slimeDetail.includes("×1.20") || !slimeDetail.includes("弱点")) {
    throw new Error("敵のキャラクター詳細に属性の弱点・耐性倍率が表示されませんでした。");
  }
  const detailTrigger = new FakeElement("warrior-detail-trigger");
  battle.ui.openCharacterDetail(warrior, detailTrigger);
  if (battle.ui.detailOverlay.classList.contains("hidden") || battle.ui.detailTitle.textContent !== warrior.name || !battle.ui.detailContent.innerHTML.includes("もろば斬り") || !documentStub.body.classList.contains("detail-open")) {
    throw new Error("クリック時にキャラクター詳細モーダルを開けませんでした。");
  }
  battle.ui.startCharacterDetailDrag({ pointerId: 1, button: 0, clientX: 320, clientY: 120, target: new FakeElement(), preventDefault() {} });
  battle.ui.moveCharacterDetail({ pointerId: 1, clientX: 1000, clientY: 790, preventDefault() {} });
  if (battle.ui.detailDialog.style.left !== "712px" || battle.ui.detailDialog.style.top !== "92px" || !battle.ui.detailDialog.classList.contains("dragging")) {
    throw new Error("キャラクター詳細を画面内に収めながらドラッグ移動できませんでした。");
  }
  battle.ui.endCharacterDetailDrag({ pointerId: 1 });
  battle.ui.closeCharacterDetail();
  if (!battle.ui.detailOverlay.classList.contains("hidden") || documentStub.body.classList.contains("detail-open") || documentStub.activeElement !== detailTrigger) {
    throw new Error("キャラクター詳細モーダルを閉じて元のカードへフォーカスを戻せませんでした。");
  }
  warrior.currentHp = warrior.maxHp - 1;
  priest.currentHp = Math.floor(priest.maxHp * 0.47);
  mage.currentHp = Math.floor(mage.maxHp * 0.26);
  battle.getLiving("ally").forEach(ally => { ally.buffs.defense.value = 18; ally.buffs.defense.turns = 2; ally.buffs.defense.stacks = 1; });
  battle.actionQueue = [];
  const healDecision = battle.ai.decide(priest);
  const heals = healDecision.candidates.filter(candidate => candidate.action.type === "heal");
  if (heals.length !== 2 || heals.some(candidate => candidate.targetOptions.length !== 3 || candidate.targets.length !== 1)) {
    throw new Error("単体回復が技ごとの候補と対象別評価に分離されていません。");
  }
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
  const resistedHyado = hyadoCandidate.targetOptions.find(option => option.templateId === "slime" && option.resistance < 1);
  if (!resistedHyado || !battle.ui.actionSettingRows(hyadoCandidate).includes("resistant-setting")) {
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
  const baikiltWarrior = baikiltCandidates[0]?.targetOptions.find(option => option.targetIds.includes("warrior"));
  const baikiltPriest = baikiltCandidates[0]?.targetOptions.find(option => option.targetIds.includes("priest"));
  if (baikiltCandidates.length !== 1 || !baikiltWarrior || !baikiltPriest || baikiltWarrior.score <= baikiltPriest.score + 100) {
    throw new Error("バイキルトの1候補内で戦士の職業適性が優先されませんでした。");
  }
  const flameSlash = battle.getAction("flameSlash");
  const doubleEdgedSlash = battle.getAction("doubleEdgedSlash");
  const normalAttack = battle.getAction("attack");
  const slime = battle.getCharacter("slime");
  const golem = battle.getCharacter("golem");
  if (doubleEdgedSlash.effects.length !== 2 || doubleEdgedSlash.effects[0].kind !== "damage" || doubleEdgedSlash.effects[1].kind !== "recoil") {
    throw new Error("複数効果を持つ技がeffects形式に変換されていません。");
  }
  const warriorHpBeforeEffects = warrior.currentHp;
  const golemHpBeforeEffects = golem.currentHp;
  warrior.currentHp = warrior.maxHp;
  golem.currentHp = golem.maxHp;
  const compositePreview = battle.effectEngine.previewAction(warrior, doubleEdgedSlash, [golem]);
  const compositeResult = battle.effectEngine.applyAction(warrior, doubleEdgedSlash, [golem], () => 0.5);
  const expectedRecoil = Math.round(compositePreview.totalExpectedDamage * doubleEdgedSlash.effects[1].rate);
  if (compositeResult.totalDamage !== compositePreview.totalExpectedDamage || golem.maxHp - golem.currentHp !== compositePreview.totalExpectedDamage || warrior.maxHp - warrior.currentHp !== expectedRecoil) {
    throw new Error("ダメージと反動の複数効果を順番に実行できませんでした。");
  }
  warrior.currentHp = warriorHpBeforeEffects;
  golem.currentHp = golemHpBeforeEffects;
  warrior.actions.push("flameSlash");
  if (warrior.maxMp < flameSlash.mpCost) throw new Error("物理職がかえん斬りのMPを支払えません。");
  if (battle.estimatePhysicalDamage(warrior, slime, flameSlash) <= battle.estimatePhysicalDamage(warrior, slime, normalAttack)) throw new Error("炎弱点に炎斬りの属性倍率が反映されませんでした。");
  if (battle.estimatePhysicalDamage(warrior, golem, flameSlash) >= battle.estimatePhysicalDamage(warrior, golem, normalAttack)) throw new Error("炎耐性に炎斬りの属性倍率が反映されませんでした。");
  const warriorDecision = battle.ai.decide(warrior);
  const flameScores = warriorDecision.candidates.filter(candidate => candidate.action.id === "flameSlash");
  const flameSlime = flameScores[0]?.targetOptions.find(option => option.templateId === "slime");
  const flameGolem = flameScores[0]?.targetOptions.find(option => option.templateId === "golem");
  if (flameScores.length !== 1 || !flameSlime || !flameGolem || flameSlime.score <= flameGolem.score) {
    throw new Error("AIが炎斬りの対象候補で弱点を優先しませんでした。");
  }
  const editor = context.dqEditor;
  editor.open();
  if (!editor.partyOrderHtml().includes('data-party-order="up"') || !editor.partyOrderHtml().includes("前衛") || !editor.partyOrderHtml().includes("不参加")) {
    throw new Error("職業エディターに戦闘参加順の並び替え操作を表示できませんでした。");
  }
  editor.tab = "actions";
  editor.selectedIndex = editor.draft.actions.findIndex(action => action.id === "baikilt");
  editor.draft.jobs.find(job => job.id === "warrior").levelStats["1"].maxHp = 999;
  editor.assignAction(editor.draft.jobs.find(job => job.id === "warrior"), "baikilt", true);
  const turnBeforeSave = battle.turn;
  editor.saveOnly();
  if (!battle.getCharacter("warrior").actions.includes("baikilt") || battle.turn !== turnBeforeSave) throw new Error("技を保存して現在の戦士へ割り当てられませんでした。");
  if (editor.store.getData().jobs.find(job => job.id === "warrior").levelStats["1"].maxHp === 999) throw new Error("個別保存で別項目の未保存変更まで保存されました。");
  const baikilt = battle.getAction("baikilt");
  battle.actionExecutor.execute(mage, baikilt, [warrior]);
  if (warrior.effectiveAttack !== warrior.attack * 2 || warrior.buffs.attack.turns !== baikilt.effects[0].duration) throw new Error("バイキルトの攻撃力倍率が反映されませんでした。");
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
  const groupedMera = battle.ai.decide(battle.getCharacter("mage")).candidates.find(candidate => candidate.action.id === "mera");
  if (!groupedMera || groupedMera.targetOptions.length !== 1 || groupedMera.targetOptions[0].targetIds.length !== 2) {
    throw new Error("同条件のスライムA・Bが1回の対象評価へまとめられませんでした。");
  }
  duplicateSlimes[0].currentHp -= 1;
  const splitMera = battle.ai.decide(battle.getCharacter("mage")).candidates.find(candidate => candidate.action.id === "mera");
  if (!splitMera || splitMera.targetOptions.length !== 2) {
    throw new Error("HPなどの戦況が異なる対象を別々に再評価できませんでした。");
  }
  const testingMage = battle.getCharacter("mage");
  const savedMageActions = testingMage.actions;
  testingMage.actions = ["mera"];
  const selectedMera = battle.ai.decide(testingMage).selected;
  testingMage.actions = savedMageActions;
  const selectedMeraOption = selectedMera.targetOptions.find(option => option.targetIds.includes(selectedMera.targets[0].id));
  const highestMeraScore = Math.max(...selectedMera.targetOptions.map(option => option.score));
  if (!selectedMeraOption || selectedMeraOption.score !== highestMeraScore) {
    throw new Error("技の決定後に最高評価グループから実際の対象を選べませんでした。");
  }
  if (editor.store.getData().selectedEncounterId !== "slimePair") throw new Error("選択した敵グループを保存できませんでした。");
  const chainWarrior = battle.getCharacter("warrior");
  const chainPriest = battle.getCharacter("priest");
  const chainMage = battle.getCharacter("mage");
  chainWarrior.currentHp = 37;
  chainPriest.currentMp = Math.max(0, chainPriest.currentMp - 7);
  chainWarrior.buffs.attack.value = 2;
  chainWarrior.buffs.attack.turns = 3;
  chainWarrior.buffs.attack.stacks = 1;
  chainMage.currentHp = 0;
  chainMage.alive = false;
  battle.strategy = "aggressive";
  battle.ui.showResult(false, 3);
  if (!documentStub.querySelector("#result-next-battle").hidden) throw new Error("全滅時にも連戦操作が表示されています。");
  battle.ui.showResult(true, 3);
  if (documentStub.querySelector("#result-next-battle").hidden || !documentStub.querySelector("#result-encounter").innerHTML.includes("resistanceLab")) {
    throw new Error("勝利時の連戦操作に敵グループが表示されませんでした。");
  }
  if (documentStub.querySelector("#result-recovery").value !== "none") throw new Error("連戦前の回復方法が初期化されませんでした。");
  battle.ended = true;
  if (!battle.startConsecutiveBattle("resistanceLab")) throw new Error("勝利後に連戦を開始できませんでした。");
  if (battle.getCharacter("warrior").currentHp !== 37 || battle.getCharacter("priest").currentMp !== chainPriest.currentMp) {
    throw new Error("連戦で味方の現在HP・MPが引き継がれませんでした。");
  }
  if (battle.getCharacter("mage").alive || battle.getCharacter("mage").currentHp !== 0) throw new Error("連戦で戦闘不能状態が引き継がれませんでした。");
  if (battle.getCharacter("warrior").buffs.attack.turns !== 0 || battle.getCharacter("warrior").buffs.attack.value !== 1) {
    throw new Error("連戦開始時に一時的な強化効果が解除されませんでした。");
  }
  if (battle.encounterId !== "resistanceLab" || battle.getLiving("enemy").length !== 3 || battle.turn !== 1 || battle.battleNumber !== 2 || battle.strategy !== "aggressive" || battle.ended) {
    throw new Error("連戦の敵グループ・ターン・作戦が正しく初期化されませんでした。");
  }
  const hpRecoveryWarrior = battle.getCharacter("warrior");
  const hpRecoveryPriest = battle.getCharacter("priest");
  const hpBeforeRecovery = hpRecoveryWarrior.currentHp;
  const mpBeforeHealing = hpRecoveryPriest.currentMp;
  battle.ended = true;
  if (!battle.startConsecutiveBattle("slimePair", "hp")) throw new Error("HP回復を指定して連戦できませんでした。");
  if (battle.getCharacter("warrior").currentHp <= hpBeforeRecovery || battle.getCharacter("priest").currentMp >= mpBeforeHealing) {
    throw new Error("連戦前のHP回復量に応じた回復呪文のMPが消費されませんでした。");
  }
  const mpRecoveryWarrior = battle.getCharacter("warrior");
  mpRecoveryWarrior.currentHp = 42;
  battle.characters.filter(unit => unit.side === "ally").forEach(unit => { unit.currentMp = 0; });
  battle.ended = true;
  if (!battle.startConsecutiveBattle("slimePair", "mp")) throw new Error("MP回復を指定して連戦できませんでした。");
  if (battle.getCharacter("warrior").currentHp !== 42 || battle.characters.filter(unit => unit.side === "ally").some(unit => unit.currentMp !== unit.maxMp)) {
    throw new Error("MPのみ回復でHPを維持したままMPを全回復できませんでした。");
  }
  battle.reset();
  if (battle.getCharacter("warrior").currentHp !== battle.getCharacter("warrior").maxHp || battle.getCharacter("priest").currentMp !== battle.getCharacter("priest").maxMp || battle.battleNumber !== 1) {
    throw new Error("通常リセットで全回復した新しい連戦を開始できませんでした。");
  }

  const statusWarrior = battle.getCharacter("warrior");
  const statusPriest = battle.getCharacter("priest");
  const statusEnemy = battle.getLiving("enemy")[0];
  const poisonAttack = battle.getAction("poisonAttack");
  const poisonResult = battle.effectEngine.applyAction(statusEnemy, poisonAttack, [statusWarrior], () => 0);
  if (!statusWarrior.hasStatus("poison") || poisonResult.effects.length !== 2 || poisonResult.effects[1].outcomes[0].success !== true) {
    throw new Error("複数効果の毒攻撃でダメージ後に毒を付与できませんでした。");
  }
  const hpBeforePoisonTick = statusWarrior.currentHp;
  battle.events.emit("turnEnd", { turn: battle.turn });
  if (hpBeforePoisonTick - statusWarrior.currentHp !== Math.max(1, Math.round(statusWarrior.maxHp * 0.08))) {
    throw new Error("ターン終了時の毒ダメージが正しくありません。");
  }

  battle.statusEngine.clear(statusWarrior);
  statusWarrior.currentHp = statusWarrior.maxHp;
  battle.statusEngine.apply(statusWarrior, "blind", { duration: 4, potency: 0.55 });
  const enemyHpBeforeBlindAttack = statusEnemy.currentHp;
  const blindAttackResult = battle.effectEngine.applyAction(statusWarrior, battle.getAction("attack"), [statusEnemy], () => 0.99);
  if (!blindAttackResult.effects[0].outcomes[0].cancelled || statusEnemy.currentHp !== enemyHpBeforeBlindAttack) {
    throw new Error("幻惑中の物理攻撃ミスを効果直前に判定できませんでした。");
  }

  battle.statusEngine.clear(statusWarrior);
  battle.statusEngine.apply(statusWarrior, "petrify", { duration: 0 });
  const petrifyGate = battle.events.emit("beforeAction", { actor: statusWarrior, cancelled: false });
  if (!petrifyGate.cancelled || battle.statusEngine.canAct(statusWarrior)) throw new Error("石化中の行動を停止できませんでした。");

  battle.statusEngine.clear(statusWarrior);
  battle.statusEngine.apply(statusWarrior, "poison", { tickRate: 0.08 });
  const cureDecision = battle.ai.decide(statusPriest);
  const kiariCandidate = cureDecision.candidates.find(candidate => candidate.action.id === "kiari");
  const attackCandidateForCure = cureDecision.candidates.find(candidate => candidate.action.id === "attack");
  if (!kiariCandidate?.available || kiariCandidate.targets[0] !== statusWarrior || kiariCandidate.finalScore <= attackCandidateForCure.finalScore || cureDecision.selected.action.id !== "kiari") {
    throw new Error("AIが毒状態の味方にキアリーを優先できませんでした。");
  }
  battle.actionExecutor.execute(statusPriest, battle.getAction("kiari"), [statusWarrior]);
  if (statusWarrior.hasStatus("poison")) throw new Error("キアリーで毒を治療できませんでした。");

  statusWarrior.currentHp = 0;
  statusWarrior.alive = false;
  statusPriest.actions.push("zaoriku");
  const reviveDecision = battle.ai.decide(statusPriest);
  const zaorikuCandidate = reviveDecision.candidates.find(candidate => candidate.action.id === "zaoriku");
  if (!zaorikuCandidate?.available || zaorikuCandidate.targets[0] !== statusWarrior || reviveDecision.selected.action.id !== "zaoriku") {
    throw new Error("AIが戦闘不能の味方にザオリクを優先できませんでした。");
  }
  battle.actionExecutor.execute(statusPriest, battle.getAction("zaoriku"), [statusWarrior]);
  if (!statusWarrior.alive || statusWarrior.currentHp !== statusWarrior.maxHp || statusWarrior.reviveProtectionUntilTurn !== battle.turn + 1) throw new Error("ザオリクで最大HPまで蘇生し、単体攻撃から一時保護できませんでした。");

  const manusaEvaluation = battle.ai.evaluate(statusPriest, battle.getAction("manusa"), battle.getLiving("enemy"));
  if (!manusaEvaluation.reasons.some(reason => reason.label.includes("幻惑付与見込み"))) throw new Error("AI判断に状態異常の成功見込みが表示されませんでした。");
  editor.open();
  const poisonEditorAction = editor.draft.actions.find(action => action.id === "poisonAttack");
  const effectsHtml = editor.effectsEditorHtml(poisonEditorAction, "実行する効果");
  if (!effectsHtml.includes("効果 2") || !effectsHtml.includes('data-effect-action="add"') || !effectsHtml.includes("状態異常付与")) {
    throw new Error("複数効果エディターを表示できませんでした。");
  }
  const healAndCure = {
    id: "healAndCureTest", name: "全体回復治療", type: "heal", target: "allAllies", mpCost: 8, baseScore: 25,
    effects: [
      { kind: "heal", target: "selected", power: 50, varianceMin: 1, varianceMax: 1 },
      { kind: "cureStatus", target: "selected", statuses: ["poison"] },
    ],
  };
  statusPriest.currentHp = Math.max(1, statusPriest.maxHp - 40);
  battle.statusEngine.apply(statusWarrior, "poison", { tickRate: 0.08 });
  const combinedTargets = battle.targetResolver.resolve(statusPriest, healAndCure);
  const combinedEvaluation = battle.ai.evaluate(statusPriest, healAndCure, combinedTargets);
  battle.effectEngine.applyAction(statusPriest, healAndCure, combinedTargets, () => 0.5);
  if (combinedTargets.length !== 2 || statusPriest.currentHp !== statusPriest.maxHp || statusWarrior.hasStatus("poison") || !combinedEvaluation.reasons.some(reason => reason.label.includes("毒を治療"))) {
    throw new Error("全体HP回復と毒治療を組み合わせた複数効果を評価・実行できませんでした。");
  }
  battle.statusEngine.clear(statusWarrior);
  battle.statusEngine.apply(statusWarrior, "sleep", { duration: 3 });
  const sleepGate = battle.events.emit("beforeAction", { actor: statusWarrior, cancelled: false });
  if (!sleepGate.cancelled || sleepGate.reason !== "sleep") throw new Error("眠り状態で行動を停止できませんでした。");
  battle.statusEngine.clear(statusWarrior);

  battle.statusEngine.apply(mage, "silence", { duration: 3 });
  const silencedDecision = battle.ai.decide(mage);
  if (silencedDecision.candidates.find(candidate => candidate.action.id === "mera")?.available !== false || !silencedDecision.candidates.find(candidate => candidate.action.id === "attack")?.available) {
    throw new Error("呪文封じで呪文だけを使用不可にできませんでした。");
  }
  battle.statusEngine.clear(mage);

  statusWarrior.buffs.magicResistance.value = 1;
  statusWarrior.buffs.magicResistance.turns = 0;
  const magicBeforeBarrier = battle.effectEngine.previewAction(statusEnemy, battle.getAction("merami"), [statusWarrior]).totalExpectedDamage;
  const resistanceLogStart = documentStub.querySelector("#battle-log").children.length;
  battle.actionExecutor.execute(statusPriest, battle.getAction("magicBarrier"), battle.getLiving("ally"));
  const magicAfterBarrier = battle.effectEngine.previewAction(statusEnemy, battle.getAction("merami"), [statusWarrior]).totalExpectedDamage;
  if (magicAfterBarrier > Math.ceil(magicBeforeBarrier * 0.51)) throw new Error("マジックバリアの呪文軽減が反映されませんでした。");
  battle.actionExecutor.execute(statusPriest, battle.getAction("fubaha"), battle.getLiving("ally"));
  battle.actionExecutor.execute(statusWarrior, battle.getAction("greatDefense"), [statusWarrior]);
  const resistanceLogs = documentStub.querySelector("#battle-log").children.slice(resistanceLogStart).map(entry => entry.textContent);
  if (!resistanceLogs.some(message => message.includes("呪文耐性が上がった"))
    || !resistanceLogs.some(message => message.includes("ブレス耐性が上がった"))
    || !resistanceLogs.some(message => message.includes("ダメージ耐性が上がった"))
    || resistanceLogs.some(message => message.includes("耐性が下がった"))) {
    throw new Error("軽減倍率が下がる耐性強化を、耐性上昇としてログ表示できませんでした。");
  }
  if (battle.actionExecutor.statChangeDirection({ stat: "magicResistance", mode: "multiply", value: 1.5 }) !== "down"
    || battle.actionExecutor.statChangeDirection({ stat: "attack", mode: "multiply", value: 0.5 }) !== "down"
    || battle.actionExecutor.statChangeDirection({ stat: "defense", mode: "add", value: 20 }) !== "up") {
    throw new Error("通常能力と耐性能力の増減方向を正しく判定できませんでした。");
  }

  const swordDance = battle.getAction("swordDance");
  const swordDancePreview = battle.effectEngine.previewAction(statusWarrior, swordDance, [statusEnemy]);
  if (swordDance.effects.filter(effect => effect.kind === "damage").length !== 4 || swordDancePreview.totalExpectedDamage <= battle.estimatePhysicalDamage(statusWarrior, statusEnemy, battle.getAction("attack")) * 2) {
    throw new Error("つるぎのまいの4回攻撃を合計ダメージとして評価できませんでした。");
  }

  mage.actions.push("palpunte");
  const utilityCandidate = battle.ai.decide(mage).candidates.find(candidate => candidate.action.id === "palpunte");
  if (utilityCandidate?.available !== false || !utilityCandidate.reasons[0].label.includes("未対応")) throw new Error("未対応呪文をデータに残したまま戦闘候補外にできませんでした。");
  statusEnemy.currentHp = 1;
  battle.statusEngine.apply(statusEnemy, "poison", { tickRate: 0.08 });
  battle.finishTurn();
  if (statusEnemy.alive || statusEnemy.currentHp !== 0) throw new Error("ターン終了イベント後に毒による戦闘不能を確定できませんでした。");
  console.log("Runtime, statuses, revival, multiple effects, editor, encounters, levels, STEP, and AI scoring: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
