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
      const allies = this.data.jobs.filter(job => job.enabled).slice(0, 3).map(job => new DQ.Character(job, "ally"));
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
      const enemies = enemyTemplates.map(template => {
        const index = (occurrences.get(template.id) || 0) + 1;
        occurrences.set(template.id, index);
        const duplicate = totals.get(template.id) > 1;
        return new DQ.Character(template, "enemy", {
          instanceId: duplicate ? `${template.id}__${index}` : template.id,
          name: `${template.battleName || template.name}${duplicate ? String.fromCharCode(64 + index) : ""}`,
        });
      });
      this.characters = [...allies, ...enemies];
      this.turn = 1;
      this.strategy = this.data.strategies[0]?.id || "balanced";
      this.ended = false;
      this.busy = false;
      this.actionQueue = [];
      this.knowledge = new DQ.EnemyKnowledge(enemies);
      this.ai = new DQ.BattleAI(this);
      this.log.clear();
      this.log.add("戦闘開始。味方AIの作戦を選んでください。", "system");
      this.ui.hideResult();
      this.ui.clearDecision();
      this.ui.renderStrategyOptions();
      this.ui.renderEncounterOptions();
      this.ui.render();
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
      this.actionQueue = this.actionQueue.map(item => {
        const decision = this.ai.decide(item.actor);
        item.actor.lastDecision = decision;
        return { actor: item.actor, decision };
      }).filter(item => item.decision.selected);
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
          await this.executeDecision(item.actor, item.decision);
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
        if (item) { await this.executeDecision(item.actor, item.decision); this.checkBattleEnd(); }
        if (!this.ended && !this.actionQueue.length) this.finishTurn();
        this.ui.render();
      } catch (error) { this.handleError(error); }
      finally { this.busy = false; this.ui.setControlsDisabled(false); }
    }

    prepareTurn() {
      this.log.add(`── TURN ${this.turn} ──`, "turn");
      this.actionQueue = [...this.getLiving("ally"), ...this.getLiving("enemy")].map(actor => {
        const decision = this.ai.decide(actor);
        actor.lastDecision = decision;
        return { actor, decision };
      }).filter(item => item.decision.selected);
      this.actionQueue.sort((a, b) => Number(b.decision.selected.action.priority || 0) - Number(a.decision.selected.action.priority || 0)
        || b.actor.effectiveSpeed - a.actor.effectiveSpeed || Math.random() - 0.5);
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
