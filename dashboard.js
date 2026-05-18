let allVisits   = [];
let allFindings = [];
let activeTab   = 'pages';

// ── Load & init ──────────────────────────────────────────────────────────────

async function load() {
  const data = await chrome.storage.local.get(['visits', 'findings', 'active']);
  allVisits   = (data.visits   || []).slice().reverse(); // newest first
  allFindings = data.findings  || [];
  updateToggleUI(data.active || false);
  populateDomainFilter();
  renderStats();
  renderPages();
  renderMappings();
}

// ── Stats ────────────────────────────────────────────────────────────────────

function renderStats() {
  const domains  = new Set(allVisits.map(v => v.domain)).size;
  const mappings = groupFindings(allFindings).length;
  document.getElementById('stat-domains').textContent  = `${domains} domain${domains !== 1 ? 's' : ''}`;
  document.getElementById('stat-pages').textContent    = `${allVisits.length} page${allVisits.length !== 1 ? 's' : ''}`;
  document.getElementById('stat-mappings').textContent = `${mappings} mapping${mappings !== 1 ? 's' : ''}`;
}

// ── Domain filter ────────────────────────────────────────────────────────────

function populateDomainFilter() {
  const sel     = document.getElementById('filter-domain');
  const current = sel.value;
  const domains = [...new Set(allVisits.map(v => v.domain))].sort();
  sel.innerHTML = '<option value="">All domains</option>' +
    domains.map(d => `<option value="${d}"${d === current ? ' selected' : ''}>${d}</option>`).join('');
}

function selectedDomain() {
  return document.getElementById('filter-domain').value;
}

// ── Pages tab ────────────────────────────────────────────────────────────────

function renderPages() {
  const domain   = selectedDomain();
  const filtered = domain ? allVisits.filter(v => v.domain === domain) : allVisits;
  const list     = document.getElementById('pages-list');
  const empty    = document.getElementById('pages-empty');

  if (!filtered.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Group by domain, preserving newest-first order within each group
  const domainMap = new Map();
  for (const v of filtered) {
    if (!domainMap.has(v.domain)) domainMap.set(v.domain, []);
    domainMap.get(v.domain).push(v);
  }

  list.innerHTML = [...domainMap.entries()].map(([d, visits]) => domainCard(d, visits)).join('');
}

function domainCard(domain, visits) {
  const totalVal  = visits.reduce((n, v) => n + (v.findings    || []).length, 0);
  const totalName = visits.reduce((n, v) => n + (v.nameMatches || []).length, 0);
  const latestTs  = Math.max(...visits.map(v => v.ts));

  const badges = [
    `<span class="badge">${visits.length} page${visits.length !== 1 ? 's' : ''}</span>`,
    totalVal  ? `<span class="badge badge-val">✓ ${totalVal} value corr.</span>`   : '',
    totalName ? `<span class="badge badge-name">⚠ ${totalName} name match</span>` : '',
  ].join('');

  return `
<details class="domain-card">
  <summary class="domain-header">
    <span class="visit-chevron">▶</span>
    <span class="domain-name">${esc(domain)}</span>
    <span class="visit-time">${relTime(latestTs)}</span>
    <div class="visit-badges">${badges}</div>
  </summary>
  <div class="domain-body">
    ${visits.map(visitCard).join('')}
  </div>
</details>`;
}

function visitCard(v) {
  const params      = v.params      || [];
  const cookies     = v.cookies     || [];
  const findings    = v.findings    || [];
  const nameMatches = v.nameMatches || [];

  const corrCookies = new Set(findings.map(f => f.cookieName));
  const nameCookies = new Set(nameMatches.map(m => m.cookieName));

  // Show path + truncated query string in the header
  let shortPath = v.path || '/';
  try {
    const q = new URL(v.url).search;
    if (q) shortPath += q.length > 50 ? q.slice(0, 50) + '…' : q;
  } catch { /* ignore */ }

  const badges = [
    `<span class="badge">${params.length} param${params.length !== 1 ? 's' : ''}</span>`,
    `<span class="badge">${cookies.length} cookie${cookies.length !== 1 ? 's' : ''}</span>`,
    findings.length    ? `<span class="badge badge-val">✓ ${findings.length} value</span>`  : '',
    nameMatches.length ? `<span class="badge badge-name">⚠ ${nameMatches.length} name</span>` : '',
  ].join('');

  return `
<details class="visit-card">
  <summary class="visit-header">
    <span class="visit-chevron">▶</span>
    <span class="visit-path">${esc(shortPath)}</span>
    <span class="visit-time">${relTime(v.ts)}</span>
    <div class="visit-badges">${badges}</div>
  </summary>
  <div class="visit-body">
    <div class="visit-url">${esc(v.url)}</div>
    <div class="visit-grid">
      ${paramsSection(params)}
      ${cookiesSection(cookies, corrCookies, nameCookies)}
    </div>
    ${correlationsSection(findings, nameMatches)}
  </div>
</details>`;
}

function paramsSection(params) {
  const rows = params.length
    ? params.map(p => `<tr>
        <td class="col-name">${esc(p.name)}</td>
        <td class="col-val">${esc(trunc(p.value, 80))}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" class="empty-kv">no query parameters</td></tr>`;

  return `<div>
    <div class="section-label">Query Parameters</div>
    <table class="kv-table">
      <thead><tr><th>Name</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function cookiesSection(cookies, corrCookies, nameCookies) {
  const rows = cookies.length
    ? cookies.map(c => {
        const isVal  = corrCookies.has(c.name);
        const isName = !isVal && nameCookies.has(c.name);
        const cls    = isVal ? 'row-val' : isName ? 'row-name' : '';
        const tag    = isVal
          ? '<span class="row-tag tag-val">✓</span>'
          : isName
          ? '<span class="row-tag tag-name">⚠</span>'
          : '<span class="row-tag"></span>';
        return `<tr class="${cls}">
          <td class="col-name">${tag}${esc(c.name)}</td>
          <td class="col-val">${esc(trunc(c.value, 80))}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="2" class="empty-kv">no cookies</td></tr>`;

  return `<div>
    <div class="section-label">Cookies <span style="color:#484f58;font-weight:400;text-transform:none;font-size:.7rem">— ✓ value corr. &nbsp;⚠ name match</span></div>
    <table class="kv-table">
      <thead><tr><th>Name</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function correlationsSection(findings, nameMatches) {
  if (!findings.length && !nameMatches.length) return '';

  const valueItems = findings.map(f => `
    <div class="corr-item corr-item-val">
      <span class="corr-badge corr-badge-val">VALUE</span>
      <span class="corr-pname">${esc(f.param)}</span>
      <span class="corr-arrow">=</span>
      <span class="corr-val">${esc(trunc(f.paramValue, 40))}</span>
      <span class="corr-arrow">→[${esc(f.transform)}]→</span>
      <span class="corr-cname">${esc(f.cookieName)}</span>
      <span class="corr-arrow">contains</span>
      <span class="corr-val">"${esc(trunc(f.transformed, 40))}"</span>
      <span class="score-pill ${f.score >= 0.95 ? 'score-high' : 'score-med'}">${f.score.toFixed(3)}</span>
    </div>`).join('');

  const nameItems = nameMatches.map(m => `
    <div class="corr-item corr-item-name">
      <span class="corr-badge corr-badge-name">NAME</span>
      <span class="corr-pname">param "${esc(m.paramName)}"</span>
      <span class="corr-arrow">≈</span>
      <span class="corr-cname">cookie "${esc(m.cookieName)}"</span>
      <span class="corr-reason">${esc(m.reason)}</span>
    </div>`).join('');

  return `<div class="correlations-section">
    <div class="section-label">Correlations</div>
    ${valueItems}${nameItems}
  </div>`;
}

// ── Mappings tab ─────────────────────────────────────────────────────────────

function groupFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = `${f.domain}|${f.param}|${f.transform}|${f.cookieName}`;
    if (!map.has(key)) map.set(key, { ...f, count: 0, total: 0, examples: [], ts: 0 });
    const g = map.get(key);
    g.count++; g.total += f.score; g.examples.push(f);
    if (f.ts > g.ts) { g.ts = f.ts; g.url = f.url; }
  }
  return [...map.values()]
    .map(g => ({ ...g, avgScore: g.total / g.count }))
    .sort((a, b) => b.avgScore - a.avgScore || b.count - a.count);
}

function renderMappings() {
  const domain   = selectedDomain();
  const minScore = parseInt(document.getElementById('filter-score').value, 10) / 100;
  const grouped  = groupFindings(allFindings)
    .filter(g => (!domain || g.domain === domain) && g.avgScore >= minScore);

  const tbody = document.getElementById('findings-body');
  const empty = document.getElementById('mappings-empty');
  const table = document.getElementById('findings-table');

  if (!grouped.length) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = 'table';
  empty.style.display = 'none';

  tbody.innerHTML = grouped.map((g, i) => `
    <tr data-index="${i}">
      <td><span class="t-domain">${esc(g.domain)}</span></td>
      <td><span class="t-param">${esc(g.param)}</span></td>
      <td><span class="t-transform">${esc(g.transform)}</span></td>
      <td><span class="t-cookie">${esc(g.cookieName)}</span></td>
      <td><span class="score-pill ${g.avgScore >= 0.95 ? 'score-high' : 'score-med'}">${g.avgScore.toFixed(3)}</span></td>
      <td><span class="t-count">×${g.count}</span></td>
      <td><span class="t-time">${relTime(g.ts)}</span></td>
    </tr>`).join('');

  tbody.querySelectorAll('tr').forEach((tr, i) =>
    tr.addEventListener('click', () => showMappingDetail(grouped[i]))
  );
}

function showMappingDetail(g) {
  document.getElementById('modal-title').textContent =
    `${g.param}  →  ${g.transform}  →  ${g.cookieName}`;
  document.getElementById('modal-subtitle').textContent =
    `${g.domain}  ·  ${g.count} observation${g.count !== 1 ? 's' : ''}  ·  avg score ${g.avgScore.toFixed(3)}`;

  const examples = g.examples.slice(-5).reverse();
  document.getElementById('modal-examples').innerHTML =
    `<p class="modal-section-label">Recent examples (up to 5)</p>` +
    examples.map(e => `
      <div class="example-card">
        <div class="kv"><span class="key">URL</span><span class="val">${esc(e.url)}</span></div>
        <div class="kv"><span class="key">Param value</span><span class="val">${esc(e.paramValue)}</span></div>
        <div class="kv"><span class="key">Transformed</span><span class="val">${esc(e.transformed)}</span></div>
        <div class="kv"><span class="key">Cookie value</span><span class="val">${esc(e.cookieValue)}</span></div>
        <div class="kv"><span class="key">Score</span><span class="val">${e.score.toFixed(3)}</span></div>
        <div class="kv"><span class="key">Seen</span><span class="val">${new Date(e.ts).toLocaleString()}</span></div>
      </div>`).join('');

  document.getElementById('detail-modal').classList.remove('hidden');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function relTime(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 60_000)     return 'just now';
  if (d < 3_600_000)  return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function updateToggleUI(active) {
  document.getElementById('status-dot').classList.toggle('active', active);
  const btn = document.getElementById('btn-toggle');
  btn.textContent = active ? '⏸  Pause Recording' : '●  Start Recording';
  btn.className   = `toggle-btn ${active ? 'recording' : 'paused'}`;
}

// ── Event listeners ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('tab-pages').style.display    = activeTab === 'pages'    ? '' : 'none';
    document.getElementById('tab-mappings').style.display = activeTab === 'mappings' ? '' : 'none';
  });
});

document.getElementById('btn-toggle').addEventListener('click', async () => {
  const { active = false } = await chrome.storage.local.get('active');
  await chrome.storage.local.set({ active: !active });
  updateToggleUI(!active);
});

document.getElementById('filter-domain').addEventListener('change', () => {
  renderPages();
  renderMappings();
});

document.getElementById('filter-score').addEventListener('input', e => {
  document.getElementById('score-label').textContent = (e.target.value / 100).toFixed(2);
  renderMappings();
});

document.getElementById('btn-refresh').addEventListener('click', load);

document.getElementById('btn-clear').addEventListener('click', async () => {
  if (!confirm('Clear all collected data? This cannot be undone.')) return;
  await chrome.storage.local.remove(['visits', 'findings']);
  allVisits = []; allFindings = [];
  populateDomainFilter();
  renderStats();
  renderPages();
  renderMappings();
});

document.getElementById('modal-close').addEventListener('click', () =>
  document.getElementById('detail-modal').classList.add('hidden'));
document.querySelector('.modal-backdrop').addEventListener('click', () =>
  document.getElementById('detail-modal').classList.add('hidden'));

// ── Init ─────────────────────────────────────────────────────────────────────

load();
