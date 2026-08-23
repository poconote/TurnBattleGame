(function (DQ) {
  "use strict";

  const STATUS_DEFINITIONS = {
    poison: { name: "毒", badge: "毒", defaultDuration: 0, defaultTickRate: 0.08 },
    blind: { name: "幻惑", badge: "幻", defaultDuration: 4, defaultPotency: 0.55 },
    petrify: { name: "石化", badge: "石", defaultDuration: 0 },
    sleep: { name: "眠り", badge: "眠", defaultDuration: 3 },
    silence: { name: "呪文封じ", badge: "封", defaultDuration: 3 },
    paralysis: { name: "マヒ", badge: "痺", defaultDuration: 4 },
    confusion: { name: "混乱", badge: "乱", defaultDuration: 3 },
  };

  class StatusEngine {
    constructor(battle, events) {
      this.battle = battle;
      this.events = events;
      events.on("beforeAction", context => this.beforeAction(context));
      events.on("beforeEffect", context => this.beforeEffect(context));
      events.on("turnEnd", context => this.turnEnd(context));
      events.on("afterDeath", context => this.afterDeath(context));
    }

    definition(statusId) { return STATUS_DEFINITIONS[statusId] || { name: statusId, badge: statusId.slice(0, 1), defaultDuration: 0 }; }
    has(target, statusId) { return Boolean(target?.statuses?.[statusId]); }
    list(target) { return Object.entries(target?.statuses || {}).map(([id, status]) => ({ id, ...status })); }
    canAct(target) {
      return target.alive && !["petrify", "sleep", "paralysis", "confusion"].some(statusId => this.has(target, statusId));
    }

    canUseAction(target, action) {
      if (!this.has(target, "silence")) return true;
      return action.type === "attack" || action.type === "utility";
    }

    apply(target, statusId, settings = {}) {
      const definition = this.definition(statusId);
      const current = target.statuses[statusId];
      const status = {
        name: definition.name,
        turns: Math.max(0, Number(settings.duration ?? definition.defaultDuration ?? 0)),
        potency: Number(settings.potency ?? definition.defaultPotency ?? 1),
        tickRate: Number(settings.tickRate ?? definition.defaultTickRate ?? 0),
      };
      if (current) {
        current.turns = Math.max(current.turns, status.turns);
        current.potency = status.potency;
        current.tickRate = status.tickRate;
        return { statusId, status: current, refreshed: true };
      }
      target.statuses[statusId] = status;
      return { statusId, status, refreshed: false };
    }

    remove(target, statusId) {
      if (!this.has(target, statusId)) return false;
      delete target.statuses[statusId];
      return true;
    }

    clear(target) { target.statuses = {}; }

    beforeAction(context) {
      const blockingStatus = ["petrify", "sleep", "paralysis", "confusion"].find(statusId => this.has(context.actor, statusId));
      if (!blockingStatus) return;
      context.cancelled = true;
      context.reason = blockingStatus;
      context.message = `${context.actor.name}は${this.definition(blockingStatus).name}で動けない。`;
    }

    beforeEffect(context) {
      if (context.effect.kind !== "damage" || context.effect.formula !== "physical" || !this.has(context.actor, "blind")) return;
      const accuracy = Math.max(0, Math.min(1, Number(context.actor.statuses.blind.potency ?? 0.55)));
      if (context.random() >= accuracy) {
        context.cancelled = true;
        context.reason = "blindMiss";
      }
    }

    turnEnd() {
      for (const target of this.battle.characters.filter(unit => unit.alive)) {
        const poison = target.statuses.poison;
        if (poison) {
          const damage = Math.max(1, Math.round(target.maxHp * Number(poison.tickRate || 0.08)));
          target.currentHp = Math.max(0, target.currentHp - damage);
          this.battle.log.add(`${target.name}は毒により${damage}ダメージを受けた。`, "danger");
        }
        for (const [statusId, status] of Object.entries(target.statuses)) {
          if (status.turns <= 0) continue;
          status.turns -= 1;
          if (status.turns === 0) {
            delete target.statuses[statusId];
            this.battle.log.add(`${target.name}の${this.definition(statusId).name}が治った。`, "system");
          }
        }
      }
    }

    afterDeath(context) { this.clear(context.target); }
  }

  DQ.STATUS_DEFINITIONS = STATUS_DEFINITIONS;
  DQ.StatusEngine = StatusEngine;
})(window.DQ = window.DQ || {});
