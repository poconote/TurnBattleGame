(function (DQ) {
  "use strict";

  const primaryKindByType = {
    attack: "damage",
    magic: "damage",
    heal: "heal",
    support: "modifyStat",
    instantDeath: "instantDeath",
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

  DQ.ActionSchema = { primaryKindByType, createPrimaryEffect, getPrimaryEffect, ensureEffects, syncLegacyFacade, syncEffectFromLegacy };
})(window.DQ = window.DQ || {});
