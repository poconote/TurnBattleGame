(function (DQ) {
  "use strict";

  const clone = value => JSON.parse(JSON.stringify(value));
  const STORAGE_KEY = "dq-ai-battle-data-v1";
  const CURRENT_SCHEMA_VERSION = 9;

  class GameDataStore {
    constructor(storageKey = STORAGE_KEY) {
      if (!DQ.DEFAULT_GAME_DATA) throw new Error("標準ゲームデータが読み込まれていません。");
      const defaultErrors = this.validate(DQ.DEFAULT_GAME_DATA);
      if (defaultErrors.length) throw new Error(`起動データが正しくありません。\n${defaultErrors.join("\n")}`);
      this.storageKey = storageKey;
      this.data = this.load();
    }

    static readCurrentSavedData(storageKey = STORAGE_KEY) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Number(parsed?.schemaVersion || 1) >= CURRENT_SCHEMA_VERSION ? parsed : null;
      } catch {
        return null;
      }
    }

    load() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return clone(DQ.DEFAULT_GAME_DATA);
        const parsed = this.migrate(JSON.parse(raw));
        const errors = this.validate(parsed);
        if (errors.length) return clone(DQ.DEFAULT_GAME_DATA);
        localStorage.setItem(this.storageKey, JSON.stringify(parsed));
        return parsed;
      } catch {
        return clone(DQ.DEFAULT_GAME_DATA);
      }
    }

    getData() { return this.data; }
    createDraft() { return clone(this.data); }

    setData(nextData) {
      const errors = this.validate(nextData);
      if (errors.length) throw new Error(errors.join("\n"));
      this.data = clone(nextData);
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      return this.data;
    }

    async restoreDefaults() {
      this.data = await this.fetchFreshDefaults();
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      return this.data;
    }

    async fetchFreshDefaults() {
      const defaults = await DQ.fetchDefaultGameData();
      const errors = this.validate(defaults);
      if (errors.length) throw new Error(`GitHubの標準データが正しくありません。\n${errors.join("\n")}`);
      DQ.setDefaultGameData(defaults);
      return clone(defaults);
    }

    setSelectedEncounter(encounterId) {
      if (!this.data.encounters.some(encounter => encounter.id === encounterId)) return;
      this.data.selectedEncounterId = encounterId;
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    migrate(data) {
      if (!data || Number(data.schemaVersion || 1) >= CURRENT_SCHEMA_VERSION) return data;
      const defaults = clone(DQ.DEFAULT_GAME_DATA);
      data.actions ||= [];
      data.jobs ||= [];
      data.enemies ||= [];
      data.strategies ||= clone(defaults.strategies);

      for (const defaultAction of defaults.actions) {
        if (!data.actions.some(action => action.id === defaultAction.id)) data.actions.push(clone(defaultAction));
      }
      data.actions.filter(action => action.type === "attack").forEach(action => {
        action.powerMultiplier ??= action.id === "attack" ? 1 : Number(action.power || 1);
      });
      const sukurlt = data.actions.find(action => action.id === "sukurlt");
      if (sukurlt) Object.assign(sukurlt, { effectStat: "defense", effectMode: "add", effectValue: Number(sukurlt.effectValue ?? sukurlt.power ?? 18), duration: Number(sukurlt.duration || 4), maxStacks: Number(sukurlt.maxStacks || 2) });

      const oldAI = data.ai || {};
      data.ai = clone(defaults.ai);
      for (const key of ["randomMin", "randomMax"]) if (oldAI[key] != null) data.ai[key] = oldAI[key];
      for (const key of ["attack", "heal", "magic", "support", "instantDeath"]) data.ai[key] = { ...data.ai[key], ...(oldAI[key] || {}) };
      data.ai.support.activePenalty = Math.min(Number(data.ai.support.activePenalty ?? -120), -120);

      data.jobs.forEach(job => {
        if (!job.levelStats) {
          job.level = Number(job.level || 1);
          job.levelStats = { [String(job.level)]: { maxHp: Number(job.maxHp || 0), maxMp: Number(job.maxMp || 0), attack: Number(job.attack || 0), defense: Number(job.defense || 0), speed: Number(job.speed || 0) } };
          delete job.maxHp; delete job.maxMp; delete job.attack; delete job.defense; delete job.speed;
        }
        const defaultJob = defaults.jobs.find(item => item.id === job.id);
        if (defaultJob) {
          job.levelStats = { ...clone(defaultJob.levelStats), ...job.levelStats };
          job.actions = [...new Set([...(job.actions || []), ...defaultJob.actions])];
          job.actionLevels = { ...clone(defaultJob.actionLevels), ...(job.actionLevels || {}) };
        } else job.actionLevels ||= Object.fromEntries((job.actions || []).map(id => [id, 1]));
        const defaultTraits = defaultJob?.aiTraits || { buffAffinity: { attack: 1, defense: 1, speed: 1 }, healPriority: 1, magicPriority: 1 };
        job.aiTraits = { ...clone(defaultTraits), ...(job.aiTraits || {}), buffAffinity: { ...clone(defaultTraits.buffAffinity), ...(job.aiTraits?.buffAffinity || {}) } };
      });

      data.enemies.forEach(enemy => {
        if (enemy.levelStats) {
          const stats = enemy.levelStats[String(enemy.level)] || Object.values(enemy.levelStats)[0];
          Object.assign(enemy, clone(stats));
        }
        delete enemy.level;
        delete enemy.levelStats;
        delete enemy.actionLevels;
        delete enemy.enabled;
        enemy.recommendedLevel = Number(enemy.recommendedLevel || 1);
      });
      for (const defaultEnemy of defaults.enemies) {
        const enemy = data.enemies.find(item => item.id === defaultEnemy.id);
        if (!enemy) data.enemies.push(clone(defaultEnemy));
        else enemy.resistances = { ...clone(defaultEnemy.resistances), ...(enemy.resistances || {}) };
      }

      data.encounters = Array.isArray(data.encounters) && data.encounters.length ? data.encounters : clone(defaults.encounters);
      data.selectedEncounterId = data.encounters.some(encounter => encounter.id === data.selectedEncounterId)
        ? data.selectedEncounterId
        : data.encounters.some(encounter => encounter.id === defaults.selectedEncounterId) ? defaults.selectedEncounterId : data.encounters[0]?.id;
      data.schemaVersion = CURRENT_SCHEMA_VERSION;
      return data;
    }

    validate(data) {
      const errors = [];
      if (!data || typeof data !== "object") return ["ゲームデータが正しくありません。"];
      for (const key of ["actions", "jobs", "enemies", "encounters", "strategies"]) {
        if (!Array.isArray(data[key])) errors.push(`${key}は配列である必要があります。`);
      }
      if (errors.length) return errors;
      if (!data.ai || !Array.isArray(data.ai.heal?.thresholds)) errors.push("AI設定が不足しています。");
      for (const key of ["actions", "jobs", "enemies", "encounters", "strategies"]) {
        const ids = data[key].map(item => item.id);
        if (ids.some(id => !id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))) errors.push(`${key}に使用できないIDがあります。`);
        if (new Set(ids).size !== ids.length) errors.push(`${key}に重複したIDがあります。`);
      }
      const actionIds = new Set(data.actions.map(action => action.id));
      data.jobs.forEach(job => {
        if (!job.name) errors.push(`${job.id || "職業"}の名前がありません。`);
        const levels = job.levelStats && typeof job.levelStats === "object" ? Object.entries(job.levelStats) : [];
        if (!levels.length) errors.push(`${job.name || job.id}にLv別ステータスがありません。`);
        if (!job.levelStats?.[String(job.level)]) errors.push(`${job.name || job.id}の使用Lv${job.level}が登録されていません。`);
        levels.forEach(([level, stats]) => {
          if (!/^\d+$/.test(level) || Number(level) < 1) errors.push(`${job.name || job.id}に不正なLvがあります。`);
          for (const field of ["maxHp", "maxMp", "attack", "defense", "speed"]) {
            if (!Number.isFinite(Number(stats[field])) || Number(stats[field]) < 0) errors.push(`${job.name || job.id} Lv${level}の${field}が不正です。`);
          }
        });
        (job.actions || []).forEach(id => {
          if (!actionIds.has(id)) errors.push(`${job.name}が存在しない技「${id}」を参照しています。`);
          const learnedAt = job.actionLevels?.[id];
          if (!Number.isInteger(Number(learnedAt)) || Number(learnedAt) < 1) errors.push(`${job.name}の「${id}」習得Lvが不正です。`);
        });
      });
      data.enemies.forEach(enemy => {
        if (!enemy.name) errors.push(`${enemy.id || "敵"}の名前がありません。`);
        for (const field of ["maxHp", "maxMp", "attack", "defense", "speed"]) {
          if (!Number.isFinite(Number(enemy[field])) || Number(enemy[field]) < 0) errors.push(`${enemy.name || enemy.id}の${field}が不正です。`);
        }
        if (!Number.isInteger(Number(enemy.recommendedLevel)) || Number(enemy.recommendedLevel) < 1) errors.push(`${enemy.name || enemy.id}の出現目安Lvが不正です。`);
        (enemy.actions || []).forEach(id => { if (!actionIds.has(id)) errors.push(`${enemy.name}が存在しない技「${id}」を参照しています。`); });
      });
      const enemyIds = new Set(data.enemies.map(enemy => enemy.id));
      data.encounters.forEach(encounter => {
        if (!encounter.name) errors.push(`${encounter.id || "敵グループ"}の名前がありません。`);
        const total = (encounter.members || []).reduce((sum, member) => sum + Number(member.count || 0), 0);
        if (total < 1 || total > 3) errors.push(`${encounter.name || encounter.id}の敵は合計1～3体にしてください。`);
        (encounter.members || []).forEach(member => {
          if (!enemyIds.has(member.enemyId)) errors.push(`${encounter.name}が存在しない敵「${member.enemyId}」を参照しています。`);
          if (!Number.isInteger(Number(member.count)) || Number(member.count) < 1) errors.push(`${encounter.name}の敵数が不正です。`);
        });
      });
      if (!data.encounters.some(encounter => encounter.id === data.selectedEncounterId)) errors.push("選択中の敵グループが存在しません。");
      data.jobs.forEach(job => {
        const traits = job.aiTraits;
        for (const value of [traits?.buffAffinity?.attack, traits?.buffAffinity?.defense, traits?.buffAffinity?.speed, traits?.healPriority, traits?.magicPriority]) {
          if (!Number.isFinite(Number(value)) || Number(value) < 0) errors.push(`${job.name}の職業適性が不正です。`);
        }
      });
      const validTargets = new Set(["enemyOne", "allEnemies", "allyOne", "allAllies", "self"]);
      const validTypes = new Set(["attack", "heal", "magic", "support", "instantDeath"]);
      data.actions.forEach(action => {
        if (!validTargets.has(action.target)) errors.push(`${action.name}の対象種別が不正です。`);
        if (!validTypes.has(action.type)) errors.push(`${action.name}の行動タイプが不正です。`);
        if (Number(action.mpCost) < 0) errors.push(`${action.name}の消費MPが不正です。`);
        if (action.successRate != null && (Number(action.successRate) < 0 || Number(action.successRate) > 1)) errors.push(`${action.name}の成功率は0～1で指定してください。`);
        if (action.recoilRate != null && (Number(action.recoilRate) < 0 || Number(action.recoilRate) > 1)) errors.push(`${action.name}の反動率は0～1で指定してください。`);
        if (action.priority != null && !Number.isFinite(Number(action.priority))) errors.push(`${action.name}の行動優先度が不正です。`);
        if (action.type === "attack" && (!Number.isFinite(Number(action.powerMultiplier)) || Number(action.powerMultiplier) <= 0)) errors.push(`${action.name}の物理攻撃倍率が不正です。`);
        if (action.type === "support") {
          if (!["attack", "defense", "speed"].includes(action.effectStat)) errors.push(`${action.name}の補助対象能力が不正です。`);
          if (!["add", "multiply"].includes(action.effectMode)) errors.push(`${action.name}の補助計算方式が不正です。`);
          if (!Number.isFinite(Number(action.effectValue)) || Number(action.duration) < 1 || Number(action.maxStacks) < 1) errors.push(`${action.name}の補助効果量・ターン・重ね掛け上限が不正です。`);
        }
      });
      if (!data.strategies.length) errors.push("作戦を1件以上登録してください。");
      data.strategies.forEach(strategy => {
        for (const type of ["attack", "heal", "magic", "support", "instantDeath"]) {
          if (!Number.isFinite(Number(strategy[type])) || Number(strategy[type]) < 0) errors.push(`${strategy.name}の${type}倍率が不正です。`);
        }
      });
      if (!data.jobs.some(job => job.enabled)) errors.push("戦闘に参加する職業を1人以上選んでください。");
      if (data.jobs.filter(job => job.enabled).length > 3) errors.push("参加できる味方は3人までです。");
      return [...new Set(errors)];
    }

    findReferences(draft, collection, id) {
      const references = [];
      if (collection === "actions") {
        [...draft.jobs, ...draft.enemies].forEach(actor => {
          if ((actor.actions || []).includes(id)) references.push(actor.name);
        });
      }
      if (collection === "enemies") {
        (draft.encounters || []).forEach(encounter => {
          if ((encounter.members || []).some(member => member.enemyId === id)) references.push(encounter.name);
        });
      }
      return references;
    }
  }

  DQ.cloneData = clone;
  DQ.GameDataStore = GameDataStore;
})(window.DQ = window.DQ || {});
