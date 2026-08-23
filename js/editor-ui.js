(function (DQ) {
  "use strict";

  const ENTITY_CONFIG = {
    jobs: {
      title: "職業", fields: [
        ["id", "ID", "text"], ["name", "表示名", "text"], ["icon", "アイコン文字", "text"], ["enabled", "戦闘に参加", "checkbox"],
        ["level", "戦闘で使用するLv", "battleLevel"], ["levelStats", "Lv別ステータス", "levels"], ["actions", "技と習得Lv", "actionLearning"],
        ["aiTraits.buffAffinity.attack", "攻撃力強化の適性", "number-step"], ["aiTraits.buffAffinity.defense", "守備力強化の適性", "number-step"],
        ["aiTraits.buffAffinity.speed", "素早さ強化の適性", "number-step"], ["aiTraits.healPriority", "回復行動の優先度", "number-step"],
        ["aiTraits.magicPriority", "攻撃魔法の優先度", "number-step"],
      ],
    },
    enemies: {
      title: "敵", fields: [
        ["id", "ID", "text"], ["name", "表示名", "text"], ["icon", "アイコン文字", "text"], ["recommendedLevel", "出現目安Lv", "number"],
        ["maxHp", "最大HP", "number"], ["maxMp", "最大MP", "number"], ["attack", "攻撃力", "number"], ["defense", "守備力", "number"], ["speed", "素早さ", "number"], ["resistances.fire", "炎耐性倍率", "number-step"],
        ["resistances.ice", "氷耐性倍率", "number-step"], ["resistances.wind", "風耐性倍率", "number-step"], ["resistances.bang", "爆発耐性倍率", "number-step"],
        ["resistances.instantDeath", "即死成功倍率", "number-step"], ["actions", "使用可能な技", "actions"],
      ],
    },
    encounters: {
      title: "敵グループ", fields: [
        ["id", "ID", "text"], ["name", "表示名", "text"], ["recommendedLevel", "推奨Lv", "number"], ["members", "出現する敵（合計3体まで）", "encounterMembers"],
      ],
    },
    actions: {
      title: "技・魔法", fields: [
        ["id", "ID", "text"], ["name", "エディター上の名前", "text"], ["battleName", "戦闘中の名前（省略可）", "text"],
        ["type", "行動タイプ", "select", [["attack", "物理攻撃・物理スキル"], ["heal", "回復"], ["magic", "攻撃魔法"], ["support", "補助"], ["instantDeath", "即死"]]],
        ["target", "対象", "select", [["enemyOne", "敵単体"], ["allEnemies", "敵全体"], ["allyOne", "味方単体"], ["allAllies", "味方全体"], ["self", "自分"]]],
        ["mpCost", "消費MP", "number"], ["power", "威力・回復量", "number-step"], ["baseScore", "基本評価", "number-step"],
        ["powerMultiplier", "物理攻撃倍率", "number-step"], ["priority", "行動優先度（現在未使用）", "number-step"], ["recoilRate", "反動率（0～1）", "number-step"],
        ["element", "属性", "select", [["", "なし"], ["fire", "炎"], ["ice", "氷"], ["wind", "風"], ["bang", "爆発"]]], ["successRate", "成功率（0～1）", "number-step"],
        ["effectStat", "補助効果の能力", "select", [["", "なし"], ["attack", "攻撃力"], ["defense", "守備力"], ["speed", "素早さ"]]],
        ["effectMode", "補助効果の計算", "select", [["add", "加算"], ["multiply", "倍率"]]],
        ["effectValue", "補助効果量", "number-step"], ["duration", "効果ターン", "number"], ["maxStacks", "重ね掛け上限", "number"],
        ["assignedActors", "この技を使用する職業・敵", "actors"],
      ],
    },
    strategies: {
      title: "作戦", fields: [
        ["id", "ID", "text"], ["name", "表示名", "text"], ["attack", "通常攻撃倍率", "number-step"],
        ["magic", "攻撃魔法倍率", "number-step"], ["heal", "回復倍率", "number-step"],
        ["support", "補助倍率", "number-step"], ["instantDeath", "即死倍率", "number-step"],
      ],
    },
  };

  const AI_FIELDS = [
    ["turnOrder.minMultiplier", "行動順：素早さ倍率の最小値"], ["turnOrder.maxMultiplier", "行動順：素早さ倍率の最大値"],
    ["targetSelection.enemyFrontWeight", "敵の対象選択：前衛ウェイト"], ["targetSelection.enemyMiddleWeight", "敵の対象選択：中衛ウェイト"],
    ["targetSelection.enemyBackWeight", "敵の対象選択：後衛ウェイト"],
    ["randomMin", "行動評価：ランダム最小値"], ["randomMax", "行動評価：ランダム最大値"],
    ["attack.lowHpThreshold", "攻撃：瀕死判定HP率"], ["attack.lowHpBonus", "攻撃：瀕死敵への加点"], ["attack.lethalBonus", "攻撃：撃破見込み加点"],
    ["attack.elementWeakBonus", "物理スキル：弱点属性加点"], ["attack.elementResistPenalty", "物理スキル：属性耐性減点"],
    ["heal.wasteRate", "回復：過剰回復判定率"], ["heal.wastePenalty", "回復：過剰回復減点"], ["heal.unsafeRate", "回復後の危険HP率"],
    ["heal.unsafePenalty", "回復量不足の減点"], ["heal.mpEnoughRate", "MP十分の判定率"], ["heal.mpEnoughBonus", "MP十分の加点"],
    ["heal.emergencyRate", "緊急回復HP率"], ["heal.emergencyFloor", "緊急回復の最低評価"],
    ["magic.weakThreshold", "魔法：弱点判定倍率"], ["magic.weakBonus", "魔法：弱点加点"], ["magic.resistThreshold", "魔法：耐性判定倍率"],
    ["magic.singleResistPenalty", "単体魔法の耐性減点"], ["magic.groupResistPenalty", "全体魔法の耐性減点"],
    ["magic.totalDamageDivisor", "総ダメージ評価の除数"], ["magic.lethalBonus", "魔法：撃破見込み加点"], ["magic.extraTargetBonus", "魔法：追加対象1体の加点"],
    ["support.fullPartyBonus", "補助：味方3人生存加点"], ["support.strongEnemyAttack", "強敵とみなす攻撃力"], ["support.strongEnemyBonus", "強敵がいる場合の加点"],
    ["support.unusedBonus", "未強化時の加点"], ["support.activePenalty", "強化済みの減点"], ["support.statValueDivisor", "攻撃強化：対象攻撃力の評価除数"],
    ["support.lowAffinityThreshold", "補助：低適性とみなす値"], ["support.lowAffinityPenalty", "補助：低適性への減点"],
    ["instantDeath.learningMultiplier", "即死：学習値倍率"], ["instantDeath.extraTargetBonus", "即死：追加対象1体の加点"],
  ];

  class EditorUI {
    constructor(store, battle) {
      this.store = store;
      this.battle = battle;
      this.overlay = document.querySelector("#editor-overlay");
      this.tab = "jobs";
      this.selectedIndex = 0;
      this.bind();
    }

    bind() {
      document.querySelector("#open-editor").addEventListener("click", () => this.open());
      document.querySelector("#close-editor").addEventListener("click", () => this.close());
      document.querySelector("#editor-cancel").addEventListener("click", () => this.close());
      document.querySelector("#editor-tabs").addEventListener("click", event => {
        const button = event.target.closest("button[data-tab]");
        if (!button) return;
        this.tab = button.dataset.tab;
        this.selectedIndex = 0;
        this.render();
      });
      document.querySelector("#editor-add").addEventListener("click", () => this.add());
      document.querySelector("#editor-duplicate").addEventListener("click", () => this.duplicate());
      document.querySelector("#editor-delete").addEventListener("click", () => this.remove());
      document.querySelector("#editor-save-only").addEventListener("click", () => this.saveOnly());
      document.querySelector("#editor-save").addEventListener("click", () => this.save());
      document.querySelector("#editor-defaults").addEventListener("click", () => this.restore());
      document.querySelector("#editor-export").addEventListener("click", () => this.exportJson());
      document.querySelector("#editor-import").addEventListener("click", () => document.querySelector("#editor-import-file").click());
      document.querySelector("#editor-import-file").addEventListener("change", event => this.importJson(event));
    }

    open() { this.draft = this.store.createDraft(); this.trackOriginalIds(); this.overlay.classList.remove("hidden"); this.render(); }
    close() { this.overlay.classList.add("hidden"); }

    render() {
      document.querySelectorAll("#editor-tabs button").forEach(button => button.classList.toggle("active", button.dataset.tab === this.tab));
      const listPane = document.querySelector(".editor-list-pane");
      const deleteButton = document.querySelector("#editor-delete");
      const entityMode = this.tab !== "ai";
      listPane.classList.toggle("hidden", !entityMode);
      document.querySelector(".editor-workspace").classList.toggle("ai-mode", !entityMode);
      deleteButton.classList.toggle("hidden", !entityMode);
      if (entityMode) { this.renderList(); this.renderEntityForm(); }
      else this.renderAIForm();
      this.showErrors([]);
    }

    renderList() {
      const items = this.draft[this.tab];
      this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, items.length - 1));
      document.querySelector("#editor-entity-list").innerHTML = items.map((item, index) => `<button class="editor-entity ${index === this.selectedIndex ? "active" : ""}" data-index="${index}"><span>${this.escape(item.name || item.id)}</span><small>${this.escape(item.id)}</small></button>`).join("");
      document.querySelectorAll(".editor-entity").forEach(button => button.addEventListener("click", () => { this.selectedIndex = Number(button.dataset.index); this.render(); }));
    }

    renderEntityForm() {
      const config = ENTITY_CONFIG[this.tab];
      const item = this.draft[this.tab][this.selectedIndex];
      if (!item) { document.querySelector("#editor-form").innerHTML = `<div class="empty-state"><p>${config.title}を新規作成してください。</p></div>`; return; }
      const actionHelp = this.tab === "jobs"
        ? `<div class="editor-help">適性1.0が標準です。1より大きいほど優先し、1未満ほど選びにくくなります。攻撃・守備・素早さ強化は対象選択、回復・攻撃魔法の優先度はこの職業自身の行動評価に使います。</div>`
        : this.tab === "actions" && item.type === "support"
        ? `<div class="editor-help">補助魔法は「能力・計算方法・効果量・効果ターン・重ね掛け上限」を組み合わせます。例：バイキルト＝攻撃力／倍率／2／4ターン／1回。</div>`
        : this.tab === "actions" && item.type === "attack"
          ? `<div class="editor-help">物理スキルは「物理攻撃倍率・属性・消費MP」を設定します。属性なし・倍率1なら通常攻撃相当です。</div>` : "";
      document.querySelector("#editor-form").innerHTML = `<div class="editor-form-title"><div><span>${config.title.toUpperCase()}</span><h3>${this.escape(item.name || "名称未設定")}</h3></div><span>変更は保存時に戦闘へ反映</span></div>${actionHelp}<div class="field-grid">${config.fields.map(field => this.fieldHtml(item, field)).join("")}</div>`;
      this.bindFormInputs(item);
    }

    fieldHtml(item, [path, label, type, options]) {
      const value = this.getPath(item, path);
      if (type === "checkbox") return `<label class="editor-field checkbox-field"><input data-path="${path}" type="checkbox" ${value ? "checked" : ""}><span>${label}</span></label>`;
      if (type === "battleLevel") {
        const levels = this.levelKeys(item);
        return `<label class="editor-field"><span>${label}</span><select data-path="${path}" data-number-value="true">${levels.map(level => `<option value="${level}" ${Number(value) === Number(level) ? "selected" : ""}>Lv ${level}</option>`).join("")}</select><small>次に開始する戦闘で使用します。</small></label>`;
      }
      if (type === "levels") return this.levelEditorHtml(item, label);
      if (type === "actionLearning") return this.actionLearningHtml(item, label);
      if (type === "encounterMembers") return this.encounterMembersHtml(item, label);
      if (type === "actions") return `<label class="editor-field wide"><span>${label}</span><select data-path="${path}" multiple size="6">${this.draft.actions.map(action => `<option value="${this.escape(action.id)}" ${(value || []).includes(action.id) ? "selected" : ""}>${this.escape(action.name)} (${this.escape(action.id)})</option>`).join("")}</select><small>Ctrlキーを押しながら選択すると複数指定できます。</small></label>`;
      if (type === "actors") {
        const actors = [...this.draft.jobs.map(actor => ({ ...actor, group: "職業" })), ...this.draft.enemies.map(actor => ({ ...actor, group: "敵" }))];
        return `<label class="editor-field wide"><span>${label}</span><select data-path="${path}" multiple size="7">${actors.map(actor => `<option value="${this.escape(actor.group)}:${this.escape(actor.id)}" ${(actor.actions || []).includes(item.id) ? "selected" : ""}>${actor.group}：${this.escape(actor.name)}</option>`).join("")}</select><small>ここで選択すると、技の保存と同時に使用技へ割り当てられます。</small></label>`;
      }
      if (type === "select") return `<label class="editor-field"><span>${label}</span><select data-path="${path}">${options.map(([id, text]) => `<option value="${id}" ${String(value || "") === id ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
      const step = type === "number-step" ? "any" : "1";
      const inputType = type.startsWith("number") ? "number" : "text";
      return `<label class="editor-field"><span>${label}</span><input data-path="${path}" type="${inputType}" step="${step}" value="${this.escape(value ?? "")}"></label>`;
    }

    levelEditorHtml(item, label) {
      const levels = this.levelKeys(item);
      let selected = Number(this.editedLevels.get(item) || item.level || levels[0]);
      if (!levels.includes(selected)) selected = levels[0];
      this.editedLevels.set(item, selected);
      const stats = item.levelStats[String(selected)];
      const fields = [["maxHp", "最大HP"], ["maxMp", "最大MP"], ["attack", "攻撃力"], ["defense", "守備力"], ["speed", "素早さ"]];
      return `<div class="editor-field wide level-editor"><span>${label}</span><div class="level-toolbar"><select data-edit-level>${levels.map(level => `<option value="${level}" ${level === selected ? "selected" : ""}>Lv ${level}</option>`).join("")}</select><button type="button" data-level-action="add">＋ Lv追加</button><button type="button" data-level-action="duplicate">このLvを複製</button><button type="button" data-level-action="delete">Lv削除</button></div><div class="level-stat-grid">${fields.map(([field, text]) => `<label><span>${text}</span><input type="number" min="0" step="1" data-level-stat="${field}" value="${Number(stats[field])}"></label>`).join("")}</div></div>`;
    }

    actionLearningHtml(item, label) {
      item.actionLevels ||= {};
      const rows = this.draft.actions.map(action => {
        const assigned = (item.actions || []).includes(action.id);
        const learnedAt = Math.max(1, Number(item.actionLevels[action.id] ?? 1));
        return `<label class="action-learning-row"><input type="checkbox" data-learn-action="${this.escape(action.id)}" ${assigned ? "checked" : ""}><span>${this.escape(action.name)}</span><small>${this.escape(action.id)}</small><span>Lv</span><input type="number" min="1" step="1" data-learn-level="${this.escape(action.id)}" value="${learnedAt}" ${assigned ? "" : "disabled"}></label>`;
      }).join("");
      return `<div class="editor-field wide action-learning"><span>${label}</span><div class="action-learning-list">${rows}</div><small>チェックした技だけを使用し、指定Lvに達すると戦闘候補へ追加されます。</small></div>`;
    }

    encounterMembersHtml(item, label) {
      const expanded = (item.members || []).flatMap(member => Array.from({ length: Math.max(1, Number(member.count || 1)) }, () => member.enemyId)).slice(0, 3);
      while (expanded.length < 3) expanded.push("");
      const options = this.draft.enemies.map(enemy => `<option value="${this.escape(enemy.id)}">Lv${Number(enemy.recommendedLevel || 1)} ${this.escape(enemy.name)}</option>`).join("");
      return `<div class="editor-field wide encounter-members"><span>${label}</span><div class="encounter-member-grid">${expanded.map((enemyId, index) => `<label><span>${index + 1}体目</span><select data-encounter-slot="${index}"><option value="">なし</option>${options.replace(`value="${this.escape(enemyId)}"`, `value="${this.escape(enemyId)}" selected`)}</select></label>`).join("")}</div><small>同じ敵を複数の枠へ指定できます。空欄の枠は出現しません。</small></div>`;
    }

    bindLevelEditor(item) {
      const select = document.querySelector("[data-edit-level]");
      if (!select) return;
      select.addEventListener("change", () => { this.editedLevels.set(item, Number(select.value)); this.renderEntityForm(); });
      document.querySelectorAll("[data-level-stat]").forEach(input => input.addEventListener("change", () => {
        const level = this.editedLevels.get(item);
        item.levelStats[String(level)][input.dataset.levelStat] = Math.max(0, Number(input.value));
      }));
      document.querySelectorAll("[data-level-action]").forEach(button => button.addEventListener("click", () => {
        const current = Number(this.editedLevels.get(item));
        if (button.dataset.levelAction === "add") {
          const requested = Number(prompt("追加するLvを入力してください。", String(Math.max(...this.levelKeys(item)) + 1)));
          if (!Number.isInteger(requested) || requested < 1 || item.levelStats[String(requested)]) { this.showErrors(["1以上の未登録Lvを入力してください。"]); return; }
          item.levelStats[String(requested)] = { maxHp: 100, maxMp: 30, attack: 30, defense: 30, speed: 30 };
          this.editedLevels.set(item, requested);
        }
        if (button.dataset.levelAction === "duplicate") {
          let next = current + 1;
          while (item.levelStats[String(next)]) next += 1;
          item.levelStats[String(next)] = DQ.cloneData(item.levelStats[String(current)]);
          this.editedLevels.set(item, next);
        }
        if (button.dataset.levelAction === "delete") {
          if (this.levelKeys(item).length === 1) { this.showErrors(["Lv別ステータスは最低1件必要です。"]); return; }
          if (!confirm(`Lv ${current}を削除しますか？`)) return;
          delete item.levelStats[String(current)];
          const next = this.levelKeys(item)[0];
          if (Number(item.level) === current) item.level = next;
          this.editedLevels.set(item, next);
        }
        this.renderEntityForm();
      }));
    }

    bindFormInputs(item) {
      document.querySelectorAll("#editor-form [data-path]").forEach(input => input.addEventListener("change", () => {
        const path = input.dataset.path;
        let value;
        if (input.type === "checkbox") value = input.checked;
        else if (input.multiple) value = [...input.selectedOptions].map(option => option.value);
        else if (input.type === "number") value = input.value === "" ? 0 : Number(input.value);
        else value = input.dataset.numberValue ? Number(input.value) : input.value;
        const oldId = item.id;
        if (path === "assignedActors") {
          const selected = new Set(value);
          this.draft.jobs.forEach(actor => this.assignAction(actor, item.id, selected.has(`職業:${actor.id}`)));
          this.draft.enemies.forEach(actor => this.assignAction(actor, item.id, selected.has(`敵:${actor.id}`)));
          return;
        }
        this.setPath(item, path, value);
        if (this.tab === "actions") DQ.ActionSchema.syncEffectFromLegacy(item, path);
        if (path === "id" && this.tab === "actions" && oldId !== value) {
          [...this.draft.jobs, ...this.draft.enemies].forEach(actor => {
            actor.actions = actor.actions.map(id => id === oldId ? value : id);
            if (actor.actionLevels?.[oldId] != null) {
              actor.actionLevels[value] = actor.actionLevels[oldId];
              delete actor.actionLevels[oldId];
            }
          });
        }
        if (path === "id" && this.tab === "enemies" && oldId !== value) {
          this.draft.encounters.forEach(encounter => encounter.members.forEach(member => { if (member.enemyId === oldId) member.enemyId = value; }));
        }
        this.renderList();
      }));
      this.bindLevelEditor(item);
      this.bindActionLearning(item);
      this.bindEncounterMembers(item);
    }

    bindEncounterMembers(item) {
      document.querySelectorAll("[data-encounter-slot]").forEach(select => select.addEventListener("change", () => {
        const ids = [...document.querySelectorAll("[data-encounter-slot]")].map(input => input.value).filter(Boolean);
        const counts = new Map();
        ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
        item.members = [...counts].map(([enemyId, count]) => ({ enemyId, count }));
      }));
    }

    bindActionLearning(item) {
      document.querySelectorAll("[data-learn-action]").forEach(input => input.addEventListener("change", () => {
        const actionId = input.dataset.learnAction;
        const levelInput = document.querySelector(`[data-learn-level="${actionId}"]`);
        this.assignAction(item, actionId, input.checked, Number(levelInput?.value || 1));
        if (levelInput) levelInput.disabled = !input.checked;
      }));
      document.querySelectorAll("[data-learn-level]").forEach(input => input.addEventListener("change", () => {
        item.actionLevels ||= {};
        item.actionLevels[input.dataset.learnLevel] = Math.max(1, Math.floor(Number(input.value) || 1));
        input.value = item.actionLevels[input.dataset.learnLevel];
      }));
    }

    renderAIForm() {
      const thresholdRows = this.draft.ai.heal.thresholds.map((rule, index) => `<div class="threshold-row"><label>HP率<input type="number" step="any" data-ai-path="heal.thresholds.${index}.rate" value="${rule.rate}"></label><label>加点<input type="number" step="any" data-ai-path="heal.thresholds.${index}.score" value="${rule.score}"></label></div>`).join("");
      document.querySelector("#editor-form").innerHTML = `<div class="editor-form-title"><div><span>AI PARAMETERS</span><h3>評価関数の設定</h3></div><span>値はすべて候補評価の内訳へ反映</span></div><h4>回復HPしきい値</h4><div class="threshold-grid">${thresholdRows}</div><h4>共通・行動別パラメータ</h4><div class="field-grid">${AI_FIELDS.map(([path, label]) => `<label class="editor-field"><span>${label}</span><input type="number" step="any" data-ai-path="${path}" value="${this.getPath(this.draft.ai, path)}"></label>`).join("")}</div>`;
      document.querySelectorAll("[data-ai-path]").forEach(input => input.addEventListener("change", () => this.setPath(this.draft.ai, input.dataset.aiPath, Number(input.value))));
    }

    add() {
      const base = {
        jobs: { name: "新しい職業", icon: "新", enabled: false, level: 1, levelStats: { "1": { maxHp: 100, maxMp: 30, attack: 30, defense: 30, speed: 30 } }, actions: ["attack"], actionLevels: { attack: 1 }, aiTraits: { buffAffinity: { attack: 1, defense: 1, speed: 1 }, healPriority: 1, magicPriority: 1 } },
        enemies: { name: "新しい敵", icon: "敵", recommendedLevel: 1, maxHp: 20, maxMp: 0, attack: 10, defense: 8, speed: 8, actions: ["attack"], resistances: { fire: 1, ice: 1, wind: 1, bang: 1, instantDeath: 1 } },
        encounters: { name: "新しい敵グループ", recommendedLevel: 1, members: [{ enemyId: this.draft.enemies[0]?.id || "", count: 1 }] },
        actions: DQ.ActionSchema.ensureEffects({ name: "新しい技", type: "attack", mpCost: 0, target: "enemyOne", power: 0, powerMultiplier: 1, baseScore: 40, effectStat: "", effectMode: "add", effectValue: 0, duration: 4, maxStacks: 1 }),
        strategies: { name: "新しい作戦", attack: 1, heal: 1, magic: 1, support: 1, instantDeath: 1 },
      }[this.tab];
      base.id = this.uniqueId({ jobs: "job", enemies: "enemy", encounters: "encounter", actions: "action", strategies: "strategy" }[this.tab] || "item");
      this.draft[this.tab].push(base);
      this.originalIds.set(base, null);
      if (base.levelStats) this.editedLevels.set(base, Number(base.level));
      this.selectedIndex = this.draft[this.tab].length - 1;
      this.render();
    }

    duplicate() {
      const source = this.draft[this.tab][this.selectedIndex];
      if (!source) return;
      const copy = DQ.cloneData(source);
      copy.id = this.uniqueId(`${source.id}_copy`);
      copy.name = `${source.name} コピー`;
      if ("enabled" in copy) copy.enabled = false;
      this.draft[this.tab].push(copy);
      this.originalIds.set(copy, null);
      if (copy.levelStats) this.editedLevels.set(copy, Number(copy.level));
      this.selectedIndex = this.draft[this.tab].length - 1;
      this.render();
    }

    remove() {
      const item = this.draft[this.tab][this.selectedIndex];
      if (!item) return;
      const refs = this.store.findReferences(this.draft, this.tab, item.id);
      if (refs.length) { this.showErrors([`「${item.name}」は ${refs.join("、")} が使用しているため削除できません。`]); return; }
      if (!confirm(`「${item.name}」を削除しますか？`)) return;
      this.draft[this.tab].splice(this.selectedIndex, 1);
      if (this.tab === "encounters" && this.draft.selectedEncounterId === item.id) this.draft.selectedEncounterId = this.draft.encounters[0]?.id || "";
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.render();
    }

    save() {
      try { this.store.setData(this.draft); this.battle.reset(); this.close(); }
      catch (error) { this.showErrors(String(error.message).split("\n")); }
    }
    saveOnly() {
      try {
        const next = this.store.createDraft();
        if (this.tab === "ai") {
          next.ai = DQ.cloneData(this.draft.ai);
        } else {
          const item = this.draft[this.tab][this.selectedIndex];
          if (!item) throw new Error("保存する項目がありません。");
          const originalId = this.originalIds.get(item);
          const index = next[this.tab].findIndex(saved => saved.id === originalId || saved.id === item.id);
          if (index >= 0) next[this.tab][index] = DQ.cloneData(item);
          else next[this.tab].push(DQ.cloneData(item));
          if (this.tab === "actions") {
            next.jobs.forEach(saved => { const edited = this.draft.jobs.find(job => job.id === saved.id); if (edited) { saved.actions = [...edited.actions]; saved.actionLevels = DQ.cloneData(edited.actionLevels || {}); } });
            next.enemies.forEach(saved => { const edited = this.draft.enemies.find(enemy => enemy.id === saved.id); if (edited) saved.actions = [...edited.actions]; });
          }
          if (this.tab === "enemies" && originalId && originalId !== item.id) {
            next.encounters.forEach(encounter => encounter.members.forEach(member => { if (member.enemyId === originalId) member.enemyId = item.id; }));
          }
          this.originalIds.set(item, item.id);
        }
        this.store.setData(next);
        this.battle.refreshData();
        this.showNotice("この項目を保存しました。技・使用者・作戦・AI設定は現在の戦闘にも反映済みです。基本ステータスは次の戦闘から反映されます。");
      } catch (error) { this.showErrors(String(error.message).split("\n")); }
    }
    async restore() {
      if (!confirm("編集中の内容を破棄して標準データへ戻しますか？")) return;
      const button = document.querySelector("#editor-defaults");
      button.disabled = true;
      try {
        this.draft = await this.store.fetchFreshDefaults();
        this.trackOriginalIds();
        this.selectedIndex = 0;
        this.render();
        this.showNotice("GitHubの標準データを読み込みました。保存するまで現在の保存データは変更されません。");
      } catch (error) {
        this.showErrors(String(error.message).split("\n"));
      } finally {
        button.disabled = false;
      }
    }
    exportJson() {
      const blob = new Blob([JSON.stringify(this.draft, null, 2)], { type: "application/json" });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "dq-battle-data.json"; link.click(); URL.revokeObjectURL(link.href);
    }
    importJson(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const errors = this.store.validate(parsed);
          if (errors.length) throw new Error(errors.join("\n"));
          this.draft = parsed; this.trackOriginalIds(); this.tab = "jobs"; this.selectedIndex = 0; this.render();
        } catch (error) { this.showErrors(String(error.message).split("\n")); }
      };
      reader.readAsText(file);
      event.target.value = "";
    }
    showErrors(errors) {
      const box = document.querySelector("#editor-errors");
      box.classList.remove("success");
      box.classList.toggle("hidden", !errors.length);
      box.innerHTML = errors.map(error => `<div>${this.escape(error)}</div>`).join("");
    }
    showNotice(message) {
      const box = document.querySelector("#editor-errors");
      box.classList.add("success");
      box.classList.remove("hidden");
      box.innerHTML = `<div>${this.escape(message)}</div>`;
    }
    assignAction(actor, actionId, enabled, learnedAt = 1) {
      actor.actions ||= [];
      const usesLearningLevels = this.draft.jobs.includes(actor);
      if (usesLearningLevels) actor.actionLevels ||= {};
      if (enabled && !actor.actions.includes(actionId)) actor.actions.push(actionId);
      if (enabled && usesLearningLevels) actor.actionLevels[actionId] = Math.max(1, Math.floor(Number(actor.actionLevels[actionId] ?? learnedAt) || 1));
      if (!enabled) {
        actor.actions = actor.actions.filter(id => id !== actionId);
        if (usesLearningLevels) delete actor.actionLevels[actionId];
      }
    }
    trackOriginalIds() {
      this.originalIds = new WeakMap();
      this.editedLevels = new WeakMap();
      for (const collection of ["jobs", "enemies", "encounters", "actions", "strategies"]) {
        (this.draft[collection] || []).forEach(item => {
          this.originalIds.set(item, item.id);
          if (item.levelStats) this.editedLevels.set(item, Number(item.level));
        });
      }
    }
    levelKeys(item) { return Object.keys(item.levelStats || {}).map(Number).sort((a, b) => a - b); }
    uniqueId(prefix) { let id = prefix.replace(/[^A-Za-z0-9_-]/g, "") || "item"; let suffix = 2; const ids = new Set(this.draft[this.tab].map(item => item.id)); while (ids.has(id)) id = `${prefix}${suffix++}`; return id; }
    getPath(object, path) { return path.split(".").reduce((value, key) => value?.[key], object); }
    setPath(object, path, value) { const keys = path.split("."); const last = keys.pop(); const target = keys.reduce((current, key) => current[key] ??= {}, object); target[last] = value; }
    escape(value) { const span = document.createElement("span"); span.textContent = String(value ?? ""); return span.innerHTML; }
  }

  DQ.EditorUI = EditorUI;
})(window.DQ = window.DQ || {});
