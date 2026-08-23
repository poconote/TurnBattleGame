(function (DQ) {
  "use strict";

  const clone = value => JSON.parse(JSON.stringify(value));
  const STORAGE_KEY = "dq-ai-battle-data-v1";
  const CURRENT_SCHEMA_VERSION = 16;
  const RESISTANCE_KEYS = ["fire", "ice", "wind", "bang", "zap", "instantDeath", "poison", "blind", "petrify", "sleep", "silence", "paralysis", "confusion"];
  const defaultEnemyActionWeights = actions => {
    const ids = [...new Set(actions || [])];
    if (!ids.length) return {};
    if (ids.length === 1) return { [ids[0]]: 100 };
    if (!ids.includes("attack")) return Object.fromEntries(ids.map(id => [id, 100 / ids.length]));
    const specialWeight = 40 / Math.max(1, ids.length - 1);
    return Object.fromEntries(ids.map(id => [id, id === "attack" ? 60 : specialWeight]));
  };

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
        if (!raw) return this.normalize(clone(DQ.DEFAULT_GAME_DATA));
        const parsed = this.normalize(this.migrate(JSON.parse(raw)));
        const errors = this.validate(parsed);
        if (errors.length) return this.normalize(clone(DQ.DEFAULT_GAME_DATA));
        localStorage.setItem(this.storageKey, JSON.stringify(parsed));
        return parsed;
      } catch {
        return this.normalize(clone(DQ.DEFAULT_GAME_DATA));
      }
    }

    getData() { return this.data; }
    createDraft() { return clone(this.data); }

    normalize(data) {
      if (data?.actions) data.actions.forEach(action => DQ.ActionSchema.ensureEffects(action));
      if (data?.jobs) {
        const jobIds = new Set(data.jobs.map(job => job.id));
        data.partyOrder = [...new Set([...(Array.isArray(data.partyOrder) ? data.partyOrder : []), ...data.jobs.map(job => job.id)])].filter(jobId => jobIds.has(jobId));
      }
      if (data?.enemies) data.enemies.forEach(enemy => {
        enemy.resistances = { ...Object.fromEntries(RESISTANCE_KEYS.map(key => [key, 1])), ...(enemy.resistances || {}) };
        const defaults = defaultEnemyActionWeights(enemy.actions);
        enemy.actionWeights = Object.fromEntries((enemy.actions || []).map(actionId => {
          const configured = Number(enemy.actionWeights?.[actionId]);
          return [actionId, Number.isFinite(configured) && configured >= 0 ? configured : defaults[actionId]];
        }));
      });
      return data;
    }

    setData(nextData) {
      const normalized = this.normalize(this.migrate(clone(nextData)));
      const errors = this.validate(normalized);
      if (errors.length) throw new Error(errors.join("\n"));
      this.data = normalized;
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
      return this.normalize(clone(defaults));
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
      for (const key of ["turnOrder", "targetSelection"]) data.ai[key] = { ...data.ai[key], ...(oldAI[key] || {}) };
      for (const key of ["attack", "heal", "magic", "support", "instantDeath", "status", "cure", "revive"]) data.ai[key] = { ...data.ai[key], ...(oldAI[key] || {}) };
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
          const legacyDefaults = {
            warrior: ["attack", "flameSlash", "quickThrust", "doubleEdgedSlash"],
            priest: ["attack", "hoimi", "kiari", "manusa", "bagi", "piorim", "behoimi", "bagima", "zaki", "zaoriku"],
            mage: ["attack", "mera", "scara", "hyado", "gira", "sukurlt", "io", "begirama", "merami", "hyadaruko", "baikilt", "zaraki"],
          }[job.id] || [];
          const customActions = (job.actions || []).filter(actionId => !legacyDefaults.includes(actionId) && !defaultJob.actions.includes(actionId));
          const customLevels = Object.fromEntries(customActions.map(actionId => [actionId, Number(job.actionLevels?.[actionId] || 1)]));
          job.actions = [...new Set([...defaultJob.actions, ...customActions])];
          job.actionLevels = { ...clone(defaultJob.actionLevels), ...customLevels };
        } else job.actionLevels ||= Object.fromEntries((job.actions || []).map(id => [id, 1]));
        const defaultTraits = defaultJob?.aiTraits || { buffAffinity: { attack: 1, defense: 1, speed: 1 }, healPriority: 1, magicPriority: 1 };
        job.aiTraits = { ...clone(defaultTraits), ...(job.aiTraits || {}), buffAffinity: { ...clone(defaultTraits.buffAffinity), ...(job.aiTraits?.buffAffinity || {}) } };
      });
      for (const defaultJob of defaults.jobs) {
        if (!data.jobs.some(job => job.id === defaultJob.id)) data.jobs.push(clone(defaultJob));
      }
      data.partyOrder = [...new Set([...(Array.isArray(data.partyOrder) ? data.partyOrder : defaults.partyOrder || []), ...data.jobs.map(job => job.id)])];

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
        enemy.actionWeights ||= defaultEnemyActionWeights(enemy.actions);
      });
      for (const defaultEnemy of defaults.enemies) {
        const enemy = data.enemies.find(item => item.id === defaultEnemy.id);
        if (!enemy) data.enemies.push(clone(defaultEnemy));
        else {
          enemy.resistances = { ...clone(defaultEnemy.resistances), ...(enemy.resistances || {}) };
          enemy.actions = [...new Set([...(enemy.actions || []), ...defaultEnemy.actions])];
          enemy.actionWeights = { ...clone(defaultEnemy.actionWeights || defaultEnemyActionWeights(defaultEnemy.actions)), ...(enemy.actionWeights || {}) };
        }
      }

      data.strategies.forEach(strategy => {
        const defaultStrategy = defaults.strategies.find(item => item.id === strategy.id);
        for (const type of ["status", "cure", "revive"]) strategy[type] = Number(strategy[type] ?? defaultStrategy?.[type] ?? 1);
      });

      data.encounters = Array.isArray(data.encounters) && data.encounters.length ? data.encounters : clone(defaults.encounters);
      for (const defaultEncounter of defaults.encounters) {
        if (!data.encounters.some(encounter => encounter.id === defaultEncounter.id)) data.encounters.push(clone(defaultEncounter));
      }
      data.selectedEncounterId = data.encounters.some(encounter => encounter.id === data.selectedEncounterId)
        ? data.selectedEncounterId
        : data.encounters.some(encounter => encounter.id === defaults.selectedEncounterId) ? defaults.selectedEncounterId : data.encounters[0]?.id;
      data.actions.forEach(action => DQ.ActionSchema.ensureEffects(action));
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
      const orderMin = Number(data.ai?.turnOrder?.minMultiplier);
      const orderMax = Number(data.ai?.turnOrder?.maxMultiplier);
      const formationWeights = [
        data.ai?.targetSelection?.enemyFrontWeight,
        data.ai?.targetSelection?.enemyMiddleWeight,
        data.ai?.targetSelection?.enemyBackWeight,
      ].map(Number);
      const revivedTargetWeight = Number(data.ai?.targetSelection?.revivedTargetWeight);
      const reviveProtectionTurns = Number(data.ai?.targetSelection?.reviveProtectionTurns);
      if (!Number.isFinite(orderMin) || !Number.isFinite(orderMax) || orderMin <= 0 || orderMax <= 0 || orderMin > orderMax) {
        errors.push("行動順の素早さ乱数倍率が不正です。");
      }
      if (formationWeights.some(weight => !Number.isFinite(weight) || weight <= 0)) {
        errors.push("敵から狙われる隊列ウェイトは、すべて0より大きくしてください。");
      }
      if (!Number.isFinite(revivedTargetWeight) || revivedTargetWeight < 0) errors.push("蘇生直後の対象ウェイトは0以上にしてください。");
      if (!Number.isInteger(reviveProtectionTurns) || reviveProtectionTurns < 0) errors.push("蘇生後に保護するターン数は0以上の整数にしてください。");
      for (const key of ["actions", "jobs", "enemies", "encounters", "strategies"]) {
        const ids = data[key].map(item => item.id);
        if (ids.some(id => !id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))) errors.push(`${key}に使用できないIDがあります。`);
        if (new Set(ids).size !== ids.length) errors.push(`${key}に重複したIDがあります。`);
      }
      const actionIds = new Set(data.actions.map(action => action.id));
      const jobIds = data.jobs.map(job => job.id);
      if (!Array.isArray(data.partyOrder) || data.partyOrder.length !== jobIds.length || new Set(data.partyOrder).size !== jobIds.length || data.partyOrder.some(jobId => !jobIds.includes(jobId))) {
        errors.push("戦闘参加順にはすべての職業を重複なく指定してください。");
      }
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
        for (const resistance of RESISTANCE_KEYS) {
          const value = Number(enemy.resistances?.[resistance] ?? 1);
          if (!Number.isFinite(value) || value < 0) errors.push(`${enemy.name || enemy.id}の${resistance}耐性倍率が不正です。`);
        }
        if (!Number.isInteger(Number(enemy.recommendedLevel)) || Number(enemy.recommendedLevel) < 1) errors.push(`${enemy.name || enemy.id}の出現目安Lvが不正です。`);
        (enemy.actions || []).forEach(id => {
          if (!actionIds.has(id)) errors.push(`${enemy.name}が存在しない技「${id}」を参照しています。`);
          const weight = Number(enemy.actionWeights?.[id]);
          if (!Number.isFinite(weight) || weight < 0) errors.push(`${enemy.name}の「${id}」使用ウェイトが不正です。`);
        });
        if ((enemy.actions || []).length && !(enemy.actions || []).some(id => Number(enemy.actionWeights?.[id]) > 0)) errors.push(`${enemy.name}は少なくとも1つの技の使用ウェイトを0より大きくしてください。`);
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
      const validTypes = new Set(["attack", "heal", "magic", "support", "instantDeath", "status", "cure", "revive", "utility"]);
      const validEffectKinds = new Set(["damage", "heal", "modifyStat", "instantDeath", "recoil", "applyStatus", "cureStatus", "revive", "drainMp", "sacrifice", "noop"]);
      const validStatuses = new Set(["poison", "blind", "petrify", "sleep", "silence", "paralysis", "confusion"]);
      data.actions.forEach(action => {
        if (!validTargets.has(action.target)) errors.push(`${action.name}の対象種別が不正です。`);
        if (!validTypes.has(action.type)) errors.push(`${action.name}の行動タイプが不正です。`);
        if (!Array.isArray(action.effects) || !action.effects.length) errors.push(`${action.name}に効果が設定されていません。`);
        (action.effects || []).forEach(effect => {
          if (!validEffectKinds.has(effect.kind)) errors.push(`${action.name}に未対応の効果「${effect.kind || "未設定"}」があります。`);
          if (!["selected", "caster"].includes(effect.target)) errors.push(`${action.name}の効果対象が不正です。`);
          if (effect.kind === "damage") {
            if (!["physical", "fixed"].includes(effect.formula)) errors.push(`${action.name}のダメージ計算式が不正です。`);
            if (effect.formula === "physical" && (!Number.isFinite(Number(effect.powerMultiplier)) || Number(effect.powerMultiplier) <= 0)) errors.push(`${action.name}の物理攻撃倍率が不正です。`);
            if (effect.formula === "fixed" && (!Number.isFinite(Number(effect.power)) || Number(effect.power) < 0)) errors.push(`${action.name}の固定ダメージ威力が不正です。`);
          }
          if (effect.kind === "heal" && (!Number.isFinite(Number(effect.power)) || Number(effect.power) < 0)) errors.push(`${action.name}の回復量が不正です。`);
          if (effect.kind === "modifyStat") {
            if (!["attack", "defense", "speed", "magicResistance", "breathResistance", "damageResistance"].includes(effect.stat) || !["add", "multiply"].includes(effect.mode)) errors.push(`${action.name}の能力変化設定が不正です。`);
            if (!Number.isFinite(Number(effect.value)) || !Number.isFinite(Number(effect.duration)) || !Number.isFinite(Number(effect.maxStacks)) || Number(effect.duration) < 1 || Number(effect.maxStacks) < 1) errors.push(`${action.name}の能力変化量・ターン・重ね掛け上限が不正です。`);
          }
          if (effect.kind === "instantDeath" && (!Number.isFinite(Number(effect.successRate)) || Number(effect.successRate) < 0 || Number(effect.successRate) > 1)) errors.push(`${action.name}の即死成功率は0～1で指定してください。`);
          if (effect.kind === "recoil" && (!Number.isFinite(Number(effect.rate)) || Number(effect.rate) < 0 || Number(effect.rate) > 1)) errors.push(`${action.name}の反動率は0～1で指定してください。`);
          if (effect.kind === "applyStatus") {
            if (!validStatuses.has(effect.status)) errors.push(`${action.name}の付与する状態異常が不正です。`);
            if (!Number.isFinite(Number(effect.successRate)) || Number(effect.successRate) < 0 || Number(effect.successRate) > 1 || !Number.isFinite(Number(effect.duration)) || Number(effect.duration) < 0) errors.push(`${action.name}の状態異常成功率・ターンが不正です。`);
            if (effect.status === "poison" && (!Number.isFinite(Number(effect.tickRate)) || Number(effect.tickRate) <= 0 || Number(effect.tickRate) > 1)) errors.push(`${action.name}の毒ダメージ率が不正です。`);
            if (effect.status === "blind" && (!Number.isFinite(Number(effect.potency)) || Number(effect.potency) < 0 || Number(effect.potency) > 1)) errors.push(`${action.name}の幻惑命中率が不正です。`);
          }
          if (effect.kind === "cureStatus" && (!Array.isArray(effect.statuses) || !effect.statuses.length || effect.statuses.some(status => !validStatuses.has(status)))) errors.push(`${action.name}の治療対象状態が不正です。`);
          if (effect.kind === "revive" && (!Number.isFinite(Number(effect.successRate)) || Number(effect.successRate) < 0 || Number(effect.successRate) > 1 || !Number.isFinite(Number(effect.hpRate)) || Number(effect.hpRate) <= 0 || Number(effect.hpRate) > 1)) errors.push(`${action.name}の蘇生成功率・HP率が不正です。`);
          if (effect.kind === "drainMp" && (!Number.isFinite(Number(effect.power)) || Number(effect.power) < 0)) errors.push(`${action.name}のMP吸収量が不正です。`);
        });
        if (Number(action.mpCost) < 0) errors.push(`${action.name}の消費MPが不正です。`);
        if (action.successRate != null && (Number(action.successRate) < 0 || Number(action.successRate) > 1)) errors.push(`${action.name}の成功率は0～1で指定してください。`);
        if (action.recoilRate != null && (Number(action.recoilRate) < 0 || Number(action.recoilRate) > 1)) errors.push(`${action.name}の反動率は0～1で指定してください。`);
        if (action.priority != null && !Number.isFinite(Number(action.priority))) errors.push(`${action.name}の行動優先度が不正です。`);
        if (action.type === "attack" && (!Number.isFinite(Number(action.powerMultiplier)) || Number(action.powerMultiplier) <= 0)) errors.push(`${action.name}の物理攻撃倍率が不正です。`);
        if (action.type === "support" && DQ.ActionSchema.getPrimaryEffect(action, "modifyStat")) {
          if (!["attack", "defense", "speed", "magicResistance", "breathResistance", "damageResistance"].includes(action.effectStat)) errors.push(`${action.name}の補助対象能力が不正です。`);
          if (!["add", "multiply"].includes(action.effectMode)) errors.push(`${action.name}の補助計算方式が不正です。`);
          if (!Number.isFinite(Number(action.effectValue)) || Number(action.duration) < 1 || Number(action.maxStacks) < 1) errors.push(`${action.name}の補助効果量・ターン・重ね掛け上限が不正です。`);
        }
      });
      if (!data.strategies.length) errors.push("作戦を1件以上登録してください。");
      data.strategies.forEach(strategy => {
        for (const type of ["attack", "heal", "magic", "support", "instantDeath", "status", "cure", "revive"]) {
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
