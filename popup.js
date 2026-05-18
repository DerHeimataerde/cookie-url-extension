async function loadState() {
  const { active = false, visits = [], findings = [] } = await chrome.storage.local.get(['active', 'visits', 'findings']);

  const dot = document.getElementById('status-dot');
  const btn = document.getElementById('btn-toggle');

  dot.classList.toggle('active', active);
  btn.textContent = active ? '⏸  Pause Recording' : '● Start Recording';
  btn.className = `toggle-btn ${active ? 'recording' : 'paused'}`;

  document.getElementById('stat-events').textContent = visits.length;
  document.getElementById('stat-domains').textContent = new Set(visits.map(v => v.domain)).size;

  const grouped = new Set(findings.map(f => `${f.domain}|${f.param}|${f.transform}|${f.cookieName}`));
  document.getElementById('stat-mappings').textContent = grouped.size;
}

document.getElementById('btn-toggle').addEventListener('click', async () => {
  const { active = false } = await chrome.storage.local.get('active');
  await chrome.storage.local.set({ active: !active });
  loadState();
});

document.getElementById('btn-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

loadState();
