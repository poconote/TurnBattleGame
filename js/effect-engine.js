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
        const expectedDamage = Math.max(1, Math.round(base * resistance));
        const minRate = Number(effect.varianceMin ?? (effect.formula === "physical" ? 0.88 : 0.9));
        const maxRate = Number(effect.varianceMax ?? (effect.formula === "physical" ? 1.12 : 1.1));
        context.lastExpectedDamage = expectedDamage;
        context.totalExpectedDamage += expectedDamage;
        return { target, resistance, expectedDamage, damageMin: Math.max(1, Math.round(expectedDamage * minRate)), damageMax: Math.max(1, Math.round(expectedDamage * maxRate)) };
      },
      apply(context, effect, target) {
        const preview = this.preview({ ...context, totalExpectedDamage: 0 }, effect, target);
        const damage = Math.max(1, Math.round(preview.expectedDamage * variance(effect, effect.formula === "physical" ? 0.88 : 0.9, effect.formula === "physical" ? 1.12 : 1.1, context.random())));
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
        if (mode === "multiply") buff.value = Math.max(buff.value, value);
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
        const success = context.random() < preview.successRate;
        if (success) target.currentHp = 0;
        return { ...preview, success };
      },
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
        outcomes: this.targetsFor(effect, actor, selectedTargets).map(target => this.registry.get(effect.kind).apply(context, effect, target)),
      }));
      return { effects, totalDamage: context.totalDamage };
    }
  }

  DQ.EffectRegistry = EffectRegistry;
  DQ.EffectEngine = EffectEngine;
  DQ.createDefaultEffectRegistry = createDefaultRegistry;
})(window.DQ = window.DQ || {});
