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
          const direction = this.statChangeDirection(outcomes[0]);
          const changeLabel = direction === "up" ? "上がった" : direction === "down" ? "下がった" : "変わらなかった";
          const logType = direction === "up" ? "heal" : direction === "down" ? "magic" : "system";
          this.battle.log.add(`${actor.name}は${actionName}を使った。${outcomes.map(outcome => outcome.target.name).join("、")}の${this.battle.statLabel(outcomes[0].stat)}が${changeLabel}！`, logType);
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

    statChangeDirection(outcome) {
      const value = Number(outcome.value);
      const neutral = outcome.mode === "multiply" ? 1 : 0;
      if (value === neutral) return "none";
      const lowerIsStronger = ["magicResistance", "breathResistance", "damageResistance"].includes(outcome.stat);
      const strengthIncreased = lowerIsStronger ? value < neutral : value > neutral;
      return strengthIncreased ? "up" : "down";
    }
  }

  DQ.ActionExecutor = ActionExecutor;
})(window.DQ = window.DQ || {});
