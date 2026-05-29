/**
 * Analyzer
 * Computes performance metrics from parsed log data
 */

class Analyzer {
  constructor(parsedData, selectedTanks = []) {
    this.data = parsedData;
    this.selectedTanks = new Set(selectedTanks);
    this.fightDuration = parsedData.fightDuration;
    this.fightDurationSec = parsedData.fightDuration / 1000;
  }

  /**
   * Run all analysis and return complete results
   */
  analyze() {
    return {
      summary: this.computeSummary(),
      throughput: this.computeThroughput(),
      cooldowns: this.computeCooldowns(),
      coh: this.computeCoH(),
      procs: this.computeProcs(),
      renew: this.computeRenew(),
      mana: this.computeMana(),
      activity: this.computeActivity(),
      timeline: this.buildTimeline(),
      observations: this.generateObservations(),
    };
  }

  // ======= SUMMARY =======
  computeSummary() {
    const heals = this.data.heals;
    const totalHealing = heals.reduce((sum, h) => sum + h.amount, 0);
    const totalOverheal = heals.reduce((sum, h) => sum + h.overheal, 0);
    const totalRaw = totalHealing + totalOverheal;
    const overhealPct = totalRaw > 0 ? (totalOverheal / totalRaw) * 100 : 0;
    const hps = totalHealing / this.fightDurationSec;
    const totalCasts = this.data.casts.length;
    const critHeals = heals.filter(h => h.isCrit).length;
    const critPct = heals.length > 0 ? (critHeals / heals.length) * 100 : 0;

    return {
      totalHealing,
      totalOverheal,
      overhealPct,
      hps,
      totalCasts,
      critPct,
      fightDuration: this.fightDurationSec,
    };
  }

  // ======= THROUGHPUT =======
  computeThroughput() {
    const spellStats = new Map();

    for (const heal of this.data.heals) {
      const key = heal.spellKey || heal.spellName;
      if (!spellStats.has(key)) {
        spellStats.set(key, {
          name: heal.spellName,
          key,
          casts: 0,
          totalHealing: 0,
          totalOverheal: 0,
          crits: 0,
          hits: 0,
          isHoT: false,
        });
      }
      const stat = spellStats.get(key);
      stat.hits++;
      stat.totalHealing += heal.amount;
      stat.totalOverheal += heal.overheal;
      if (heal.isCrit) stat.crits++;
      if (heal.isHoT) stat.isHoT = true;
    }

    // Count casts per spell from cast events
    for (const cast of this.data.casts) {
      const key = cast.spellKey || cast.spellName;
      if (spellStats.has(key)) {
        spellStats.get(key).casts++;
      }
    }

    // Calculate derived stats
    const results = [];
    for (const stat of spellStats.values()) {
      const totalRaw = stat.totalHealing + stat.totalOverheal;
      results.push({
        ...stat,
        avgHeal: stat.hits > 0 ? stat.totalHealing / stat.hits : 0,
        overhealPct: totalRaw > 0 ? (stat.totalOverheal / totalRaw) * 100 : 0,
        critPct: stat.hits > 0 ? (stat.crits / stat.hits) * 100 : 0,
        hps: stat.totalHealing / this.fightDurationSec,
        pctOfHealing: 0, // filled below
      });
    }

    const totalHealing = results.reduce((sum, r) => sum + r.totalHealing, 0);
    for (const r of results) {
      r.pctOfHealing = totalHealing > 0 ? (r.totalHealing / totalHealing) * 100 : 0;
    }

    // Sort by effective healing contribution
    results.sort((a, b) => b.totalHealing - a.totalHealing);
    return results;
  }

  // ======= COOLDOWNS =======
  computeCooldowns() {
    const results = {};

    // Circle of Healing
    const cohCasts = this.data.casts.filter(c =>
      SPELL_IDS.CIRCLE_OF_HEALING.includes(c.spellId)
    );
    const cohHeals = this.data.heals.filter(h =>
      SPELL_IDS.CIRCLE_OF_HEALING.includes(h.spellId)
    );
    const cohPossible = Math.floor(this.fightDuration / 6000) + 1;
    results.circleOfHealing = {
      casts: cohCasts.length,
      possibleCasts: cohPossible,
      usagePct: cohPossible > 0 ? (cohCasts.length / cohPossible) * 100 : 0,
      totalHealing: cohHeals.reduce((s, h) => s + h.amount, 0),
      totalOverheal: cohHeals.reduce((s, h) => s + h.overheal, 0),
      avgTargetsHit: cohCasts.length > 0 ? cohHeals.length / cohCasts.length : 0,
      timeOffCooldown: this.computeTimeOffCooldown(cohCasts, 6000),
    };

    // Prayer of Mending
    const pomCasts = this.data.casts.filter(c =>
      SPELL_IDS.PRAYER_OF_MENDING.includes(c.spellId)
    );
    const pomHeals = this.data.heals.filter(h =>
      SPELL_IDS.PRAYER_OF_MENDING_HEAL.includes(h.spellId) ||
      SPELL_IDS.PRAYER_OF_MENDING.includes(h.spellId)
    );
    const pomPossible = Math.floor(this.fightDuration / 10000) + 1;
    results.prayerOfMending = {
      casts: pomCasts.length,
      possibleCasts: pomPossible,
      usagePct: pomPossible > 0 ? (pomCasts.length / pomPossible) * 100 : 0,
      totalBounces: pomHeals.length,
      avgBouncesPerCast: pomCasts.length > 0 ? pomHeals.length / pomCasts.length : 0,
      totalHealing: pomHeals.reduce((s, h) => s + h.amount, 0),
      timeOffCooldown: this.computeTimeOffCooldown(pomCasts, 10000),
    };

    // Inner Focus
    const ifCasts = this.data.casts.filter(c =>
      MANA_COOLDOWNS.INNER_FOCUS.includes(c.spellId)
    );
    const ifPossible = Math.floor(this.fightDuration / 180000) + 1;
    results.innerFocus = {
      casts: ifCasts.length,
      possibleCasts: ifPossible,
      usagePct: ifPossible > 0 ? (ifCasts.length / ifPossible) * 100 : 0,
      // Try to find what spell was cast after Inner Focus
      usedOn: ifCasts.map(ifCast => {
        const nextCast = this.data.casts.find(c =>
          c.timestamp > ifCast.timestamp && c.spellKey !== 'INNER_FOCUS' &&
          c.timestamp - ifCast.timestamp < 5000
        );
        return nextCast ? nextCast.spellName : 'Unknown';
      }),
    };

    return results;
  }

  computeTimeOffCooldown(casts, cooldownMs) {
    if (casts.length === 0) return this.fightDuration;

    let totalOffCD = 0;
    // Time from fight start to first cast
    totalOffCD += casts[0].timestamp - this.data.fightStart;

    // Time between casts minus cooldown
    for (let i = 1; i < casts.length; i++) {
      const gap = casts[i].timestamp - casts[i - 1].timestamp;
      if (gap > cooldownMs) {
        totalOffCD += gap - cooldownMs;
      }
    }

    // Time from last cast to fight end
    const lastCast = casts[casts.length - 1];
    const endGap = this.data.fightEnd - lastCast.timestamp;
    if (endGap > cooldownMs) {
      totalOffCD += endGap - cooldownMs;
    }

    return totalOffCD;
  }

  // ======= CIRCLE OF HEALING =======
  computeCoH() {
    const cohCasts = this.data.casts.filter(c =>
      SPELL_IDS.CIRCLE_OF_HEALING.includes(c.spellId)
    );
    const cohHeals = this.data.heals.filter(h =>
      SPELL_IDS.CIRCLE_OF_HEALING.includes(h.spellId)
    );

    const totalCasts = cohCasts.length;
    if (totalCasts === 0) {
      return { totalCasts: 0, message: 'No Circle of Healing casts detected.' };
    }

    // Group heals by cast timestamp (within 100ms = same cast)
    const castGroups = [];
    let currentGroup = { timestamp: cohHeals[0]?.timestamp, heals: [] };

    for (const heal of cohHeals) {
      if (Math.abs(heal.timestamp - currentGroup.timestamp) < 100) {
        currentGroup.heals.push(heal);
      } else {
        if (currentGroup.heals.length > 0) castGroups.push(currentGroup);
        currentGroup = { timestamp: heal.timestamp, heals: [heal] };
      }
    }
    if (currentGroup.heals.length > 0) castGroups.push(currentGroup);

    // Compute metrics per cast
    const totalHealing = cohHeals.reduce((s, h) => s + h.amount, 0);
    const totalOverheal = cohHeals.reduce((s, h) => s + h.overheal, 0);
    const totalRaw = totalHealing + totalOverheal;
    const overhealPct = totalRaw > 0 ? (totalOverheal / totalRaw) * 100 : 0;
    const totalTargetsHit = cohHeals.length;
    const avgTargets = castGroups.length > 0 ? totalTargetsHit / castGroups.length : 0;
    const critCount = cohHeals.filter(h => h.isCrit).length;
    const critPct = totalTargetsHit > 0 ? (critCount / totalTargetsHit) * 100 : 0;

    // Cooldown efficiency: CoH has 6s CD
    const cohCD = 6000;
    const possibleCasts = Math.floor(this.fightDuration / cohCD) + 1;
    const cdEfficiency = (totalCasts / possibleCasts) * 100;

    // Per-cast breakdown
    const castDetails = castGroups.map(group => {
      const healing = group.heals.reduce((s, h) => s + h.amount, 0);
      const overheal = group.heals.reduce((s, h) => s + h.overheal, 0);
      const raw = healing + overheal;
      const targets = group.heals.map(h => h.targetName || 'Unknown');
      return {
        time: group.timestamp - this.data.fightStart,
        targetsHit: group.heals.length,
        targets,
        healing,
        overheal,
        overhealPct: raw > 0 ? (overheal / raw) * 100 : 0,
        hasCrit: group.heals.some(h => h.isCrit),
      };
    });

    // Identify wasted casts (>80% overheal)
    const wastedCasts = castDetails.filter(c => c.overhealPct > 80).length;

    // Target frequency (who got healed by CoH most)
    const targetFreq = new Map();
    for (const heal of cohHeals) {
      const name = heal.targetName || 'Unknown';
      if (!targetFreq.has(name)) targetFreq.set(name, { name, count: 0, healing: 0, overheal: 0 });
      const entry = targetFreq.get(name);
      entry.count++;
      entry.healing += heal.amount;
      entry.overheal += heal.overheal;
    }
    const targetBreakdown = Array.from(targetFreq.values())
      .sort((a, b) => b.count - a.count);

    return {
      totalCasts,
      possibleCasts,
      cdEfficiency,
      avgTargets,
      totalHealing,
      totalOverheal,
      overhealPct,
      critPct,
      wastedCasts,
      castDetails,
      targetBreakdown,
      hps: totalHealing / this.fightDurationSec,
    };
  }

  // ======= PROCS =======
  computeProcs() {
    const results = {};

    // Helper: find the fade event matching a gain
    const findFade = (gains, fades, gainIndex, defaultDuration) => {
      const gainTime = gains[gainIndex].timestamp;
      const nextGain = gainIndex + 1 < gains.length ? gains[gainIndex + 1].timestamp : Infinity;
      const matchingFade = fades.find(f => f.timestamp > gainTime && f.timestamp < nextGain);
      return matchingFade ? matchingFade.timestamp : Math.min(gainTime + defaultDuration, this.data.fightEnd);
    };

    // Helper: find first cast in a time window
    const castsInWindow = (start, end, spellFilter = null) => {
      return this.data.casts.filter(c =>
        c.timestamp >= start && c.timestamp <= end &&
        (!spellFilter || spellFilter(c))
      );
    };

    // Helper: get mana cost of a cast from mana events
    const getManaCost = (cast) => {
      const manaEvent = this.data.manaEvents.find(e =>
        e.spellId === cast.spellId && Math.abs(e.timestamp - cast.timestamp) < 100
      );
      return manaEvent ? manaEvent.manaCost : 0;
    };

    // ---- CLEARCASTING ----
    const ccGains = this.data.buffs.filter(b => PROC_BUFFS.CLEARCASTING.ids.includes(b.auraId) && b.type === 'gain');
    const ccFades = this.data.buffs.filter(b => PROC_BUFFS.CLEARCASTING.ids.includes(b.auraId) && b.type === 'fade');

    if (ccGains.length > 0) {
      const ccDetails = [];
      let totalManaSaved = 0;
      let totalPotentialSavings = 0;
      // Max rank Greater Heal costs ~820, Prayer of Healing ~1255
      const maxExpensiveSpellCost = 820;

      for (let i = 0; i < ccGains.length; i++) {
        const gainTime = ccGains[i].timestamp;
        const fadeTime = findFade(ccGains, ccFades, i, 15000);

        // Find the first cast after proc (the one that consumed it)
        const nextCasts = castsInWindow(gainTime + 50, fadeTime + 500);
        const consumedBy = nextCasts.length > 0 ? nextCasts[0] : null;

        let manaSaved = 0;
        let spellUsed = null;
        let isOptimal = false;

        if (consumedBy) {
          manaSaved = getManaCost(consumedBy);
          spellUsed = consumedBy.spellName;
          // Optimal = used on an expensive spell (Greater Heal max rank, PoH, etc.)
          isOptimal = manaSaved >= 600;
        }

        totalManaSaved += manaSaved;
        totalPotentialSavings += maxExpensiveSpellCost;

        ccDetails.push({
          time: gainTime - this.data.fightStart,
          spellUsed,
          manaSaved,
          isOptimal,
          wasted: !consumedBy,
        });
      }

      results.clearcasting = {
        name: 'Clearcasting (Holy Concentration)',
        description: 'After a critical heal, your next spell costs no mana. Best used on your most expensive spell.',
        procs: ccGains.length,
        totalManaSaved,
        totalPotentialSavings,
        efficiency: totalPotentialSavings > 0 ? (totalManaSaved / totalPotentialSavings) * 100 : 0,
        optimalUses: ccDetails.filter(d => d.isOptimal).length,
        suboptimalUses: ccDetails.filter(d => !d.isOptimal && !d.wasted).length,
        wasted: ccDetails.filter(d => d.wasted).length,
        details: ccDetails,
      };
    }

    // ---- FLEXIBILITY (T4 2pc) ----
    const flexGains = this.data.buffs.filter(b => PROC_BUFFS.FLEXIBILITY.ids.includes(b.auraId) && b.type === 'gain');
    const flexFades = this.data.buffs.filter(b => PROC_BUFFS.FLEXIBILITY.ids.includes(b.auraId) && b.type === 'fade');

    if (flexGains.length > 0) {
      const flexDetails = [];
      let ghFollowups = 0;

      for (let i = 0; i < flexGains.length; i++) {
        const gainTime = flexGains[i].timestamp;
        const fadeTime = findFade(flexGains, flexFades, i, 6000);

        // Did they cast Greater Heal during this window?
        const ghCasts = castsInWindow(gainTime + 50, fadeTime + 500,
          c => SPELL_IDS.GREATER_HEAL.includes(c.spellId));
        const otherCasts = castsInWindow(gainTime + 50, fadeTime + 500,
          c => !SPELL_IDS.GREATER_HEAL.includes(c.spellId));

        const usedOnGH = ghCasts.length > 0;
        if (usedOnGH) ghFollowups++;

        flexDetails.push({
          time: gainTime - this.data.fightStart,
          usedOnGH,
          castInstead: !usedOnGH && otherCasts.length > 0 ? otherCasts[0].spellName : null,
          expired: !usedOnGH && otherCasts.length === 0,
        });
      }

      results.flexibility = {
        name: 'Flexibility (T4 2pc)',
        description: 'Flash Heal casts proc a cast time reduction for Greater Heal. Capitalize by following Flash Heals with Greater Heals.',
        procs: flexGains.length,
        ghFollowups,
        ghRate: (ghFollowups / flexGains.length) * 100,
        missedOpportunities: flexGains.length - ghFollowups,
        details: flexDetails,
      };
    }

    // ---- SURGE OF LIGHT ----
    const solGains = this.data.buffs.filter(b => PROC_BUFFS.SURGE_OF_LIGHT.ids.includes(b.auraId) && b.type === 'gain');
    const solFades = this.data.buffs.filter(b => PROC_BUFFS.SURGE_OF_LIGHT.ids.includes(b.auraId) && b.type === 'fade');

    if (solGains.length > 0) {
      const solDetails = [];

      for (let i = 0; i < solGains.length; i++) {
        const gainTime = solGains[i].timestamp;
        const fadeTime = findFade(solGains, solFades, i, 10000);

        // Was Flash Heal cast during this window?
        const fhCasts = castsInWindow(gainTime + 50, fadeTime + 500,
          c => SPELL_IDS.FLASH_HEAL.includes(c.spellId));

        const consumed = fhCasts.length > 0;
        const reactionTime = consumed ? fhCasts[0].timestamp - gainTime : null;

        solDetails.push({
          time: gainTime - this.data.fightStart,
          consumed,
          reactionTime,
        });
      }

      const consumedCount = solDetails.filter(d => d.consumed).length;
      const reactionTimes = solDetails.filter(d => d.reactionTime !== null).map(d => d.reactionTime);
      const avgReaction = reactionTimes.length > 0 ?
        reactionTimes.reduce((s, t) => s + t, 0) / reactionTimes.length : 0;

      results.surgeOfLight = {
        name: 'Surge of Light',
        description: 'After a spell crit, your next Flash Heal is instant and free. React quickly to use before it expires (10s).',
        procs: solGains.length,
        consumed: consumedCount,
        wasted: solGains.length - consumedCount,
        usageRate: (consumedCount / solGains.length) * 100,
        avgReactionMs: Math.round(avgReaction),
        details: solDetails,
      };
    }

    // ---- EYE OF GRUUL ----
    const eogGains = this.data.buffs.filter(b => PROC_BUFFS.EYE_OF_GRUUL.ids.includes(b.auraId) && b.type === 'gain');
    const eogFades = this.data.buffs.filter(b => PROC_BUFFS.EYE_OF_GRUUL.ids.includes(b.auraId) && b.type === 'fade');

    if (eogGains.length > 0) {
      const eogDetails = [];
      const manaDiscount = 450;

      for (let i = 0; i < eogGains.length; i++) {
        const gainTime = eogGains[i].timestamp;
        const fadeTime = findFade(eogGains, eogFades, i, 15000);

        const nextCasts = castsInWindow(gainTime + 50, fadeTime + 500);
        const consumedBy = nextCasts.length > 0 ? nextCasts[0] : null;
        const spellCost = consumedBy ? getManaCost(consumedBy) : 0;
        // Optimal if used on a spell that costs more than 450 (otherwise you waste some discount)
        const isOptimal = spellCost >= manaDiscount;

        eogDetails.push({
          time: gainTime - this.data.fightStart,
          spellUsed: consumedBy ? consumedBy.spellName : null,
          spellCost,
          wasted: !consumedBy,
          isOptimal,
        });
      }

      const consumedCount = eogDetails.filter(d => !d.wasted).length;
      results.eyeOfGruul = {
        name: 'Eye of Gruul',
        description: 'Proc reduces next heal mana cost by 450. Maximize value by using on an expensive spell (Greater Heal, Prayer of Healing).',
        procs: eogGains.length,
        consumed: consumedCount,
        wasted: eogGains.length - consumedCount,
        optimalUses: eogDetails.filter(d => d.isOptimal).length,
        details: eogDetails,
      };
    }

    // ---- HASTE PROCS (Scarab, Bloodlust, Power Infusion) ----
    const hasteProcs = [
      { key: 'QUAGMIRRANS_EYE', duration: 6000 },
      { key: 'BLOODLUST', duration: 40000 },
      { key: 'POWER_INFUSION', duration: 15000 },
    ];

    results.hasteWindows = [];

    for (const { key, duration } of hasteProcs) {
      const procDef = PROC_BUFFS[key];
      const gains = this.data.buffs.filter(b => procDef.ids.includes(b.auraId) && b.type === 'gain');
      const fadesH = this.data.buffs.filter(b => procDef.ids.includes(b.auraId) && b.type === 'fade');

      if (gains.length === 0) continue;

      const windows = [];
      for (let i = 0; i < gains.length; i++) {
        const gainTime = gains[i].timestamp;
        const fadeTime = findFade(gains, fadesH, i, duration);
        const windowDuration = fadeTime - gainTime;

        const windowCasts = castsInWindow(gainTime, fadeTime);
        const ghCasts = windowCasts.filter(c => SPELL_IDS.GREATER_HEAL.includes(c.spellId));
        const fhCasts = windowCasts.filter(c => SPELL_IDS.FLASH_HEAL.includes(c.spellId));
        const pohCasts = windowCasts.filter(c => SPELL_IDS.PRAYER_OF_HEALING.includes(c.spellId));

        windows.push({
          time: gainTime - this.data.fightStart,
          duration: windowDuration,
          totalCasts: windowCasts.length,
          ghCasts: ghCasts.length,
          fhCasts: fhCasts.length,
          pohCasts: pohCasts.length,
          // Haste benefits long casts most
          longCastRatio: windowCasts.length > 0 ?
            (ghCasts.length + pohCasts.length) / windowCasts.length * 100 : 0,
        });
      }

      results.hasteWindows.push({
        name: procDef.name,
        description: procDef.description,
        procs: gains.length,
        windows,
        avgCastsPerWindow: windows.reduce((s, w) => s + w.totalCasts, 0) / windows.length,
        avgLongCastRatio: windows.reduce((s, w) => s + w.longCastRatio, 0) / windows.length,
      });
    }

    return results;
  }

  // ======= RENEW =======
  computeRenew() {
    const renewCasts = this.data.casts.filter(c =>
      SPELL_IDS.RENEW.includes(c.spellId)
    );
    const renewHeals = this.data.heals.filter(h =>
      SPELL_IDS.RENEW.includes(h.spellId) && h.isHoT
    );

    // Group by target
    const targetMap = new Map();
    for (const cast of renewCasts) {
      const key = cast.targetId;
      if (!targetMap.has(key)) {
        targetMap.set(key, { name: cast.targetName, casts: [], ticks: [] });
      }
      targetMap.get(key).casts.push(cast);
    }
    for (const heal of renewHeals) {
      const key = heal.targetId;
      if (targetMap.has(key)) {
        targetMap.get(key).ticks.push(heal);
      }
    }

    // Detect clipped renews (refreshed before 5 ticks)
    let totalClipped = 0;
    for (const [targetId, data] of targetMap) {
      const casts = data.casts.sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 1; i < casts.length; i++) {
        const gap = casts[i].timestamp - casts[i - 1].timestamp;
        if (gap < 15000) { // Refreshed before full duration
          totalClipped++;
        }
      }
    }

    // Tank renew uptime
    const tankUptime = [];
    for (const [targetId, data] of targetMap) {
      if (this.selectedTanks.has(targetId)) {
        // Calculate approximate uptime
        const casts = data.casts.sort((a, b) => a.timestamp - b.timestamp);
        let coveredTime = 0;
        let lastEnd = 0;
        for (const cast of casts) {
          const start = Math.max(cast.timestamp, lastEnd);
          const end = cast.timestamp + 15000;
          if (start < end) {
            coveredTime += Math.min(end, this.data.fightEnd) - start;
          }
          lastEnd = Math.max(lastEnd, end);
        }
        const uptimePct = (coveredTime / this.fightDuration) * 100;
        tankUptime.push({ targetId, name: data.name, uptimePct, casts: casts.length });
      }
    }

    const totalRenewHealing = renewHeals.reduce((s, h) => s + h.amount, 0);
    const totalRenewOverheal = renewHeals.reduce((s, h) => s + h.overheal, 0);
    const renewRaw = totalRenewHealing + totalRenewOverheal;

    return {
      totalCasts: renewCasts.length,
      totalTicks: renewHeals.length,
      avgTicksPerCast: renewCasts.length > 0 ? renewHeals.length / renewCasts.length : 0,
      clippedRenews: totalClipped,
      clipPct: renewCasts.length > 0 ? (totalClipped / renewCasts.length) * 100 : 0,
      totalHealing: totalRenewHealing,
      overhealPct: renewRaw > 0 ? (totalRenewOverheal / renewRaw) * 100 : 0,
      uniqueTargets: targetMap.size,
      tankUptime,
      targetBreakdown: Array.from(targetMap.entries()).map(([id, d]) => ({
        targetId: id,
        name: d.name,
        casts: d.casts.length,
        ticks: d.ticks.length,
        healing: d.ticks.reduce((s, t) => s + t.amount, 0),
        isTank: this.selectedTanks.has(id),
      })).sort((a, b) => b.casts - a.casts).slice(0, 15),
    };
  }

  // ======= MANA =======
  computeMana() {
    const manaEvents = this.data.manaEvents;

    // Track mana over time using corrected field mapping
    const manaTimeline = [];
    let maxMana = 0;
    let startMana = null;
    let endMana = null;
    let totalManaSpent = 0;

    // Compute mana spent per spell
    const manaBySpell = new Map();

    for (const event of manaEvents) {
      if (event.maxMana > maxMana) maxMana = event.maxMana;
      if (startMana === null) {
        // First event: estimate starting mana as currentMana + manaCost of first cast
        startMana = event.currentMana + (event.manaCost || 0);
      }
      endMana = event.currentMana;
      totalManaSpent += event.manaCost || 0;

      // Track mana cost per spell
      if (event.manaCost > 0 && event.spellName) {
        const key = event.spellName;
        if (!manaBySpell.has(key)) {
          manaBySpell.set(key, { name: key, totalCost: 0, casts: 0 });
        }
        const entry = manaBySpell.get(key);
        entry.totalCost += event.manaCost;
        entry.casts++;
      }

      manaTimeline.push({
        time: event.fightTime,
        mana: event.currentMana,
        max: maxMana,
      });
    }

    // Detect mana gains (where current mana goes UP between events)
    let totalManaRegenerated = 0;
    for (let i = 1; i < manaEvents.length; i++) {
      const prev = manaEvents[i - 1];
      const curr = manaEvents[i];
      // Expected mana = prev.currentMana - curr.manaCost
      // If actual > expected, the difference is regen/gain
      const expectedMana = prev.currentMana - (curr.manaCost || 0);
      if (curr.currentMana > expectedMana) {
        totalManaRegenerated += curr.currentMana - expectedMana;
      }
    }

    // Mana potion/rune usage
    const potionIds = [...MANA_COOLDOWNS.SUPER_MANA_POTION, ...MANA_COOLDOWNS.MANA_EMERALD];
    const runeIds = [...MANA_COOLDOWNS.DARK_RUNE, ...MANA_COOLDOWNS.DEMONIC_RUNE];
    const sfIds = MANA_COOLDOWNS.SHADOWFIEND;

    const potionUses = this.data.casts.filter(c => potionIds.includes(c.spellId));
    const runeUses = this.data.casts.filter(c => runeIds.includes(c.spellId));
    const shadowfiendUses = this.data.casts.filter(c => sfIds.includes(c.spellId));

    // Innervate received (check buffs)
    const innervates = this.data.buffs.filter(b =>
      AURA_IDS.INNERVATE.includes(b.auraId) && b.type === 'gain'
    );

    // Spell cost breakdown sorted by total cost
    const spellCostBreakdown = Array.from(manaBySpell.values())
      .sort((a, b) => b.totalCost - a.totalCost);

    // Mana-saving procs
    const clearcastProcs = this.data.buffs.filter(b =>
      PROC_BUFFS.CLEARCASTING.ids.includes(b.auraId) && b.type === 'gain'
    ).length;
    const eyeOfGrulProcs = this.data.buffs.filter(b =>
      PROC_BUFFS.EYE_OF_GRUUL.ids.includes(b.auraId) && b.type === 'gain'
    ).length;

    return {
      maxMana,
      startMana: startMana || maxMana,
      endMana: endMana || 0,
      totalManaSpent,
      totalManaRegenerated,
      manaPerSecond: totalManaSpent / this.fightDurationSec,
      spellCostBreakdown,
      manaTimeline,
      potionUses: potionUses.map(c => ({ time: c.fightTime, name: c.spellName })),
      runeUses: runeUses.map(c => ({ time: c.fightTime, name: c.spellName })),
      shadowfiendUses: shadowfiendUses.map(c => ({ time: c.fightTime })),
      innervates: innervates.map(b => ({ time: b.fightTime })),
      consumablesUsed: potionUses.length + runeUses.length,
      clearcastProcs,
      eyeOfGrulProcs,
    };
  }

  // ======= ACTIVITY =======
  computeActivity() {
    const casts = this.data.casts;
    if (casts.length === 0) {
      return { gcdUsage: 0, avgLatency: 0, idleTime: 0, latencyBreakdown: [] };
    }

    let totalActiveTime = 0;
    const latencies = [];

    for (let i = 0; i < casts.length; i++) {
      const cast = casts[i];
      const spellData = cast.spellKey ? SPELL_DATA[cast.spellKey] : null;
      const castDuration = spellData ? Math.max(spellData.baseCastTime, spellData.gcd || 1500) : 1500;

      totalActiveTime += castDuration;

      // Latency: time between end of one cast and start of next
      if (i < casts.length - 1) {
        const nextCast = casts[i + 1];
        const expectedEnd = cast.timestamp + (cast.castTime || castDuration);
        const gap = nextCast.startTimestamp - expectedEnd;

        // Only count reasonable gaps (< 3s) as latency, longer = movement/mechanics
        if (gap > 0 && gap < 3000) {
          latencies.push({
            time: cast.fightTime,
            gap,
            afterSpell: cast.spellName,
            beforeSpell: nextCast.spellName,
          });
        }
      }
    }

    const gcdUsage = Math.min(100, (totalActiveTime / this.fightDuration) * 100);
    const avgLatency = latencies.length > 0
      ? latencies.reduce((s, l) => s + l.gap, 0) / latencies.length
      : 0;
    const idleTime = Math.max(0, this.fightDuration - totalActiveTime);

    return {
      gcdUsage,
      avgLatency,
      idleTime,
      idleTimePct: (idleTime / this.fightDuration) * 100,
      totalCasts: casts.length,
      castsPerMinute: (casts.length / this.fightDurationSec) * 60,
      latencyBreakdown: latencies.slice(0, 50), // Cap at 50 for UI
    };
  }

  // ======= TIMELINE =======
  buildTimeline() {
    // Merge casts and heals into a unified timeline
    const entries = [];

    for (const heal of this.data.heals) {
      entries.push({
        time: heal.fightTime,
        timestamp: heal.timestamp,
        type: 'heal',
        spellName: heal.spellName,
        spellId: heal.spellId,
        target: heal.targetName,
        amount: heal.amount,
        overheal: heal.overheal,
        isCrit: heal.isCrit,
        isHoT: heal.isHoT,
        school: getSpellSchool(heal.spellId),
      });
    }

    // Add buff events
    for (const buff of this.data.buffs) {
      if (buff.type === 'gain') {
        entries.push({
          time: buff.fightTime,
          timestamp: buff.timestamp,
          type: 'buff',
          spellName: buff.auraName,
          target: '',
          amount: 0,
          overheal: 0,
        });
      }
    }

    entries.sort((a, b) => a.timestamp - b.timestamp);
    return entries;
  }

  // ======= OBSERVATIONS =======
  generateObservations() {
    const obs = [];
    const summary = this.computeSummary();
    const cooldowns = this.computeCooldowns();
    const renew = this.computeRenew();
    const activity = this.computeActivity();

    // Overheal check
    if (summary.overhealPct > 40) {
      obs.push({ type: 'warning', text: `High overall overheal (${summary.overhealPct.toFixed(1)}%). Consider using lower rank heals or timing heals better.` });
    } else if (summary.overhealPct < 20) {
      obs.push({ type: 'good', text: `Good overheal management (${summary.overhealPct.toFixed(1)}%).` });
    }

    // CoH usage
    if (cooldowns.circleOfHealing.casts > 0) {
      if (cooldowns.circleOfHealing.usagePct < 50) {
        obs.push({ type: 'warning', text: `Circle of Healing used ${cooldowns.circleOfHealing.casts}/${cooldowns.circleOfHealing.possibleCasts} possible casts (${cooldowns.circleOfHealing.usagePct.toFixed(0)}%). This is your most efficient heal — try to use it on cooldown when raid damage is present.` });
      } else if (cooldowns.circleOfHealing.usagePct > 75) {
        obs.push({ type: 'good', text: `Good Circle of Healing usage (${cooldowns.circleOfHealing.usagePct.toFixed(0)}% of possible casts).` });
      }
    }

    // PoM usage
    if (cooldowns.prayerOfMending.casts > 0) {
      if (cooldowns.prayerOfMending.usagePct < 40) {
        obs.push({ type: 'warning', text: `Prayer of Mending used ${cooldowns.prayerOfMending.casts}/${cooldowns.prayerOfMending.possibleCasts} possible casts. Keep it bouncing — it's free HPS.` });
      }
      if (cooldowns.prayerOfMending.avgBouncesPerCast < 3) {
        obs.push({ type: 'info', text: `Prayer of Mending averaged ${cooldowns.prayerOfMending.avgBouncesPerCast.toFixed(1)} bounces per cast. Ideal is 5. Consider casting on tanks taking consistent damage.` });
      }
    }

    // GCD usage
    if (activity.gcdUsage < 70) {
      obs.push({ type: 'warning', text: `GCD usage is ${activity.gcdUsage.toFixed(0)}%. Significant downtime detected — are you moving a lot or running OOM?` });
    } else if (activity.gcdUsage > 90) {
      obs.push({ type: 'good', text: `Excellent GCD usage (${activity.gcdUsage.toFixed(0)}%). Very active healing.` });
    }

    // Latency
    if (activity.avgLatency > 200) {
      obs.push({ type: 'warning', text: `Average latency between casts is ${activity.avgLatency.toFixed(0)}ms. Try to queue your next spell earlier.` });
    }

    // Renew clipping
    if (renew.clipPct > 20) {
      obs.push({ type: 'warning', text: `${renew.clipPct.toFixed(0)}% of Renews were clipped (refreshed before all ticks). Let them tick fully for better efficiency.` });
    }

    return obs;
  }
}
