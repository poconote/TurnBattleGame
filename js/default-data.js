(function (DQ) {
  "use strict";

  const makeLevelStats = (anchors, maxLevel = 24) => {
    const result = {};
    const levels = Object.keys(anchors).map(Number).sort((a, b) => a - b);
    for (let level = 1; level <= maxLevel; level += 1) {
      const lower = [...levels].reverse().find(value => value <= level) ?? levels[0];
      const upper = levels.find(value => value >= level) ?? levels[levels.length - 1];
      const rate = upper === lower ? 0 : (level - lower) / (upper - lower);
      result[String(level)] = {};
      for (const stat of ["maxHp", "maxMp", "attack", "defense", "speed"]) {
        result[String(level)][stat] = Math.round(anchors[lower][stat] + (anchors[upper][stat] - anchors[lower][stat]) * rate);
      }
    }
    return result;
  };

  const actor = (data, anchors) => ({ ...data, level: 20, levelStats: makeLevelStats(anchors) });

  DQ.DEFAULT_GAME_DATA = {
    schemaVersion: 9,
    actions: [
      { id: "attack", name: "こうげき", type: "attack", mpCost: 0, target: "enemyOne", power: 0, powerMultiplier: 1, baseScore: 40 },
      { id: "flameSlash", name: "炎斬り（検証用）", battleName: "炎斬り", type: "attack", mpCost: 4, target: "enemyOne", power: 0, powerMultiplier: 1.25, element: "fire", baseScore: 48 },
      { id: "quickThrust", name: "しっぷう突き", type: "attack", mpCost: 3, target: "enemyOne", power: 0, powerMultiplier: 1, priority: 100, baseScore: 43 },
      { id: "doubleEdgedSlash", name: "もろば斬り", type: "attack", mpCost: 6, target: "enemyOne", power: 0, powerMultiplier: 1.6, recoilRate: 0.16, baseScore: 58 },
      { id: "heavyBlow", name: "強打", type: "attack", mpCost: 0, target: "enemyOne", power: 0, powerMultiplier: 1.18, baseScore: 48 },
      { id: "hoimi", name: "ホイミ", type: "heal", mpCost: 3, target: "allyOne", power: 35, baseScore: 20 },
      { id: "behoimi", name: "ベホイミ", type: "heal", mpCost: 5, target: "allyOne", power: 85, baseScore: 20 },
      { id: "scara", name: "スカラ", type: "support", mpCost: 3, target: "allyOne", power: 24, baseScore: 25, effectStat: "defense", effectMode: "add", effectValue: 24, duration: 4, maxStacks: 2 },
      { id: "sukurlt", name: "スクルト", type: "support", mpCost: 5, target: "allAllies", power: 14, baseScore: 25, effectStat: "defense", effectMode: "add", effectValue: 14, duration: 4, maxStacks: 2 },
      { id: "piorim", name: "ピオリム", type: "support", mpCost: 3, target: "allAllies", power: 18, baseScore: 23, effectStat: "speed", effectMode: "add", effectValue: 18, duration: 4, maxStacks: 2 },
      { id: "baikilt", name: "バイキルト", type: "support", mpCost: 6, target: "allyOne", power: 2, baseScore: 28, effectStat: "attack", effectMode: "multiply", effectValue: 2, duration: 4, maxStacks: 1 },
      { id: "mera", name: "メラ", type: "magic", mpCost: 2, target: "enemyOne", power: 11, element: "fire", baseScore: 34 },
      { id: "hyado", name: "ヒャド", type: "magic", mpCost: 3, target: "enemyOne", power: 30, element: "ice", baseScore: 42 },
      { id: "gira", name: "ギラ", type: "magic", mpCost: 4, target: "allEnemies", power: 23, element: "fire", baseScore: 42 },
      { id: "io", name: "イオ", type: "magic", mpCost: 5, target: "allEnemies", power: 18, element: "bang", baseScore: 41 },
      { id: "begirama", name: "ベギラマ", type: "magic", mpCost: 6, target: "allEnemies", power: 39, element: "fire", baseScore: 48 },
      { id: "merami", name: "メラミ", type: "magic", mpCost: 6, target: "enemyOne", power: 63, element: "fire", baseScore: 52 },
      { id: "hyadaruko", name: "ヒャダルコ", type: "magic", mpCost: 7, target: "allEnemies", power: 48, element: "ice", baseScore: 51 },
      { id: "bagi", name: "バギ", type: "magic", mpCost: 4, target: "allEnemies", power: 16, element: "wind", baseScore: 39 },
      { id: "bagima", name: "バギマ", type: "magic", mpCost: 6, target: "allEnemies", power: 40, element: "wind", baseScore: 48 },
      { id: "enemyMera", name: "メラ（敵用）", battleName: "メラ", type: "magic", mpCost: 2, target: "enemyOne", power: 22, element: "fire", baseScore: 44 },
      { id: "zaki", name: "ザキ", type: "instantDeath", mpCost: 7, target: "enemyOne", power: 0, successRate: 0.4, baseScore: 50 },
      { id: "zaraki", name: "ザラキ（検証用）", battleName: "ザラキ", type: "instantDeath", mpCost: 10, target: "allEnemies", power: 0, successRate: 0.25, baseScore: 46 },
    ],
    jobs: [
      actor({
        id: "warrior", name: "戦士", icon: "戦", enabled: true,
        actions: ["attack", "flameSlash", "quickThrust", "doubleEdgedSlash"],
        actionLevels: { attack: 1, flameSlash: 6, quickThrust: 9, doubleEdgedSlash: 16 },
        aiTraits: { buffAffinity: { attack: 1.5, defense: 1.1, speed: 0.8 }, healPriority: 0.4, magicPriority: 0.3 },
      }, {
        1: { maxHp: 24, maxMp: 4, attack: 12, defense: 10, speed: 6 }, 5: { maxHp: 48, maxMp: 9, attack: 27, defense: 23, speed: 11 },
        10: { maxHp: 82, maxMp: 15, attack: 46, defense: 39, speed: 18 }, 15: { maxHp: 121, maxMp: 22, attack: 65, defense: 54, speed: 25 },
        20: { maxHp: 165, maxMp: 30, attack: 84, defense: 70, speed: 33 }, 22: { maxHp: 184, maxMp: 33, attack: 92, defense: 76, speed: 36 },
      }),
      actor({
        id: "priest", name: "僧侶", icon: "僧", enabled: true,
        actions: ["attack", "hoimi", "bagi", "piorim", "behoimi", "bagima", "zaki"],
        actionLevels: { attack: 1, hoimi: 1, bagi: 5, piorim: 10, behoimi: 14, bagima: 20, zaki: 22 },
        aiTraits: { buffAffinity: { attack: 0.2, defense: 1.2, speed: 1 }, healPriority: 1.3, magicPriority: 0.8 },
      }, {
        1: { maxHp: 18, maxMp: 11, attack: 7, defense: 7, speed: 9 }, 5: { maxHp: 36, maxMp: 25, attack: 17, defense: 16, speed: 20 },
        10: { maxHp: 59, maxMp: 44, attack: 28, defense: 28, speed: 34 }, 15: { maxHp: 86, maxMp: 65, attack: 39, defense: 39, speed: 47 },
        20: { maxHp: 116, maxMp: 88, attack: 49, defense: 50, speed: 60 }, 22: { maxHp: 129, maxMp: 98, attack: 53, defense: 55, speed: 65 },
      }),
      actor({
        id: "mage", name: "魔法使い", icon: "魔", enabled: true,
        actions: ["attack", "mera", "scara", "hyado", "gira", "sukurlt", "io", "begirama", "merami", "hyadaruko", "baikilt", "zaraki"],
        actionLevels: { attack: 1, mera: 1, scara: 2, hyado: 4, gira: 7, sukurlt: 8, io: 11, begirama: 13, merami: 16, hyadaruko: 20, baikilt: 21, zaraki: 24 },
        aiTraits: { buffAffinity: { attack: 0.3, defense: 0.9, speed: 1.2 }, healPriority: 0.5, magicPriority: 1.3 },
      }, {
        1: { maxHp: 15, maxMp: 13, attack: 5, defense: 5, speed: 10 }, 5: { maxHp: 29, maxMp: 31, attack: 11, defense: 12, speed: 23 },
        10: { maxHp: 47, maxMp: 55, attack: 18, defense: 20, speed: 39 }, 15: { maxHp: 68, maxMp: 79, attack: 25, defense: 27, speed: 55 },
        20: { maxHp: 92, maxMp: 106, attack: 32, defense: 35, speed: 72 }, 22: { maxHp: 102, maxMp: 117, attack: 35, defense: 38, speed: 79 },
      }),
    ],
    enemies: [
      { id: "slime", name: "スライム", icon: "●", recommendedLevel: 1, maxHp: 14, maxMp: 0, attack: 8, defense: 6, speed: 8, actions: ["attack"], resistances: { fire: 1.25, ice: 0.9, wind: 1, bang: 1, instantDeath: 0.72 } },
      { id: "greatRaven", name: "おおがらす", icon: "烏", recommendedLevel: 2, maxHp: 18, maxMp: 0, attack: 11, defense: 7, speed: 14, actions: ["attack"], resistances: { fire: 1, ice: 1, wind: 1.25, bang: 1, instantDeath: 0.75 } },
      { id: "hornedRabbit", name: "いっかくうさぎ", icon: "兎", recommendedLevel: 3, maxHp: 22, maxMp: 0, attack: 14, defense: 9, speed: 16, actions: ["attack"], resistances: { fire: 1, ice: 1, wind: 1, bang: 1, instantDeath: 0.72 } },
      { id: "giantAnteater", name: "おおありくい", icon: "食", recommendedLevel: 4, maxHp: 28, maxMp: 0, attack: 17, defense: 12, speed: 10, actions: ["attack"], resistances: { fire: 1.1, ice: 1, wind: 1, bang: 1, instantDeath: 0.68 } },
      { id: "faceButterfly", name: "じんめんちょう", icon: "蝶", recommendedLevel: 4, maxHp: 20, maxMp: 0, attack: 13, defense: 10, speed: 19, actions: ["attack"], resistances: { fire: 1.15, ice: 1, wind: 0.8, bang: 1, instantDeath: 0.7 } },
      { id: "frogger", name: "フロッガー", icon: "蛙", recommendedLevel: 5, maxHp: 34, maxMp: 0, attack: 20, defense: 14, speed: 12, actions: ["attack", "heavyBlow"], resistances: { fire: 1.15, ice: 0.85, wind: 1, bang: 1, instantDeath: 0.65 } },
      { id: "bubbleSlime", name: "バブルスライム", icon: "毒", recommendedLevel: 5, maxHp: 27, maxMp: 0, attack: 18, defense: 13, speed: 17, actions: ["attack"], resistances: { fire: 1.2, ice: 0.9, wind: 1, bang: 1, instantDeath: 0.6 } },
      { id: "enemyMage", name: "まほうつかい", icon: "妖", recommendedLevel: 6, maxHp: 31, maxMp: 20, attack: 13, defense: 14, speed: 22, actions: ["attack", "enemyMera"], resistances: { fire: 0.75, ice: 1.2, wind: 1, bang: 1.1, instantDeath: 0.5 } },
      { id: "scorpionWasp", name: "さそりばち", icon: "蜂", recommendedLevel: 6, maxHp: 29, maxMp: 0, attack: 21, defense: 15, speed: 25, actions: ["attack"], resistances: { fire: 1.15, ice: 1, wind: 1.2, bang: 1, instantDeath: 0.62 } },
      { id: "healSlime", name: "ホイミスライム", icon: "癒", recommendedLevel: 7, maxHp: 38, maxMp: 24, attack: 16, defense: 18, speed: 20, actions: ["attack", "hoimi"], resistances: { fire: 1, ice: 1, wind: 1, bang: 1.1, instantDeath: 0.55 } },
      { id: "caterpillar", name: "キャタピラー", icon: "虫", recommendedLevel: 8, maxHp: 48, maxMp: 0, attack: 27, defense: 23, speed: 13, actions: ["attack", "heavyBlow"], resistances: { fire: 1.25, ice: 1, wind: 1, bang: 1, instantDeath: 0.5 } },
      { id: "killerBee", name: "キラービー", icon: "殺", recommendedLevel: 9, maxHp: 42, maxMp: 0, attack: 31, defense: 20, speed: 33, actions: ["attack"], resistances: { fire: 1.15, ice: 1, wind: 1.2, bang: 1, instantDeath: 0.5 } },
      { id: "armyCrab", name: "ぐんたいガニ", icon: "蟹", recommendedLevel: 10, maxHp: 55, maxMp: 0, attack: 30, defense: 42, speed: 16, actions: ["attack"], resistances: { fire: 0.8, ice: 1.15, wind: 0.85, bang: 1.15, instantDeath: 0.42 } },
      { id: "wanderingArmor", name: "さまようよろい", icon: "鎧", recommendedLevel: 12, maxHp: 72, maxMp: 0, attack: 42, defense: 48, speed: 18, actions: ["attack", "heavyBlow"], resistances: { fire: 0.8, ice: 0.9, wind: 0.8, bang: 1.15, instantDeath: 0.25 } },
      { id: "mummy", name: "ミイラおとこ", icon: "包", recommendedLevel: 15, maxHp: 88, maxMp: 0, attack: 49, defense: 38, speed: 22, actions: ["attack", "heavyBlow"], resistances: { fire: 1.25, ice: 0.9, wind: 1, bang: 1, instantDeath: 0.2 } },
      { id: "heatGizmo", name: "ヒートギズモ", icon: "炎", recommendedLevel: 18, maxHp: 96, maxMp: 36, attack: 42, defense: 40, speed: 48, actions: ["attack", "gira"], resistances: { fire: 0.35, ice: 1.35, wind: 0.8, bang: 1, instantDeath: 0.18 } },
      { id: "killerApe", name: "キラーエイプ", icon: "猿", recommendedLevel: 20, maxHp: 128, maxMp: 0, attack: 64, defense: 46, speed: 38, actions: ["attack", "heavyBlow"], resistances: { fire: 1, ice: 1.1, wind: 1, bang: 1, instantDeath: 0.14 } },
      { id: "golem", name: "ゴーレム（検証用）", battleName: "ゴーレム", icon: "剛", recommendedLevel: 20, maxHp: 200, maxMp: 0, attack: 68, defense: 76, speed: 20, actions: ["attack", "heavyBlow"], resistances: { fire: 0.65, ice: 1.2, wind: 0.8, bang: 0.9, instantDeath: 0.06 } },
    ],
    selectedEncounterId: "dharmaRoad",
    encounters: [
      { id: "slimeSolo", name: "スライム 1匹", recommendedLevel: 1, members: [{ enemyId: "slime", count: 1 }] },
      { id: "slimePair", name: "スライム 2匹", recommendedLevel: 2, members: [{ enemyId: "slime", count: 2 }] },
      { id: "slimeRaven", name: "スライムとおおがらす", recommendedLevel: 3, members: [{ enemyId: "slime", count: 1 }, { enemyId: "greatRaven", count: 1 }] },
      { id: "ariahanWild", name: "アリアハン周辺", recommendedLevel: 4, members: [{ enemyId: "greatRaven", count: 1 }, { enemyId: "hornedRabbit", count: 1 }, { enemyId: "giantAnteater", count: 1 }] },
      { id: "najimiTower", name: "ナジミの塔", recommendedLevel: 5, members: [{ enemyId: "faceButterfly", count: 1 }, { enemyId: "frogger", count: 1 }, { enemyId: "bubbleSlime", count: 1 }] },
      { id: "mageAndWasps", name: "まほうつかいとさそりばち", recommendedLevel: 6, members: [{ enemyId: "enemyMage", count: 1 }, { enemyId: "scorpionWasp", count: 2 }] },
      { id: "healingPack", name: "ホイミスライム隊", recommendedLevel: 8, members: [{ enemyId: "healSlime", count: 1 }, { enemyId: "caterpillar", count: 2 }] },
      { id: "romariaRoad", name: "ロマリア街道", recommendedLevel: 10, members: [{ enemyId: "killerBee", count: 1 }, { enemyId: "armyCrab", count: 2 }] },
      { id: "champagneTower", name: "シャンパーニの塔", recommendedLevel: 12, members: [{ enemyId: "wanderingArmor", count: 1 }, { enemyId: "killerBee", count: 2 }] },
      { id: "pyramid", name: "ピラミッド", recommendedLevel: 15, members: [{ enemyId: "mummy", count: 2 }, { enemyId: "armyCrab", count: 1 }] },
      { id: "baharataRoad", name: "バハラタ周辺", recommendedLevel: 18, members: [{ enemyId: "heatGizmo", count: 2 }, { enemyId: "mummy", count: 1 }] },
      { id: "dharmaRoad", name: "ダーマ周辺", recommendedLevel: 20, members: [{ enemyId: "killerApe", count: 2 }, { enemyId: "heatGizmo", count: 1 }] },
      { id: "golemTrial", name: "ゴーレム耐性検証", recommendedLevel: 20, members: [{ enemyId: "golem", count: 1 }] },
      { id: "resistanceLab", name: "3属性・耐性検証", recommendedLevel: 20, members: [{ enemyId: "slime", count: 1 }, { enemyId: "golem", count: 1 }, { enemyId: "enemyMage", count: 1 }] },
    ],
    strategies: [
      { id: "balanced", name: "バランスよく", attack: 1, heal: 1, magic: 1, support: 1, instantDeath: 1 },
      { id: "aggressive", name: "ガンガンいこうぜ", attack: 1.3, heal: 0.55, magic: 1.5, support: 0.45, instantDeath: 1.35 },
      { id: "defensive", name: "いのちだいじに", attack: 0.7, heal: 1.7, magic: 0.65, support: 1.5, instantDeath: 0.5 },
    ],
    ai: {
      randomMin: -10, randomMax: 10,
      attack: { lowHpThreshold: 0.3, lowHpBonus: 20, lethalBonus: 40, elementWeakBonus: 25, elementResistPenalty: -20 },
      heal: {
        thresholds: [{ rate: 0.85, score: 10 }, { rate: 0.7, score: 20 }, { rate: 0.5, score: 30 }, { rate: 0.25, score: 60 }, { rate: 0.1, score: 80 }],
        wasteRate: 0.25, wastePenalty: -18, unsafeRate: 0.5, unsafePenalty: -25, mpEnoughRate: 0.45, mpEnoughBonus: 5, emergencyRate: 0.1, emergencyFloor: 145,
      },
      magic: { weakThreshold: 1.15, weakBonus: 40, resistThreshold: 0.75, singleResistPenalty: -30, groupResistPenalty: -10, totalDamageDivisor: 5, lethalBonus: 30, extraTargetBonus: 15, lowMpRate: 0.2, lowMpPenalty: -30 },
      support: { fullPartyBonus: 15, strongEnemyAttack: 45, strongEnemyBonus: 20, unusedBonus: 30, activePenalty: -120, statValueDivisor: 1, lowAffinityThreshold: 0.5, lowAffinityPenalty: -80 },
      instantDeath: { learningMultiplier: 25, extraTargetBonus: 12, lowEnemyHpRate: 0.2, lowEnemyHpPenalty: -35, lowMpRate: 0.2, lowMpPenalty: -25 },
    },
  };
})(window.DQ = window.DQ || {});
