(function (DQ) {
  "use strict";

  const start = () => {
    const store = new DQ.GameDataStore();
    const ui = new DQ.BattleUI();
    const battle = new DQ.Battle(ui, store);
    ui.attachBattle(battle);
    battle.reset();
    const editor = new DQ.EditorUI(store, battle);
    window.dqBattle = battle;
    window.dqEditor = editor;
  };

  const showStartupError = error => {
    console.error(error);
    const status = document.querySelector("#battle-status");
    const party = document.querySelector("#enemy-party");
    if (status) status.textContent = "データ読込失敗";
    if (party) party.innerHTML = '<div class="startup-error"><strong>標準データを読み込めませんでした。</strong><span>start.bat、ローカルサーバー、またはGitHub Pagesから起動してください。</span></div>';
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (DQ.DEFAULT_GAME_DATA) { start(); return; }
    const savedData = DQ.GameDataStore.readCurrentSavedData();
    if (savedData) {
      try {
        DQ.setDefaultGameData(savedData);
        start();
        return;
      } catch (error) {
        console.warn("保存データを使用できないため、標準JSONを読み込みます。", error);
      }
    }
    DQ.fetchDefaultGameData()
      .then(defaults => { DQ.setDefaultGameData(defaults); start(); })
      .catch(showStartupError);
  });
})(window.DQ = window.DQ || {});
