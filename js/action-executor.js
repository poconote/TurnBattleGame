(function (DQ) {
  "use strict";

  class ActionExecutor {
    constructor(battle, effectEngine) {
      this.battle = battle;
      this.effectEngine = effectEngine;
    }

    execute(actor, action, targets) {
      const result = this.effectEngine.applyAction(actor, action, targets);
      const actionName = this.battle.actionName(action);
      const physicalAction = action.type === "attack";
      if (action.type === "magic" || action.type === "instantDeath") this.battle.log.add(`${actor.name}は${actionName}を唱えた！`, "magic");
      result.effects.forEach(({ effect, outcomes }) => {
        if (effect.kind === "damage") outcomes.forEach(outcome => {
          const message = physicalAction
            ? `${actor.name}の${actionName}！ ${outcome.target.name}に${outcome.damage}ダメージ。`
            : `${outcome.target.name}に${outcome.damage}ダメージ。`;
          this.battle.log.add(message, physicalAction ? "normal" : "magic");
        });
        if (effect.kind === "heal") outcomes.forEach(outcome => this.battle.log.add(`${actor.name}は${actionName}を唱えた。${outcome.target.name}のHPが${outcome.amount}回復。`, "heal"));
        if (effect.kind === "modifyStat" && outcomes.length) {
          this.battle.log.add(`${actor.name}は${actionName}を唱えた。${outcomes.map(outcome => outcome.target.name).join("、")}の${this.battle.statLabel(outcomes[0].stat)}が上がった！`, "heal");
        }
        if (effect.kind === "instantDeath") outcomes.forEach(outcome => {
          this.battle.log.add(outcome.success ? `${outcome.target.name}の息の根を止めた！` : `${outcome.target.name}には効かなかった。`, outcome.success ? "danger" : "system");
          if (actor.side === "ally" && outcome.target.side === "enemy") {
            const value = this.battle.knowledge.update(outcome.target.templateId, "instantDeath", outcome.success ? 1 : -1);
            this.battle.log.add(`AI学習：${outcome.target.name}の即死有効度を ${value > 0 ? "+" : ""}${value} に更新。`, "learn");
          }
        });
        if (effect.kind === "recoil") outcomes.filter(outcome => outcome.amount > 0).forEach(outcome => this.battle.log.add(`${actor.name}は反動で${outcome.amount}ダメージを受けた。`, "danger"));
      });
      return result;
    }
  }

  DQ.ActionExecutor = ActionExecutor;
})(window.DQ = window.DQ || {});
