(function (DQ) {
  "use strict";

  const presets = {
    enemyOne: { side: "opponent", scope: "single", lifeState: "alive" },
    allEnemies: { side: "opponent", scope: "all", lifeState: "alive" },
    allyOne: { side: "ally", scope: "single", lifeState: "alive" },
    allAllies: { side: "ally", scope: "all", lifeState: "alive" },
    self: { side: "self", scope: "single", lifeState: "alive" },
  };

  class TargetResolver {
    constructor(battle) { this.battle = battle; }

    static config(action) {
      return typeof action.target === "string" ? { ...(presets[action.target] || presets.enemyOne) } : { ...(action.target || presets.enemyOne) };
    }

    static isGroup(action) { return TargetResolver.config(action).scope === "all"; }

    resolve(actor, action) {
      const config = TargetResolver.config(action);
      let units;
      if (config.side === "self") units = [actor];
      else {
        const side = config.side === "ally" ? actor.side : actor.side === "ally" ? "enemy" : "ally";
        units = this.battle.characters.filter(unit => unit.side === side);
      }
      const lifeState = config.lifeState || "alive";
      if (lifeState === "alive") units = units.filter(unit => unit.alive);
      if (lifeState === "dead") units = units.filter(unit => !unit.alive);
      if (lifeState === "damaged") units = units.filter(unit => unit.alive && unit.currentHp < unit.maxHp);
      const hasHeal = (action.effects || []).some(effect => effect.kind === "heal");
      if (hasHeal && config.side !== "opponent" && lifeState === "alive") units = units.filter(unit => unit.currentHp < unit.maxHp);
      return units;
    }
  }

  DQ.TargetResolver = TargetResolver;
  DQ.isGroupTarget = action => TargetResolver.isGroup(action);
})(window.DQ = window.DQ || {});
