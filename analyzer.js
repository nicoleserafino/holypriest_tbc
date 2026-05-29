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

  getSpellManaCost(spellId) {
    return getSpellManaCost(spellId) || 0;
  }

  getManaCostForCast(cast) {
    const manaEvent = this.data.manaEvents.find(e =>
      e.spellId === cast.spellId && Math.abs(e.timestamp - cast.timestamp) < 100
    );
    return manaEvent && manaEvent.manaCost > 0 ? manaEvent.manaCost : this.getSpellManaCost(cast.spellId);
  }

  isExpensiveInnerFocusTarget(cast) {
    const rankInfo = SPELL_RANK_MAP[cast.spellId];
    if (!rankInfo) return false;
    const isMaxRankGreaterHeal = rankInfo.key === 'GREATER_HEAL' && rankInfo.rank === rankInfo.maxRank;
    return isMaxRankGreaterHeal || rankInfo.key === 'PRAYER_OF_HEALING';
  }

  /**
   * Run all analysis and return complete results
   */
  analyze() {
    return {
      summary: this.computeSummary(),
      throughput: this.computeThroughput(),
      downranking: this.computeDownranking(),
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

    for (const cast of this.data.casts) {
      const key = cast.spellKey || cast.spellName;
      if (spellStats.has(key)) {
        spellStats.get(key).casts++;
      }
    }

    const spellBreakdown = [];
    for (const stat of spellStats.values()) {
      const totalRaw = stat.totalHealing + stat.totalOverheal;
      spellBreakdown.push({
        ...stat,
        avgHeal: stat.hits > 0 ? stat.totalHealing / stat.hits : 0,
        overhealPct: totalRaw > 0 ? (stat.totalOverheal / totalRaw) * 100 : 0,
        critPct: stat.hits > 0 ? (stat.crits / stat.hits) * 100 : 0,
        hps: stat.totalHealing / this.fightDurationSec,
        pctOfHealing: 0,
      });
    }

    const totalHealing = spellBreakdown.reduce((sum, r) => sum + r.totalHealing, 0);
    for (const row of spellBreakdown) {
      row.pctOfHealing = totalHealing > 0 ? (row.totalHealing / totalHealing) * 100 : 0;
    }

    spellBreakdown.sort((a, b) => b.totalHealing - a.totalHealing);

    return {
      spellBreakdown,
      bindingHeal: this.computeBindingHeal(),
      healingSplit: this.computeHealingSplit(),
    };
  }

  // ======= COOLDOWNS =======
  computeCooldowns() {
    const results = {};

    const cohCasts = this.data.casts.filter(c =>
      SPELL_IDS.CIRCLE_OF_HEALING.includes(c.spellId)
    );
    const cohHeals = this.data.heals.filter(h =>
      SPELL_IDS.CIRCLE_OF_HEALING.includes(h.spellId)
    );
    const cohTotalRaw = cohHeals.reduce((s, h) => s + h.amount + h.overheal, 0);
    const cohOverhealAmt = cohHeals.reduce((s, h) => s + h.overheal, 0);
    results.circleOfHealing = {
      casts: cohCasts.length,
      totalHealing: cohHeals.reduce((s, h) => s + h.amount, 0),
      totalOverheal: cohOverhealAmt,
      overhealPct: cohTotalRaw > 0 ? (cohOverhealAmt / cohTotalRaw) * 100 : 0,
      avgTargetsHit: cohCasts.length > 0 ? cohHeals.length / cohCasts.length : 0,
    };

    const pomCasts = this.data.casts.filter(c =>
      SPELL_IDS.PRAYER_OF_MENDING.includes(c.spellId)
    );
    const pomHeals = this.data.heals.filter(h =>
      SPELL_IDS.PRAYER_OF_MENDING_HEAL.includes(h.spellId) ||
      SPELL_IDS.PRAYER_OF_MENDING.includes(h.spellId)
    );
    const pomPossible = Math.floor(this.fightDuration / 10000) + 1;
    const tankTargetedCasts = pomCasts.filter(cast => this.selectedTanks.has(cast.targetId));
    results.prayerOfMending = {
      casts: pomCasts.length,
      possibleCasts: pomPossible,
      usagePct: pomPossible > 0 ? (pomCasts.length / pomPossible) * 100 : 0,
      totalBounces: pomHeals.length,
      avgBouncesPerCast: pomCasts.length > 0 ? pomHeals.length / pomCasts.length : 0,
      totalHealing: pomHeals.reduce((s, h) => s + h.amount, 0),
      timeOffCooldown: this.computeTimeOffCooldown(pomCasts, 10000),
      tankTargetedCasts: tankTargetedCasts.length,
      tankTargetingRate: pomCasts.length > 0 ? (tankTargetedCasts.length / pomCasts.length) * 100 : 0,
      targetBreakdown: pomCasts.map(cast => ({
        time: cast.fightTime,
        targetName: cast.targetName,
        isTank: this.selectedTanks.has(cast.targetId),
      })),
    };

    const ifCasts = this.data.casts.filter(c =>
      MANA_COOLDOWNS.INNER_FOCUS.includes(c.spellId)
    );
    const ifPossible = Math.floor(this.fightDuration / 180000) + 1;
    results.innerFocus = {
      casts: ifCasts.length,
      possibleCasts: ifPossible,
      usagePct: ifPossible > 0 ? (ifCasts.length / ifPossible) * 100 : 0,
      usedOn: ifCasts.map(ifCast => {
        const nextCast = this.data.casts.find(c =>
          c.timestamp > ifCast.timestamp && !MANA_COOLDOWNS.INNER_FOCUS.includes(c.spellId) &&
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

    // Average healing per cast
    const avgHealingPerCast = castGroups.length > 0 ?
      totalHealing / castGroups.length : 0;

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
      avgTargets,
      avgHealingPerCast,
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

    const findFade = (gains, fades, gainIndex, defaultDuration) => {
      const gainTime = gains[gainIndex].timestamp;
      const nextGain = gainIndex + 1 < gains.length ? gains[gainIndex + 1].timestamp : Infinity;
      const matchingFade = fades.find(f => f.timestamp > gainTime && f.timestamp < nextGain);
      return matchingFade ? matchingFade.timestamp : Math.min(gainTime + defaultDuration, this.data.fightEnd);
    };

    const castsInWindow = (start, end, spellFilter = null) => {
      return this.data.casts.filter(c =>
        c.timestamp >= start && c.timestamp <= end &&
        (!spellFilter || spellFilter(c))
      );
    };

    const getManaCost = (cast) => this.getManaCostForCast(cast);

    const ccGains = this.data.buffs.filter(b => PROC_BUFFS.CLEARCASTING.ids.includes(b.auraId) && b.type === 'gain');
    const ccFades = this.data.buffs.filter(b => PROC_BUFFS.CLEARCASTING.ids.includes(b.auraId) && b.type === 'fade');

    if (ccGains.length > 0) {
      const ccDetails = [];
      let totalManaSaved = 0;
      let totalPotentialSavings = 0;
      const maxExpensiveSpellCost = Math.max(
        this.getSpellManaCost(SPELL_IDS.GREATER_HEAL[SPELL_IDS.GREATER_HEAL.length - 1]),
        this.getSpellManaCost(SPELL_IDS.PRAYER_OF_HEALING[SPELL_IDS.PRAYER_OF_HEALING.length - 1])
      );

      for (let i = 0; i < ccGains.length; i++) {
        const gainTime = ccGains[i].timestamp;
        const fadeTime = findFade(ccGains, ccFades, i, 15000);
        const nextCasts = castsInWindow(gainTime + 50, fadeTime + 500);
        const consumedBy = nextCasts.length > 0 ? nextCasts[0] : null;

        let manaSaved = 0;
        let spellUsed = null;
        let isOptimal = false;

        if (consumedBy) {
          manaSaved = getManaCost(consumedBy);
          spellUsed = consumedBy.spellName;
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

    const flexEvents = this.data.buffs.filter(b =>
      PROC_BUFFS.FLEXIBILITY.ids.includes(b.auraId)
    );

    if (flexEvents.length > 0) {
      const maxStacks = 5;
      const flexDetails = [];
      let currentStacks = 0;
      let maxStackReachedAt = null;

      for (let i = 0; i < flexEvents.length; i++) {
        const event = flexEvents[i];

        if (event.type === 'gain') {
          if (currentStacks === 0) currentStacks = 1;
          if (currentStacks >= maxStacks && maxStackReachedAt === null) {
            maxStackReachedAt = event.timestamp;
          }
        } else if (event.type === 'stack') {
          currentStacks = event.stack;
          if (currentStacks >= maxStacks && maxStackReachedAt === null) {
            maxStackReachedAt = event.timestamp;
          }
        } else if (event.type === 'fade') {
          const fadeTime = event.timestamp;

          if (maxStackReachedAt !== null) {
            const castAfterMax = castsInWindow(maxStackReachedAt + 50, fadeTime + 500);
            const ghCast = castAfterMax.find(c => SPELL_IDS.GREATER_HEAL.includes(c.spellId));
            const otherCast = castAfterMax.find(c => !SPELL_IDS.GREATER_HEAL.includes(c.spellId) &&
              !SPELL_IDS.FLASH_HEAL.includes(c.spellId));

            flexDetails.push({
              time: maxStackReachedAt - this.data.fightStart,
              stacksAtUse: maxStacks,
              usedOnGH: !!ghCast,
              spellUsed: ghCast ? 'Greater Heal' : (otherCast ? otherCast.spellName : null),
              expired: !ghCast && !otherCast,
              status: ghCast ? 'optimal' : (!otherCast ? 'expired' : 'suboptimal'),
            });
          } else if (currentStacks > 0 && currentStacks < maxStacks) {
            const castBeforeFade = castsInWindow(fadeTime - 3500, fadeTime + 500);
            const ghCast = castBeforeFade.find(c => SPELL_IDS.GREATER_HEAL.includes(c.spellId));

            flexDetails.push({
              time: fadeTime - this.data.fightStart,
              stacksAtUse: currentStacks,
              usedOnGH: !!ghCast,
              spellUsed: ghCast ? 'Greater Heal' : null,
              expired: !ghCast,
              status: ghCast ? 'early' : 'expired',
            });
          }

          currentStacks = 0;
          maxStackReachedAt = null;
        }
      }

      const optimalUses = flexDetails.filter(d => d.status === 'optimal').length;
      const earlyUses = flexDetails.filter(d => d.status === 'early').length;
      const suboptimalUses = flexDetails.filter(d => d.status === 'suboptimal').length;
      const expiredUses = flexDetails.filter(d => d.status === 'expired').length;

      results.flexibility = {
        name: 'Flexibility (T4 2pc)',
        description: 'Each Flash Heal builds a stack (max 5), reducing Greater Heal cast time. Ideally, build to 5 stacks then cast Greater Heal.',
        totalWindows: flexDetails.length,
        optimalUses,
        earlyUses,
        suboptimalUses,
        expiredUses,
        optimalRate: flexDetails.length > 0 ? (optimalUses / flexDetails.length) * 100 : 0,
        details: flexDetails,
      };
    }

    const solGains = this.data.buffs.filter(b => PROC_BUFFS.SURGE_OF_LIGHT.ids.includes(b.auraId) && b.type === 'gain');
    const solFades = this.data.buffs.filter(b => PROC_BUFFS.SURGE_OF_LIGHT.ids.includes(b.auraId) && b.type === 'fade');

    if (solGains.length > 0) {
      const solDetails = [];

      for (let i = 0; i < solGains.length; i++) {
        const gainTime = solGains[i].timestamp;
        const fadeTime = findFade(solGains, solFades, i, 10000);
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
        const isOptimal = spellCost >= manaDiscount;

        eogDetails.push({
          time: gainTime - this.data.fightStart,
          spellUsed: consumedBy ? consumedBy.spellName : null,
          spellCost,
          isOptimal,
          wasted: !consumedBy,
        });
      }

      results.eyeOfGruul = {
        name: 'Eye of Gruul',
        description: 'Your next spell costs 450 less mana. Use it on any spell that costs at least 450 mana to get full value.',
        procs: eogGains.length,
        consumed: eogDetails.filter(d => !d.wasted).length,
        wasted: eogDetails.filter(d => d.wasted).length,
        optimalUses: eogDetails.filter(d => d.isOptimal && !d.wasted).length,
        details: eogDetails,
      };
    }

    const innerFocusGains = this.data.buffs.filter(b => b.auraId === 14751 && b.type === 'gain');
    const innerFocusFades = this.data.buffs.filter(b => b.auraId === 14751 && b.type === 'fade');

    if (innerFocusGains.length > 0) {
      const details = [];

      for (let i = 0; i < innerFocusGains.length; i++) {
        const gainTime = innerFocusGains[i].timestamp;
        const fadeTime = findFade(innerFocusGains, innerFocusFades, i, 15000);
        const nextCasts = castsInWindow(gainTime + 50, fadeTime + 500,
          c => !MANA_COOLDOWNS.INNER_FOCUS.includes(c.spellId));
        const pairedCast = nextCasts.length > 0 ? nextCasts[0] : null;

        details.push({
          time: gainTime - this.data.fightStart,
          spellUsed: pairedCast ? pairedCast.spellName : null,
          manaSaved: pairedCast ? this.getSpellManaCost(pairedCast.spellId) : 0,
          isOptimal: pairedCast ? this.isExpensiveInnerFocusTarget(pairedCast) : false,
          wasted: !pairedCast,
        });
      }

      results.innerFocus = {
        name: 'Inner Focus Pairing',
        description: 'Inner Focus is best paired with max-rank Greater Heal or Prayer of Healing to maximize the free cast.',
        procs: innerFocusGains.length,
        consumed: details.filter(d => !d.wasted).length,
        wasted: details.filter(d => d.wasted).length,
        optimalUses: details.filter(d => d.isOptimal).length,
        suboptimalUses: details.filter(d => !d.isOptimal && !d.wasted).length,
        totalManaSaved: details.reduce((sum, d) => sum + d.manaSaved, 0),
        details,
      };
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
      return {
        gcdUsage: 0,
        avgLatency: 0,
        idleTime: 0,
        idleTimePct: 0,
        totalCasts: 0,
        castsPerMinute: 0,
        latencyBreakdown: [],
        cancelCasting: this.computeCancelCasting(),
        fiveSecondRule: this.computeFiveSecondRule(),
      };
    }

    let totalActiveTime = 0;
    const latencies = [];

    for (let i = 0; i < casts.length; i++) {
      const cast = casts[i];
      const spellData = cast.spellKey ? SPELL_DATA[cast.spellKey] : null;
      const castDuration = cast.castTime || (spellData ? Math.max(spellData.baseCastTime, spellData.gcd || 1500) : 1500);

      totalActiveTime += castDuration;

      if (i < casts.length - 1) {
        const nextCast = casts[i + 1];
        const expectedEnd = cast.timestamp + castDuration;
        const gap = nextCast.startTimestamp - expectedEnd;

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
      latencyBreakdown: latencies.slice(0, 50),
      cancelCasting: this.computeCancelCasting(),
      fiveSecondRule: this.computeFiveSecondRule(),
    };
  }

  computeDownranking() {
    const ranksBySpell = new Map();

    for (const heal of this.data.heals) {
      const rankInfo = SPELL_RANK_MAP[heal.spellId];
      if (!rankInfo) continue;
      const key = `${rankInfo.key}:${rankInfo.rank}`;
      if (!ranksBySpell.has(key)) {
        ranksBySpell.set(key, {
          spellId: heal.spellId,
          spellName: rankInfo.spellName,
          spellKey: rankInfo.key,
          rank: rankInfo.rank,
          maxRank: rankInfo.maxRank,
          casts: 0,
          hits: 0,
          totalHealing: 0,
          totalOverheal: 0,
        });
      }
      const entry = ranksBySpell.get(key);
      entry.hits++;
      entry.totalHealing += heal.amount;
      entry.totalOverheal += heal.overheal;
    }

    for (const cast of this.data.casts) {
      const rankInfo = SPELL_RANK_MAP[cast.spellId];
      if (!rankInfo) continue;
      const key = `${rankInfo.key}:${rankInfo.rank}`;
      if (!ranksBySpell.has(key)) {
        ranksBySpell.set(key, {
          spellId: cast.spellId,
          spellName: rankInfo.spellName,
          spellKey: rankInfo.key,
          rank: rankInfo.rank,
          maxRank: rankInfo.maxRank,
          casts: 0,
          hits: 0,
          totalHealing: 0,
          totalOverheal: 0,
        });
      }
      ranksBySpell.get(key).casts++;
    }

    const grouped = new Map();
    for (const row of ranksBySpell.values()) {
      const totalRaw = row.totalHealing + row.totalOverheal;
      const enriched = {
        ...row,
        avgHealAmount: row.hits > 0 ? row.totalHealing / row.hits : 0,
        overhealPct: totalRaw > 0 ? (row.totalOverheal / totalRaw) * 100 : 0,
      };
      if (!grouped.has(row.spellKey)) {
        grouped.set(row.spellKey, {
          spellName: row.spellName,
          spellKey: row.spellKey,
          totalCasts: 0,
          totalHealing: 0,
          ranks: [],
        });
      }
      const group = grouped.get(row.spellKey);
      group.totalCasts += enriched.casts;
      group.totalHealing += enriched.totalHealing;
      group.ranks.push(enriched);
    }

    const spellBreakdown = Array.from(grouped.values())
      .map(group => ({
        ...group,
        ranks: group.ranks
          .sort((a, b) => a.rank - b.rank)
          .map(rank => ({
            ...rank,
            usagePct: group.totalCasts > 0 ? (rank.casts / group.totalCasts) * 100 : 0,
            couldDownrankFurther: rank.overhealPct > 50,
          })),
      }))
      .sort((a, b) => b.totalHealing - a.totalHealing);

    const rankDistribution = spellBreakdown
      .flatMap(group => group.ranks.map(rank => ({
        spellName: group.spellName,
        rank: rank.rank,
        maxRank: rank.maxRank,
        casts: rank.casts,
        healing: rank.totalHealing,
        overhealPct: rank.overhealPct,
      })))
      .sort((a, b) => b.casts - a.casts || b.healing - a.healing);

    return { spellBreakdown, rankDistribution };
  }

  computeCancelCasting() {
    const begincasts = this.data.begincasts || [];
    const bySpell = new Map();

    for (const begincast of begincasts) {
      const key = begincast.spellKey || begincast.spellId;
      if (!bySpell.has(key)) {
        bySpell.set(key, {
          spellName: begincast.spellName,
          begincasts: 0,
          successful: 0,
          cancels: 0,
        });
      }
      const row = bySpell.get(key);
      row.begincasts++;
      if (begincast.canceled) row.cancels++;
      else row.successful++;
    }

    const totalBegincasts = begincasts.length;
    const cancels = begincasts.filter(c => c.canceled).length;

    return {
      totalBegincasts,
      successfulCasts: totalBegincasts - cancels,
      cancels,
      cancelRate: totalBegincasts > 0 ? (cancels / totalBegincasts) * 100 : 0,
      spellBreakdown: Array.from(bySpell.values())
        .map(row => ({
          ...row,
          cancelRate: row.begincasts > 0 ? (row.cancels / row.begincasts) * 100 : 0,
        }))
        .sort((a, b) => b.cancels - a.cancels || b.begincasts - a.begincasts),
    };
  }

  computeFiveSecondRule() {
    const manaSpendingCasts = this.data.manaEvents
      .filter(event => event.manaCost > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (manaSpendingCasts.length === 0) {
      return {
        manaSpendingCasts: 0,
        timeInFiveSecondRule: 0,
        timeOutsideFiveSecondRule: this.fightDuration,
        spiritRegenPct: 100,
        regenWindows: [],
      };
    }

    const windows = [];
    for (const event of manaSpendingCasts) {
      const start = event.timestamp;
      const end = Math.min(event.timestamp + 5000, this.data.fightEnd);
      const last = windows[windows.length - 1];
      if (!last || start > last.end) {
        windows.push({ start, end });
      } else {
        last.end = Math.max(last.end, end);
      }
    }

    const timeInFiveSecondRule = windows.reduce((sum, window) => sum + (window.end - window.start), 0);
    const timeOutsideFiveSecondRule = Math.max(0, this.fightDuration - timeInFiveSecondRule);
    const regenWindows = [];
    let cursor = this.data.fightStart;

    for (const window of windows) {
      if (window.start > cursor) {
        regenWindows.push({
          start: cursor - this.data.fightStart,
          duration: window.start - cursor,
        });
      }
      cursor = Math.max(cursor, window.end);
    }

    if (cursor < this.data.fightEnd) {
      regenWindows.push({
        start: cursor - this.data.fightStart,
        duration: this.data.fightEnd - cursor,
      });
    }

    return {
      manaSpendingCasts: manaSpendingCasts.length,
      timeInFiveSecondRule,
      timeOutsideFiveSecondRule,
      spiritRegenPct: this.fightDuration > 0 ? (timeOutsideFiveSecondRule / this.fightDuration) * 100 : 0,
      regenWindows: regenWindows.filter(window => window.duration > 0).sort((a, b) => b.duration - a.duration),
    };
  }

  computeBindingHeal() {
    const damageEvents = (this.data.damageTaken || [])
      .filter(event => (event.amount || 0) + (event.absorbed || 0) + (event.overkill || 0) > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (damageEvents.length === 0) {
      return {
        timesDamaged: 0,
        bindingHealUsed: 0,
        flashHealUsedInstead: 0,
        missedOpportunities: 0,
        opportunities: [],
      };
    }

    const windows = [];
    for (const event of damageEvents) {
      const amount = (event.amount || 0) + (event.absorbed || 0) + (event.overkill || 0);
      const last = windows[windows.length - 1];
      if (!last || event.timestamp > last.end) {
        windows.push({ start: event.timestamp, end: event.timestamp + 5000, damageTaken: amount, hits: 1 });
      } else {
        last.end = Math.max(last.end, event.timestamp + 5000);
        last.damageTaken += amount;
        last.hits++;
      }
    }

    const opportunities = windows.map(window => {
      const response = this.data.casts.find(cast =>
        cast.timestamp >= window.start && cast.timestamp <= window.end &&
        (SPELL_IDS.BINDING_HEAL.includes(cast.spellId) || SPELL_IDS.FLASH_HEAL.includes(cast.spellId))
      );
      let outcome = 'missed';
      if (response) {
        outcome = SPELL_IDS.BINDING_HEAL.includes(response.spellId) ? 'binding-heal' : 'flash-heal';
      }
      return {
        time: window.start - this.data.fightStart,
        damageTaken: window.damageTaken,
        responseSpell: response ? response.spellName : 'No heal',
        outcome,
      };
    });

    return {
      timesDamaged: windows.length,
      bindingHealUsed: opportunities.filter(o => o.outcome === 'binding-heal').length,
      flashHealUsedInstead: opportunities.filter(o => o.outcome === 'flash-heal').length,
      missedOpportunities: opportunities.filter(o => o.outcome === 'missed').length,
      opportunities,
    };
  }

  computeHealingSplit() {
    const spellBreakdown = new Map();
    let tankHealing = 0;
    let raidHealing = 0;

    for (const heal of this.data.heals) {
      const isTank = this.selectedTanks.has(heal.targetId);
      const key = heal.spellKey || heal.spellName;
      if (!spellBreakdown.has(key)) {
        spellBreakdown.set(key, {
          name: heal.spellName,
          tankHealing: 0,
          raidHealing: 0,
        });
      }
      const row = spellBreakdown.get(key);
      if (isTank) {
        tankHealing += heal.amount;
        row.tankHealing += heal.amount;
      } else {
        raidHealing += heal.amount;
        row.raidHealing += heal.amount;
      }
    }

    const totalHealing = tankHealing + raidHealing;
    return {
      tankHealing,
      raidHealing,
      tankHealingPct: totalHealing > 0 ? (tankHealing / totalHealing) * 100 : 0,
      raidHealingPct: totalHealing > 0 ? (raidHealing / totalHealing) * 100 : 0,
      spellBreakdown: Array.from(spellBreakdown.values())
        .map(row => ({
          ...row,
          totalHealing: row.tankHealing + row.raidHealing,
          tankPct: row.tankHealing + row.raidHealing > 0 ? (row.tankHealing / (row.tankHealing + row.raidHealing)) * 100 : 0,
        }))
        .sort((a, b) => b.totalHealing - a.totalHealing),
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
      const cohOhPct = this.data.heals
        .filter(h => SPELL_IDS.CIRCLE_OF_HEALING.includes(h.spellId))
        .reduce((acc, h) => {
          acc.oh += h.overheal;
          acc.raw += h.amount + h.overheal;
          return acc;
        }, { oh: 0, raw: 0 });
      const cohOverheal = cohOhPct.raw > 0 ? (cohOhPct.oh / cohOhPct.raw) * 100 : 0;
      if (cohOverheal > 50) {
        obs.push({ type: 'warning', text: `Circle of Healing has ${cohOverheal.toFixed(0)}% overheal. Consider casting it only when multiple targets have taken damage.` });
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
