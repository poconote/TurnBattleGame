(function (DQ) {
  "use strict";

  class Character {
    constructor(data, side, options = {}) {
      const level = side === "enemy" ? null : Number(data.level || 1);
      const stats = side === "enemy" ? data : (data.levelStats?.[String(level)] || data);
      this.templateId = data.id;
      this.id = options.instanceId || data.id;
      this.name = options.name || data.battleName || data.name;
      this.icon = data.icon || data.name.slice(0, 1);
      this.side = side;
      this.role = data.id;
      this.level = level;
      this.recommendedLevel = Number(data.recommendedLevel || 1);
      this.maxHp = Number(stats.maxHp);
      this.currentHp = this.maxHp;
      this.maxMp = Number(stats.maxMp);
      this.currentMp = this.maxMp;
      this.attack = Number(stats.attack);
      this.defense = Number(stats.defense);
      this.speed = Number(stats.speed);
      this.actionLevels = { ...(data.actionLevels || {}) };
      this.allActions = [...(data.actions || [])];
      this.actions = side === "enemy" ? [...this.allActions] : this.allActions.filter(actionId => Number(this.actionLevels[actionId] ?? 1) <= level);
      this.aiTraits = DQ.cloneData?.(data.aiTraits || {}) || JSON.parse(JSON.stringify(data.aiTraits || {}));
      this.aiTraits.buffAffinity = { attack: 1, defense: 1, speed: 1, ...(this.aiTraits.buffAffinity || {}) };
      this.aiTraits.healPriority = Number(this.aiTraits.healPriority ?? 1);
      this.aiTraits.magicPriority = Number(this.aiTraits.magicPriority ?? 1);
      this.resistances = { fire: 1, ice: 1, wind: 1, bang: 1, instantDeath: 1, ...(data.resistances || {}) };
      this.alive = true;
      this.buffs = {
        attack: { mode: "multiply", value: 1, turns: 0, stacks: 0 },
        defense: { mode: "add", value: 0, turns: 0, stacks: 0 },
        speed: { mode: "add", value: 0, turns: 0, stacks: 0 },
      };
      this.lastDecision = null;
    }
    get hpRate() { return this.currentHp / this.maxHp; }
    effectiveStat(stat) {
      const base = Number(this[stat]);
      const buff = this.buffs[stat];
      if (!buff || buff.turns <= 0) return base;
      return buff.mode === "multiply" ? base * buff.value : base + buff.value;
    }
    get effectiveAttack() { return this.effectiveStat("attack"); }
    get effectiveDefense() { return this.effectiveStat("defense"); }
    get effectiveSpeed() { return this.effectiveStat("speed"); }
  }

  class EnemyKnowledge {
    constructor(enemies) {
      this.values = new Map(enemies.map(enemy => [enemy.templateId, { instantDeath: 0 }]));
    }
    get(enemyId, type) { return this.values.get(enemyId)?.[type] ?? 0; }
    update(enemyId, type, delta) {
      const record = this.values.get(enemyId);
      if (!record) return 0;
      record[type] = Math.max(-3, Math.min(3, record[type] + delta));
      return record[type];
    }
  }

  class BattleLog {
    constructor(element) { this.element = element; }
    add(message, type = "normal") {
      const entry = document.createElement("div");
      entry.className = `log-entry ${type}`;
      entry.textContent = message;
      this.element.appendChild(entry);
      this.element.scrollTop = this.element.scrollHeight;
    }
    clear() { this.element.innerHTML = ""; }
  }

  DQ.Character = Character;
  DQ.EnemyKnowledge = EnemyKnowledge;
  DQ.BattleLog = BattleLog;
})(window.DQ = window.DQ || {});
