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
    this.actors = rawData.actors || {};
  }

  /**
   * Resolve actor name from ID
   */
  resolveActor(id, fallbackName) {
    return this.actors[id] || fallbackName || 'Unknown';
  }

  /**
   * Parse all events into structured format
   */
  parse() {
    const { casts, begincasts } = this.parseCasts();
    const heals = this.parseHeals();
    const buffs = this.parseBuffs();
    const manaEvents = this.parseManaEvents();
    const damageTaken = this.parseDamageTaken();

    this.linkHealsToCasts(casts, heals);

    return {
      casts,
      begincasts,
      heals,
      buffs,
      manaEvents,
      damageTaken,
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
    const begincasts = [];
    const pendingBegincasts = new Map();

    for (const event of this.rawData.castEvents) {
      if (!event.ability?.guid) continue;

      const spellId = event.ability.guid;
      const spellKey = getSpellDataKey(spellId);
      const baseEvent = {
        timestamp: event.timestamp,
        spellId,
        spellKey,
        spellName: event.ability.name || getSpellName(spellId),
        targetId: event.targetID,
        targetName: this.resolveActor(event.targetID, event.targetName),
        rank: getSpellRank(spellId),
        fightTime: event.timestamp - this.fightStart,
      };

      if (event.type === 'begincast') {
        const begincast = {
          ...baseEvent,
          matchedCastTimestamp: null,
          canceled: false,
        };
        begincasts.push(begincast);

        if (!pendingBegincasts.has(spellId)) {
          pendingBegincasts.set(spellId, []);
        }
        pendingBegincasts.get(spellId).push(begincast);
        continue;
      }

      if (event.type !== 'cast') continue;

      const pendingForSpell = pendingBegincasts.get(spellId) || [];
      const castWindow = Math.max(500, (SPELL_DATA[spellKey]?.baseCastTime || 0) + 500);
      let matchedBegincast = null;

      for (let i = 0; i < pendingForSpell.length; i++) {
        const candidate = pendingForSpell[i];
        const delta = event.timestamp - candidate.timestamp;
        if (candidate.matchedCastTimestamp) continue;
        if (delta >= 0 && delta <= castWindow) {
          matchedBegincast = candidate;
          pendingForSpell.splice(i, 1);
          break;
        }
      }

      if (pendingForSpell.length === 0) {
        pendingBegincasts.delete(spellId);
      }

      if (matchedBegincast) {
        matchedBegincast.matchedCastTimestamp = event.timestamp;
      }

      casts.push({
        ...baseEvent,
        startTimestamp: matchedBegincast ? matchedBegincast.timestamp : event.timestamp,
        castTime: matchedBegincast ? event.timestamp - matchedBegincast.timestamp : 0,
      });
    }

    for (const begincast of begincasts) {
      if (!begincast.matchedCastTimestamp) {
        begincast.canceled = true;
      }
    }

    return {
      casts: casts.sort((a, b) => a.timestamp - b.timestamp),
      begincasts: begincasts.sort((a, b) => a.timestamp - b.timestamp),
    };
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
        targetName: this.resolveActor(event.targetID, event.targetName),
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
          stack: event.stack || 1,
          fightTime: event.timestamp - this.fightStart,
        });
      } else if (event.type === 'applybuffstack') {
        activeBuffs.set(auraId, event.timestamp);
        buffs.push({
          type: 'stack',
          timestamp: event.timestamp,
          auraId,
          auraName: event.ability.name,
          stack: event.stack || 1,
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
   * Parse mana resource events (extracted from cast/heal events classResources)
   * WCL v1 classResources format: { amount: maxMana, max: manaCost, type: currentManaAfterCast }
   */
  parseManaEvents() {
    const events = [];

    for (const event of this.rawData.castEvents) {
      if (event.type !== 'cast') continue;
      if (event.classResources && event.classResources.length > 0) {
        const manaRes = event.classResources[0];
        if (manaRes && manaRes.amount !== undefined) {
          events.push({
            timestamp: event.timestamp,
            type: 'cast',
            manaCost: manaRes.max || 0,
            currentMana: manaRes.type,
            maxMana: manaRes.amount,
            spellId: event.ability?.guid,
            spellName: event.ability?.name,
            fightTime: event.timestamp - this.fightStart,
          });
        }
      }
    }

    events.sort((a, b) => a.timestamp - b.timestamp);
    return events;
  }

  parseDamageTaken() {
    const events = [];

    for (const event of this.rawData.damageTakenEvents || []) {
      events.push({
        timestamp: event.timestamp,
        sourceId: event.sourceID,
        sourceName: this.resolveActor(event.sourceID, event.sourceName),
        spellId: event.ability?.guid,
        spellName: event.ability?.name || 'Unknown',
        amount: event.amount || 0,
        absorbed: event.absorbed || 0,
        overkill: event.overkill || 0,
        fightTime: event.timestamp - this.fightStart,
      });
    }

    return events.sort((a, b) => a.timestamp - b.timestamp);
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
