(function (DQ) {
  "use strict";

  const isGroupTarget = action => DQ.TargetResolver.isGroup(action);

  class BattleAI {
    constructor(battle) { this.battle = battle; }

    decide(actor) {
      const candidates = [];
      for (const actionId of actor.actions) {
        const action = this.battle.getAction(actionId);
        if (!action) continue;
        const targets = this.battle.targetResolver.resolve(actor, action);
        if (actor.currentMp < action.mpCost) {
          candidates.push(this.unavailable(actor, action, targets, "MPが足りない"));
        } else if (!targets.length) {
          candidates.push(this.unavailable(actor, action, targets, "有効な対象がいない"));
        } else if (isGroupTarget(action)) {
          candidates.push(this.finalizeCandidate(this.evaluate(actor, action, targets)));
        } else {
          candidates.push(this.evaluateSingleTargetAction(actor, action, targets));
        }
      }
      const usable = candidates.filter(candidate => candidate.available).sort((a, b) => b.finalScore - a.finalScore);
      const selected = usable[0] || null;
      if (selected) this.resolveConcreteTarget(selected);
      return {
        actorId: actor.id,
        turn: this.battle.turn,
        strategy: this.battle.strategy,
        selected,
        candidates: [...usable, ...candidates.filter(candidate => !candidate.available)],
      };
    }

    unavailable(actor, action, targets, reason) {
      return { action, targets, available: false, finalScore: -Infinity, reasons: [{ label: reason, value: "使用不可" }], settings: this.describeAction(actor, action, targets) };
    }

    getTargets(actor, action) {
      return this.battle.targetResolver.resolve(actor, action);
    }

    evaluateSingleTargetAction(actor, action, targets) {
      const groups = this.groupEquivalentTargets(actor, action, targets);
      const options = groups.map(group => {
        const evaluated = this.evaluate(actor, action, [group.targets[0]]);
        const outcome = evaluated.settings.outcomes[0] || {};
        return {
          label: this.groupLabel(group.targets),
          score: evaluated.finalScore,
          targets: group.targets,
          targetIds: group.targets.map(target => target.id),
          templateId: group.targets[0].templateId,
          resistance: outcome.resistance,
          expectedDamage: outcome.expectedDamage,
          damageMin: outcome.damageMin,
          damageMax: outcome.damageMax,
          expectedHeal: outcome.expectedHeal,
          healMin: outcome.healMin,
          healMax: outcome.healMax,
          successRate: outcome.successRate,
          formationLabel: this.formationLabel(group.targets[0]),
          targetWeight: this.enemyFormationWeight(group.targets[0]),
          evaluated,
        };
      }).sort((a, b) => b.score - a.score);
      const best = this.chooseBestTargetOption(actor, action, options);
      const candidate = best.evaluated;
      candidate.targetGroup = best.targets;
      candidate.targetLabel = best.label;
      candidate.targetOptions = options.map(({ evaluated, targets: groupedTargets, ...option }) => option);
      return this.finalizeCandidate(candidate);
    }

    groupEquivalentTargets(actor, action, targets) {
      const groups = new Map();
      targets.forEach(target => {
        const primary = DQ.ActionSchema.getPrimaryEffect(action);
        const resistanceKey = primary?.kind === "instantDeath" ? primary.resistanceKey || "instantDeath" : primary?.element;
        const signature = JSON.stringify({
          templateId: target.templateId,
          side: target.side,
          formationIndex: target.formationIndex,
          currentHp: target.currentHp,
          maxHp: target.maxHp,
          attack: target.effectiveAttack,
          defense: target.effectiveDefense,
          speed: target.effectiveSpeed,
          resistance: resistanceKey ? Number(target.resistances[resistanceKey] ?? 1) : 1,
          buffs: target.buffs,
          buffAffinity: target.aiTraits?.buffAffinity,
          knowledge: actor.side === "ally" && action.type === "instantDeath" ? this.battle.knowledge.get(target.templateId, "instantDeath") : 0,
        });
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push(target);
      });
      return [...groups.values()].map(groupTargets => ({ targets: groupTargets }));
    }

    chooseBestTargetOption(actor, action, options, randomValue = Math.random()) {
      const bestScore = Math.max(...options.map(option => option.score));
      const tied = options.filter(option => option.score === bestScore);
      if (tied.length === 1) return tied[0];
      const weights = tied.map(option => actor.side === "enemy" && action.target === "enemyOne"
        ? this.enemyFormationWeight(option.targets[0]) : 1);
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let roll = Math.max(0, Math.min(0.999999999, Number(randomValue))) * total;
      for (let index = 0; index < tied.length; index += 1) {
        roll -= weights[index];
        if (roll < 0) return tied[index];
      }
      return tied[tied.length - 1];
    }

    formationLabel(target) {
      return target?.side === "ally" ? (["前衛", "中衛", "後衛"][target.formationIndex] || "隊列外") : null;
    }

    enemyFormationWeight(target) {
      if (target?.side !== "ally") return 1;
      const rules = this.battle.data.ai.targetSelection || {};
      return [
        Number(rules.enemyFrontWeight ?? 5),
        Number(rules.enemyMiddleWeight ?? 3),
        Number(rules.enemyBackWeight ?? 1),
      ][target.formationIndex] || 1;
    }

    groupLabel(targets) {
      if (targets.length === 1) return targets[0].name;
      const template = this.battle.data.enemies.find(enemy => enemy.id === targets[0].templateId)
        || this.battle.data.jobs.find(job => job.id === targets[0].templateId);
      return template?.battleName || template?.name || targets[0].name;
    }

    finalizeCandidate(candidate) {
      const random = this.randomInt(this.battle.data.ai.randomMin, this.battle.data.ai.randomMax);
      candidate.finalScore = Math.round(candidate.finalScore + random);
      candidate.reasons.push({ label: "ランダム補正", value: random, kind: "add" });
      return candidate;
    }

    resolveConcreteTarget(candidate) {
      if (isGroupTarget(candidate.action) || !candidate.targetGroup?.length) return;
      const targets = candidate.targetGroup;
      const target = targets.length === 1 ? targets[0] : targets[Math.floor(Math.random() * targets.length)];
      candidate.targets = [target];
      candidate.targetLabel = target.name;
      candidate.settings = this.describeAction(this.battle.getCharacter(candidate.actorId) || null, candidate.action, [target]);
    }

    evaluate(actor, action, targets) {
      let score = Number(action.baseScore || 0);
      const reasons = [{ label: "基本評価", value: score, kind: "add" }];
      if (action.type === "attack") score += this.evaluateAttack(actor, action, targets[0], reasons);
      if (action.type === "heal") score += this.evaluateHeal(actor, action, targets[0], reasons);
      if (action.type === "magic") score += this.evaluateMagic(actor, action, targets, reasons);
      if (action.type === "support") score += this.evaluateSupport(actor, action, targets, reasons);
      if (action.type === "instantDeath") score += this.evaluateInstantDeath(actor, action, targets, reasons);

      const roleMultiplier = action.type === "heal" ? actor.aiTraits.healPriority : action.type === "magic" ? actor.aiTraits.magicPriority : 1;
      if (roleMultiplier !== 1) {
        score *= roleMultiplier;
        reasons.push({ label: "職業適性", value: roleMultiplier, kind: "multiply" });
      }

      const strategy = actor.side === "ally" ? this.battle.getStrategy() : this.battle.getBalancedStrategy();
      const multiplier = Number(strategy?.[action.type] ?? 1);
      score *= multiplier;
      reasons.push({ label: `作戦「${strategy?.name || "補正なし"}」`, value: multiplier, kind: "multiply" });

      const healRules = this.battle.data.ai.heal;
      if (action.type === "heal" && targets[0].hpRate <= healRules.emergencyRate && score < healRules.emergencyFloor) {
        score = healRules.emergencyFloor;
        reasons.push({ label: "瀕死者の回復を最低限確保", value: healRules.emergencyFloor, kind: "floor" });
      }
      return { actorId: actor.id, action, targets, available: true, finalScore: Math.round(score), reasons, settings: this.describeAction(actor, action, targets), targetOptions: [] };
    }

    describeAction(actor, action, targets) {
      const primary = DQ.ActionSchema.getPrimaryEffect(action);
      const settings = {
        type: action.type,
        mpCost: Number(action.mpCost || 0),
        target: action.target,
        baseScore: Number(action.baseScore || 0),
        effects: DQ.cloneData(action.effects || []),
        power: Number(primary?.power || 0),
        powerMultiplier: Number(primary?.powerMultiplier ?? 1),
        element: primary?.element || null,
        successRate: Number(primary?.successRate || 0),
        effectStat: primary?.stat || null,
        effectMode: primary?.mode || null,
        effectValue: Number(primary?.value || 0),
        duration: Number(primary?.duration || 0),
        maxStacks: Number(primary?.maxStacks || 0),
        recoilRate: Number((action.effects || []).find(effect => effect.kind === "recoil")?.rate || 0),
        outcomes: [],
      };
      const preview = this.battle.effectEngine.previewAction(actor, action, targets);
      settings.outcomes = targets.map(target => {
        const outcome = { targetId: target.id, targetName: target.name };
        preview.effects.forEach(result => result.outcomes.filter(item => item.target === target).forEach(item => Object.assign(outcome, {
          resistance: item.resistance ?? outcome.resistance,
          expectedDamage: item.expectedDamage ?? outcome.expectedDamage,
          damageMin: item.damageMin ?? outcome.damageMin,
          damageMax: item.damageMax ?? outcome.damageMax,
          expectedHeal: item.expectedHeal ?? outcome.expectedHeal,
          healMin: item.healMin ?? outcome.healMin,
          healMax: item.healMax ?? outcome.healMax,
          successRate: item.successRate ?? outcome.successRate,
        })));
        return outcome;
      });
      return settings;
    }

    evaluateAttack(actor, action, target, reasons) {
      const rules = this.battle.data.ai.attack;
      let bonus = 0;
      const effect = DQ.ActionSchema.getPrimaryEffect(action, "damage");
      const damage = this.battle.estimatePhysicalDamage(actor, target, action);
      if (effect?.element) {
        const resistance = target.resistances[effect.element] ?? 1;
        if (resistance >= this.battle.data.ai.magic.weakThreshold) {
          bonus += rules.elementWeakBonus;
          reasons.push({ label: "物理スキルで弱点属性", value: rules.elementWeakBonus, kind: "add" });
        }
        if (resistance <= this.battle.data.ai.magic.resistThreshold) {
          bonus += rules.elementResistPenalty;
          reasons.push({ label: "物理スキルに属性耐性", value: rules.elementResistPenalty, kind: "add" });
        }
      }
      if (target.hpRate < rules.lowHpThreshold) { bonus += rules.lowHpBonus; reasons.push({ label: "敵HPが少ない", value: rules.lowHpBonus, kind: "add" }); }
      if (damage >= target.currentHp) { bonus += rules.lethalBonus; reasons.push({ label: "撃破できる見込み", value: rules.lethalBonus, kind: "add" }); }
      return bonus;
    }

    evaluateHeal(actor, action, target, reasons) {
      const rules = this.battle.data.ai.heal;
      let bonus = 0;
      const effect = DQ.ActionSchema.getPrimaryEffect(action, "heal");
      const power = Number(effect?.power || 0);
      rules.thresholds.forEach(rule => {
        if (target.hpRate < rule.rate) {
          bonus += Number(rule.score);
          reasons.push({ label: `HP ${Math.round(rule.rate * 100)}%未満`, value: Number(rule.score), kind: "add" });
        }
      });
      const missing = target.maxHp - target.currentHp;
      const wasted = Math.max(0, power - missing);
      if (wasted > power * rules.wasteRate) { bonus += rules.wastePenalty; reasons.push({ label: "回復量の一部が無駄", value: rules.wastePenalty, kind: "add" }); }
      const expectedRate = Math.min(target.maxHp, target.currentHp + power) / target.maxHp;
      if (target.hpRate < 0.25 && expectedRate < rules.unsafeRate) { bonus += rules.unsafePenalty; reasons.push({ label: "回復後も危険域", value: rules.unsafePenalty, kind: "add" }); }
      if (actor.currentMp / Math.max(1, actor.maxMp) > rules.mpEnoughRate) { bonus += rules.mpEnoughBonus; reasons.push({ label: "MP残量十分", value: rules.mpEnoughBonus, kind: "add" }); }
      return bonus;
    }

    evaluateMagic(actor, action, targets, reasons) {
      const rules = this.battle.data.ai.magic;
      let bonus = 0;
      const effect = DQ.ActionSchema.getPrimaryEffect(action, "damage");
      const group = isGroupTarget(action);
      const weak = targets.filter(target => (target.resistances[effect?.element] ?? 1) >= rules.weakThreshold).length;
      const resistant = targets.filter(target => (target.resistances[effect?.element] ?? 1) <= rules.resistThreshold).length;
      const damages = targets.map(target => this.battle.estimateMagicDamage(action, target));
      const totalDamage = damages.reduce((sum, damage) => sum + damage, 0);
      if (weak) { const value = weak * rules.weakBonus; bonus += value; reasons.push({ label: `弱点属性${weak > 1 ? `（${weak}体）` : ""}`, value, kind: "add" }); }
      if (resistant) { const value = resistant * (group ? rules.groupResistPenalty : rules.singleResistPenalty); bonus += value; reasons.push({ label: `属性耐性あり${resistant > 1 ? `（${resistant}体）` : ""}`, value, kind: "add" }); }
      const damageBonus = Math.round(totalDamage / Math.max(1, rules.totalDamageDivisor));
      bonus += damageBonus;
      reasons.push({ label: `総ダメージ見込み ${totalDamage}`, value: damageBonus, kind: "add" });
      if (targets.some((target, index) => damages[index] >= target.currentHp)) { bonus += rules.lethalBonus; reasons.push({ label: "撃破できる見込み", value: rules.lethalBonus, kind: "add" }); }
      if (group) { const value = Math.max(0, targets.length - 1) * rules.extraTargetBonus; bonus += value; if (value) reasons.push({ label: `対象${targets.length}体`, value, kind: "add" }); }
      if (actor.currentMp / actor.maxMp < rules.lowMpRate) { bonus += rules.lowMpPenalty; reasons.push({ label: "MP残量が少ない", value: rules.lowMpPenalty, kind: "add" }); }
      return bonus;
    }

    evaluateSupport(actor, action, targets, reasons) {
      const rules = this.battle.data.ai.support;
      let bonus = 0;
      const effect = DQ.ActionSchema.getPrimaryEffect(action, "modifyStat");
      if (targets.length === 3) { bonus += rules.fullPartyBonus; reasons.push({ label: "味方3人生存", value: rules.fullPartyBonus, kind: "add" }); }
      const opponents = this.battle.getLiving(actor.side === "ally" ? "enemy" : "ally");
      if (Math.max(...opponents.map(unit => unit.attack)) >= rules.strongEnemyAttack) { bonus += rules.strongEnemyBonus; reasons.push({ label: "強力な物理攻撃の敵", value: rules.strongEnemyBonus, kind: "add" }); }
      const stat = effect?.stat || "defense";
      const affinities = targets.map(target => Number(target.aiTraits.buffAffinity[stat] ?? 1));
      const affinity = affinities.reduce((sum, value) => sum + value, 0) / affinities.length;
      const affinityAdjustment = Math.round((affinity - 1) * 40);
      if (affinityAdjustment) {
        bonus += affinityAdjustment;
        reasons.push({ label: `${{ attack: "攻撃", defense: "守備", speed: "素早さ" }[stat] || stat}強化適性 ×${affinity.toFixed(2)}`, value: affinityAdjustment, kind: "add" });
      }
      if (stat === "attack" && !isGroupTarget(action)) {
        const value = Math.round(targets[0].effectiveAttack * affinity / Math.max(1, rules.statValueDivisor || 1));
        bonus += value;
        reasons.push({ label: "対象の攻撃力を活かせる", value, kind: "add" });
      }
      if (affinity < rules.lowAffinityThreshold) {
        bonus += rules.lowAffinityPenalty;
        reasons.push({ label: "この強化に不向きな職業", value: rules.lowAffinityPenalty, kind: "add" });
      }
      const active = targets.filter(unit => unit.buffs[stat]?.turns > 0).length;
      if (!active) { bonus += rules.unusedBonus; reasons.push({ label: "強化が未使用", value: rules.unusedBonus, kind: "add" }); }
      if (active === targets.length) { bonus += rules.activePenalty; reasons.push({ label: "すでに全員強化済み", value: rules.activePenalty, kind: "add" }); }
      return bonus;
    }

    evaluateInstantDeath(actor, action, targets, reasons) {
      const rules = this.battle.data.ai.instantDeath;
      let bonus = 0;
      const values = targets.map(target => actor.side === "ally" ? this.battle.knowledge.get(target.templateId, "instantDeath") : 0);
      const learning = values.reduce((sum, value) => sum + value, 0) / values.length * rules.learningMultiplier;
      if (learning) { bonus += learning; reasons.push({ label: "即死の学習値", value: learning, kind: "add" }); }
      if (isGroupTarget(action)) { const value = Math.max(0, targets.length - 1) * rules.extraTargetBonus; bonus += value; if (value) reasons.push({ label: `対象${targets.length}体`, value, kind: "add" }); }
      if (targets.every(target => target.hpRate < rules.lowEnemyHpRate)) { bonus += rules.lowEnemyHpPenalty; reasons.push({ label: "通常攻撃で倒せそう", value: rules.lowEnemyHpPenalty, kind: "add" }); }
      if (actor.currentMp / actor.maxMp < rules.lowMpRate) { bonus += rules.lowMpPenalty; reasons.push({ label: "MP残量が少ない", value: rules.lowMpPenalty, kind: "add" }); }
      return bonus;
    }

    randomInt(min, max) { return Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min); }
  }

  DQ.isGroupTarget = isGroupTarget;
  DQ.BattleAI = BattleAI;
})(window.DQ = window.DQ || {});
