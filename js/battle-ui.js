(function (DQ) {
  "use strict";

  class BattleUI {
    constructor() {
      this.autoSpeed = 800;
      this.selectedDecisionActor = null;
      this.cache();
    }
    attachBattle(battle) { this.battle = battle; this.bind(); }
    cache() {
      this.enemyParty = document.querySelector("#enemy-party");
      this.allyParty = document.querySelector("#ally-party");
      this.turnNumber = document.querySelector("#turn-number");
      this.status = document.querySelector("#battle-status");
      this.stepButton = document.querySelector("#step-action");
      this.nextButton = document.querySelector("#next-turn");
      this.autoButton = document.querySelector("#auto-battle");
      this.strategySelect = document.querySelector("#strategy-select");
      this.encounterSelect = document.querySelector("#encounter-select");
      this.decisionEmpty = document.querySelector("#decision-empty");
      this.decisionContent = document.querySelector("#decision-content");
      this.candidateList = document.querySelector("#candidate-list");
      this.detailOverlay = document.querySelector("#character-detail-overlay");
      this.detailContent = document.querySelector("#character-detail-content");
      this.detailTitle = document.querySelector("#character-detail-name");
      this.detailCloseButton = document.querySelector("#character-detail-close");
    }
    bind() {
      this.stepButton.addEventListener("click", () => this.battle.ended ? this.battle.reset() : this.battle.stepAction());
      this.nextButton.addEventListener("click", () => this.battle.runTurn());
      this.autoButton.addEventListener("click", () => this.battle.autoTimer ? this.battle.stopAuto() : this.battle.startAuto());
      document.querySelector("#reset-battle").addEventListener("click", () => this.battle.reset());
      document.querySelector("#result-close").addEventListener("click", () => this.hideResult());
      document.querySelector("#result-continue").addEventListener("click", () => {
        this.battle.startConsecutiveBattle(
          document.querySelector("#result-encounter").value,
          document.querySelector("#result-recovery").value,
        );
      });
      document.querySelector("#clear-log").addEventListener("click", () => this.battle.log.clear());
      this.detailCloseButton.addEventListener("click", () => this.closeCharacterDetail());
      this.detailOverlay.addEventListener("click", event => {
        if (event.target === this.detailOverlay) this.closeCharacterDetail();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && this.detailCharacterId) this.closeCharacterDetail();
      });
      this.strategySelect.addEventListener("change", event => {
        this.battle.setStrategy(event.target.value);
        this.battle.log.add(`作戦を「${this.battle.getStrategy().name}」に変更した。`, "system");
      });
      this.encounterSelect.addEventListener("change", event => this.battle.setEncounter(event.target.value));
      document.querySelectorAll(".speed-button").forEach(button => button.addEventListener("click", () => {
        document.querySelectorAll(".speed-button").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        this.autoSpeed = Number(button.dataset.speed);
      }));
    }
    renderStrategyOptions() {
      this.strategySelect.innerHTML = this.battle.data.strategies.map(strategy => `<option value="${this.escape(strategy.id)}">${this.escape(strategy.name)}</option>`).join("");
      this.strategySelect.value = this.battle.strategy;
    }
    renderEncounterOptions() {
      this.encounterSelect.innerHTML = this.battle.data.encounters.map(encounter => `<option value="${this.escape(encounter.id)}">Lv${Number(encounter.recommendedLevel || 1)} ${this.escape(encounter.name)}</option>`).join("");
      this.encounterSelect.value = this.battle.encounterId;
    }
    render() {
      this.turnNumber.textContent = this.battle.turn;
      this.status.textContent = this.battle.ended ? "戦闘終了" : "戦闘中";
      this.stepButton.textContent = this.battle.ended ? "↻ もう一度" : "▶ STEP 1人";
      if (!this.battle.busy) this.setControlsDisabled(false);
      this.enemyParty.innerHTML = this.battle.characters.filter(unit => unit.side === "enemy").map(unit => this.card(unit)).join("");
      this.allyParty.innerHTML = this.battle.characters.filter(unit => unit.side === "ally").map(unit => this.card(unit)).join("");
      document.querySelectorAll(".card-focus-trigger").forEach(button => button.addEventListener("click", () => {
        const actor = this.battle.getCharacter(button.dataset.characterId);
        if (actor) this.openCharacterDetail(actor, button);
      }));
      if (this.detailCharacterId) {
        const detailActor = this.battle.getCharacter(this.detailCharacterId);
        if (detailActor) this.updateCharacterDetail(detailActor);
        else this.closeCharacterDetail(false);
      }
      this.renderKnowledge();
    }
    card(unit) {
      const hp = Math.max(0, unit.hpRate * 100);
      const mp = unit.maxMp ? unit.currentMp / unit.maxMp * 100 : 0;
      const buffLabels = Object.entries(unit.buffs).filter(([, effect]) => effect.turns > 0).map(([stat, effect]) => {
        const label = { attack: "攻", defense: "守", speed: "速" }[stat] || stat;
        const value = effect.mode === "multiply" ? `×${effect.value}` : `+${effect.value}`;
        return `<span class="state-badge">${label}${value} ${effect.turns}</span>`;
      }).join("");
      const statusLabels = this.battle.statusEngine.list(unit).map(status => {
        const definition = this.battle.statusEngine.definition(status.id);
        return `<span class="state-badge status ${this.escape(status.id)}">${this.escape(definition.badge)}${status.turns > 0 ? ` ${status.turns}` : ""}</span>`;
      }).join("");
      const reviveProtectionLabel = unit.side === "ally" && unit.alive && Number(unit.reviveProtectionUntilTurn || 0) >= this.battle.turn
        ? '<span class="state-badge">蘇生保護</span>' : "";
      return `<article class="character-card ${unit.alive ? "" : "dead"} ${this.selectedDecisionActor === unit.id ? "selected" : ""}" data-id="${this.escape(unit.id)}" data-role="${this.escape(unit.role)}">
        <button type="button" class="card-focus-trigger" data-character-id="${this.escape(unit.id)}" aria-label="${this.escape(`${unit.name}のステータスと使える技を表示`)}"></button>
        <div class="character-visual"><div class="sprite">${this.escape(unit.icon)}</div></div>
        <div class="character-name-row"><span class="character-name">${this.escape(unit.name)}${unit.side === "ally" ? ` <small class="level-badge">Lv.${unit.level}</small>` : ""}</span><span class="state-badges">${buffLabels}${statusLabels}${reviveProtectionLabel}</span></div>
        <div class="stat-line"><div class="stat-values"><span>HP</span><b>${unit.currentHp} / ${unit.maxHp}</b></div><div class="bar"><span class="hp-bar ${hp < 25 ? "low" : ""}" style="width:${hp}%"></span></div></div>
        <div class="stat-line"><div class="stat-values"><span>MP</span><b>${unit.currentMp} / ${unit.maxMp}</b></div><div class="bar"><span class="mp-bar" style="width:${mp}%"></span></div></div>
        ${unit.alive ? "" : '<div class="dead-label">戦闘不能</div>'}</article>`;
    }
    statusDetail(unit) {
      const statValue = (base, effective) => Math.round(base) === Math.round(effective)
        ? `${Math.round(base)}`
        : `${Math.round(base)} → ${Math.round(effective)}`;
      const totalActionWeight = unit.side === "enemy" ? unit.actions.reduce((sum, actionId) => sum + Math.max(0, Number(unit.actionWeights?.[actionId] ?? 1)), 0) : 0;
      const actionRows = unit.actions.map(actionId => {
        const action = this.battle.getAction(actionId);
        if (!action) return "";
        const mpCost = Number(action.mpCost || 0);
        const available = action.battleUsable !== false && unit.alive && unit.currentMp >= mpCost;
        const note = action.battleUsable === false ? "・戦闘外" : available ? "" : "・不足";
        const probability = unit.side === "enemy" && totalActionWeight > 0 ? `${(Math.max(0, Number(unit.actionWeights?.[actionId] ?? 1)) / totalActionWeight * 100).toFixed(1)}%・` : "";
        return `<li class="${available ? "" : "unavailable"}"><span>${this.escape(action.battleName || action.name)}</span><b>${probability}MP ${mpCost}${note}</b></li>`;
      }).join("");
      const resistanceRows = unit.side === "enemy" ? Object.entries(unit.resistances).map(([element, multiplier]) => {
        const labels = { fire: "炎", ice: "氷", wind: "風", bang: "爆発", zap: "デイン", instantDeath: "即死", poison: "毒", blind: "幻惑", petrify: "石化", sleep: "眠り", silence: "呪文封じ", paralysis: "マヒ", confusion: "混乱" };
        const value = Number(multiplier);
        const state = value >= 1.15 ? "weak" : value > 1 ? "slightly-weak" : value <= 0.75 ? "strong-resistant" : value < 1 ? "resistant" : "normal";
        const stateLabel = { weak: "弱点", "slightly-weak": "やや弱点", "strong-resistant": "強耐性", resistant: "耐性", normal: "通常" }[state];
        return `<li class="${state}"><span>${labels[element] || this.escape(element)}</span><b>×${value.toFixed(2)}</b><small>${stateLabel}</small></li>`;
      }).join("") : "";
      const formationLabel = unit.side === "ally" ? this.battle.ai.formationLabel(unit) : null;
      const formationWeight = unit.side === "ally" ? this.battle.ai.enemyFormationWeight(unit) : null;
      const statusRows = this.battle.statusEngine.list(unit).map(status => `<li><span>${this.escape(this.battle.statusEngine.definition(status.id).name)}</span><b>${status.turns > 0 ? `残り${status.turns}ターン` : "治療まで継続"}</b></li>`).join("");
      return `<dl class="status-detail-grid">
          <div><dt>HP</dt><dd>${unit.currentHp} / ${unit.maxHp}</dd></div>
          <div><dt>MP</dt><dd>${unit.currentMp} / ${unit.maxMp}</dd></div>
          <div><dt>攻撃力</dt><dd>${statValue(unit.attack, unit.effectiveAttack)}</dd></div>
          <div><dt>守備力</dt><dd>${statValue(unit.defense, unit.effectiveDefense)}</dd></div>
          <div><dt>素早さ</dt><dd>${statValue(unit.speed, unit.effectiveSpeed)}</dd></div>
          ${unit.side === "ally" ? `<div><dt>レベル</dt><dd>${unit.level}</dd></div>` : ""}
          ${unit.side === "ally" ? `<div><dt>隊列</dt><dd>${formationLabel}</dd></div><div><dt>狙われやすさ</dt><dd>×${formationWeight}</dd></div>` : ""}
        </dl>
        ${statusRows ? `<div class="status-action-title">状態異常</div><ul class="status-action-list">${statusRows}</ul>` : ""}
        ${unit.side === "enemy" ? `<div class="status-action-title">弱点・耐性倍率</div><ul class="status-resistance-list">${resistanceRows}</ul>` : ""}
        <div class="status-action-title">使える技</div>
        <ul class="status-action-list">${actionRows || "<li><span>なし</span></li>"}</ul>`;
    }
    openCharacterDetail(unit, returnFocus = null) {
      this.detailCharacterId = unit.id;
      this.detailReturnFocus = returnFocus || document.activeElement || null;
      if (unit.side === "ally" && unit.lastDecision) this.showDecision(unit.lastDecision);
      this.updateCharacterDetail(unit);
      this.detailContent.scrollTop = 0;
      this.detailOverlay.classList.remove("hidden");
      document.body?.classList.add("detail-open");
      this.detailCloseButton.focus?.();
    }
    updateCharacterDetail(unit) {
      this.detailTitle.textContent = unit.name;
      this.detailContent.innerHTML = this.statusDetail(unit);
    }
    closeCharacterDetail(restoreFocus = true) {
      this.detailOverlay.classList.add("hidden");
      document.body?.classList.remove("detail-open");
      this.detailCharacterId = null;
      if (restoreFocus) this.detailReturnFocus?.focus?.();
      this.detailReturnFocus = null;
    }
    renderKnowledge() {
      const enemies = this.battle.characters.filter(unit => unit.side === "enemy").filter((enemy, index, all) => all.findIndex(item => item.templateId === enemy.templateId) === index);
      document.querySelector("#knowledge-list").innerHTML = enemies.map(enemy => {
        const value = this.battle.knowledge.get(enemy.templateId, "instantDeath");
        const label = value === 0 ? "不明" : value > 0 ? "有効そう" : value <= -2 ? "効きにくい" : "やや疑わしい";
        return `<div class="knowledge-item"><span class="knowledge-name">${this.escape(enemy.name)}</span><span class="knowledge-value">即死：${label}<b class="${value > 0 ? "positive" : value < 0 ? "negative" : ""}">${value > 0 ? "+" : ""}${value}</b></span></div>`;
      }).join("");
    }
    showDecision(decision) {
      const actor = this.battle.getCharacter(decision.actorId);
      if (!actor || !decision.selected) return;
      this.selectedDecisionActor = actor.id;
      this.decisionEmpty.classList.add("hidden");
      this.decisionContent.classList.remove("hidden");
      document.querySelector("#decision-turn").textContent = `TURN ${decision.turn}`;
      document.querySelector("#decision-actor-icon").textContent = actor.icon;
      document.querySelector("#decision-actor").textContent = `${actor.name}の判断`;
      document.querySelector("#decision-choice").textContent = `${decision.selected.action.battleName || decision.selected.action.name} → ${this.targetLabel(decision.selected.targets)}`;
      document.querySelector("#decision-score").textContent = decision.selected.finalScore;
      this.candidateList.innerHTML = decision.candidates.map((candidate, index) => `<button class="candidate-item ${index === 0 ? "winner active" : ""}" data-index="${index}" aria-controls="breakdown" aria-label="${this.escape(`${candidate.action.battleName || candidate.action.name}の評価内訳を表示`)}">
        <span class="candidate-rank">${candidate.available ? index + 1 : "–"}</span><span class="candidate-name">${this.escape(candidate.action.battleName || candidate.action.name)}<small>${candidate.available ? this.escape(this.candidateTargetLabel(candidate)) : this.escape(candidate.reasons[0].label)}</small></span><span class="candidate-score">${candidate.available ? `${candidate.finalScore}点` : "不可"}</span></button>`).join("");
      this.candidateList.querySelectorAll(".candidate-item").forEach(button => {
        const showCandidateSettings = () => {
          this.candidateList.querySelectorAll(".candidate-item").forEach(item => item.classList.remove("active"));
          button.classList.add("active");
          this.showBreakdown(decision.candidates[Number(button.dataset.index)]);
        };
        button.addEventListener("click", showCandidateSettings);
      });
      this.showBreakdown(decision.candidates[0]);
      this.render();
    }
    showBreakdown(candidate) {
      document.querySelector("#breakdown-action").textContent = candidate.action.battleName || candidate.action.name;
      document.querySelector("#breakdown-target").textContent = candidate.available ? `対象：${this.candidateTargetLabel(candidate)}` : "使用不可";
      const settings = this.actionSettingRows(candidate);
      const reasons = candidate.reasons.map(reason => {
        let value = reason.value;
        if (reason.kind === "multiply") value = `×${Number(value).toFixed(2)}`;
        else if (typeof value === "number") value = `${value >= 0 ? "+" : ""}${Math.round(value)}`;
        return `<div class="breakdown-row ${reason.kind === "multiply" ? "multiplier" : ""}"><span>${this.escape(reason.label)}</span><b>${value}</b></div>`;
      }).join("");
      document.querySelector("#action-setting-rows").innerHTML = settings;
      document.querySelector("#breakdown-rows").innerHTML = reasons;
      document.querySelector("#breakdown-total").textContent = candidate.available ? `${candidate.finalScore}点` : "使用不可";
    }
    actionSettingRows(candidate) {
      const action = candidate.action;
      const settings = candidate.settings || {};
      const typeLabels = { attack: "物理攻撃", heal: "回復", magic: "攻撃魔法", support: "補助・弱体", instantDeath: "即死", status: "状態異常", cure: "状態治療", revive: "蘇生", utility: "戦闘外・未対応" };
      const targetLabels = { enemyOne: "敵1体", allEnemies: "敵全体", allyOne: "味方1人", allAllies: "味方全体", self: "自分" };
      const elementLabels = { fire: "炎", ice: "氷", wind: "風", bang: "爆発", zap: "デイン" };
      const statLabels = { attack: "攻撃力", defense: "守備力", speed: "素早さ", magicResistance: "呪文耐性", breathResistance: "ブレス耐性", damageResistance: "全ダメージ耐性" };
      const rows = [
        ["行動タイプ", typeLabels[settings.type] || settings.type || "不明"],
        ["消費MP", settings.mpCost ?? Number(action.mpCost || 0)],
        ["対象設定", targetLabels[settings.target] || settings.target || "不明"],
        ["基本評価", `${settings.baseScore ?? Number(action.baseScore || 0)}点`],
      ];
      if (action.description) rows.push(["効果・補足", action.description]);
      if (settings.element) rows.push(["属性", elementLabels[settings.element] || settings.element]);
      if (settings.type === "magic") rows.push(["基礎威力", settings.power]);
      if (settings.type === "attack") {
        rows.push(["技威力倍率", `×${Number(settings.powerMultiplier || 1).toFixed(2)}`]);
        if (settings.recoilRate > 0) rows.push(["反動率", `${(Number(settings.recoilRate) * 100).toFixed(1)}%`]);
      }
      if (settings.type === "heal") rows.push(["基礎回復量", settings.power]);
      if (settings.type === "support") {
        rows.push(["強化対象", statLabels[settings.effectStat] || settings.effectStat || "不明"]);
        rows.push(["強化量", settings.effectMode === "multiply" ? `×${Number(settings.effectValue).toFixed(2)}` : `+${settings.effectValue}`]);
        rows.push(["効果ターン", settings.duration]);
        rows.push(["最大重ね掛け", settings.maxStacks]);
      }
      if (settings.type === "instantDeath") rows.push(["基本成功率", `${(Number(settings.successRate) * 100).toFixed(1)}%`]);
      const effectLabels = { damage: "ダメージ", heal: "HP回復", modifyStat: "能力変化", instantDeath: "即死", recoil: "反動", applyStatus: "状態異常付与", cureStatus: "状態異常治療", revive: "蘇生", drainMp: "MP吸収", sacrifice: "自己犠牲", noop: "効果なし" };
      const statusLabels = { poison: "毒", blind: "幻惑", petrify: "石化", sleep: "眠り", silence: "呪文封じ", paralysis: "マヒ", confusion: "混乱" };
      (settings.effectPreviews || []).forEach((preview, index) => {
        const effect = preview.effect;
        rows.push([`効果${index + 1}`, effectLabels[effect.kind] || effect.kind]);
        if (effect.kind === "applyStatus") {
          rows.push(["付与状態", statusLabels[effect.status] || effect.status]);
          rows.push(["基本成功率", `${(Number(effect.successRate) * 100).toFixed(1)}%`]);
          if (effect.status === "poison") rows.push(["毒ダメージ", `毎ターン最大HPの${(Number(effect.tickRate) * 100).toFixed(1)}%`]);
          if (effect.status === "blind") rows.push(["幻惑中の物理命中率", `${(Number(effect.potency) * 100).toFixed(1)}%`]);
          rows.push(["持続", Number(effect.duration) > 0 ? `${effect.duration}ターン` : "治療まで継続"]);
        }
        if (effect.kind === "cureStatus") rows.push(["治療対象", effect.statuses.map(status => statusLabels[status] || status).join("・")]);
        if (effect.kind === "revive") rows.push(["蘇生設定", `成功${(Number(effect.successRate) * 100).toFixed(1)}% / HP${(Number(effect.hpRate) * 100).toFixed(1)}%`]);
        if (effect.kind === "drainMp") rows.push(["MP吸収量", effect.power]);
        preview.outcomes.forEach(outcome => {
          if (effect.kind === "applyStatus") rows.push([`成功見込み（${outcome.targetName}）`, `${(Number(outcome.successRate) * 100).toFixed(1)}%`, Number(outcome.resistance) < 1 ? "resistant-setting" : ""]);
          if (effect.kind === "cureStatus" && outcome.statuses?.length) rows.push([`治療（${outcome.targetName}）`, outcome.statuses.map(status => statusLabels[status] || status).join("・")]);
          if (effect.kind === "revive") rows.push([`復活HP（${outcome.targetName}）`, outcome.reviveHp]);
        });
      });
      const showTargetOptions = (candidate.targetOptions || []).length > 1
        || (candidate.targetOptions || []).some(option => option.targetIds?.length > 1);
      if (showTargetOptions) {
        rows.push(["対象候補の比較", "ランダム補正前"]);
        candidate.targetOptions.forEach(option => {
          const count = option.targetIds?.length > 1 ? `・同条件${option.targetIds.length}体` : "";
          const details = [`${option.score}点`];
          if (Number.isFinite(option.resistance)) details.push(`倍率×${Number(option.resistance).toFixed(2)}`);
          if (Number.isFinite(option.expectedDamage)) details.push(`予想${option.expectedDamage}ダメージ`);
          if (Number.isFinite(option.expectedHeal)) details.push(`予想${option.expectedHeal}回復`);
          if (Number.isFinite(option.successRate)) details.push(`成功率${(Number(option.successRate) * 100).toFixed(1)}%`);
          rows.push([`対象評価（${option.label}${count}）`, details.join(" / "), Number(option.resistance) < 1 ? "resistant-setting" : ""]);
        });
      }
      (settings.outcomes || []).forEach(outcome => {
        if ((settings.type === "magic" || settings.type === "attack") && settings.element) {
          const state = outcome.resistance > 1 ? "弱点" : outcome.resistance < 1 ? "耐性" : "通常";
          rows.push([`属性倍率（${outcome.targetName}）`, `×${Number(outcome.resistance).toFixed(2)}・${state}`, outcome.resistance < 1 ? "resistant-setting" : ""]);
        }
        if (settings.type === "magic" || settings.type === "attack") {
          rows.push([`予想ダメージ（${outcome.targetName}）`, `${outcome.expectedDamage}（${outcome.damageMin}～${outcome.damageMax}）`]);
        }
        if (settings.type === "heal") rows.push([`予想回復（${outcome.targetName}）`, `${outcome.expectedHeal}（${outcome.healMin}～${outcome.healMax}）`]);
        if (settings.type === "instantDeath") {
          rows.push([`即死倍率（${outcome.targetName}）`, `×${Number(outcome.resistance).toFixed(2)}`, outcome.resistance < 1 ? "resistant-setting" : ""]);
          rows.push([`予想成功率（${outcome.targetName}）`, `${(Number(outcome.successRate) * 100).toFixed(1)}%`]);
        }
      });
      if ((settings.type === "magic" || settings.type === "attack") && (settings.outcomes || []).length > 1) {
        rows.push(["総予想ダメージ", settings.outcomes.reduce((sum, outcome) => sum + Number(outcome.expectedDamage || 0), 0)]);
      }
      return rows.map(([label, value, stateClass = ""]) => `<div class="breakdown-row setting ${stateClass}"><span>${this.escape(label)}</span><b>${this.escape(value)}</b></div>`).join("");
    }
    targetLabel(targets) {
      if (!targets.length) return "対象なし";
      if (targets.length > 1) return targets[0].side === "ally" ? "味方全体" : "敵全体";
      return targets[0].name;
    }
    candidateTargetLabel(candidate) {
      return candidate.targetLabel || this.targetLabel(candidate.targets || []);
    }
    clearDecision() {
      this.selectedDecisionActor = null;
      this.decisionEmpty.classList.remove("hidden");
      this.decisionContent.classList.add("hidden");
      document.querySelector("#decision-turn").textContent = "待機中";
    }
    markActing(actorId, targets) {
      document.querySelectorAll(".character-card").forEach(card => {
        card.classList.toggle("acting", card.dataset.id === actorId);
        card.classList.toggle("targeted", targets.includes(card.dataset.id));
      });
    }
    setControlsDisabled(disabled) {
      this.stepButton.disabled = disabled;
      this.nextButton.disabled = disabled || this.battle.ended;
      this.strategySelect.disabled = disabled;
      this.encounterSelect.disabled = disabled;
      if (!this.battle.autoTimer) this.autoButton.disabled = this.battle.ended;
    }
    setAutoState(running) { this.autoButton.textContent = running ? "■ 一時停止" : "自動戦闘"; this.autoButton.classList.toggle("running", running); }
    showResult(victory, turns) {
      document.querySelector("#result-title").textContent = victory ? "勝利！" : "全滅……";
      document.querySelector("#result-message").textContent = `${turns}ターンで戦闘が終了しました。`;
      const nextBattle = document.querySelector("#result-next-battle");
      const encounter = document.querySelector("#result-encounter");
      nextBattle.hidden = !victory;
      encounter.innerHTML = this.battle.data.encounters.map(item => `<option value="${this.escape(item.id)}">Lv${Number(item.recommendedLevel || 1)} ${this.escape(item.name)}</option>`).join("");
      encounter.value = this.battle.encounterId;
      document.querySelector("#result-recovery").value = "none";
      document.querySelector("#result-overlay").classList.remove("hidden");
    }
    hideResult() { document.querySelector("#result-overlay").classList.add("hidden"); }
    escape(value) { const span = document.createElement("span"); span.textContent = String(value ?? ""); return span.innerHTML; }
  }

  DQ.BattleUI = BattleUI;
})(window.DQ = window.DQ || {});
