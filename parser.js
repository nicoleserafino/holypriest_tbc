/**
 * Log Parser
 * Converts raw WCL events into structured healing data
 */

class LogParser {
  constructor(rawData, selectedTanks = []) {
    this.rawData = rawData;
    this.selectedTanks = selectedTanks;
    this.fightStart = rawData.fight.start_time;
    this.fightEnd = rawData.fight.end_time;
    this.fightDuration = this.fightEnd - this.fightStart;
  }

  /**
   * Parse all events into structured format
   */
  parse() {
    const casts = this.parseCasts();
    const heals = this.parseHeals();
    const buffs = this.parseBuffs();
    const manaEvents = this.parseManaEvents();

    // Link heals to casts where possible
    this.linkHealsToCasts(casts, heals);

    return {
      casts,
      heals,
      buffs,
      manaEvents,
      fightDuration: this.fightDuration,
      fightStart: this.fightStart,
      fightEnd: this.fightEnd,
    };
  }

  /**
   * Parse cast events
   */
  parseCasts() {
    const casts = [];
    const castStarts = new Map(); // spellId -> start timestamp

    for (const event of this.rawData.castEvents) {
      if (event.type === 'begincast') {
        castStarts.set(event.ability.guid, event.timestamp);
        continue;
      }

      if (event.type === 'cast') {
        const spellId = event.ability.guid;
        const spellKey = getSpellDataKey(spellId);
        const startTime = castStarts.get(spellId) || event.timestamp;
        castStarts.delete(spellId);

        casts.push({
          timestamp: event.timestamp,
          startTimestamp: startTime,
          spellId,
          spellKey,
          spellName: event.ability.name || getSpellName(spellId),
          targetId: event.targetID,
          targetName: event.targetName || 'Unknown',
          castTime: event.timestamp - startTime,
          rank: getSpellRank(spellId),
          fightTime: event.timestamp - this.fightStart,
        });
      }
    }

    return casts.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Parse healing events
   */
  parseHeals() {
    const heals = [];

    for (const event of this.rawData.healingEvents) {
      const spellId = event.ability.guid;

      heals.push({
        timestamp: event.timestamp,
        spellId,
        spellKey: getSpellDataKey(spellId),
        spellName: event.ability.name || getSpellName(spellId),
        targetId: event.targetID,
        targetName: event.targetName || 'Unknown',
        amount: event.amount || 0,
        overheal: event.overheal || 0,
        absorbed: event.absorbed || 0,
        hitType: event.hitType, // 1=normal, 2=crit
        isCrit: event.hitType === 2,
        isHoT: event.tick === true,
        fightTime: event.timestamp - this.fightStart,
      });
    }

    return heals.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Parse buff events
   */
  parseBuffs() {
    const buffs = [];
    const activeBuffs = new Map(); // auraId -> start time

    for (const event of this.rawData.buffEvents) {
      const auraId = event.ability.guid;

      if (event.type === 'applybuff' || event.type === 'refreshbuff') {
        activeBuffs.set(auraId, event.timestamp);
        buffs.push({
          type: 'gain',
          timestamp: event.timestamp,
          auraId,
          auraName: event.ability.name,
          fightTime: event.timestamp - this.fightStart,
        });
      } else if (event.type === 'removebuff') {
        const start = activeBuffs.get(auraId);
        activeBuffs.delete(auraId);
        buffs.push({
          type: 'fade',
          timestamp: event.timestamp,
          auraId,
          auraName: event.ability.name,
          duration: start ? event.timestamp - start : 0,
          fightTime: event.timestamp - this.fightStart,
        });
      }
    }

    return buffs;
  }

  /**
   * Parse mana resource events
   */
  parseManaEvents() {
    const events = [];

    for (const event of this.rawData.resourceEvents) {
      events.push({
        timestamp: event.timestamp,
        type: event.type,
        amount: event.resourceChange || 0,
        waste: event.waste || 0,
        currentMana: event.classResources?.[0]?.amount,
        maxMana: event.classResources?.[0]?.max,
        spellId: event.ability?.guid,
        spellName: event.ability?.name,
        fightTime: event.timestamp - this.fightStart,
      });
    }

    return events;
  }

  /**
   * Link heal events back to their originating cast
   */
  linkHealsToCasts(casts, heals) {
    // For direct heals, find the cast that produced each heal
    for (const heal of heals) {
      if (heal.isHoT) continue; // HoTs are tracked separately

      // Find the most recent cast of this spell to this target
      let bestCast = null;
      for (let i = casts.length - 1; i >= 0; i--) {
        const cast = casts[i];
        if (cast.spellId === heal.spellId && cast.timestamp <= heal.timestamp) {
          // Within 500ms window for direct heals
          if (heal.timestamp - cast.timestamp < 500) {
            bestCast = cast;
          }
          break;
        }
      }

      if (bestCast) {
        if (!bestCast.heals) bestCast.heals = [];
        bestCast.heals.push(heal);
        heal.linkedCast = bestCast;
      }
    }
  }
}
