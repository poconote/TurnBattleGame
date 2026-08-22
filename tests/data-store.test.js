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
for (const file of ["default-data.js", "data-store.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);

const store = new context.DQ.GameDataStore("test-data");
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

const legacy = JSON.parse(JSON.stringify(context.DQ.DEFAULT_GAME_DATA));
legacy.schemaVersion = 1;
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
delete legacy.actions.find(action => action.id === "sukurlt").effectStat;
delete legacy.ai.support.statValueDivisor;
memory.set("legacy-data", JSON.stringify(legacy));
const migrated = new context.DQ.GameDataStore("legacy-data").getData();
if (migrated.schemaVersion !== 9 || !migrated.actions.some(action => action.id === "baikilt") || !migrated.actions.some(action => action.id === "flameSlash") || migrated.actions.find(action => action.id === "sukurlt").effectStat !== "defense" || !migrated.jobs[0].levelStats["20"] || migrated.enemies[0].levelStats || !migrated.encounters.length || migrated.jobs.find(job => job.id === "warrior").aiTraits.buffAffinity.attack !== 1.5 || migrated.jobs.find(job => job.id === "mage").actionLevels.baikilt !== 21) {
  throw new Error("旧保存データを補助効果対応形式へ移行できませんでした。");
}
console.log("Data validation and persistence: OK");
