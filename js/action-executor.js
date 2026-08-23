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
      if (["magic", "instantDeath", "status", "cure", "revive"].includes(action.type)) this.battle.log.add(`${actor.name}は${actionName}を唱えた！`, action.type === "cure" || action.type === "revive" ? "heal" : "magic");
      result.effects.forEach(({ effect, outcomes }) => {
        if (effect.kind === "damage") outcomes.forEach(outcome => {
          if (outcome.cancelled) {
            this.battle.log.add(`${actor.name}の攻撃は外れた！`, "system");
            return;
          }
          const message = physicalAction
            ? `${actor.name}の${actionName}！ ${outcome.target.name}に${outcome.damage}ダメージ。`
            : `${outcome.target.name}に${outcome.damage}ダメージ。`;
          this.battle.log.add(message, physicalAction ? "normal" : "magic");
        });
        if (effect.kind === "heal") outcomes.forEach(outcome => this.battle.log.add(`${actor.name}は${actionName}を唱えた。${outcome.target.name}のHPが${outcome.amount}回復。`, "heal"));
        if (effect.kind === "modifyStat" && outcomes.length) {
          const decreased = outcomes[0].mode === "multiply" ? Number(outcomes[0].value) < 1 : Number(outcomes[0].value) < 0;
          this.battle.log.add(`${actor.name}は${actionName}を使った。${outcomes.map(outcome => outcome.target.name).join("、")}の${this.battle.statLabel(outcomes[0].stat)}が${decreased ? "下がった" : "上がった"}！`, decreased ? "magic" : "heal");
        }
        if (effect.kind === "instantDeath") outcomes.forEach(outcome => {
          if (outcome.skipped) return;
          this.battle.log.add(outcome.success ? `${outcome.target.name}の息の根を止めた！` : `${outcome.target.name}には効かなかった。`, outcome.success ? "danger" : "system");
          if (actor.side === "ally" && outcome.target.side === "enemy") {
            const value = this.battle.knowledge.update(outcome.target.templateId, "instantDeath", outcome.success ? 1 : -1);
            this.battle.log.add(`AI学習：${outcome.target.name}の即死有効度を ${value > 0 ? "+" : ""}${value} に更新。`, "learn");
          }
        });
        if (effect.kind === "applyStatus") outcomes.forEach(outcome => {
          if (outcome.skipped) return;
          const statusName = this.battle.statusEngine.definition(effect.status).name;
          if (outcome.success) this.battle.log.add(`${outcome.target.name}は${statusName}状態になった。`, effect.status === "petrify" ? "danger" : "learn");
          else this.battle.log.add(`${outcome.target.name}には${statusName}が効かなかった。`, "system");
        });
        if (effect.kind === "cureStatus") outcomes.forEach(outcome => {
          if (!outcome.curedStatuses.length) return;
          const names = outcome.curedStatuses.map(statusId => this.battle.statusEngine.definition(statusId).name).join("・");
          this.battle.log.add(`${outcome.target.name}の${names}が治った。`, "heal");
        });
        if (effect.kind === "revive") outcomes.forEach(outcome => {
          this.battle.log.add(outcome.success
            ? `${outcome.target.name}はHP${outcome.reviveHp}で生き返った！`
            : `${outcome.target.name}は生き返らなかった。`, outcome.success ? "heal" : "system");
        });
        if (effect.kind === "drainMp") outcomes.filter(outcome => outcome.amount > 0).forEach(outcome => this.battle.log.add(`${actor.name}は${outcome.target.name}からMPを${outcome.amount}吸収した。`, "magic"));
        if (effect.kind === "sacrifice") outcomes.forEach(() => this.battle.log.add(`${actor.name}は命を投げ出した！`, "danger"));
        if (effect.kind === "recoil") outcomes.filter(outcome => outcome.amount > 0).forEach(outcome => this.battle.log.add(`${actor.name}は反動で${outcome.amount}ダメージを受けた。`, "danger"));
      });
      return result;
    }
  }

  DQ.ActionExecutor = ActionExecutor;
})(window.DQ = window.DQ || {});
