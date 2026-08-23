(function (DQ) {
  "use strict";

  const primaryKindByType = {
    attack: "damage",
    magic: "damage",
    heal: "heal",
    support: "modifyStat",
    instantDeath: "instantDeath",
    status: "applyStatus",
    cure: "cureStatus",
    revive: "revive",
    utility: "noop",
  };

  const createEffect = kind => ({
    damage: { kind: "damage", target: "selected", formula: "physical", powerMultiplier: 1, power: 20, element: null, varianceMin: 0.88, varianceMax: 1.12 },
    heal: { kind: "heal", target: "selected", power: 35, varianceMin: 0.92, varianceMax: 1.08 },
    modifyStat: { kind: "modifyStat", target: "selected", stat: "defense", mode: "add", value: 15, duration: 4, maxStacks: 2 },
    instantDeath: { kind: "instantDeath", target: "selected", successRate: 0.4, resistanceKey: "instantDeath" },
    recoil: { kind: "recoil", target: "caster", rate: 0.15 },
    applyStatus: { kind: "applyStatus", target: "selected", status: "poison", successRate: 0.5, resistanceKey: "poison", duration: 0, potency: 1, tickRate: 0.08 },
    cureStatus: { kind: "cureStatus", target: "selected", statuses: ["poison"] },
    revive: { kind: "revive", target: "selected", successRate: 1, hpRate: 1 },
    drainMp: { kind: "drainMp", target: "selected", power: 8, varianceMin: 0.65, varianceMax: 1.35 },
    sacrifice: { kind: "sacrifice", target: "caster" },
    noop: { kind: "noop", target: "caster" },
  }[kind] || { kind, target: "selected" });

  const normalizeEffect = effect => {
    const normalized = { ...createEffect(effect.kind), ...effect };
    if (normalized.kind === "cureStatus") {
      normalized.statuses = [...new Set(Array.isArray(normalized.statuses) ? normalized.statuses : [normalized.status].filter(Boolean))];
      delete normalized.status;
    }
    return normalized;
  };

  const createPrimaryEffect = action => {
    if (action.type === "attack") {
      return {
        kind: "damage",
        target: "selected",
        formula: "physical",
        powerMultiplier: Number(action.powerMultiplier ?? (action.id === "attack" ? 1 : action.power || 1)),
        element: action.element || null,
        varianceMin: 0.88,
        varianceMax: 1.12,
      };
    }
    if (action.type === "magic") {
      return {
        kind: "damage",
        target: "selected",
        formula: "fixed",
        power: Number(action.power || 0),
        element: action.element || null,
        varianceMin: 0.9,
        varianceMax: 1.1,
      };
    }
    if (action.type === "heal") {
      return {
        kind: "heal",
        target: "selected",
        power: Number(action.power || 0),
        varianceMin: 0.92,
        varianceMax: 1.08,
      };
    }
    if (action.type === "support") {
      return {
        kind: "modifyStat",
        target: "selected",
        stat: action.effectStat || "defense",
        mode: action.effectMode || "add",
        value: Number(action.effectValue ?? action.power ?? 0),
        duration: Math.max(1, Number(action.duration || 4)),
        maxStacks: Math.max(1, Number(action.maxStacks || 1)),
      };
    }
    if (action.type === "instantDeath") {
      return {
        kind: "instantDeath",
        target: "selected",
        successRate: Number(action.successRate || 0),
        resistanceKey: "instantDeath",
      };
    }
    if (action.type === "status") return { ...createEffect("applyStatus"), status: action.status || "poison", successRate: Number(action.successRate ?? 0.5), resistanceKey: action.status || "poison" };
    if (action.type === "cure") return { ...createEffect("cureStatus"), statuses: [action.status || "poison"] };
    if (action.type === "revive") return { ...createEffect("revive"), successRate: Number(action.successRate ?? 1), hpRate: Number(action.hpRate ?? 1) };
    if (action.type === "utility") return createEffect("noop");
    return null;
  };

  const getPrimaryEffect = (action, kind = primaryKindByType[action?.type]) => (action?.effects || []).find(effect => {
    if (kind !== "damage") return effect.kind === kind;
    const formula = action.type === "attack" ? "physical" : "fixed";
    return effect.kind === "damage" && effect.formula === formula;
  }) || (action?.effects || []).find(effect => effect.kind === kind) || null;

  const syncLegacyFacade = action => {
    const primary = getPrimaryEffect(action);
    if (!primary) return action;
    if (primary.kind === "damage") {
      action.element = primary.element || "";
      if (primary.formula === "physical") {
        action.power = 0;
        action.powerMultiplier = Number(primary.powerMultiplier ?? 1);
      } else action.power = Number(primary.power || 0);
    }
    if (primary.kind === "heal") action.power = Number(primary.power || 0);
    if (primary.kind === "modifyStat") {
      action.power = Number(primary.value || 0);
      action.effectStat = primary.stat;
      action.effectMode = primary.mode;
      action.effectValue = Number(primary.value || 0);
      action.duration = Number(primary.duration || 0);
      action.maxStacks = Number(primary.maxStacks || 0);
    }
    if (primary.kind === "instantDeath") action.successRate = Number(primary.successRate || 0);
    if (primary.kind === "applyStatus") {
      action.status = primary.status;
      action.successRate = Number(primary.successRate || 0);
      action.duration = Number(primary.duration || 0);
    }
    if (primary.kind === "cureStatus") action.status = primary.statuses?.[0] || "";
    if (primary.kind === "revive") {
      action.successRate = Number(primary.successRate ?? 1);
      action.hpRate = Number(primary.hpRate ?? 1);
    }
    const recoil = (action.effects || []).find(effect => effect.kind === "recoil");
    action.recoilRate = Number(recoil?.rate || 0);
    return action;
  };

  const ensureEffects = action => {
    if (!Array.isArray(action.effects) || !action.effects.length) {
      const primary = createPrimaryEffect(action);
      action.effects = primary ? [primary] : [];
      if (Number(action.recoilRate || 0) > 0) action.effects.push({ kind: "recoil", target: "caster", rate: Number(action.recoilRate) });
    }
    action.effects = action.effects.map(normalizeEffect);
    return syncLegacyFacade(action);
  };

  const syncEffectFromLegacy = (action, changedPath) => {
    // Existing effects are authoritative. Do not synchronize them back to the
    // legacy editor fields before copying the user's latest edit into them.
    if (!Array.isArray(action.effects) || !action.effects.length) ensureEffects(action);
    if (changedPath === "type") {
      const replacement = createPrimaryEffect(action);
      const primaryIndex = action.effects.findIndex(effect => effect.kind !== "recoil");
      if (replacement && primaryIndex >= 0) action.effects.splice(primaryIndex, 1, replacement);
      else if (replacement) action.effects.unshift(replacement);
    }
    const primary = getPrimaryEffect(action);
    if (primary?.kind === "damage") {
      if (changedPath === "power") primary.power = Number(action.power || 0);
      if (changedPath === "powerMultiplier") primary.powerMultiplier = Number(action.powerMultiplier || 1);
      if (changedPath === "element") primary.element = action.element || null;
    }
    if (primary?.kind === "heal" && changedPath === "power") primary.power = Number(action.power || 0);
    if (primary?.kind === "modifyStat") {
      if (changedPath === "power" || changedPath === "effectValue") primary.value = Number(action.effectValue ?? action.power ?? 0);
      if (changedPath === "effectStat") primary.stat = action.effectStat;
      if (changedPath === "effectMode") primary.mode = action.effectMode;
      if (changedPath === "duration") primary.duration = Number(action.duration || 1);
      if (changedPath === "maxStacks") primary.maxStacks = Number(action.maxStacks || 1);
    }
    if (primary?.kind === "instantDeath" && changedPath === "successRate") primary.successRate = Number(action.successRate || 0);
    if (changedPath === "recoilRate") {
      const recoilIndex = action.effects.findIndex(effect => effect.kind === "recoil");
      const rate = Number(action.recoilRate || 0);
      if (rate > 0 && recoilIndex >= 0) action.effects[recoilIndex].rate = rate;
      else if (rate > 0) action.effects.push({ kind: "recoil", target: "caster", rate });
      else if (recoilIndex >= 0) action.effects.splice(recoilIndex, 1);
    }
    return syncLegacyFacade(action);
  };

  DQ.ActionSchema = { primaryKindByType, createEffect, normalizeEffect, createPrimaryEffect, getPrimaryEffect, ensureEffects, syncLegacyFacade, syncEffectFromLegacy };
})(window.DQ = window.DQ || {});
