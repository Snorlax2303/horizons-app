// List Evolution instances (read-only). Prints only name and state; never
// prints API keys, tokens, QR codes or phone numbers.
import 'dotenv/config';

const apiUrl = process.env.EVOLUTION_API_URL;
const apiKey = process.env.EVOLUTION_API_KEY;

if (!apiUrl || !apiKey) {
  console.error('EVOLUTION_API_URL ou EVOLUTION_API_KEY ausentes.');
  process.exit(1);
}

const base = apiUrl.replace(/\/+$/, '');
const response = await fetch(`${base}/instance/fetchInstances`, {
  headers: { apikey: apiKey },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) {
  console.error(`Evolution respondeu ${response.status}.`);
  process.exit(2);
}
const payload = await response.json();
const instances = Array.isArray(payload) ? payload : payload?.data || [];
for (const instance of instances) {
  const name = instance.instanceName || instance.name || 'sem nome';
  const state = instance.connectionStatus || instance.connectionState || instance.state || instance.status || 'desconhecido';
  console.log(`${name}\t${state}`);
}
