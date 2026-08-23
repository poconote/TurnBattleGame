"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const memory = new Map();
const context = {
  localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "default-data.js"), "utf8"), context);
context.DQ.setDefaultGameData(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "default-game-data.json"), "utf8")));
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "action-schema.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "data-store.js"), "utf8"), context);

const store = new context.DQ.GameDataStore("test-data");
const browserSaved = JSON.parse(JSON.stringify(context.DQ.DEFAULT_GAME_DATA));
browserSaved.enemies[0].maxHp = 777;
memory.set("dq-ai-battle-data-v1", JSON.stringify(browserSaved));
if (context.DQ.GameDataStore.readCurrentSavedData().enemies[0].maxHp !== 777) throw new Error("初期化前に現在形式のブラウザ保存データを検出できませんでした。");
memory.set("dq-ai-battle-data-v1", JSON.stringify({ schemaVersion: 1 }));
if (context.DQ.GameDataStore.readCurrentSavedData() !== null) throw new Error("旧形式の保存データより標準JSONが優先されませんでした。");
const draft = store.createDraft();
draft.enemies[0].maxHp = 123;
store.setData(draft);
if (store.getData().enemies[0].maxHp !== 123 || !memory.has("test-data")) throw new Error("編集データを保存できませんでした。");

const invalid = store.createDraft();
invalid.actions[1].id = invalid.actions[0].id;
if (!store.validate(invalid).some(error => error.includes("重複"))) throw new Error("重複IDを検出できませんでした。");

const missingReference = store.createDraft();
missingReference.jobs[0].actions = ["missing-action"];
if (!store.validate(missingReference).some(error => error.includes("存在しない技"))) throw new Error("参照切れを検出できませんでした。");

const invalidEncounter = store.createDraft();
invalidEncounter.encounters[0].members = [{ enemyId: "slime", count: 4 }];
if (!store.validate(invalidEncounter).some(error => error.includes("1～3体"))) throw new Error("敵グループの最大数を検証できませんでした。");

const invalidFormation = store.createDraft();
invalidFormation.ai.targetSelection.enemyBackWeight = 0;
if (!store.validate(invalidFormation).some(error => error.includes("隊列ウェイト"))) throw new Error("隊列ウェイトの不正値を検出できませんでした。");

const invalidEffect = store.createDraft();
invalidEffect.actions.find(action => action.id === "doubleEdgedSlash").effects.find(effect => effect.kind === "recoil").rate = 2;
if (!store.validate(invalidEffect).some(error => error.includes("反動率"))) throw new Error("効果データの不正値を検出できませんでした。");

const invalidStatusEffect = store.createDraft();
invalidStatusEffect.actions.find(action => action.id === "manusa").effects[0].status = "freeze";
if (!store.validate(invalidStatusEffect).some(error => error.includes("状態異常"))) throw new Error("未対応の状態異常を検出できませんでした。");

const invalidReviveEffect = store.createDraft();
invalidReviveEffect.actions.find(action => action.id === "zaoriku").effects[0].hpRate = 2;
if (!store.validate(invalidReviveEffect).some(error => error.includes("蘇生"))) throw new Error("蘇生効果の不正値を検出できませんでした。");

const legacy = JSON.parse(JSON.stringify(context.DQ.DEFAULT_GAME_DATA));
legacy.schemaVersion = 1;
legacy.actions.forEach(action => { delete action.effects; });
for (const actor of legacy.jobs) {
  Object.assign(actor, actor.levelStats["1"]);
  delete actor.level;
  delete actor.levelStats;
}
for (const enemy of legacy.enemies) {
  enemy.level = 20;
  enemy.levelStats = { "20": { maxHp: enemy.maxHp, maxMp: enemy.maxMp, attack: enemy.attack, defense: enemy.defense, speed: enemy.speed } };
  delete enemy.maxHp; delete enemy.maxMp; delete enemy.attack; delete enemy.defense; delete enemy.speed;
}
delete legacy.encounters;
delete legacy.selectedEncounterId;
legacy.actions = legacy.actions.filter(action => action.id !== "baikilt");
legacy.jobs.find(job => job.id === "mage").actions = legacy.jobs.find(job => job.id === "mage").actions.filter(id => id !== "baikilt");
const statusActionIds = new Set(["poisonAttack", "petrifyingAttack", "manusa", "kiari", "zaoriku"]);
legacy.actions = legacy.actions.filter(action => !statusActionIds.has(action.id));
for (const actor of [...legacy.jobs, ...legacy.enemies]) {
  actor.actions = actor.actions.filter(id => !statusActionIds.has(id));
  if (actor.actionLevels) for (const id of statusActionIds) delete actor.actionLevels[id];
}
delete legacy.actions.find(action => action.id === "sukurlt").effectStat;
delete legacy.ai.support.statValueDivisor;
legacy.ai.turnOrder.minMultiplier = 0.8;
delete legacy.ai.targetSelection;
memory.set("legacy-data", JSON.stringify(legacy));
const migrated = new context.DQ.GameDataStore("legacy-data").getData();
if (migrated.schemaVersion !== 15 || migrated.ai.turnOrder.minMultiplier !== 0.8 || migrated.ai.targetSelection.enemyBackWeight !== 1 || migrated.ai.targetSelection.revivedTargetWeight !== 0 || !migrated.actions.some(action => action.id === "baikilt") || !migrated.actions.some(action => action.id === "flameSlash") || !migrated.actions.some(action => action.id === "gigadein") || migrated.actions.find(action => action.id === "sukurlt").effectStat !== "defense" || migrated.actions.find(action => action.id === "sukurlt").effects[0].kind !== "modifyStat" || migrated.actions.some(action => !action.effects.length) || !migrated.jobs[0].levelStats["50"] || !migrated.jobs.some(job => job.id === "hero") || !migrated.jobs.some(job => job.id === "sage") || migrated.enemies[0].levelStats || !migrated.enemies.every(enemy => enemy.actionWeights && enemy.actions.every(actionId => enemy.actionWeights[actionId] != null)) || !migrated.encounters.some(encounter => encounter.id === "level50Trial") || migrated.jobs.find(job => job.id === "warrior").aiTraits.buffAffinity.attack !== 1.5 || migrated.jobs.find(job => job.id === "mage").actionLevels.baikilt !== 21 || migrated.jobs.find(job => job.id === "priest").actionLevels.zaoriku !== 37 || migrated.enemies.find(enemy => enemy.id === "bubbleSlime").resistances.poison !== 0.15 || migrated.strategies.some(strategy => strategy.revive == null)) {
  throw new Error("旧保存データを補助効果対応形式へ移行できませんでした。");
}
console.log("Data validation and persistence: OK");
