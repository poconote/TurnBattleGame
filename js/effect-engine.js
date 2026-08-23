(function (DQ) {
  "use strict";

  class EffectRegistry {
    constructor() { this.handlers = new Map(); }
    register(kind, handler) { this.handlers.set(kind, handler); return this; }
    get(kind) {
      const handler = this.handlers.get(kind);
      if (!handler) throw new Error(`未対応の効果タイプです：${kind}`);
      return handler;
    }
  }

  const resistanceOf = (effect, target) => effect.element ? Number(target.resistances[effect.element] ?? 1) : 1;
  const variance = (effect, fallbackMin, fallbackMax, randomValue) => {
    const min = Number(effect.varianceMin ?? fallbackMin);
    const max = Number(effect.varianceMax ?? fallbackMax);
    return min + (max - min) * randomValue;
  };

  const createDefaultRegistry = battle => new EffectRegistry()
    .register("damage", {
      preview(context, effect, target) {
        const resistance = resistanceOf(effect, target);
        const base = effect.formula === "physical"
          ? context.actor.effectiveAttack * Number(effect.powerMultiplier ?? 1) - target.effectiveDefense * 0.48
          : Number(effect.power || 0);
        const damageTakenMultiplier = target.damageTakenMultiplier?.(effect.damageClass || (effect.formula === "fixed" ? "magic" : "physical")) ?? 1;
        const hitDamage = Math.max(1, Math.round(base * resistance * damageTakenMultiplier));
        const accuracy = effect.formula === "physical" && context.actor.hasStatus?.("blind")
          ? Math.max(0, Math.min(1, Number(context.actor.statuses.blind.potency ?? 0.55))) : 1;
        const expectedDamage = Math.max(1, Math.round(hitDamage * accuracy));
        const minRate = Number(effect.varianceMin ?? (effect.formula === "physical" ? 0.88 : 0.9));
        const maxRate = Number(effect.varianceMax ?? (effect.formula === "physical" ? 1.12 : 1.1));
        context.lastExpectedDamage = expectedDamage;
        context.totalExpectedDamage += expectedDamage;
        return { target, resistance, damageTakenMultiplier, accuracy, hitDamage, expectedDamage, damageMin: Math.max(1, Math.round(hitDamage * minRate)), damageMax: Math.max(1, Math.round(hitDamage * maxRate)) };
      },
      apply(context, effect, target) {
        const preview = this.preview({ ...context, totalExpectedDamage: 0 }, effect, target);
        const damage = Math.max(1, Math.round(preview.hitDamage * variance(effect, effect.formula === "physical" ? 0.88 : 0.9, effect.formula === "physical" ? 1.12 : 1.1, context.random())));
        target.currentHp = Math.max(0, target.currentHp - damage);
        context.lastDamage = damage;
        context.totalDamage += damage;
        return { ...preview, damage };
      },
    })
    .register("heal", {
      preview(context, effect, target) {
        const missingHp = Math.max(0, target.maxHp - target.currentHp);
        const power = Number(effect.power || 0);
        return { target, expectedHeal: Math.min(missingHp, power), healMin: Math.min(missingHp, Math.round(power * Number(effect.varianceMin ?? 0.92))), healMax: Math.min(missingHp, Math.round(power * Number(effect.varianceMax ?? 1.08))) };
      },
      apply(context, effect, target) {
        const amount = Math.min(target.maxHp - target.currentHp, Math.round(Number(effect.power || 0) * variance(effect, 0.92, 1.08, context.random())));
        target.currentHp += amount;
        return { target, amount };
      },
    })
    .register("modifyStat", {
      preview(context, effect, target) { return { target, stat: effect.stat, mode: effect.mode, value: Number(effect.value || 0), duration: Number(effect.duration || 0), maxStacks: Number(effect.maxStacks || 1) }; },
      apply(context, effect, target) {
        const stat = effect.stat || "defense";
        const mode = effect.mode || "add";
        const value = Number(effect.value || 0);
        const duration = Math.max(1, Number(effect.duration || 4));
        const maxStacks = Math.max(1, Number(effect.maxStacks || 1));
        const buff = target.buffs[stat] || (target.buffs[stat] = { mode, value: mode === "multiply" ? 1 : 0, turns: 0, stacks: 0 });
        buff.mode = mode;
        if (mode === "multiply") {
          const lowerIsStronger = ["magicResistance", "breathResistance", "damageResistance"].includes(stat);
          buff.value = lowerIsStronger ? Math.min(buff.value, value) : Math.max(buff.value, value);
        }
        else if (buff.stacks < maxStacks) buff.value += value;
        buff.stacks = Math.min(maxStacks, buff.stacks + 1);
        buff.turns = duration;
        return { target, stat, mode, value, duration, maxStacks };
      },
    })
    .register("instantDeath", {
      preview(context, effect, target) {
        const resistance = Number(target.resistances[effect.resistanceKey || "instantDeath"] ?? 1);
        return { target, resistance, successRate: Number(effect.successRate || 0) * resistance };
      },
      apply(context, effect, target) {
        const preview = this.preview(context, effect, target);
        if (!target.alive || target.currentHp <= 0) return { ...preview, success: false, skipped: true };
        const success = context.random() < preview.successRate;
        if (success) target.currentHp = 0;
        return { ...preview, success };
      },
    })
    .register("applyStatus", {
      preview(context, effect, target) {
        const resistanceKey = effect.resistanceKey || effect.status;
        const resistance = Number(target.resistances[resistanceKey] ?? 1);
        const successRate = Math.max(0, Math.min(1, Number(effect.successRate || 0) * resistance));
        return { target, status: effect.status, resistance, successRate, alreadyAffected: target.hasStatus(effect.status) };
      },
      apply(context, effect, target) {
        const preview = this.preview(context, effect, target);
        if (!target.alive || target.currentHp <= 0) return { ...preview, success: false, skipped: true };
        const success = context.random() < preview.successRate;
        const applied = success ? context.battle.statusEngine.apply(target, effect.status, effect) : null;
        return { ...preview, success, refreshed: Boolean(applied?.refreshed) };
      },
    })
    .register("cureStatus", {
      preview(context, effect, target) {
        const statuses = (effect.statuses || []).filter(statusId => target.hasStatus(statusId));
        return { target, statuses };
      },
      apply(context, effect, target) {
        const preview = this.preview(context, effect, target);
        const curedStatuses = preview.statuses.filter(statusId => context.battle.statusEngine.remove(target, statusId));
        return { target, statuses: preview.statuses, curedStatuses };
      },
    })
    .register("revive", {
      preview(context, effect, target) {
        const successRate = Math.max(0, Math.min(1, Number(effect.successRate ?? 1)));
        const hpRate = Math.max(0.01, Math.min(1, Number(effect.hpRate ?? 1)));
        return { target, successRate, hpRate, reviveHp: Math.max(1, Math.round(target.maxHp * hpRate)) };
      },
      apply(context, effect, target) {
        const preview = this.preview(context, effect, target);
        const success = !target.alive && context.random() < preview.successRate;
        if (success) {
          target.currentHp = preview.reviveHp;
          target.alive = true;
          const protectionTurns = Math.max(0, Math.floor(Number(context.battle.data.ai?.targetSelection?.reviveProtectionTurns ?? 1)));
          target.reviveProtectionUntilTurn = Number(context.battle.turn || 1) + protectionTurns;
          context.battle.statusEngine.clear(target);
        }
        return { ...preview, success };
      },
    })
    .register("drainMp", {
      preview(context, effect, target) {
        const power = Math.max(0, Number(effect.power || 0));
        const expectedDrain = Math.min(target.currentMp, Math.round(power));
        return { target, expectedDrain, drainMin: Math.min(target.currentMp, Math.round(power * Number(effect.varianceMin ?? 0.65))), drainMax: Math.min(target.currentMp, Math.round(power * Number(effect.varianceMax ?? 1.35))) };
      },
      apply(context, effect, target) {
        const requested = Math.max(0, Math.round(Number(effect.power || 0) * variance(effect, 0.65, 1.35, context.random())));
        const amount = Math.min(target.currentMp, requested, Math.max(0, context.actor.maxMp - context.actor.currentMp));
        target.currentMp -= amount;
        context.actor.currentMp += amount;
        return { target, amount };
      },
    })
    .register("sacrifice", {
      preview(context) { return { target: context.actor, currentHp: context.actor.currentHp }; },
      apply(context) {
        const amount = context.actor.currentHp;
        context.actor.currentHp = 0;
        return { target: context.actor, amount };
      },
    })
    .register("noop", {
      preview(context) { return { target: context.actor }; },
      apply(context) { return { target: context.actor }; },
    })
    .register("recoil", {
      preview(context, effect) { return { target: context.actor, expectedRecoil: Math.round(Number(context.lastExpectedDamage || 0) * Number(effect.rate || 0)) }; },
      apply(context, effect) {
        const amount = Math.round(Number(context.lastDamage || 0) * Number(effect.rate || 0));
        context.actor.currentHp = Math.max(0, context.actor.currentHp - amount);
        return { target: context.actor, amount };
      },
    });

  class EffectEngine {
    constructor(battle, registry = createDefaultRegistry(battle)) {
      this.battle = battle;
      this.registry = registry;
    }

    targetsFor(effect, actor, selectedTargets) { return effect.target === "caster" ? [actor] : selectedTargets; }

    createContext(actor, action, random = Math.random) {
      return { battle: this.battle, actor, action, random, lastDamage: 0, totalDamage: 0, lastExpectedDamage: 0, totalExpectedDamage: 0 };
    }

    previewAction(actor, action, selectedTargets) {
      const context = this.createContext(actor, action, () => 0.5);
      const effects = (action.effects || []).map(effect => ({
        effect,
        outcomes: this.targetsFor(effect, actor, selectedTargets).map(target => this.registry.get(effect.kind).preview(context, effect, target)),
      }));
      return { effects, totalExpectedDamage: context.totalExpectedDamage };
    }

    applyAction(actor, action, selectedTargets, random = Math.random) {
      const context = this.createContext(actor, action, random);
      const effects = (action.effects || []).map(effect => ({
        effect,
        outcomes: this.targetsFor(effect, actor, selectedTargets).map(target => {
          const event = this.battle.events.emit("beforeEffect", { actor, action, effect, target, random, cancelled: false });
          if (event.cancelled) return { target, cancelled: true, reason: event.reason };
          const outcome = this.registry.get(effect.kind).apply(context, effect, target);
          this.battle.events.emit("afterEffect", { actor, action, effect, target, outcome, random, cancelled: false });
          return outcome;
        }),
      }));
      return { effects, totalDamage: context.totalDamage };
    }
  }

  DQ.EffectRegistry = EffectRegistry;
  DQ.EffectEngine = EffectEngine;
  DQ.createDefaultEffectRegistry = createDefaultRegistry;
})(window.DQ = window.DQ || {});
