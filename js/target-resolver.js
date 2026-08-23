(function (DQ) {
  "use strict";

  const presets = {
    enemyOne: { side: "opponent", scope: "single", lifeState: "auto" },
    allEnemies: { side: "opponent", scope: "all", lifeState: "auto" },
    allyOne: { side: "ally", scope: "single", lifeState: "auto" },
    allAllies: { side: "ally", scope: "all", lifeState: "auto" },
    self: { side: "self", scope: "single", lifeState: "auto" },
  };

  class TargetResolver {
    constructor(battle) { this.battle = battle; }

    static config(action) {
      return typeof action.target === "string" ? { ...(presets[action.target] || presets.enemyOne) } : { ...(action.target || presets.enemyOne) };
    }

    static isGroup(action) { return TargetResolver.config(action).scope === "all"; }

    isEffectUseful(effect, target) {
      if (effect.target === "caster") return false;
      if (effect.kind === "revive") return !target.alive;
      if (!target.alive) return false;
      if (effect.kind === "heal") return target.currentHp < target.maxHp;
      if (effect.kind === "applyStatus") return !target.hasStatus(effect.status);
      if (effect.kind === "cureStatus") {
        const statuses = Array.isArray(effect.statuses) ? effect.statuses : [effect.status].filter(Boolean);
        return statuses.some(statusId => target.hasStatus(statusId));
      }
      return true;
    }

    isEligible(actor, action, target) {
      return this.resolve(actor, action).some(unit => unit.id === target.id);
    }

    resolve(actor, action) {
      const config = TargetResolver.config(action);
      let units;
      if (config.side === "self") units = [actor];
      else {
        const side = config.side === "ally" ? actor.side : actor.side === "ally" ? "enemy" : "ally";
        units = this.battle.characters.filter(unit => unit.side === side);
      }
      const lifeState = config.lifeState || "auto";
      if (lifeState === "alive") units = units.filter(unit => unit.alive);
      if (lifeState === "dead") units = units.filter(unit => !unit.alive);
      if (lifeState === "damaged") units = units.filter(unit => unit.alive && unit.currentHp < unit.maxHp);
      const selectedEffects = (action.effects || []).filter(effect => effect.target !== "caster");
      if (!selectedEffects.length) return units.filter(unit => unit.alive);
      return units.filter(unit => selectedEffects.some(effect => this.isEffectUseful(effect, unit)));
    }
  }

  DQ.TargetResolver = TargetResolver;
  DQ.isGroupTarget = action => TargetResolver.isGroup(action);
})(window.DQ = window.DQ || {});
