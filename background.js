// ── Transforms ──────────────────────────────────────────────────────────────

function tryB64(s) {
  try {
    const standard = s.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard + '='.repeat((4 - standard.length % 4) % 4);
    const decoded = atob(padded);
    if (/^[\x20-\x7E\t\n\r]+$/.test(decoded)) return decoded;
    return null;
  } catch { return null; }
}

const NAMED_TRANSFORMS = [
  { name: 'identity',  fn: s => s },
  { name: 'urldecode', fn: s => { try { return decodeURIComponent(s); } catch { return null; } } },
  { name: 'base64url', fn: s => tryB64(s) },
  {
    name: 'hex',
    fn: s => {
      if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0 || s.length < 6) return null;
      try { return s.match(/.{2}/g).map(b => String.fromCharCode(parseInt(b, 16))).join(''); }
      catch { return null; }
    },
  },
];

function candidatesFor(token) {
  const out = [];
  for (const { name, fn } of NAMED_TRANSFORMS) {
    const v = fn(token);
    if (v !== null) out.push({ transform: name, value: v });
  }
  for (const sep of ['.', '-', '_', '~', ':', '|']) {
    const parts = token.split(sep);
    if (parts.length <= 1) continue;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || part.length < 3) continue;
      out.push({ transform: `split:${sep}:${i}`, value: part });
      const b = tryB64(part);
      if (b) out.push({ transform: `split+b64:${sep}:${i}`, value: b });
    }
  }
  return out;
}

// ── Value similarity ─────────────────────────────────────────────────────────

function valueSimilarity(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 1.0;
  if (!a || !b || a.length < 3 || b.length < 3) return 0;

  const la = a.toLowerCase(), lb = b.toLowerCase();
  // Substring containment is the primary real-world signal
  if (lb.includes(la)) return 0.85 + 0.15 * (a.length / b.length);
  if (la.includes(lb)) return 0.85 + 0.15 * (b.length / a.length);

  const setA = new Set(la), setB = new Set(lb);
  const inter = [...setA].filter(c => setB.has(c)).length;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union > 0 ? inter / union : 0;
  const maxLen = Math.max(a.length, b.length);
  const lenSim = Math.min(a.length, b.length) / maxLen;
  let pfx = 0;
  while (pfx < a.length && pfx < b.length && a[pfx] === b[pfx]) pfx++;
  return Math.min(0.84, jaccard * 0.4 + lenSim * 0.25 + pfx / maxLen * 0.3);
}

// ── Key name matching ────────────────────────────────────────────────────────

const SEMANTIC_GROUPS = [
  ['session', 'sess', 'sid', 'sessionid', 'sessid', 'phpsessid', 'jsessionid'],
  ['user', 'uid', 'userid', 'usr', 'member', 'memberid', 'username'],
  ['token', 'tok', 'accesstoken', 'authtoken', 'jwt', 'bearer', 'apikey', 'csrftoken'],
  ['client', 'cid', 'clientid'],
  ['visitor', 'vid', 'visitorid', 'visitid', 'visid'],
  ['click', 'clid', 'clickid', 'gclid', 'fbclid', 'ttclid', 'msclkid', 'twclid', 'dclid'],
  ['customer', 'cust', 'custid', 'customerid'],
  ['account', 'acct', 'accountid', 'acctid'],
  ['campaign', 'cmpid', 'campaignid', 'utm', 'utmcampaign'],
  ['order', 'orderid', 'oid', 'transactionid', 'txid'],
  ['device', 'did', 'deviceid'],
  ['install', 'iid', 'installid'],
  ['page', 'pid', 'pageid'],
  ['product', 'prid', 'productid', 'item', 'itemid', 'sku'],
];

function normKey(k) {
  return k.toLowerCase().replace(/^[_\-.]+|[_\-.]+$/g, '').replace(/[_\-.]/g, '');
}

function detectNameMatches(params, cookieList) {
  const matches = [];
  const seen = new Set();

  for (const p of params) {
    const pn = normKey(p.name);
    for (const c of cookieList) {
      const cn = normKey(c.name);
      const key = `${p.name}|${c.name}`;
      if (seen.has(key)) continue;

      let match = null;

      if (pn === cn) {
        match = { paramName: p.name, cookieName: c.name, score: 1.0, reason: 'exact key match' };
      } else if (pn.length >= 3 && cn.length >= 3) {
        if (pn.includes(cn) || cn.includes(pn)) {
          const shorter = Math.min(pn.length, cn.length);
          const longer  = Math.max(pn.length, cn.length);
          match = { paramName: p.name, cookieName: c.name, score: 0.75 + 0.2 * (shorter / longer), reason: 'key substring' };
        } else {
          for (const group of SEMANTIC_GROUPS) {
            const ng = group.map(normKey);
            if (ng.some(g => pn === g || pn.includes(g) || g.includes(pn)) &&
                ng.some(g => cn === g || cn.includes(g) || g.includes(cn))) {
              match = { paramName: p.name, cookieName: c.name, score: 0.75, reason: 'semantic alias' };
              break;
            }
          }
        }
      }

      if (match) { matches.push(match); seen.add(key); }
    }
  }
  return matches;
}

// ── Value detection ──────────────────────────────────────────────────────────

const THRESHOLD = 0.85;

function detectMappings(urlStr, rawCookies) {
  const findings = [];
  let params;
  try { params = [...new URL(urlStr).searchParams.entries()]; } catch { return findings; }
  if (!params.length || !rawCookies.length) return findings;

  const domain = new URL(urlStr).hostname;

  for (const [param, paramValue] of params) {
    if (!paramValue || paramValue.length < 3) continue;
    const candidates = candidatesFor(paramValue);
    for (const cookie of rawCookies) {
      if (!cookie.value || cookie.value.length < 3) continue;
      for (const { transform, value } of candidates) {
        const score = valueSimilarity(value, cookie.value);
        if (score >= THRESHOLD) {
          findings.push({
            domain, url: urlStr, param, paramValue, transform,
            transformed: value,
            cookieName: cookie.name,
            cookieValue: cookie.value,
            score: Math.round(score * 1000) / 1000,
            ts: Date.now(),
          });
        }
      }
    }
  }
  return findings;
}

// ── Storage ──────────────────────────────────────────────────────────────────

const MAX_VISITS   = 500;
const MAX_FINDINGS = 2000;

async function saveVisit(visit) {
  const { visits = [] } = await chrome.storage.local.get('visits');
  await chrome.storage.local.set({ visits: [...visits, visit].slice(-MAX_VISITS) });
}

async function saveFindings(newFindings) {
  const { findings = [] } = await chrome.storage.local.get('findings');
  await chrome.storage.local.set({ findings: [...findings, ...newFindings].slice(-MAX_FINDINGS) });
}

async function isRecording() {
  const { active = false } = await chrome.storage.local.get('active');
  return active;
}

// ── Tab listener ─────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('http')) return;

  if (!(await isRecording())) {
    console.log('[CookieURL] paused — skipping', tab.url);
    return;
  }

  let parsedUrl;
  try { parsedUrl = new URL(tab.url); } catch { return; }

  const params = [...parsedUrl.searchParams.entries()].map(([name, value]) => ({ name, value }));
  console.log(`[CookieURL] tab loaded: ${tab.url}`);
  console.log(`[CookieURL] query params: ${params.length ? params.map(p => p.name).join(', ') : '(none)'}`);

  chrome.cookies.getAll({ url: tab.url }, async (rawCookies) => {
    const cookieList = (rawCookies || []).map(c => ({ name: c.name, value: c.value }));
    console.log(`[CookieURL] cookies (${cookieList.length}):`, cookieList.map(c => c.name));

    const findings    = detectMappings(tab.url, rawCookies || []);
    const nameMatches = detectNameMatches(params, cookieList);

    console.log(`[CookieURL] value correlations: ${findings.length}`);
    findings.forEach(f =>
      console.log(`  ✓ ${f.param}=${f.paramValue} --[${f.transform}]--> "${f.transformed}" ~ ${f.cookieName}="${f.cookieValue}" (${f.score})`)
    );
    console.log(`[CookieURL] name matches: ${nameMatches.length}`);
    nameMatches.forEach(m =>
      console.log(`  ⚠ param "${m.paramName}" ≈ cookie "${m.cookieName}" (${m.reason}, ${m.score.toFixed(2)})`)
    );

    const visit = {
      url: tab.url,
      domain: parsedUrl.hostname,
      path: parsedUrl.pathname,
      ts: Date.now(),
      params,
      cookies: cookieList,
      findings,
      nameMatches,
    };

    await saveVisit(visit);
    if (findings.length) await saveFindings(findings);
  });
});
