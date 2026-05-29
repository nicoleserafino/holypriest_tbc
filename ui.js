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
    const split = throughput.healingSplit || { spellBreakdown: [], tankHealingPct: 0, raidHealingPct: 0, tankHealing: 0, raidHealing: 0 };
    const binding = throughput.bindingHeal || { opportunities: [] };

    let html = `
      <h3>Healing by Spell</h3>
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

    for (const spell of throughput.spellBreakdown) {
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

    html += `</tbody></table>`;

    html += `
      <h3 class="mt-16">Tank vs Raid Healing Split</h3>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${UI.formatPct(split.tankHealingPct)}</div><div class="stat-label">Tank Healing</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(split.raidHealingPct)}</div><div class="stat-label">Raid Healing</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatNumber(split.tankHealing)}</div><div class="stat-label">Healing to Tanks</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatNumber(split.raidHealing)}</div><div class="stat-label">Healing to Raid</div></div>
      </div>
    `;

    if (split.spellBreakdown.length > 0) {
      html += `<table><thead><tr><th>Spell</th><th class="text-right">Tank Healing</th><th class="text-right">Raid Healing</th><th class="text-right">Tank Share</th></tr></thead><tbody>`;
      for (const row of split.spellBreakdown) {
        html += `<tr>
          <td>${row.name}</td>
          <td class="text-right">${UI.formatNumber(row.tankHealing)}</td>
          <td class="text-right">${UI.formatNumber(row.raidHealing)}</td>
          <td class="text-right">${UI.formatPct(row.tankPct)}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    html += `
      <h3 class="mt-16">Binding Heal Awareness</h3>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${binding.timesDamaged || 0}</div><div class="stat-label">Damage Windows</div></div>
        <div class="stat-box"><div class="stat-value">${binding.bindingHealUsed || 0}</div><div class="stat-label">Binding Heal Used</div></div>
        <div class="stat-box"><div class="stat-value">${binding.flashHealUsedInstead || 0}</div><div class="stat-label">Flash Heal Instead</div></div>
        <div class="stat-box"><div class="stat-value">${binding.missedOpportunities || 0}</div><div class="stat-label">Missed Opportunities</div></div>
      </div>
    `;

    if (binding.opportunities.length > 0) {
      html += `<table><thead><tr><th>Time</th><th>Damage Taken</th><th>Response</th><th>Outcome</th></tr></thead><tbody>`;
      for (const row of binding.opportunities.slice(0, 15)) {
        html += `<tr>
          <td>${UI.formatTime(row.time)}</td>
          <td>${UI.formatNumber(row.damageTaken)}</td>
          <td>${row.responseSpell}</td>
          <td>${row.outcome}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    el.innerHTML = html;
  }


  static renderDownranking(downranking) {
    const el = document.getElementById('downranking-content');
    let html = '';

    if (downranking.rankDistribution.length > 0) {
      html += `<h3>Rank Distribution</h3>`;
      html += `<table><thead><tr><th>Spell</th><th>Rank</th><th class="text-right">Casts</th><th class="text-right">Healing</th><th class="text-right">Overheal</th></tr></thead><tbody>`;
      for (const row of downranking.rankDistribution.slice(0, 20)) {
        html += `<tr>
          <td>${row.spellName}</td>
          <td>${row.rank}/${row.maxRank}</td>
          <td class="text-right">${row.casts}</td>
          <td class="text-right">${UI.formatNumber(row.healing)}</td>
          <td class="text-right">${UI.formatPct(row.overhealPct)}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    for (const spell of downranking.spellBreakdown) {
      html += `<h3 class="mt-16">${spell.spellName}</h3>`;
      html += `<table><thead><tr><th>Rank</th><th class="text-right">Casts</th><th class="text-right">Healing</th><th class="text-right">Overheal</th><th class="text-right">Avg Heal</th><th class="text-right">Usage</th><th>Note</th></tr></thead><tbody>`;
      for (const rank of spell.ranks) {
        html += `<tr${rank.couldDownrankFurther ? ' style="color:#f0ad4e"' : ''}>
          <td>${rank.rank}/${rank.maxRank}</td>
          <td class="text-right">${rank.casts}</td>
          <td class="text-right">${UI.formatNumber(rank.totalHealing)}</td>
          <td class="text-right">${UI.formatPct(rank.overhealPct)}</td>
          <td class="text-right">${UI.formatNumber(rank.avgHealAmount)}</td>
          <td class="text-right">${UI.formatPct(rank.usagePct)}</td>
          <td>${rank.couldDownrankFurther ? 'Could downrank further' : ''}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    if (!html) {
      html = '<p style="color:#999">No ranked healing spells were detected.</p>';
    }

    el.innerHTML = html;
  }

  // ======= COOLDOWNS =======
  static renderCooldowns(cooldowns) {
    const el = document.getElementById('cooldowns-content');
    let html = '';

    const coh = cooldowns.circleOfHealing;
    html += `
      <h3 class="spell-holy">Circle of Healing</h3>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${coh.casts}</div><div class="stat-label">Total Casts</div></div>
        <div class="stat-box"><div class="stat-value">${coh.avgTargetsHit.toFixed(1)}</div><div class="stat-label">Avg Targets Hit</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatNumber(coh.totalHealing)}</div><div class="stat-label">Total Healing</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(coh.overhealPct)}</div><div class="stat-label">Overheal %</div></div>
      </div>
    `;

    const pom = cooldowns.prayerOfMending;
    html += `
      <h3 class="spell-holy mt-16">Prayer of Mending</h3>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${pom.casts} / ${pom.possibleCasts}</div><div class="stat-label">Casts / Possible</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(pom.usagePct)}</div><div class="stat-label">Usage Rate</div></div>
        <div class="stat-box"><div class="stat-value">${pom.totalBounces}</div><div class="stat-label">Total Bounces</div></div>
        <div class="stat-box"><div class="stat-value">${pom.avgBouncesPerCast.toFixed(1)}</div><div class="stat-label">Avg Bounces/Cast</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(pom.tankTargetingRate)}</div><div class="stat-label">Tank Targeting Rate</div></div>
      </div>
    `;
    if (pom.targetBreakdown.length > 0) {
      html += `<table><thead><tr><th>Time</th><th>Target</th><th>Role</th></tr></thead><tbody>`;
      for (const row of pom.targetBreakdown.slice(0, 15)) {
        html += `<tr><td>${UI.formatTime(row.time)}</td><td>${row.targetName || 'Unknown'}</td><td>${row.isTank ? 'Tank' : 'Raid'}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    const inf = cooldowns.innerFocus;
    html += `
      <h3 class="spell-disc mt-16">Inner Focus</h3>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${inf.casts} / ${inf.possibleCasts}</div><div class="stat-label">Uses / Possible</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(inf.usagePct)}</div><div class="stat-label">Usage Rate</div></div>
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
          <div class="stat-value">${UI.formatNumber(Math.round(coh.avgHealingPerCast))}</div>
          <div class="stat-label">Avg Healing per Cast</div>
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

  // ======= PROCS =======
  static renderProcs(procs) {
    const el = document.getElementById('procs-content');

    if (!procs || (Object.keys(procs).length === 0) ||
        (!procs.clearcasting && !procs.flexibility && !procs.surgeOfLight &&
         !procs.eyeOfGruul && !procs.innerFocus && (!procs.hasteWindows || procs.hasteWindows.length === 0))) {
      el.innerHTML = `<p style="color:#999">No tracked procs detected in this fight. Tracked: Clearcasting, Surge of Light, Flexibility (T4 2pc), Eye of Gruul, Inner Focus, Scarab of the Infinite Cycle, Power Infusion, Bloodlust/Heroism.</p>`;
      return;
    }

    let html = '';

    const renderDetails = (rows, headers) => {
      let table = `<table style="margin-top:12px"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;
      table += rows.join('');
      table += `</tbody></table>`;
      return table;
    };

    if (procs.clearcasting) {
      const cc = procs.clearcasting;
      html += `<div class="card" style="margin-bottom:16px;padding:16px;background:#1a1a2e;">`;
      html += `<h3 style="color:#ffd700;margin-bottom:4px">${cc.name}</h3>`;
      html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">${cc.description}</p>`;
      html += `<div class="stats-grid">`;
      html += `<div class="stat-box"><div class="stat-value">${cc.procs}</div><div class="stat-label">Total Procs</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${UI.formatNumber(cc.totalManaSaved)}</div><div class="stat-label">Mana Saved</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${UI.formatPct(cc.efficiency)}</div><div class="stat-label">Efficiency</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${cc.optimalUses}</div><div class="stat-label">Expensive Spell Uses</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${cc.suboptimalUses > 0 ? '#ff6b6b' : '#4ecdc4'}">${cc.suboptimalUses}</div><div class="stat-label">Cheap Spell Uses</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${cc.wasted > 0 ? '#ff6b6b' : '#4ecdc4'}">${cc.wasted}</div><div class="stat-label">Expired Unused</div></div>`;
      html += `</div>`;
      html += renderDetails(cc.details.map(d => `<tr${d.wasted ? ' style="color:#ff6b6b"' : (!d.isOptimal ? ' style="color:#f0ad4e"' : '')}><td>${UI.formatTime(d.time)}</td><td>${d.spellUsed || 'Expired'}</td><td>${d.manaSaved > 0 ? UI.formatNumber(d.manaSaved) : '-'}</td><td>${d.wasted ? 'Wasted' : (d.isOptimal ? 'Yes' : 'Low value')}</td></tr>`), ['Time', 'Spell Used', 'Mana Saved', 'Optimal?']);
      html += `</div>`;
    }

    if (procs.flexibility) {
      const flex = procs.flexibility;
      html += `<div class="card" style="margin-bottom:16px;padding:16px;background:#1a1a2e;">`;
      html += `<h3 style="color:#ffd700;margin-bottom:4px">${flex.name}</h3>`;
      html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">${flex.description}</p>`;
      html += `<div class="stats-grid">`;
      html += `<div class="stat-box"><div class="stat-value">${flex.totalWindows}</div><div class="stat-label">Stack Windows</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${flex.optimalUses}</div><div class="stat-label">GH at 5 Stacks</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${flex.earlyUses > 0 ? '#f0ad4e' : '#4ecdc4'}">${flex.earlyUses}</div><div class="stat-label">GH Before Max</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${flex.suboptimalUses > 0 ? '#f0ad4e' : '#4ecdc4'}">${flex.suboptimalUses}</div><div class="stat-label">Wrong Spell</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${flex.expiredUses > 0 ? '#ff6b6b' : '#4ecdc4'}">${flex.expiredUses}</div><div class="stat-label">Expired Unused</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${UI.formatPct(flex.optimalRate)}</div><div class="stat-label">Optimal Usage Rate</div></div>`;
      html += `</div>`;
      html += renderDetails(flex.details.map(d => {
        const statusLabel = d.status === 'optimal' ? 'Optimal (GH at 5)' : d.status === 'early' ? `Used early (${d.stacksAtUse} stacks)` : d.status === 'expired' ? 'Expired unused' : `Wrong spell (${d.spellUsed})`;
        const color = d.status === 'optimal' ? '' : d.status === 'expired' ? ' style="color:#ff6b6b"' : ' style="color:#f0ad4e"';
        return `<tr${color}><td>${UI.formatTime(d.time)}</td><td>${d.stacksAtUse}/5</td><td>${d.spellUsed || '-'}</td><td>${statusLabel}</td></tr>`;
      }), ['Time', 'Stacks', 'Spell Used', 'Result']);
      html += `</div>`;
    }

    if (procs.surgeOfLight) {
      const sol = procs.surgeOfLight;
      html += `<div class="card" style="margin-bottom:16px;padding:16px;background:#1a1a2e;">`;
      html += `<h3 style="color:#ffd700;margin-bottom:4px">${sol.name}</h3>`;
      html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">${sol.description}</p>`;
      html += `<div class="stats-grid">`;
      html += `<div class="stat-box"><div class="stat-value">${sol.procs}</div><div class="stat-label">Total Procs</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${sol.consumed}</div><div class="stat-label">Consumed</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${sol.wasted > 0 ? '#ff6b6b' : '#4ecdc4'}">${sol.wasted}</div><div class="stat-label">Wasted</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${UI.formatPct(sol.usageRate)}</div><div class="stat-label">Usage Rate</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${sol.avgReactionMs}ms</div><div class="stat-label">Avg Reaction Time</div></div>`;
      html += `</div></div>`;
    }

    if (procs.eyeOfGruul) {
      const eog = procs.eyeOfGruul;
      html += `<div class="card" style="margin-bottom:16px;padding:16px;background:#1a1a2e;">`;
      html += `<h3 style="color:#ffd700;margin-bottom:4px">${eog.name}</h3>`;
      html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">${eog.description}</p>`;
      html += `<div class="stats-grid">`;
      html += `<div class="stat-box"><div class="stat-value">${eog.procs}</div><div class="stat-label">Total Procs</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${eog.consumed}</div><div class="stat-label">Consumed</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${eog.optimalUses}</div><div class="stat-label">Expensive Spell Uses</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${eog.wasted > 0 ? '#ff6b6b' : '#4ecdc4'}">${eog.wasted}</div><div class="stat-label">Expired Unused</div></div>`;
      html += `</div>`;
      html += renderDetails(eog.details.map(d => `<tr${d.wasted ? ' style="color:#ff6b6b"' : (!d.isOptimal ? ' style="color:#f0ad4e"' : '')}><td>${UI.formatTime(d.time)}</td><td>${d.spellUsed || 'Expired'}</td><td>${d.spellCost > 0 ? UI.formatNumber(d.spellCost) : '-'}</td><td>${d.wasted ? 'Wasted' : (d.isOptimal ? 'Yes' : 'Low value')}</td></tr>`), ['Time', 'Spell Used', 'Spell Cost', 'Optimal?']);
      html += `</div>`;
    }

    if (procs.innerFocus) {
      const inf = procs.innerFocus;
      html += `<div class="card" style="margin-bottom:16px;padding:16px;background:#1a1a2e;">`;
      html += `<h3 style="color:#ffd700;margin-bottom:4px">${inf.name}</h3>`;
      html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">${inf.description}</p>`;
      html += `<div class="stats-grid">`;
      html += `<div class="stat-box"><div class="stat-value">${inf.procs}</div><div class="stat-label">Buff Gains</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${inf.consumed}</div><div class="stat-label">Paired Casts</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${inf.optimalUses}</div><div class="stat-label">Optimal Pairings</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${inf.suboptimalUses > 0 ? '#f0ad4e' : '#4ecdc4'}">${inf.suboptimalUses}</div><div class="stat-label">Suboptimal Pairings</div></div>`;
      html += `<div class="stat-box"><div class="stat-value">${UI.formatNumber(inf.totalManaSaved)}</div><div class="stat-label">Mana Saved</div></div>`;
      html += `<div class="stat-box"><div class="stat-value" style="color:${inf.wasted > 0 ? '#ff6b6b' : '#4ecdc4'}">${inf.wasted}</div><div class="stat-label">Expired Unused</div></div>`;
      html += `</div>`;
      html += renderDetails(inf.details.map(d => `<tr${d.wasted ? ' style="color:#ff6b6b"' : (!d.isOptimal ? ' style="color:#f0ad4e"' : '')}><td>${UI.formatTime(d.time)}</td><td>${d.spellUsed || 'Expired'}</td><td>${d.manaSaved > 0 ? UI.formatNumber(d.manaSaved) : '-'}</td><td>${d.wasted ? 'Wasted' : (d.isOptimal ? 'Yes' : 'Low value')}</td></tr>`), ['Time', 'Spell Used', 'Mana Saved', 'Optimal?']);
      html += `</div>`;
    }

    if (procs.hasteWindows && procs.hasteWindows.length > 0) {
      html += `<h3 class="mt-16">Haste Windows</h3>`;
      html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">Haste benefits long-cast spells (Greater Heal, Prayer of Healing) the most. Prioritize these during haste windows.</p>`;
      for (const haste of procs.hasteWindows) {
        html += `<div class="card" style="margin-bottom:16px;padding:16px;background:#1a1a2e;">`;
        html += `<h3 style="color:#ffd700;margin-bottom:4px">${haste.name}</h3>`;
        html += `<p style="color:#aaa;font-size:13px;margin-bottom:12px">${haste.description}</p>`;
        html += `<div class="stats-grid">`;
        html += `<div class="stat-box"><div class="stat-value">${haste.procs}</div><div class="stat-label">Occurrences</div></div>`;
        html += `<div class="stat-box"><div class="stat-value">${haste.avgCastsPerWindow.toFixed(1)}</div><div class="stat-label">Avg Casts per Window</div></div>`;
        html += `<div class="stat-box"><div class="stat-value">${UI.formatPct(haste.avgLongCastRatio)}</div><div class="stat-label">Long Cast Usage</div></div>`;
        html += `</div>`;
        html += `<table style="margin-top:12px"><thead><tr><th>Time</th><th>Duration</th><th>Total Casts</th><th>GH</th><th>FH</th><th>PoH</th><th>Long Cast %</th></tr></thead><tbody>`;
        for (const w of haste.windows) {
          html += `<tr><td>${UI.formatTime(w.time)}</td><td>${(w.duration / 1000).toFixed(1)}s</td><td>${w.totalCasts}</td><td>${w.ghCasts}</td><td>${w.fhCasts}</td><td>${w.pohCasts}</td><td>${w.longCastRatio.toFixed(0)}%</td></tr>`;
        }
        html += `</tbody></table></div>`;
      }
    }

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
        html += `<tr><td>${t.name}${t.isTank ? ' (Tank)' : ''}</td><td class="text-right">${t.casts}</td><td class="text-right">${t.ticks}</td><td class="text-right">${UI.formatNumber(t.healing)}</td></tr>`;
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

    // Mana-saving procs
    if (mana.clearcastProcs > 0 || mana.eyeOfGrulProcs > 0) {
      html += `<h3 class="mt-16">Mana-Saving Procs</h3>`;
      html += `<div class="stats-grid">`;
      if (mana.clearcastProcs > 0) {
        html += `<div class="stat-box"><div class="stat-value">${mana.clearcastProcs}</div><div class="stat-label">Clearcasting Procs</div></div>`;
      }
      if (mana.eyeOfGrulProcs > 0) {
        html += `<div class="stat-box"><div class="stat-value">${mana.eyeOfGrulProcs}</div><div class="stat-label">Eye of Gruul Procs</div></div>`;
      }
      html += `</div>`;
      html += `<p style="color:#999;font-size:12px;margin-top:4px">See the Procs tab for detailed usage tracking (consumed vs wasted).</p>`;
    }

    // Consumables & mana cooldowns
    html += `<h3 class="mt-16">Mana Consumables & Cooldowns</h3>`;

    const allUses = [
      ...mana.potionUses.map(u => ({ ...u, type: 'Potion' })),
      ...mana.runeUses.map(u => ({ ...u, type: 'Rune', name: u.name })),
      ...mana.shadowfiendUses.map(u => ({ ...u, type: 'Shadowfiend', name: 'Shadowfiend' })),
      ...mana.innervates.map(u => ({ ...u, type: 'Innervate', name: 'Innervate' })),
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
    const cancel = activity.cancelCasting;
    const five = activity.fiveSecondRule;

    let html = `
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${UI.formatPct(activity.gcdUsage)}</div><div class="stat-label">GCD Usage</div></div>
        <div class="stat-box"><div class="stat-value">${Math.round(activity.avgLatency)}ms</div><div class="stat-label">Avg Latency</div></div>
        <div class="stat-box"><div class="stat-value">${activity.castsPerMinute.toFixed(1)}</div><div class="stat-label">Casts/Minute</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatTime(activity.idleTime)}</div><div class="stat-label">Idle Time</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(cancel.cancelRate)}</div><div class="stat-label">Cancel Rate</div></div>
        <div class="stat-box"><div class="stat-value">${UI.formatPct(five.spiritRegenPct)}</div><div class="stat-label">Spirit Regen Time</div></div>
      </div>
    `;

    if (activity.latencyBreakdown.length > 0) {
      html += `<h3 class="mt-16">Latency Samples (gaps &gt; 100ms)</h3>`;
      const bigGaps = activity.latencyBreakdown.filter(l => l.gap > 100).slice(0, 20);
      if (bigGaps.length > 0) {
        html += `<table><thead><tr><th>Time</th><th>Gap</th><th>After</th><th>Before</th></tr></thead><tbody>`;
        for (const l of bigGaps) {
          html += `<tr><td>${UI.formatTime(l.time)}</td><td>${Math.round(l.gap)}ms</td><td>${l.afterSpell}</td><td>${l.beforeSpell}</td></tr>`;
        }
        html += `</tbody></table>`;
      }
    }

    html += `<h3 class="mt-16">Cancel-Casting</h3>`;
    html += `<div class="stats-grid">
      <div class="stat-box"><div class="stat-value">${cancel.totalBegincasts}</div><div class="stat-label">Begincasts</div></div>
      <div class="stat-box"><div class="stat-value">${cancel.successfulCasts}</div><div class="stat-label">Completed Casts</div></div>
      <div class="stat-box"><div class="stat-value">${cancel.cancels}</div><div class="stat-label">Cancels</div></div>
    </div>`;
    if (cancel.spellBreakdown.length > 0) {
      html += `<table><thead><tr><th>Spell</th><th class="text-right">Begincasts</th><th class="text-right">Completed</th><th class="text-right">Cancels</th><th class="text-right">Cancel Rate</th></tr></thead><tbody>`;
      for (const row of cancel.spellBreakdown) {
        html += `<tr><td>${row.spellName}</td><td class="text-right">${row.begincasts}</td><td class="text-right">${row.successful}</td><td class="text-right">${row.cancels}</td><td class="text-right">${UI.formatPct(row.cancelRate)}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    html += `<h3 class="mt-16">Five-Second Rule</h3>`;
    html += `<div class="stats-grid">
      <div class="stat-box"><div class="stat-value">${UI.formatTime(five.timeInFiveSecondRule)}</div><div class="stat-label">Time in 5SR</div></div>
      <div class="stat-box"><div class="stat-value">${UI.formatTime(five.timeOutsideFiveSecondRule)}</div><div class="stat-label">Time Outside 5SR</div></div>
      <div class="stat-box"><div class="stat-value">${five.manaSpendingCasts}</div><div class="stat-label">Mana-Spending Casts</div></div>
    </div>`;
    if (five.regenWindows.length > 0) {
      html += `<table><thead><tr><th>Regen Window Start</th><th>Duration</th></tr></thead><tbody>`;
      for (const window of five.regenWindows.slice(0, 15)) {
        html += `<tr><td>${UI.formatTime(window.start)}</td><td>${UI.formatTime(window.duration)}</td></tr>`;
      }
      html += `</tbody></table>`;
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
