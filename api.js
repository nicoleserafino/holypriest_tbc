/**
 * WCL v1 API Client
 * Handles authentication, pagination, and data fetching
 */

const WCL_API_URL = 'https://classic.warcraftlogs.com/v1';

class WCLApi {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async request(endpoint, params = {}) {
    const url = new URL(`${WCL_API_URL}/${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 401) throw new Error('Invalid API key. Check your WCL v1 key.');
      if (resp.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
      throw new Error(`API error ${resp.status} on ${endpoint}: ${text.slice(0, 100)}`);
    }
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON from ${endpoint}: ${text.slice(0, 80)}`);
    }
  }

  /**
   * Extract report ID from URL or raw string
   */
  static extractReportId(input) {
    input = input.trim();
    // Full URL: https://classic.warcraftlogs.com/reports/ABC123#...
    const urlMatch = input.match(/warcraftlogs\.com\/reports\/([A-Za-z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    // Raw ID
    if (/^[A-Za-z0-9]+$/.test(input)) return input;
    return null;
  }

  /**
   * Get report fights and actors
   */
  async getFights(reportId) {
    return this.request(`report/fights/${reportId}`);
  }

  /**
   * Get combatant info for a fight
   */
  async getCombatantInfo(reportId, fightId, startTime, endTime) {
    return this.request(`report/events/summary/${reportId}`, {
      start: startTime,
      end: endTime,
    });
  }

  /**
   * Fetch paginated events of a given type
   */
  async getEvents(reportId, type, startTime, endTime, sourceId, options = {}) {
    const allEvents = [];
    let nextPage = startTime;
    let page = 0;
    const maxPages = options.maxPages || 20;

    while (nextPage !== undefined && page < maxPages) {
      const params = {
        start: nextPage,
        end: endTime,
      };
      if (sourceId !== undefined && sourceId !== null) {
        params.sourceid = sourceId;
      }
      if (options.targetid !== undefined) {
        params.targetid = options.targetid;
      }
      if (options.filter) {
        params.filter = options.filter;
      }

      const data = await this.request(`report/events/${type}/${reportId}`, params);

      if (data.events && data.events.length > 0) {
        allEvents.push(...data.events);
      }

      nextPage = data.nextPageTimestamp;
      page++;

      if (options.onProgress) {
        options.onProgress(page, nextPage !== undefined);
      }
    }

    return allEvents;
  }

  /**
   * Load all required data for a holy priest analysis
   */
  async loadAnalysisData(reportId, fight, playerId, onProgress) {
    const { start_time, end_time } = fight;
    let step = 0;
    const totalSteps = 5;

    const progress = (label) => {
      step++;
      if (onProgress) onProgress(step / totalSteps, label);
    };

    progress('Loading healing events...');
    const healingEvents = await this.getEvents(reportId, 'healing', start_time, end_time, playerId);

    progress('Loading cast events...');
    const castEvents = await this.getEvents(reportId, 'casts', start_time, end_time, playerId);

    progress('Loading buff events...');
    const buffEventsSource = await this.getEvents(reportId, 'buffs', start_time, end_time, playerId);
    const buffEventsTarget = await this.getEvents(reportId, 'buffs', start_time, end_time, null, {
      targetid: playerId,
    });
    // Merge and deduplicate
    const buffMap = new Map();
    for (const e of [...buffEventsSource, ...buffEventsTarget]) {
      const key = `${e.timestamp}-${e.ability?.guid}-${e.type}`;
      if (!buffMap.has(key)) buffMap.set(key, e);
    }
    const buffEvents = Array.from(buffMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    progress('Loading combatant info...');
    const summary = await this.getCombatantInfo(reportId, fight.id, start_time, end_time);

    // Mana data is extracted from classResources in cast/healing events (no separate endpoint in v1)
    return {
      healingEvents,
      castEvents,
      buffEvents,
      resourceEvents: [], // mana extracted from cast/heal events in parser
      combatantInfo: summary,
      fight,
      playerId,
      actors: null, // populated by caller from report data
    };
  }
}
