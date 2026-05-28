/**
 * App Controller
 * Wires together API, Parser, Analyzer, and UI
 */

(function () {
  // State
  let api = null;
  let reportData = null;
  let analysisResults = null;

  // DOM references
  const apiKeyInput = document.getElementById('api-key');
  const reportUrlInput = document.getElementById('report-url');
  const loadBtn = document.getElementById('load-btn');
  const loadError = document.getElementById('load-error');
  const loadProgress = document.getElementById('load-progress');
  const progressBar = loadProgress.querySelector('.progress-bar');
  const progressText = loadProgress.querySelector('.progress-text');
  const fightSection = document.getElementById('fight-section');
  const fightSelect = document.getElementById('fight-select');
  const playerSelect = document.getElementById('player-select');
  const tankSelectDiv = document.getElementById('tank-select');
  const analyzeBtn = document.getElementById('analyze-btn');
  const resultsSection = document.getElementById('results-section');

  // Load API key from localStorage
  const savedKey = localStorage.getItem('wcl_api_key');
  if (savedKey) apiKeyInput.value = savedKey;

  // ======= LOAD REPORT =======
  loadBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const input = reportUrlInput.value.trim();

    if (!key) { showError('Please enter your WCL API key.'); return; }
    if (!input) { showError('Please enter a report URL or ID.'); return; }

    const reportId = WCLApi.extractReportId(input);
    if (!reportId) { showError('Invalid report URL or ID.'); return; }

    // Save key
    localStorage.setItem('wcl_api_key', key);
    api = new WCLApi(key);

    hideError();
    showProgress('Loading report...');
    loadBtn.disabled = true;

    try {
      reportData = await api.getFights(reportId);
      reportData._reportId = reportId;
      populateFightSelect(reportData);
      fightSection.classList.remove('hidden');
      hideProgress();
    } catch (e) {
      showError(e.message);
      hideProgress();
    } finally {
      loadBtn.disabled = false;
    }
  });

  // ======= FIGHT/PLAYER SELECTION =======
  function populateFightSelect(data) {
    fightSelect.innerHTML = '';
    const fights = (data.fights || []).filter(f => f.boss > 0 && !f.originalBoss);

    if (fights.length === 0) {
      fightSelect.innerHTML = '<option>No boss fights found</option>';
      return;
    }

    for (const fight of fights) {
      const duration = ((fight.end_time - fight.start_time) / 1000).toFixed(0);
      const opt = document.createElement('option');
      opt.value = fight.id;
      opt.textContent = `${fight.name} (${fight.kill ? 'Kill' : 'Wipe'}) - ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
      opt.dataset.startTime = fight.start_time;
      opt.dataset.endTime = fight.end_time;
      fightSelect.appendChild(opt);
    }

    fightSelect.addEventListener('change', () => populatePlayers());
    populatePlayers();
  }

  function populatePlayers() {
    playerSelect.innerHTML = '';
    tankSelectDiv.innerHTML = '';

    // Find priests in the report
    const friendlies = reportData.friendlies || [];
    const priests = friendlies.filter(f => f.type === 'Priest');
    const tanks = friendlies.filter(f =>
      f.type === 'Warrior' || f.type === 'Paladin' || f.type === 'Druid'
    );

    if (priests.length === 0) {
      playerSelect.innerHTML = '<option>No priests found</option>';
      return;
    }

    for (const priest of priests) {
      const opt = document.createElement('option');
      opt.value = priest.id;
      opt.textContent = priest.name;
      playerSelect.appendChild(opt);
    }

    // Tank checkboxes
    for (const tank of tanks) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = tank.id;
      cb.dataset.name = tank.name;
      // Auto-check Warriors
      if (tank.type === 'Warrior') cb.checked = true;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(` ${tank.name} (${tank.type})`));
      tankSelectDiv.appendChild(label);
    }
  }

  // ======= ANALYZE =======
  analyzeBtn.addEventListener('click', async () => {
    const fightId = parseInt(fightSelect.value);
    const playerId = parseInt(playerSelect.value);

    if (!fightId || !playerId) { showError('Please select a fight and player.'); return; }

    const fight = (reportData.fights || []).find(f => f.id === fightId);
    if (!fight) { showError('Fight not found.'); return; }

    // Get selected tanks
    const tankCheckboxes = tankSelectDiv.querySelectorAll('input:checked');
    const selectedTanks = Array.from(tankCheckboxes).map(cb => parseInt(cb.value));

    hideError();
    showProgress('Fetching events...');
    analyzeBtn.disabled = true;

    try {
      const rawData = await api.loadAnalysisData(
        reportData._reportId,
        fight,
        playerId,
        (pct, label) => updateProgress(pct * 100, label)
      );

      updateProgress(80, 'Parsing events...');
      const parser = new LogParser(rawData, selectedTanks);
      const parsedData = parser.parse();

      updateProgress(90, 'Analyzing performance...');
      const analyzer = new Analyzer(parsedData, selectedTanks);
      analysisResults = analyzer.analyze();

      updateProgress(100, 'Rendering results...');
      renderResults(analysisResults);
      hideProgress();
    } catch (e) {
      showError('Analysis failed: ' + e.message);
      console.error(e);
      hideProgress();
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  // ======= RENDER RESULTS =======
  function renderResults(results) {
    resultsSection.classList.remove('hidden');

    UI.renderSummary(results.summary);
    UI.renderThroughput(results.throughput);
    UI.renderCooldowns(results.cooldowns);
    UI.renderRenew(results.renew);
    UI.renderMana(results.mana);
    UI.renderActivity(results.activity);
    UI.renderTimeline(results.timeline);

    // Add observations to summary card
    const summaryCard = document.getElementById('summary-card');
    // Remove old observations
    const oldObs = summaryCard.querySelectorAll('.observation, h3');
    oldObs.forEach(el => {
      if (el.textContent.includes('Observations')) el.remove();
    });
    summaryCard.querySelectorAll('.observation').forEach(el => el.remove());
    UI.renderObservations(results.observations, summaryCard);
  }

  // ======= TABS =======
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  // ======= HELPERS =======
  function showError(msg) {
    loadError.textContent = msg;
    loadError.classList.remove('hidden');
  }

  function hideError() {
    loadError.classList.add('hidden');
  }

  function showProgress(text) {
    loadProgress.classList.remove('hidden');
    progressText.textContent = text;
    progressBar.style.width = '0%';
  }

  function updateProgress(pct, text) {
    progressBar.style.width = pct + '%';
    if (text) progressText.textContent = text;
  }

  function hideProgress() {
    loadProgress.classList.add('hidden');
  }
})();
