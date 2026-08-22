(function (DQ) {
  "use strict";

  const DEFAULT_DATA_URL = "data/default-game-data.json";
  const clone = value => JSON.parse(JSON.stringify(value));

  DQ.DEFAULT_DATA_URL = DEFAULT_DATA_URL;
  DQ.setDefaultGameData = data => {
    if (!data || typeof data !== "object") throw new Error("標準ゲームデータが正しくありません。");
    DQ.DEFAULT_GAME_DATA = clone(data);
    return DQ.DEFAULT_GAME_DATA;
  };
  DQ.fetchDefaultGameData = async () => {
    const response = await fetch(DEFAULT_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`標準データを取得できませんでした（HTTP ${response.status}）。`);
    return response.json();
  };
})(window.DQ = window.DQ || {});
