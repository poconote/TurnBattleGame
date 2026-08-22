(function (DQ) {
  "use strict";

  const isGroupTarget = action => action.target === "allAllies" || action.target === "allEnemies";

  class BattleAI {
    constructor(battle) { this.battle = battle; }

    decide(actor) {
      const candidates = [];
      for (const actionId of actor.actions) {
        const action = this.battle.getAction(actionId);
        if (!action) continue;
        const targets = this.getTargets(actor, action);
        if (actor.currentMp < action.mpCost) {
          candidates.push(this.unavailable(action, "MPが足りない"));
        } else if (!targets.length) {
          candidates.push(this.unavailable(action, "有効な対象がいない"));
        } else if (isGroupTarget(action)) {
          candidates.push(this.evaluate(actor, action, targets));
        } else {
          targets.forEach(target => candidates.push(this.evaluate(actor, action, [target])));
        }
      }
      const usable = candidates.filter(candidate => candidate.available).sort((a, b) => b.finalScore - a.finalScore);
      return {
        actorId: actor.id,
        turn: this.battle.turn,
        strategy: this.battle.strategy,
        selected: usable[0] || null,
        candidates: [...usable, ...candidates.filter(candidate => !candidate.available)],
      };
    }

    unavailable(action, reason) {
      return { action, targets: [], available: false, finalScore: -Infinity, reasons: [{ label: reason, value: "使用不可" }] };
    }

    getTargets(actor, action) {
      const allies = this.battle.getLiving(actor.side);
      const enemies = this.battle.getLiving(actor.side === "ally" ? "enemy" : "ally");
      if (action.target === "self") return [actor];
      if (action.target === "allyOne" || action.target === "allAllies") {
        return action.type === "heal" ? allies.filter(unit => unit.currentHp < unit.maxHp) : allies;
      }
      return enemies;
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
      const random = this.randomInt(this.battle.data.ai.randomMin, this.battle.data.ai.randomMax);
      score += random;
      reasons.push({ label: "ランダム補正", value: random, kind: "add" });
      return { action, targets, available: true, finalScore: Math.round(score), reasons };
    }

    evaluateAttack(actor, action, target, reasons) {
      const rules = this.battle.data.ai.attack;
      let bonus = 0;
      const damage = this.battle.estimatePhysicalDamage(actor, target, action);
      if (action.element) {
        const resistance = target.resistances[action.element] ?? 1;
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
      rules.thresholds.forEach(rule => {
        if (target.hpRate < rule.rate) {
          bonus += Number(rule.score);
          reasons.push({ label: `HP ${Math.round(rule.rate * 100)}%未満`, value: Number(rule.score), kind: "add" });
        }
      });
      const missing = target.maxHp - target.currentHp;
      const wasted = Math.max(0, Number(action.power) - missing);
      if (wasted > Number(action.power) * rules.wasteRate) { bonus += rules.wastePenalty; reasons.push({ label: "回復量の一部が無駄", value: rules.wastePenalty, kind: "add" }); }
      const expectedRate = Math.min(target.maxHp, target.currentHp + Number(action.power)) / target.maxHp;
      if (target.hpRate < 0.25 && expectedRate < rules.unsafeRate) { bonus += rules.unsafePenalty; reasons.push({ label: "回復後も危険域", value: rules.unsafePenalty, kind: "add" }); }
      if (actor.currentMp / Math.max(1, actor.maxMp) > rules.mpEnoughRate) { bonus += rules.mpEnoughBonus; reasons.push({ label: "MP残量十分", value: rules.mpEnoughBonus, kind: "add" }); }
      return bonus;
    }

    evaluateMagic(actor, action, targets, reasons) {
      const rules = this.battle.data.ai.magic;
      let bonus = 0;
      const group = action.target === "allEnemies";
      const weak = targets.filter(target => (target.resistances[action.element] ?? 1) >= rules.weakThreshold).length;
      const resistant = targets.filter(target => (target.resistances[action.element] ?? 1) <= rules.resistThreshold).length;
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
      if (targets.length === 3) { bonus += rules.fullPartyBonus; reasons.push({ label: "味方3人生存", value: rules.fullPartyBonus, kind: "add" }); }
      const opponents = this.battle.getLiving(actor.side === "ally" ? "enemy" : "ally");
      if (Math.max(...opponents.map(unit => unit.attack)) >= rules.strongEnemyAttack) { bonus += rules.strongEnemyBonus; reasons.push({ label: "強力な物理攻撃の敵", value: rules.strongEnemyBonus, kind: "add" }); }
      const stat = action.effectStat || "defense";
      const affinities = targets.map(target => Number(target.aiTraits.buffAffinity[stat] ?? 1));
      const affinity = affinities.reduce((sum, value) => sum + value, 0) / affinities.length;
      const affinityAdjustment = Math.round((affinity - 1) * 40);
      if (affinityAdjustment) {
        bonus += affinityAdjustment;
        reasons.push({ label: `${{ attack: "攻撃", defense: "守備", speed: "素早さ" }[stat] || stat}強化適性 ×${affinity.toFixed(2)}`, value: affinityAdjustment, kind: "add" });
      }
      if (stat === "attack" && action.target === "allyOne") {
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
      if (action.target === "allEnemies") { const value = Math.max(0, targets.length - 1) * rules.extraTargetBonus; bonus += value; if (value) reasons.push({ label: `対象${targets.length}体`, value, kind: "add" }); }
      if (targets.every(target => target.hpRate < rules.lowEnemyHpRate)) { bonus += rules.lowEnemyHpPenalty; reasons.push({ label: "通常攻撃で倒せそう", value: rules.lowEnemyHpPenalty, kind: "add" }); }
      if (actor.currentMp / actor.maxMp < rules.lowMpRate) { bonus += rules.lowMpPenalty; reasons.push({ label: "MP残量が少ない", value: rules.lowMpPenalty, kind: "add" }); }
      return bonus;
    }

    randomInt(min, max) { return Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min); }
  }

  DQ.isGroupTarget = isGroupTarget;
  DQ.BattleAI = BattleAI;
})(window.DQ = window.DQ || {});
