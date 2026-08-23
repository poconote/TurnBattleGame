"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const context = { window: null };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "default-data.js"), "utf8"), context, { filename: "default-data.js" });
context.DQ.setDefaultGameData(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "default-game-data.json"), "utf8")));
for (const file of ["action-schema.js", "data-store.js", "models.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context, { filename: file });
}

const data = context.DQ.DEFAULT_GAME_DATA;
for (const actor of data.jobs) {
  for (let level = 1; level <= 24; level += 1) {
    if (!actor.levelStats[String(level)]) throw new Error(`${actor.name}のLv${level}データがありません。`);
  }
}
if (data.enemies.some(enemy => enemy.levelStats || enemy.level != null)) throw new Error("敵にLv別データが残っています。");
if (data.enemies.length < 15 || data.encounters.length < 10) throw new Error("敵または敵グループの標準データが不足しています。");

const warriorData = data.jobs.find(job => job.id === "warrior");
const mageData = data.jobs.find(job => job.id === "mage");
const priestData = data.jobs.find(job => job.id === "priest");
if (warriorData.levelStats["1"].maxHp > 29 || priestData.levelStats["1"].maxHp > 29 || mageData.levelStats["1"].maxHp > 29) {
  throw new Error("Lv1のHPが20台以内に収まっていません。");
}

const mageLv7 = new context.DQ.Character({ ...mageData, level: 7 }, "ally");
const mageLv20 = new context.DQ.Character({ ...mageData, level: 20 }, "ally");
const mageLv21 = new context.DQ.Character({ ...mageData, level: 21 }, "ally");
if (!mageLv7.actions.includes("gira") || mageLv7.actions.includes("io")) throw new Error("Lv7の魔法使いの習得技が不正です。");
if (!mageLv20.actions.includes("hyadaruko") || mageLv20.actions.includes("baikilt")) throw new Error("Lv20の魔法使いの習得技が不正です。");
if (!mageLv21.actions.includes("baikilt")) throw new Error("Lv21でバイキルトを習得できません。");

console.log("Lv1-24 progression and learned actions: OK");
