// Smoke test operacional do Horizons (read-only, sem envio).
// Verifica frontend, API, n8n e a página pública de checklist.
import process from 'node:process';

const checks = [
  { name: 'Frontend /', url: 'http://127.0.0.1:3100/', expect: 200 },
  { name: 'Frontend /checklist-validacao-financeira.html', url: 'http://127.0.0.1:3100/checklist-validacao-financeira.html', expect: 200 },
  { name: 'API /health', url: 'http://127.0.0.1:8081/health', expect: 200, parse: (b) => { try { return JSON.parse(b).status; } catch { return null; } } },
  { name: 'API /health/details (sem token)', url: 'http://127.0.0.1:8081/health/details', expect: 401 },
  { name: 'n8n /healthz', url: 'http://127.0.0.1:5678/healthz', expect: 200 },
];

const results = [];
for (const check of checks) {
  try {
    const response = await fetch(check.url, { signal: AbortSignal.timeout(10_000) });
    const body = await response.text();
    const detail = check.parse ? check.parse(body) : null;
    results.push({ name: check.name, url: check.url, status: response.status, expected: check.expect, ok: response.status === check.expect, detail });
  } catch (error) {
    results.push({ name: check.name, url: check.url, status: 0, expected: check.expect, ok: false, error: error.message });
  }
}

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name} (status=${r.status}, esperado=${r.expected}${r.detail ? `, detalhe=${r.detail}` : ''})`);
  if (!r.ok) failed += 1;
}
process.exit(failed > 0 ? 1 : 0);
