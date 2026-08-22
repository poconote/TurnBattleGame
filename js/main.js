(function (DQ) {
  "use strict";
  document.addEventListener("DOMContentLoaded", () => {
    const store = new DQ.GameDataStore();
    const ui = new DQ.BattleUI();
    const battle = new DQ.Battle(ui, store);
    ui.attachBattle(battle);
    battle.reset();
    const editor = new DQ.EditorUI(store, battle);
    window.dqBattle = battle;
    window.dqEditor = editor;
  });
})(window.DQ = window.DQ || {});
