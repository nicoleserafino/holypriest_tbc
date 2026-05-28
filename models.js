/**
 * TBC Holy Priest Spell & Buff Models
 * Spell IDs from WoW TBC Classic (2.5.x)
 */

const SpellType = {
  HEAL: 'heal',
  HOT: 'hot',
  ABSORB: 'absorb',
  INSTANT: 'instant',
  CHANNEL: 'channel',
};

// TBC Classic Holy Priest Spell IDs (by rank)
const SPELL_IDS = {
  // Greater Heal
  GREATER_HEAL: [2060, 10963, 10964, 10965, 25314, 25210, 25213],
  // Flash Heal
  FLASH_HEAL: [2061, 9472, 9473, 9474, 10915, 10916, 10917, 25233, 25235],
  // Heal
  HEAL: [2054, 2055, 6063, 6064],
  // Prayer of Healing
  PRAYER_OF_HEALING: [596, 996, 10960, 10961, 25316, 25308],
  // Circle of Healing
  CIRCLE_OF_HEALING: [34861, 34863, 34864, 34865, 34866],
  // Prayer of Mending
  PRAYER_OF_MENDING: [33076],
  PRAYER_OF_MENDING_HEAL: [33110],
  // Renew
  RENEW: [139, 6074, 6075, 6076, 6077, 6078, 10927, 10928, 10929, 25315, 25221, 25222, 25315],
  // Binding Heal
  BINDING_HEAL: [32546],
  // Power Word: Shield
  POWER_WORD_SHIELD: [17, 592, 600, 3747, 6065, 6066, 10898, 10899, 10900, 10901, 25217, 25218],
  // Holy Nova (healing)
  HOLY_NOVA_HEAL: [23455, 23458, 23459, 27803, 25329, 25330],
  // Desperate Prayer
  DESPERATE_PRAYER: [19236, 19238, 19240, 19241, 19242, 19243, 25437],
  // Lightwell
  LIGHTWELL: [724, 27870, 27871],
  LIGHTWELL_RENEW: [7001, 27873, 27874],
  // ProM bounce tracking
  PRAYER_OF_MENDING_BUFF: [41635],
};

// Mana cooldown spell IDs
const MANA_COOLDOWNS = {
  INNER_FOCUS: [14751],
  SHADOWFIEND: [34433],
  SUPER_MANA_POTION: [28499],
  MANA_EMERALD: [27103],
  DARK_RUNE: [20520],
  DEMONIC_RUNE: [16666],
};

// Buff/Aura IDs to track
const AURA_IDS = {
  POWER_INFUSION: [10060],
  BLOODLUST: [2825],
  HEROISM: [32182],
  INNERVATE: [29166],
  TREE_OF_LIFE: [34123],
  DRUMS_OF_BATTLE: [35476],
  DRUMS_OF_RESTORATION: [35478],
  INNER_FOCUS_BUFF: [14751],
  SURGE_OF_LIGHT: [33151],
};

// Proc buffs to track for analysis
const PROC_BUFFS = {
  CLEARCASTING: {
    name: 'Clearcasting (Holy Concentration)',
    ids: [34754],
    description: 'Free spell cast after critical heal',
    category: 'mana',
  },
  SURGE_OF_LIGHT: {
    name: 'Surge of Light',
    ids: [33151],
    description: 'Free instant Flash Heal after spell crit',
    category: 'throughput',
  },
  FLEXIBILITY: {
    name: 'Flexibility (T4 2pc)',
    ids: [37237],
    description: 'Reduces Greater Heal cast time by 0.1s, stacks to 4',
    category: 'throughput',
  },
  EYE_OF_GRUUL: {
    name: 'Eye of Gruul',
    ids: [37228],
    description: 'Next heal costs 450 less mana (15s window)',
    category: 'mana',
  },
  QUAGMIRRANS_EYE: {
    name: "Quagmirran's Eye",
    ids: [33370],
    description: '+320 spell haste for 6s',
    category: 'haste',
  },
  POWER_INFUSION: {
    name: 'Power Infusion',
    ids: [10060],
    description: '+20% spell haste, -20% mana cost for 15s',
    category: 'haste',
  },
  BLOODLUST: {
    name: 'Bloodlust/Heroism',
    ids: [2825, 32182],
    description: '+30% haste for 40s',
    category: 'haste',
  },
};

// Spell metadata
const SPELL_DATA = {
  GREATER_HEAL: {
    name: 'Greater Heal',
    type: SpellType.HEAL,
    baseCastTime: 3000, // ms
    gcd: 1500,
    school: 'holy',
    ranks: SPELL_IDS.GREATER_HEAL,
    manaCost: [370, 455, 545, 655, 710, 750, 820], // per rank
  },
  FLASH_HEAL: {
    name: 'Flash Heal',
    type: SpellType.HEAL,
    baseCastTime: 1500,
    gcd: 1500,
    school: 'holy',
    ranks: SPELL_IDS.FLASH_HEAL,
    manaCost: [125, 155, 185, 215, 265, 315, 350, 380, 400],
  },
  HEAL: {
    name: 'Heal',
    type: SpellType.HEAL,
    baseCastTime: 3000,
    gcd: 1500,
    school: 'holy',
    ranks: SPELL_IDS.HEAL,
    manaCost: [155, 205, 255, 305],
  },
  PRAYER_OF_HEALING: {
    name: 'Prayer of Healing',
    type: SpellType.HEAL,
    baseCastTime: 3000,
    gcd: 1500,
    school: 'holy',
    ranks: SPELL_IDS.PRAYER_OF_HEALING,
    manaCost: [410, 560, 770, 1030, 1070, 1255],
  },
  CIRCLE_OF_HEALING: {
    name: 'Circle of Healing',
    type: SpellType.INSTANT,
    baseCastTime: 0,
    gcd: 1500,
    cooldown: 6000,
    school: 'holy',
    ranks: SPELL_IDS.CIRCLE_OF_HEALING,
    manaCost: [300, 335, 370, 405, 450],
  },
  PRAYER_OF_MENDING: {
    name: 'Prayer of Mending',
    type: SpellType.INSTANT,
    baseCastTime: 0,
    gcd: 1500,
    cooldown: 10000,
    school: 'holy',
    ranks: SPELL_IDS.PRAYER_OF_MENDING,
    manaCost: [390],
  },
  RENEW: {
    name: 'Renew',
    type: SpellType.HOT,
    baseCastTime: 0,
    gcd: 1500,
    duration: 15000,
    tickInterval: 3000,
    ticks: 5,
    school: 'holy',
    ranks: SPELL_IDS.RENEW,
    manaCost: [30, 65, 105, 140, 170, 205, 250, 305, 365, 400, 430, 450, 490, 510],
  },
  BINDING_HEAL: {
    name: 'Binding Heal',
    type: SpellType.HEAL,
    baseCastTime: 1500,
    gcd: 1500,
    school: 'holy',
    ranks: SPELL_IDS.BINDING_HEAL,
    manaCost: [705],
  },
  POWER_WORD_SHIELD: {
    name: 'Power Word: Shield',
    type: SpellType.ABSORB,
    baseCastTime: 0,
    gcd: 1500,
    school: 'disc',
    ranks: SPELL_IDS.POWER_WORD_SHIELD,
    manaCost: [45, 80, 130, 175, 210, 265, 315, 380, 425, 500, 550, 600],
  },
  HOLY_NOVA: {
    name: 'Holy Nova',
    type: SpellType.INSTANT,
    baseCastTime: 0,
    gcd: 1500,
    school: 'holy',
    ranks: SPELL_IDS.HOLY_NOVA_HEAL,
    manaCost: [185, 290, 400, 520, 635, 750],
  },
  DESPERATE_PRAYER: {
    name: 'Desperate Prayer',
    type: SpellType.INSTANT,
    baseCastTime: 0,
    gcd: 1500,
    cooldown: 600000, // 10 min
    school: 'holy',
    ranks: SPELL_IDS.DESPERATE_PRAYER,
    manaCost: [0], // free
  },
  LIGHTWELL: {
    name: 'Lightwell',
    type: SpellType.INSTANT,
    baseCastTime: 0,
    gcd: 1500,
    cooldown: 360000, // 6 min
    school: 'holy',
    ranks: SPELL_IDS.LIGHTWELL,
    manaCost: [625, 799, 989],
  },
};

// All healing spell IDs flattened for quick lookup
const ALL_HEAL_SPELL_IDS = new Set([
  ...SPELL_IDS.GREATER_HEAL,
  ...SPELL_IDS.FLASH_HEAL,
  ...SPELL_IDS.HEAL,
  ...SPELL_IDS.PRAYER_OF_HEALING,
  ...SPELL_IDS.CIRCLE_OF_HEALING,
  ...SPELL_IDS.PRAYER_OF_MENDING,
  ...SPELL_IDS.PRAYER_OF_MENDING_HEAL,
  ...SPELL_IDS.RENEW,
  ...SPELL_IDS.BINDING_HEAL,
  ...SPELL_IDS.HOLY_NOVA_HEAL,
  ...SPELL_IDS.DESPERATE_PRAYER,
  ...SPELL_IDS.LIGHTWELL_RENEW,
]);

const ALL_ABSORB_SPELL_IDS = new Set([
  ...SPELL_IDS.POWER_WORD_SHIELD,
]);

// Map spell ID -> spell data key
function getSpellDataKey(spellId) {
  for (const [key, data] of Object.entries(SPELL_DATA)) {
    if (data.ranks && data.ranks.includes(spellId)) {
      return key;
    }
  }
  // Check PoM heal
  if (SPELL_IDS.PRAYER_OF_MENDING_HEAL.includes(spellId)) return 'PRAYER_OF_MENDING';
  if (SPELL_IDS.LIGHTWELL_RENEW.includes(spellId)) return 'LIGHTWELL';
  return null;
}

function getSpellName(spellId) {
  const key = getSpellDataKey(spellId);
  if (key && SPELL_DATA[key]) return SPELL_DATA[key].name;
  if (SPELL_IDS.PRAYER_OF_MENDING_HEAL.includes(spellId)) return 'Prayer of Mending';
  if (SPELL_IDS.LIGHTWELL_RENEW.includes(spellId)) return 'Lightwell';
  return `Unknown (${spellId})`;
}

function getSpellRank(spellId) {
  for (const data of Object.values(SPELL_DATA)) {
    if (data.ranks) {
      const idx = data.ranks.indexOf(spellId);
      if (idx !== -1) return idx + 1;
    }
  }
  return 0;
}

function getSpellSchool(spellId) {
  const key = getSpellDataKey(spellId);
  if (key && SPELL_DATA[key]) return SPELL_DATA[key].school || 'holy';
  return 'holy';
}
