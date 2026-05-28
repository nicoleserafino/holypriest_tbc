/**
 * UI Renderer
 * Renders analysis results to the DOM
 */

class UI {
  static formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toLocaleString();
  }

  static formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  static formatPct(n) {
    return n.toFixed(1) + '%';
  }

  static show(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  static hide(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  // ======= SUMMARY =======
  static renderSummary(summary) {
    const el = document.getElementById('summary-content');
    el.innerHTML = `
      <div class="stat-box">
        <div class="stat-value">${UI.formatNumber(summary.totalHealing)}</div>
        <div class="stat-label">Effective Healing</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${UI.formatNumber(summary.hps)}</div>
        <div class="stat-label">HPS</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${UI.formatPct(summary.overhealPct)}</div>
        <div class="stat-label">Overheal</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${summary.totalCasts}</div>
        <div class="stat-label">Total Casts</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${UI.formatPct(summary.critPct)}</div>
        <div class="stat-label">Crit %</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${UI.formatTime(summary.fightDuration * 1000)}</div>
        <div class="stat-label">Fight Duration</div>
      </div>
    `;
  }

  // ======= THROUGHPUT =======
  static renderThroughput(throughput) {
    const el = document.getElementById('throughput-content');
    let html = `
      <table>
        <thead>
          <tr>
            <th>Spell</th>
            <th class="text-right">Hits</th>
            <th class="text-right">Healing</th>
            <th class="text-right">HPS</th>
            <th class="text-right">Avg Heal</th>
            <th class="text-right">Overheal</th>
            <th class="text-right">Crit %</th>
            <th class="text-right">% of Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const spell of throughput) {
      const school = spell.key ? (SPELL_DATA[spell.key]?.school || 'holy') : 'holy';
      html += `
        <tr>
          <td class="spell-${school}">${spell.name}${spell.isHoT ? ' (HoT)' : ''}</td>
          <td class="text-right">${spell.hits}</td>
          <td class="text-right">${UI.formatNumber(spell.totalHealing)}</td>
          <td class="text-right">${UI.formatNumber(spell.hps)}</td>
          <td class="text-right">${UI.formatNumber(spell.avgHeal)}</td>
          <td class="text-right">${UI.formatPct(spell.overhealPct)}</td>
          <td class="text-right">${UI.formatPct(spell.critPct)}</td>
          <td class="text-right">${UI.formatPct(spell.pctOfHealing)}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // ======= COOLDOWNS =======
  static renderCooldowns(cooldowns) {
    const el = document.getElementById('cooldowns-content');
    let html = '';

    // Circle of Healing
    const coh = cooldowns.circleOfHealing;
    html += `
      <h3 class="spell-holy">Circle of Healing</h3>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${coh.casts} / ${coh.possibleCasts}</div>
          <div class="stat-label">Casts / Possible</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(coh.usagePct)}</div>
          <div class="stat-label">Usage Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${coh.avgTargetsHit.toFixed(1)}</div>
          <div class="stat-label">Avg Targets Hit</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(coh.totalHealing)}</div>
          <div class="stat-label">Total Healing</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatTime(coh.timeOffCooldown)}</div>
          <div class="stat-label">Time Off Cooldown</div>
        </div>
      </div>
    `;

    // Prayer of Mending
    const pom = cooldowns.prayerOfMending;
    html += `
      <h3 class="spell-holy mt-16">Prayer of Mending</h3>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${pom.casts} / ${pom.possibleCasts}</div>
          <div class="stat-label">Casts / Possible</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(pom.usagePct)}</div>
          <div class="stat-label">Usage Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${pom.totalBounces}</div>
          <div class="stat-label">Total Bounces</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${pom.avgBouncesPerCast.toFixed(1)}</div>
          <div class="stat-label">Avg Bounces/Cast</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(pom.totalHealing)}</div>
          <div class="stat-label">Total Healing</div>
        </div>
      </div>
    `;

    // Inner Focus
    const inf = cooldowns.innerFocus;
    html += `
      <h3 class="spell-disc mt-16">Inner Focus</h3>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${inf.casts} / ${inf.possibleCasts}</div>
          <div class="stat-label">Uses / Possible</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(inf.usagePct)}</div>
          <div class="stat-label">Usage Rate</div>
        </div>
      </div>
      ${inf.usedOn.length > 0 ? `<p class="mt-8" style="color:#aaa">Used on: ${inf.usedOn.join(', ')}</p>` : ''}
    `;

    el.innerHTML = html;
  }

  // ======= CIRCLE OF HEALING =======
  static renderCoH(coh) {
    const el = document.getElementById('coh-content');

    if (coh.totalCasts === 0) {
      el.innerHTML = `<p style="color:#999">${coh.message}</p>`;
      return;
    }

    let html = `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${coh.totalCasts}</div>
          <div class="stat-label">Total Casts</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${coh.avgTargets.toFixed(1)}</div>
          <div class="stat-label">Avg Targets Hit</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(coh.overhealPct)}</div>
          <div class="stat-label">Overheal %</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(coh.critPct)}</div>
          <div class="stat-label">Crit %</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(Math.round(coh.hps))}</div>
          <div class="stat-label">CoH HPS</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(coh.cdEfficiency)}</div>
          <div class="stat-label">CD Efficiency (${coh.totalCasts}/${coh.possibleCasts})</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${coh.wastedCasts}</div>
          <div class="stat-label">Wasted Casts (&gt;80% OH)</div>
        </div>
      </div>
    `;

    // Target breakdown
    if (coh.targetBreakdown.length > 0) {
      html += `<h3 class="mt-16">Targets Healed</h3>`;
      html += `<table><thead><tr><th>Player</th><th>Hits</th><th>Healing</th><th>Overheal</th><th>OH%</th></tr></thead><tbody>`;
      for (const t of coh.targetBreakdown.slice(0, 20)) {
        const raw = t.healing + t.overheal;
        const ohPct = raw > 0 ? (t.overheal / raw * 100).toFixed(1) : '0.0';
        html += `<tr>
          <td>${t.name}</td>
          <td>${t.count}</td>
          <td>${UI.formatNumber(t.healing)}</td>
          <td>${UI.formatNumber(t.overheal)}</td>
          <td>${ohPct}%</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    // Per-cast timeline
    html += `<h3 class="mt-16">Cast-by-Cast Breakdown</h3>`;
    html += `<table><thead><tr><th>Time</th><th>Targets</th><th>Healing</th><th>OH%</th><th>Crit</th></tr></thead><tbody>`;
    for (const cast of coh.castDetails) {
      const ohClass = cast.overhealPct > 80 ? 'style="color:#ff6b6b"' : '';
      html += `<tr ${ohClass}>
        <td>${UI.formatTime(cast.time)}</td>
        <td>${cast.targetsHit} (${cast.targets.join(', ')})</td>
        <td>${UI.formatNumber(cast.healing)}</td>
        <td>${cast.overhealPct.toFixed(1)}%</td>
        <td>${cast.hasCrit ? '✓' : ''}</td>
      </tr>`;
    }
    html += `</tbody></table>`;

    el.innerHTML = html;
  }

  // ======= RENEW =======
  static renderRenew(renew) {
    const el = document.getElementById('renew-content');
    let html = `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${renew.totalCasts}</div>
          <div class="stat-label">Total Casts</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${renew.avgTicksPerCast.toFixed(1)} / 5</div>
          <div class="stat-label">Avg Ticks/Cast</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${renew.clippedRenews}</div>
          <div class="stat-label">Clipped Renews</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(renew.overhealPct)}</div>
          <div class="stat-label">Overheal %</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${renew.uniqueTargets}</div>
          <div class="stat-label">Unique Targets</div>
        </div>
      </div>
    `;

    // Tank uptime
    if (renew.tankUptime.length > 0) {
      html += `<h3 class="mt-16">Tank Renew Uptime</h3><table><thead><tr><th>Tank</th><th class="text-right">Uptime</th><th class="text-right">Casts</th></tr></thead><tbody>`;
      for (const tank of renew.tankUptime) {
        html += `<tr><td>${tank.name}</td><td class="text-right">${UI.formatPct(tank.uptimePct)}</td><td class="text-right">${tank.casts}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    // Target breakdown
    if (renew.targetBreakdown.length > 0) {
      html += `<h3 class="mt-16">Top Renew Targets</h3><table><thead><tr><th>Target</th><th class="text-right">Casts</th><th class="text-right">Ticks</th><th class="text-right">Healing</th></tr></thead><tbody>`;
      for (const t of renew.targetBreakdown) {
        html += `<tr><td>${t.name}${t.isTank ? ' 🛡️' : ''}</td><td class="text-right">${t.casts}</td><td class="text-right">${t.ticks}</td><td class="text-right">${UI.formatNumber(t.healing)}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    el.innerHTML = html;
  }

  // ======= MANA =======
  static renderMana(mana) {
    const el = document.getElementById('mana-content');
    let html = `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(mana.maxMana)}</div>
          <div class="stat-label">Max Mana Pool</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(mana.startMana)}</div>
          <div class="stat-label">Starting Mana</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(mana.totalManaSpent)}</div>
          <div class="stat-label">Total Mana Spent</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(mana.totalManaRegenerated)}</div>
          <div class="stat-label">Total Mana Regenerated</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatNumber(mana.endMana)}</div>
          <div class="stat-label">Ending Mana</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${Math.round(mana.manaPerSecond)}/s</div>
          <div class="stat-label">Avg Mana Spent/sec</div>
        </div>
      </div>
    `;

    // Mana spent per spell breakdown
    if (mana.spellCostBreakdown && mana.spellCostBreakdown.length > 0) {
      html += `<h3 class="mt-16">Mana Spent by Spell</h3>`;
      html += `<table><thead><tr><th>Spell</th><th>Casts</th><th>Avg Cost</th><th>Total Mana</th><th>% of Total</th></tr></thead><tbody>`;
      for (const spell of mana.spellCostBreakdown) {
        const pct = mana.totalManaSpent > 0 ? (spell.totalCost / mana.totalManaSpent * 100).toFixed(1) : 0;
        html += `<tr>
          <td>${spell.name}</td>
          <td>${spell.casts}</td>
          <td>${UI.formatNumber(Math.round(spell.totalCost / spell.casts))}</td>
          <td>${UI.formatNumber(spell.totalCost)}</td>
          <td>${pct}%</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    // Consumables & mana cooldowns
    html += `<h3 class="mt-16">Mana Consumables & Cooldowns</h3>`;

    const allUses = [
      ...mana.potionUses.map(u => ({ ...u, type: '🧪 Potion' })),
      ...mana.runeUses.map(u => ({ ...u, type: '💎 Rune', name: u.name })),
      ...mana.shadowfiendUses.map(u => ({ ...u, type: '👻 Shadowfiend', name: 'Shadowfiend' })),
      ...mana.innervates.map(u => ({ ...u, type: '🌿 Innervate', name: 'Innervate' })),
    ].sort((a, b) => a.time - b.time);

    if (allUses.length > 0) {
      html += `<p><strong>${allUses.length}</strong> mana consumable${allUses.length > 1 ? 's' : ''} used during this fight.</p>`;
      html += `<table><thead><tr><th>Time</th><th>Type</th><th>Name</th></tr></thead><tbody>`;
      for (const use of allUses) {
        html += `<tr><td>${UI.formatTime(use.time)}</td><td>${use.type}</td><td>${use.name || ''}</td></tr>`;
      }
      html += `</tbody></table>`;
    } else {
      html += `<p style="color:#999">No mana consumables or cooldowns detected.</p>`;
    }

    // Mana timeline chart
    if (mana.manaTimeline.length > 0) {
      html += `<h3 class="mt-16">Mana Over Time</h3>`;
      html += `<div id="mana-chart" style="height:120px;background:#0f3460;border-radius:4px;position:relative;overflow:hidden;">`;

      const maxMana = mana.maxMana || 1;
      const fightLen = mana.manaTimeline[mana.manaTimeline.length - 1]?.time || 1;

      // Sample points for SVG path
      const points = mana.manaTimeline
        .filter((_, i) => i % Math.max(1, Math.floor(mana.manaTimeline.length / 100)) === 0)
        .map(p => {
          const x = (p.time / fightLen) * 100;
          const y = 100 - (p.mana / maxMana) * 100;
          return `${x},${y}`;
        });

      html += `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points="${points.join(' ')}" fill="none" stroke="#ffd700" stroke-width="0.5"/>
        <polyline points="0,100 ${points.join(' ')} 100,100" fill="rgba(255,215,0,0.1)" stroke="none"/>
      </svg>`;
      html += `<div style="position:absolute;top:4px;left:8px;font-size:11px;color:#ffd700">${UI.formatNumber(maxMana)}</div>`;
      html += `<div style="position:absolute;bottom:4px;left:8px;font-size:11px;color:#999">0</div>`;
      html += `</div>`;
    }

    el.innerHTML = html;
  }

  // ======= ACTIVITY =======
  static renderActivity(activity) {
    const el = document.getElementById('activity-content');
    let html = `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${UI.formatPct(activity.gcdUsage)}</div>
          <div class="stat-label">GCD Usage</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${Math.round(activity.avgLatency)}ms</div>
          <div class="stat-label">Avg Latency</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${activity.castsPerMinute.toFixed(1)}</div>
          <div class="stat-label">Casts/Minute</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${UI.formatTime(activity.idleTime)}</div>
          <div class="stat-label">Idle Time</div>
        </div>
      </div>
    `;

    if (activity.latencyBreakdown.length > 0) {
      html += `<h3 class="mt-16">Latency Samples (gaps > 100ms)</h3>`;
      const bigGaps = activity.latencyBreakdown.filter(l => l.gap > 100).slice(0, 20);
      if (bigGaps.length > 0) {
        html += `<table><thead><tr><th>Time</th><th>Gap</th><th>After</th><th>Before</th></tr></thead><tbody>`;
        for (const l of bigGaps) {
          html += `<tr><td>${UI.formatTime(l.time)}</td><td>${Math.round(l.gap)}ms</td><td>${l.afterSpell}</td><td>${l.beforeSpell}</td></tr>`;
        }
        html += `</tbody></table>`;
      }
    }

    el.innerHTML = html;
  }

  // ======= TIMELINE =======
  static renderTimeline(timeline) {
    const el = document.getElementById('timeline-content');
    const maxEntries = 200;
    const entries = timeline.slice(0, maxEntries);

    let html = `<p style="color:#999;margin-bottom:8px">Showing first ${Math.min(timeline.length, maxEntries)} of ${timeline.length} events</p>`;

    for (const entry of entries) {
      if (entry.type === 'buff') {
        html += `
          <div class="timeline-row">
            <span class="timeline-time">${UI.formatTime(entry.time)}</span>
            <span class="timeline-spell spell-disc">▲ ${entry.spellName}</span>
            <span class="timeline-target"></span>
            <span class="timeline-amount"></span>
            <span class="timeline-overheal"></span>
          </div>
        `;
      } else {
        const amtClass = entry.isCrit ? 'style="color:#4caf50;font-weight:bold"' : '';
        html += `
          <div class="timeline-row">
            <span class="timeline-time">${UI.formatTime(entry.time)}</span>
            <span class="timeline-spell spell-${entry.school || 'holy'}">${entry.spellName}${entry.isHoT ? ' ●' : ''}${entry.isCrit ? ' ★' : ''}</span>
            <span class="timeline-target">${entry.target}</span>
            <span class="timeline-amount" ${amtClass}>${UI.formatNumber(entry.amount)}</span>
            <span class="timeline-overheal">${entry.overheal > 0 ? '-' + UI.formatNumber(entry.overheal) : ''}</span>
          </div>
        `;
      }
    }

    el.innerHTML = html;
  }

  // ======= OBSERVATIONS =======
  static renderObservations(observations, container) {
    if (!observations || observations.length === 0) return;

    let html = '<h3 class="mt-16">Observations &amp; Suggestions</h3>';
    for (const obs of observations) {
      html += `<div class="observation ${obs.type}">${obs.text}</div>`;
    }
    container.insertAdjacentHTML('beforeend', html);
  }
}
