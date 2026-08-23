"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const jsonPath = path.join(__dirname, "..", "data", "default-game-data.json");
const sourceData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
let requestedUrl = "";
let requestedOptions = null;
const context = {
  fetch: async (url, options) => {
    requestedUrl = url;
    requestedOptions = options;
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(sourceData)) };
  },
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "default-data.js"), "utf8"), context, { filename: "default-data.js" });

(async () => {
  const fetched = await context.DQ.fetchDefaultGameData();
  if (requestedUrl !== "data/default-game-data.json" || requestedOptions?.cache !== "no-store") throw new Error("標準JSONを正しい相対URLから取得していません。");
  context.DQ.setDefaultGameData(fetched);
  if (context.DQ.DEFAULT_GAME_DATA.schemaVersion !== 10 || context.DQ.DEFAULT_GAME_DATA.ai.turnOrder.maxMultiplier !== 1.25 || context.DQ.DEFAULT_GAME_DATA.jobs.length !== 3 || context.DQ.DEFAULT_GAME_DATA.enemies.length < 15 || !context.DQ.DEFAULT_GAME_DATA.jobs[0].levelStats["24"]) {
    throw new Error("標準JSONから職業・敵・Lv別データを初期化できませんでした。");
  }
  fetched.jobs[0].name = "変更";
  if (context.DQ.DEFAULT_GAME_DATA.jobs[0].name === "変更") throw new Error("標準JSONが複製されず外部変更の影響を受けました。");
  console.log("Default JSON loading: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
