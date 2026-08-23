(function (DQ) {
  "use strict";

  class Battle {
    constructor(ui, store) {
      this.ui = ui;
      this.store = store;
      this.log = new DQ.BattleLog(document.querySelector("#battle-log"));
      this.encounterId = null;
    }

    reset() {
      this.stopAuto();
      this.data = this.store.getData();
      const allies = this.data.jobs.filter(job => job.enabled).slice(0, 3)
        .map((job, formationIndex) => new DQ.Character(job, "ally", { formationIndex }));
      this.battleNumber = 1;
      this.initializeBattle(allies, true);
    }

    createEnemies() {
      const encounters = this.data.encounters || [];
      if (!encounters.some(encounter => encounter.id === this.encounterId)) {
        this.encounterId = encounters.some(encounter => encounter.id === this.data.selectedEncounterId)
          ? this.data.selectedEncounterId : encounters[0]?.id;
      }
      const encounter = this.getEncounter();
      const enemyTemplates = (encounter?.members || []).flatMap(member => {
        const template = this.data.enemies.find(enemy => enemy.id === member.enemyId);
        return template ? Array.from({ length: Number(member.count) }, () => template) : [];
      }).slice(0, 3);
      const totals = enemyTemplates.reduce((map, enemy) => map.set(enemy.id, (map.get(enemy.id) || 0) + 1), new Map());
      const occurrences = new Map();
      return enemyTemplates.map(template => {
        const index = (occurrences.get(template.id) || 0) + 1;
        occurrences.set(template.id, index);
        const duplicate = totals.get(template.id) > 1;
        return new DQ.Character(template, "enemy", {
          instanceId: duplicate ? `${template.id}__${index}` : template.id,
          name: `${template.battleName || template.name}${duplicate ? String.fromCharCode(64 + index) : ""}`,
        });
      });
    }

    initializeBattle(allies, clearLog, transitionMessages = []) {
      const enemies = this.createEnemies();
      this.characters = [...allies, ...enemies];
      this.turn = 1;
      if (clearLog || !this.data.strategies.some(strategy => strategy.id === this.strategy)) {
        this.strategy = this.data.strategies[0]?.id || "balanced";
      }
      this.ended = false;
      this.busy = false;
      this.actionQueue = [];
      this.knowledge = new DQ.EnemyKnowledge(enemies);
      this.ai = new DQ.BattleAI(this);
      if (clearLog) {
        this.log.clear();
        this.log.add("戦闘開始。味方AIの作戦を選んでください。", "system");
      } else {
        this.log.add(`── 連戦 ${this.battleNumber}：${this.getEncounter()?.name || "次の戦闘"} ──`, "turn");
        transitionMessages.forEach(message => this.log.add(message, "heal"));
        this.log.add("強化効果と耐性学習をリセットして次の戦闘を開始。", "system");
      }
      this.ui.hideResult();
      this.ui.clearDecision();
      this.ui.renderStrategyOptions();
      this.ui.renderEncounterOptions();
      this.ui.render();
    }

    startConsecutiveBattle(encounterId = this.encounterId, recoveryMode = "none") {
      if (!this.ended || !this.getLiving("ally").length) return false;
      if (this.data.encounters.some(encounter => encounter.id === encounterId)) {
        this.encounterId = encounterId;
        this.store.setSelectedEncounter(encounterId);
      }
      const allies = this.characters.filter(unit => unit.side === "ally");
      allies.forEach(unit => {
        unit.currentHp = Math.max(0, Math.min(unit.maxHp, unit.currentHp));
        unit.currentMp = Math.max(0, Math.min(unit.maxMp, unit.currentMp));
        unit.alive = unit.currentHp > 0;
        unit.lastDecision = null;
        Object.values(unit.buffs).forEach(buff => {
          buff.value = buff.mode === "multiply" ? 1 : 0;
          buff.turns = 0;
          buff.stacks = 0;
        });
      });
      const recoveryMessages = this.applyConsecutiveRecovery(allies, recoveryMode);
      this.battleNumber = Number(this.battleNumber || 1) + 1;
      this.initializeBattle(allies, false, recoveryMessages);
      return true;
    }

    applyConsecutiveRecovery(allies, mode) {
      if (mode === "mp") {
        const recovered = allies.reduce((sum, unit) => sum + Math.max(0, unit.maxMp - unit.currentMp), 0);
        allies.forEach(unit => { unit.currentMp = unit.maxMp; });
        return [`連戦前回復：MPのみ${recovered}回復。HPはそのまま引き継ぎ。`];
      }
      if (mode !== "hp") return ["連戦前回復：なし。現在のHP・MPをそのまま引き継ぎ。"];
      const recovery = this.recoverHpWithMagic(allies);
      if (!recovery.hpRecovered) {
        const reason = recovery.remainingHp ? "回復呪文を使える味方またはMPが不足。" : "生存者のHPはすでに満タン。";
        return [`連戦前回復：HP回復なし（${reason}）`];
      }
      const casts = recovery.casts.map(cast => `${cast.actorName}の${cast.actionName}×${cast.count}`).join("、");
      const messages = [`連戦前回復：${casts}。HPを${recovery.hpRecovered}回復し、MPを${recovery.mpSpent}消費。`];
      if (recovery.remainingHp) messages.push(`MP不足のため、残り${recovery.remainingHp}HPは回復できなかった。`);
      return messages;
    }

    recoverHpWithMagic(allies) {
      const castCounts = new Map();
      let hpRecovered = 0;
      let mpSpent = 0;
      let safety = 0;
      while (safety++ < 500) {
        const damaged = allies.filter(unit => unit.alive && unit.currentHp < unit.maxHp);
        if (!damaged.length) break;
        const choices = [];
        allies.filter(unit => unit.alive).forEach(actor => {
          actor.actions.map(actionId => this.getAction(actionId))
            .filter(action => action?.type === "heal" && ["allyOne", "allAllies", "self"].includes(action.target))
            .forEach(action => {
              const mpCost = Math.max(0, Number(action.mpCost || 0));
              const power = Math.max(0, Number(action.power || 0));
              if (!power || actor.currentMp < mpCost) return;
              const targets = action.target === "self" ? damaged.filter(target => target === actor) : damaged;
              if (!targets.length) return;
              if (action.target === "allAllies") {
                const effectiveHeal = targets.reduce((sum, target) => sum + Math.min(power, target.maxHp - target.currentHp), 0);
                choices.push({ actor, action, targets, mpCost, power, effectiveHeal });
              } else {
                targets.forEach(target => choices.push({ actor, action, targets: [target], mpCost, power, effectiveHeal: Math.min(power, target.maxHp - target.currentHp) }));
              }
            });
        });
        if (!choices.length) break;
        choices.sort((a, b) => {
          const aEfficiency = a.mpCost ? a.effectiveHeal / a.mpCost : Infinity;
          const bEfficiency = b.mpCost ? b.effectiveHeal / b.mpCost : Infinity;
          return bEfficiency - aEfficiency || b.effectiveHeal - a.effectiveHeal || a.mpCost - b.mpCost;
        });
        const choice = choices[0];
        choice.actor.currentMp -= choice.mpCost;
        mpSpent += choice.mpCost;
        choice.targets.forEach(target => {
          const amount = Math.min(choice.power, target.maxHp - target.currentHp);
          target.currentHp += amount;
          hpRecovered += amount;
        });
        const key = `${choice.actor.id}:${choice.action.id}`;
        const record = castCounts.get(key) || { actorName: choice.actor.name, actionName: this.actionName(choice.action), count: 0 };
        record.count += 1;
        castCounts.set(key, record);
      }
      return {
        hpRecovered,
        mpSpent,
        casts: [...castCounts.values()],
        remainingHp: allies.filter(unit => unit.alive).reduce((sum, unit) => sum + Math.max(0, unit.maxHp - unit.currentHp), 0),
      };
    }

    getAction(id) { return this.data.actions.find(action => action.id === id); }
    getEncounter() { return this.data.encounters.find(encounter => encounter.id === this.encounterId) || this.data.encounters[0]; }
    getStrategy() { return this.data.strategies.find(strategy => strategy.id === this.strategy) || this.data.strategies[0]; }
    getBalancedStrategy() { return this.data.strategies.find(strategy => strategy.id === "balanced") || { name: "補正なし" }; }
    getLiving(side) { return this.characters.filter(unit => unit.side === side && unit.alive); }
    getCharacter(id) { return this.characters.find(unit => unit.id === id); }

    setEncounter(encounterId) {
      if (!this.data.encounters.some(encounter => encounter.id === encounterId)) return;
      this.encounterId = encounterId;
      this.store.setSelectedEncounter(encounterId);
      this.reset();
    }

    setStrategy(strategy) {
      this.strategy = strategy;
    }

    refreshData() {
      this.data = this.store.getData();
      this.characters.forEach(actor => {
        const collection = actor.side === "ally" ? this.data.jobs : this.data.enemies;
        const template = collection.find(item => item.id === actor.templateId);
        if (template) {
          actor.allActions = [...template.actions];
          actor.actionLevels = { ...(template.actionLevels || {}) };
          actor.actions = actor.side === "enemy" ? [...actor.allActions] : actor.allActions.filter(actionId => Number(actor.actionLevels[actionId] ?? 1) <= actor.level);
        }
      });
      if (!this.data.strategies.some(strategy => strategy.id === this.strategy)) this.strategy = this.data.strategies[0].id;
      if (this.actionQueue.length) this.setStrategy(this.strategy);
      this.ui.renderStrategyOptions();
      this.ui.renderEncounterOptions();
      this.ui.render();
      this.log.add("編集した技・割り当て・作戦・AI設定を現在の戦闘へ反映しました。", "system");
    }

    estimatePhysicalDamage(actor, target, action) {
      const multiplier = Number(action.powerMultiplier ?? (action.id === "attack" ? 1 : action.power || 1));
      const resistance = action.element ? (target.resistances[action.element] ?? 1) : 1;
      return Math.max(1, Math.round((actor.effectiveAttack * multiplier - target.effectiveDefense * 0.48) * resistance));
    }
    estimateMagicDamage(action, target) {
      return Math.max(1, Math.round(Number(action.power) * (target.resistances[action.element] ?? 1)));
    }

    async runTurn() {
      if (this.busy || this.ended) return;
      this.busy = true;
      this.ui.setControlsDisabled(true);
      try {
        if (!this.actionQueue.length) this.prepareTurn();
        while (this.actionQueue.length && !this.ended) {
          const item = this.actionQueue.shift();
          if (!item.actor.alive) continue;
          const decision = this.decideAtActionTime(item.actor);
          if (!decision.selected) continue;
          await this.executeDecision(item.actor, decision);
          this.checkBattleEnd();
        }
        if (!this.ended) this.finishTurn();
        this.ui.render();
        this.showStrategyDecision();
      } catch (error) { this.handleError(error); }
      finally { this.busy = false; this.ui.setControlsDisabled(false); }
    }

    async stepAction() {
      if (this.busy || this.ended) return;
      this.busy = true;
      this.ui.setControlsDisabled(true);
      try {
        if (!this.actionQueue.length) this.prepareTurn();
        let item = null;
        while (this.actionQueue.length && !item) {
          const next = this.actionQueue.shift();
          if (next.actor.alive) item = next;
        }
        if (item) {
          const decision = this.decideAtActionTime(item.actor);
          if (decision.selected) await this.executeDecision(item.actor, decision);
          this.checkBattleEnd();
        }
        if (!this.ended && !this.actionQueue.length) this.finishTurn();
        this.ui.render();
      } catch (error) { this.handleError(error); }
      finally { this.busy = false; this.ui.setControlsDisabled(false); }
    }

    prepareTurn() {
      this.log.add(`── TURN ${this.turn} ──`, "turn");
      this.actionQueue = [...this.getLiving("ally"), ...this.getLiving("enemy")]
        .map(actor => ({ actor, initiative: this.rollInitiative(actor) }));
      this.sortActionQueue();
    }

    decideAtActionTime(actor) {
      const decision = this.ai.decide(actor);
      actor.lastDecision = decision;
      return decision;
    }

    rollInitiative(actor, randomValue = Math.random()) {
      const rules = this.data.ai.turnOrder || {};
      const min = Number(rules.minMultiplier ?? 0.75);
      const max = Number(rules.maxMultiplier ?? 1.25);
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      return actor.effectiveSpeed * (low + (high - low) * randomValue);
    }

    sortActionQueue() {
      this.actionQueue.sort((a, b) => b.initiative - a.initiative || Math.random() - 0.5);
    }

    finishTurn() {
      this.characters.forEach(unit => Object.entries(unit.buffs).forEach(([stat, buff]) => {
        if (buff.turns > 0 && --buff.turns === 0) {
          buff.value = buff.mode === "multiply" ? 1 : 0;
          buff.stacks = 0;
          if (unit.alive) this.log.add(`${unit.name}の${this.statLabel(stat)}が元に戻った。`, "system");
        }
      }));
      this.turn += 1;
    }

    showStrategyDecision() {
      const preferred = this.getLiving("ally").map(actor => actor.lastDecision).filter(Boolean)
        .sort((a, b) => b.candidates.length - a.candidates.length)[0];
      if (preferred?.selected) this.ui.showDecision(preferred);
    }

    async executeDecision(actor, decision) {
      const candidate = decision.selected;
      const action = candidate.action;
      let targets = candidate.targets.filter(target => target.alive);
      if (!targets.length) targets = this.ai.getTargets(actor, action);
      if (!targets.length) { this.log.add(`${actor.name}は行動しようとしたが、対象がいなかった。`, "system"); return; }
      if (!DQ.isGroupTarget(action)) targets = [targets[0]];
      actor.currentMp -= Number(action.mpCost);
      if (actor.side === "ally") this.ui.showDecision(decision);
      this.ui.markActing(actor.id, targets.map(target => target.id));
      await this.pause(150);
      if (action.type === "attack") this.executeAttack(actor, action, targets[0]);
      if (action.type === "heal") this.executeHeal(actor, action, targets[0]);
      if (action.type === "magic") this.executeMagic(actor, action, targets);
      if (action.type === "support") this.executeSupport(actor, action, targets);
      if (action.type === "instantDeath") this.executeInstantDeath(actor, action, targets);
      this.updateDeaths();
      this.ui.render();
      await this.pause(100);
    }

    actionName(action) { return action.battleName || action.name; }
    executeAttack(actor, action, target) {
      const damage = Math.max(1, Math.round(this.estimatePhysicalDamage(actor, target, action) * (0.88 + Math.random() * 0.24)));
      target.currentHp = Math.max(0, target.currentHp - damage);
      this.log.add(`${actor.name}の${this.actionName(action)}！ ${target.name}に${damage}ダメージ。`);
      const recoil = Math.round(damage * Number(action.recoilRate || 0));
      if (recoil > 0) {
        actor.currentHp = Math.max(0, actor.currentHp - recoil);
        this.log.add(`${actor.name}は反動で${recoil}ダメージを受けた。`, "danger");
      }
    }
    executeHeal(actor, action, target) {
      const amount = Math.min(target.maxHp - target.currentHp, Math.round(Number(action.power) * (0.92 + Math.random() * 0.16)));
      target.currentHp += amount;
      this.log.add(`${actor.name}は${this.actionName(action)}を唱えた。${target.name}のHPが${amount}回復。`, "heal");
    }
    executeMagic(actor, action, targets) {
      this.log.add(`${actor.name}は${this.actionName(action)}を唱えた！`, "magic");
      targets.forEach(target => {
        const damage = Math.max(1, Math.round(this.estimateMagicDamage(action, target) * (0.9 + Math.random() * 0.2)));
        target.currentHp = Math.max(0, target.currentHp - damage);
        this.log.add(`${target.name}に${damage}ダメージ。`, "magic");
      });
    }
    executeSupport(actor, action, targets) {
      const stat = action.effectStat || "defense";
      const mode = action.effectMode || "add";
      const amount = Number(action.effectValue ?? action.power ?? 0);
      const duration = Math.max(1, Number(action.duration || 4));
      const maxStacks = Math.max(1, Number(action.maxStacks || 1));
      targets.forEach(target => {
        const buff = target.buffs[stat] || (target.buffs[stat] = { mode, value: mode === "multiply" ? 1 : 0, turns: 0, stacks: 0 });
        buff.mode = mode;
        if (mode === "multiply") buff.value = Math.max(buff.value, amount);
        else if (buff.stacks < maxStacks) buff.value += amount;
        buff.stacks = Math.min(maxStacks, buff.stacks + 1);
        buff.turns = duration;
      });
      this.log.add(`${actor.name}は${this.actionName(action)}を唱えた。${targets.map(target => target.name).join("、")}の${this.statLabel(stat)}が上がった！`, "heal");
    }

    statLabel(stat) { return { attack: "攻撃力", defense: "守備力", speed: "素早さ" }[stat] || stat; }
    executeInstantDeath(actor, action, targets) {
      this.log.add(`${actor.name}は${this.actionName(action)}を唱えた！`, "magic");
      targets.forEach(target => {
        const success = Math.random() < Number(action.successRate) * (target.resistances.instantDeath ?? 1);
        if (success) { target.currentHp = 0; this.log.add(`${target.name}の息の根を止めた！`, "danger"); }
        else this.log.add(`${target.name}には効かなかった。`, "system");
        if (actor.side === "ally" && target.side === "enemy") {
          const value = this.knowledge.update(target.templateId, "instantDeath", success ? 1 : -1);
          this.log.add(`AI学習：${target.name}の即死有効度を ${value > 0 ? "+" : ""}${value} に更新。`, "learn");
        }
      });
    }

    updateDeaths() {
      this.characters.forEach(unit => {
        if (unit.alive && unit.currentHp <= 0) { unit.alive = false; unit.currentHp = 0; this.log.add(`${unit.name}は戦闘不能になった。`, "danger"); }
      });
    }
    checkBattleEnd() {
      const allies = this.getLiving("ally");
      const enemies = this.getLiving("enemy");
      if (allies.length && enemies.length) return;
      this.ended = true;
      this.stopAuto();
      const victory = allies.length > 0;
      this.log.add(victory ? "戦闘に勝利した！" : "味方パーティーは全滅した……", victory ? "heal" : "danger");
      this.ui.showResult(victory, this.turn);
    }
    startAuto() {
      if (this.ended || this.autoTimer) return;
      this.ui.setAutoState(true);
      const loop = async () => {
        if (!this.autoTimer || this.ended) return;
        await this.runTurn();
        if (this.autoTimer && !this.ended) this.autoTimer = setTimeout(loop, this.ui.autoSpeed);
      };
      this.autoTimer = setTimeout(loop, 100);
    }
    stopAuto() { if (this.autoTimer) clearTimeout(this.autoTimer); this.autoTimer = null; this.ui?.setAutoState(false); }
    pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    handleError(error) { console.error(error); this.log.add("行動処理中にエラーが発生しました。", "danger"); }
  }

  DQ.Battle = Battle;
})(window.DQ = window.DQ || {});
