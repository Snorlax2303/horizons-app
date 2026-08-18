import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const configPath = join(root, 'config.json');
if (!existsSync(configPath)) throw new Error('Crie config.json a partir de config.example.json.');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
for (const key of ['apiUrl', 'agentId', 'enrollmentToken']) if (!config[key]) throw new Error(`Configuração ausente: ${key}`);
const apiUrl = config.apiUrl.replace(/\/$/, '');
const allowedHosts = new Set((config.allowedHosts || []).map((host) => String(host).toLowerCase()));
const profileRoot = join(homedir(), '.horizons-panel-agent', 'profiles');
mkdirSync(profileRoot, { recursive: true });
const running = new Map();
const captures = new Map();

function safeId(value) { return String(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 100); }
function debugPort(connectionId) {
  let hash = 0;
  for (const char of String(connectionId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 9300 + (hash % 500);
}
function chromeCandidates() {
  if (platform() === 'win32') return [
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'), 'chrome.exe',
  ];
  if (platform() === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome'];
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
}
async function launchBrowser(connectionId, targetUrl) {
  const target = new URL(targetUrl);
  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname.toLowerCase())) {
    throw new Error(`O host ${target.hostname} não está autorizado neste agente.`);
  }
  const current = running.get(connectionId);
  if (current && !current.killed) return { reused: true, pid: current.pid };
  const profile = join(profileRoot, safeId(connectionId));
  mkdirSync(profile, { recursive: true });
  let lastError;
  for (const command of chromeCandidates()) {
    try {
      const child = spawn(command, [
        `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
        '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort(connectionId)}`, target.toString(),
      ], { detached: false, stdio: 'ignore', windowsHide: false });
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      running.set(connectionId, child);
      child.once('exit', () => running.delete(connectionId));
      return { reused: false, pid: child.pid };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Google Chrome/Chromium não foi encontrado.');
}
function closeBrowser(connectionId) {
  for (const [captureId, capture] of captures) if (capture.connectionId === connectionId) stopCapture(captureId);
  const child = running.get(connectionId);
  if (!child || child.killed) return { closed: false };
  child.kill(); running.delete(connectionId);
  return { closed: true };
}
async function openCdp(connectionId) {
  const port = debugPort(connectionId);
  const targets = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(3_000) }).then((response) => response.json());
  const target = targets.find((item) => {
    if (item.type !== 'page' || !item.webSocketDebuggerUrl) return false;
    try { return allowedHosts.has(new URL(item.url).hostname.toLowerCase()); } catch { return false; }
  }) || targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl && item.url !== 'about:blank');
  if (!target) throw new Error('A aba do painel ainda não está disponível para captura.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => reject(new Error(`Tempo esgotado em ${method}.`)), 8_000);
    const onMessage = (message) => {
      const payload = JSON.parse(message.data);
      if (payload.id !== id) return;
      clearTimeout(timeout); socket.removeEventListener('message', onMessage);
      if (payload.error) reject(new Error(payload.error.message || method)); else resolve(payload.result || {});
    };
    socket.addEventListener('message', onMessage); socket.send(JSON.stringify({ id, method, params }));
  });
  return { call, close: () => socket.close() };
}
const captureInjection = `(() => {
  if (window.__horizonsCaptureInstalled) return;
  window.__horizonsCaptureInstalled = true; window.__horizonsCaptureEvents = [];
  const clean = (value, max = 240) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  const selector = (element) => {
    if (!element) return '';
    if (element.id) return '#' + CSS.escape(element.id);
    const parts = []; let current = element;
    while (current && current.nodeType === 1 && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      if (current.name) part += '[name="' + CSS.escape(current.name) + '"]';
      else { const siblings = [...current.parentElement?.children || []].filter((node) => node.tagName === current.tagName); if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')'; }
      parts.unshift(part); current = current.parentElement;
    }
    return parts.join(' > ');
  };
  document.addEventListener('click', (event) => { const element = event.target?.closest('button,a,input,textarea,[role="button"],select'); if (element) window.__horizonsCaptureEvents.push({ selector: selector(element), text: clean(element.innerText || element.getAttribute('aria-label') || element.name || element.type || element.placeholder) }); }, true);
})();`;
async function snapshot(connectionId, click = null) {
  const cdp = await openCdp(connectionId);
  try {
    await cdp.call('Page.enable');
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: captureInjection });
    await cdp.call('Runtime.evaluate', { expression: captureInjection });
    const details = await cdp.call('Runtime.evaluate', { expression: `JSON.stringify({ url: location.href, title: document.title, outline: Array.from(document.querySelectorAll('h1,h2,h3,button,a,label,input,select,textarea')).slice(0,300).map((e) => ({ tag:e.tagName.toLowerCase(), type:e.type || null, id:e.id || null, name:e.name || null, label:e.getAttribute('aria-label') || null, text:String(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.name || '').replace(/\\s+/g,' ').trim().slice(0,240), href:e.tagName === 'A' ? e.pathname : null })) })`, returnByValue: true });
    const metrics = await cdp.call('Page.getLayoutMetrics');
    const viewport = metrics.cssVisualViewport || { clientWidth: 1024, clientHeight: 768 };
    const image = await cdp.call('Page.captureScreenshot', { format: 'jpeg', quality: 45, clip: { x: viewport.pageX || 0, y: viewport.pageY || 0, width: Math.min(viewport.clientWidth, 1280), height: Math.min(viewport.clientHeight, 900), scale: 0.5 } });
    let value = {};
    try { value = JSON.parse(details.result?.value || '{}'); } catch { value = {}; }
    return { page_url: value.url || null, page_title: value.title || null, dom_outline: value.outline || [], screenshot_base64: image.data?.length <= 175000 ? image.data : null, ...(click ? { selector: click.selector, element_text: click.text } : {}) };
  } finally { cdp.close(); }
}
async function takeBrowserEvents(connectionId) {
  const cdp = await openCdp(connectionId);
  try {
    await cdp.call('Runtime.evaluate', { expression: captureInjection });
    const result = await cdp.call('Runtime.evaluate', { expression: 'window.__horizonsCaptureEvents ? window.__horizonsCaptureEvents.splice(0) : []', returnByValue: true });
    return result.result?.value || [];
  } finally { cdp.close(); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function runPanelFlow(connectionId, flow, baseUrl) {
  if (!flow || !Array.isArray(flow.steps) || !flow.steps.length || flow.steps.length > 40) throw new Error('Roteiro de painel inválido.');
  let cdp;
  try { cdp = await openCdp(connectionId); }
  catch (firstError) {
    if (typeof baseUrl !== 'string' || !baseUrl) throw firstError;
    await launchBrowser(connectionId, baseUrl);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try { cdp = await openCdp(connectionId); break; }
      catch { await sleep(750); }
    }
    if (!cdp) throw new Error('O Chrome do painel foi aberto, mas ainda não ficou disponível para automação.');
  }
  const extracted = {};
  const evaluate = (expression) => cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  // A previous flow can leave this isolated Chrome profile inside a modal or
  // detail page. Always return to the connection's entry page before resolving
  // navigation labels such as "Teste".
  if (typeof baseUrl === 'string' && baseUrl) {
    await cdp.call('Page.navigate', { url: baseUrl });
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const ready = await evaluate(`document.readyState === 'complete'`);
      if (ready.result?.value) break;
      await sleep(250);
    }
  }
  const typeFocusedValue = async (value) => {
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 8 });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8 });
    await cdp.call('Input.insertText', { text: value });
  };
  const clickPoint = async (point) => {
    if (!point) return false;
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    return true;
  };
  try {
    for (const step of flow.steps) {
      if (!step || typeof step !== 'object') throw new Error('Etapa de roteiro inválida.');
      if (step.type === 'wait') { await sleep(Math.min(10_000, Math.max(0, Number(step.ms) || 0))); continue; }
      const semanticTypes = ['click_text', 'click_text_if_present', 'click_row_selector', 'click_label', 'click_label_action', 'click_form_submit', 'fill_label', 'fill_near_text', 'fill_topmost_label', 'select_visible_combobox', 'press_key', 'extract_label', 'wait_for_text'];
      if (semanticTypes.includes(step.type)) {
        const text = step.text ?? step.label;
        if (step.type === 'press_key') {
          const keys = { Enter: 13, ArrowDown: 40, Escape: 27 };
          if (typeof step.key !== 'string' || !keys[step.key]) throw new Error('Tecla de etapa inválida.');
          await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, code: step.key, windowsVirtualKeyCode: keys[step.key] });
          await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code: step.key, windowsVirtualKeyCode: keys[step.key] });
          continue;
        }
        if (typeof text !== 'string' || !text.trim() || text.length > 300) throw new Error('Texto de etapa inválido.');
        if (['fill_label', 'fill_near_text', 'fill_topmost_label', 'select_visible_combobox'].includes(step.type) && (typeof step.value !== 'string' || step.value.length > 500)) throw new Error('Valor de preenchimento inválido.');
        if (step.type === 'extract_label' && (typeof step.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/.test(step.key))) throw new Error('Chave de resultado inválida.');
        const needle = JSON.stringify(text.trim());
        const scope = typeof step.scope_text === 'string' && step.scope_text.trim().length <= 300 ? JSON.stringify(step.scope_text.trim()) : 'null';
        const helper = `(() => {
          const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
          const comparable = (v) => normalize(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
          const wanted = normalize(${needle}); const scopeText = ${scope};
          const visible = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
          const inScope = (e) => !scopeText || [...document.querySelectorAll('h1,h2,h3,[role="dialog"],form')].some((container) => visible(container) && normalize(container.innerText).includes(normalize(scopeText)) && container.contains(e));
          const byText = (selectors) => [...document.querySelectorAll(selectors)].filter((e) => {
            if (!visible(e) || !inScope(e)) return false;
            const actual = normalize(e.innerText || e.textContent || e.getAttribute('aria-label') || e.placeholder);
            const expected = comparable(wanted); const candidate = comparable(actual);
            return actual === wanted || (expected.length >= 3 && candidate.includes(expected));
          }).sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
          const controlByLabel = () => {
            const label = [...document.querySelectorAll('label')].find((e) => visible(e) && inScope(e) && normalize(e.innerText || e.textContent) === wanted);
            if (!label) return null;
            if (label.htmlFor) { const target = document.getElementById(label.htmlFor); if (target && visible(target)) return target; }
            const nested = label.querySelector('input,textarea,select,[contenteditable="true"]'); if (nested && visible(nested)) return nested;
            const controlSelector = 'input,textarea,select,[contenteditable="true"]';
            const firstVisibleControl = (node) => node?.matches?.(controlSelector) && visible(node) ? node : [...(node?.querySelectorAll?.(controlSelector) || [])].find(visible) || null;
            let sibling = label.nextElementSibling;
            while (sibling) { const control = firstVisibleControl(sibling); if (control) return control; sibling = sibling.nextElementSibling; }
            let child = label;
            for (let depth = 0; depth < 4 && child?.parentElement; depth += 1) {
              const parent = child.parentElement; const children = [...parent.children]; const start = Math.max(0, children.indexOf(child) + 1);
              for (const candidate of children.slice(start)) { const control = firstVisibleControl(candidate); if (control) return control; }
              child = parent;
            }
            // Some Union dialogs render their floating label and combobox in
            // separate wrappers.  Use the closest visible following control
            // as a final, geometry-based fallback instead of relying on the
            // generated input ID or a rigid sibling structure.
            const labelRect = label.getBoundingClientRect();
            const candidates = [...document.querySelectorAll(controlSelector)].filter(visible).map((control) => {
              const rect = control.getBoundingClientRect();
              return { control, score: Math.abs(rect.top - labelRect.bottom) + Math.abs(rect.left - labelRect.left) / 8 + (rect.top + 24 < labelRect.top ? 10_000 : 0) };
            }).sort((a, b) => a.score - b.score);
            return candidates[0]?.control || null;
          };
          return { byText, controlByLabel };
        })()`;
        if (step.type === 'wait_for_text') {
          const deadline = Date.now() + Math.min(15_000, Math.max(1_000, Number(step.timeout_ms) || 8_000)); let found = false;
          while (Date.now() < deadline) { const check = await evaluate(`${helper}.byText('button,a,label,h1,h2,h3,[role="option"],input') ? true : false`); if (check.result?.value) { found = true; break; } await sleep(250); }
          if (!found) throw new Error(`Texto não encontrado: ${text}`); continue;
        }
        if (step.type === 'click_text' || step.type === 'click_text_if_present') {
          const result = await evaluate(`(() => { const api = ${helper}; const e = api.byText('button,a,[role="button"],[role="option"],label') || api.byText('*'); if (!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return r.width && r.height ? { x:r.left+r.width/2, y:r.top+r.height/2 } : null; })()`);
          const point = result.result?.value;
          if (!point && step.type === 'click_text_if_present') continue;
          if (!point) throw new Error(`Não foi possível clicar no texto: ${text}`);
          await clickPoint(point);
          continue;
        }
        if (step.type === 'select_visible_combobox') {
          const option = JSON.stringify(step.value);
          const trigger = await evaluate(`(() => { const normalize=(v)=>String(v||'').replace(/\\s+/g,' ').trim().toLocaleLowerCase('pt-BR'); const visible=(e)=>!!e&&(!!e.offsetWidth||!!e.offsetHeight||e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden'; const label=[...document.querySelectorAll('label')].filter((e)=>visible(e)&&normalize(e.innerText||e.textContent)===normalize(${needle})).sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top)[0]; if(!label)return null; const lr=label.getBoundingClientRect(); const controls=[...document.querySelectorAll('button,[role="combobox"],[aria-haspopup="listbox"],input')].filter(visible).map((e)=>{const r=e.getBoundingClientRect();return {e,r,score:Math.abs(r.top-lr.bottom)+Math.abs(r.left-lr.left)/8+(r.top+20<lr.top?10000:0)}}).sort((a,b)=>a.score-b.score); const target=controls[0]?.e; if(!target)return null; target.scrollIntoView({block:'center'}); const r=target.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
          if (!await clickPoint(trigger.result?.value)) throw new Error(`Não foi possível abrir o combobox: ${text}`);
          await sleep(150); await typeFocusedValue(step.value); await sleep(250);
          const choice = await evaluate(`(() => { const normalize=(v)=>String(v||'').replace(/\\s+/g,' ').trim().toLocaleLowerCase('pt-BR'); const wanted=normalize(${option}); const visible=(e)=>!!e&&(!!e.offsetWidth||!!e.offsetHeight||e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden'; const top=(e)=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit&&(hit===e||e.contains(hit)||hit.contains(e));}; const e=[...document.querySelectorAll('button,[role="option"],li,div')].filter((n)=>visible(n)&&top(n)&&normalize(n.innerText||n.textContent)===wanted).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0]; if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
          if (!await clickPoint(choice.result?.value)) throw new Error(`Não foi possível selecionar a opção visível: ${step.value}`);
          continue;
        }
        if (step.type === 'click_row_selector') {
          if (typeof step.selector !== 'string' || step.selector.length > 500) throw new Error('Seletor da linha inválido.');
          const rowSelector = JSON.stringify(step.selector);
          const result = await evaluate(`(() => { const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR'); const wanted = normalize(${needle}); const visible = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden'; const row = [...document.querySelectorAll('tbody tr')].find((candidate) => visible(candidate) && normalize(candidate.innerText).includes(wanted)); const target = row?.querySelector(${rowSelector}); if (!target || !visible(target)) return null; target.scrollIntoView({block:'center'}); const r=target.getBoundingClientRect(); return r.width && r.height ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
          if (!await clickPoint(result.result?.value)) throw new Error(`Não foi possível abrir a ação do cliente: ${text}`);
          continue;
        }
        if (step.type === 'click_form_submit') {
          const result = await evaluate(`(() => { const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR'); const wanted = normalize(${needle}); const visible = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden'; const form = [...document.querySelectorAll('form')].find((candidate) => visible(candidate) && normalize(candidate.innerText).includes(wanted)); const submit = [...(form?.querySelectorAll('button[type="submit"],input[type="submit"]') || [])].find(visible); if (!submit) return null; submit.scrollIntoView({block:'center'}); const r=submit.getBoundingClientRect(); return r.width && r.height ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
          if (!await clickPoint(result.result?.value)) throw new Error(`Não foi possível enviar o formulário: ${text}`);
          continue;
        }
        if (step.type === 'click_label' || step.type === 'click_label_action') {
          const action = step.type === 'click_label_action';
          const result = await evaluate(`(() => { const api = ${helper}; const e = api.controlByLabel(); if (!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return r.width && r.height ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
          if (!action) { if (!await clickPoint(result.result?.value)) throw new Error(`Não foi possível abrir o campo: ${text}`); continue; }
          const actionResult = await evaluate(`(() => { const api = ${helper}; const field = api.controlByLabel(); if (!field) return null; const actionSelector='button,[role="button"]'; const visibleAction=(node) => [...(node?.querySelectorAll?.(actionSelector) || [])].find((candidate) => { const r=candidate.getBoundingClientRect(); return r.width && r.height && getComputedStyle(candidate).visibility !== 'hidden'; }) || null; let button=visibleAction(field.parentElement); let child=field; for(let depth=0;!button && depth<4 && child?.parentElement;depth+=1){const parent=child.parentElement;const children=[...parent.children];const start=Math.max(0,children.indexOf(child)+1);for(const candidate of children.slice(start)){button=candidate.matches?.(actionSelector) ? candidate : visibleAction(candidate);if(button)break;}child=parent;} if (!button) return null; button.scrollIntoView({block:'center'}); const r=button.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
          if (!await clickPoint(actionResult.result?.value)) throw new Error(`Não foi possível acionar o gerador de: ${text}`); continue;
        }
        if (step.type === 'fill_near_text') {
          const result = await evaluate(`(() => {
            const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
            const comparable = (v) => normalize(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
            const wanted = comparable(${needle});
            const visible = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
            const labels = [...document.querySelectorAll('label,h1,h2,h3,span,div')].filter((e) => visible(e) && comparable(e.innerText || e.textContent) === wanted).sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
            const anchor = labels[0]; if (!anchor) return false;
            const anchorRect = anchor.getBoundingClientRect();
            const controls = [...document.querySelectorAll('input,textarea,select,[role="combobox"],[role="textbox"]')].filter(visible).map((control) => { const rect = control.getBoundingClientRect(); return { control, score: Math.abs(rect.top - anchorRect.bottom) + Math.abs(rect.left - anchorRect.left) / 8 + (rect.top + 30 < anchorRect.top ? 10000 : 0) }; }).sort((a,b) => a.score - b.score);
            const field = controls[0]?.control; if (!field) return false; field.scrollIntoView({block:'center'}); field.focus(); return document.activeElement === field;
          })()`);
          if (!result.result?.value) throw new Error(`Não foi possível preencher o campo próximo de: ${text}`);
          await typeFocusedValue(step.value);
          continue;
        }
        if (step.type === 'fill_topmost_label') {
          const result = await evaluate(`(() => {
            const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
            const comparable = (v) => normalize(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
            const wanted = comparable(${needle});
            const visible = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
            const topmost = (e) => { const r=e.getBoundingClientRect(); const hit=document.elementFromPoint(r.left + Math.max(2, r.width / 2), r.top + Math.max(2, r.height / 2)); return !!hit && (hit === e || e.contains(hit) || hit.contains(e)); };
            const labels = [...document.querySelectorAll('label')].filter((e) => visible(e) && comparable(e.innerText || e.textContent) === wanted).filter(topmost);
            const anchor = labels[0]; if (!anchor) return false;
            const anchorRect = anchor.getBoundingClientRect();
            const controls = [...document.querySelectorAll('input,textarea,select,[role="combobox"],[role="textbox"]')].filter((e) => visible(e) && topmost(e)).map((control) => { const rect=control.getBoundingClientRect(); return { control, score: Math.abs(rect.top-anchorRect.bottom) + Math.abs(rect.left-anchorRect.left)/8 + (rect.top+30 < anchorRect.top ? 10000 : 0) }; }).sort((a,b)=>a.score-b.score);
            const field=controls[0]?.control; if(!field) return false; field.scrollIntoView({block:'center'}); field.focus(); return document.activeElement===field;
          })()`);
          if (!result.result?.value) throw new Error(`Não foi possível preencher o campo visível: ${text}`);
          await typeFocusedValue(step.value);
          continue;
        }
        if (step.type === 'fill_label') {
          const result = await evaluate(`(() => { const api = ${helper}; const e = api.controlByLabel(); if (!e) return false; e.scrollIntoView({block:'center'}); e.focus(); return document.activeElement === e; })()`);
          if (!result.result?.value) throw new Error(`Não foi possível preencher o campo: ${text}`);
          await typeFocusedValue(step.value);
          continue;
        }
        const result = await evaluate(`(() => { const api = ${helper}; const e = api.controlByLabel(); return e ? String(e.value || e.innerText || e.textContent || '').trim().slice(0,1000) : null; })()`);
        if (result.result?.value === null || result.result?.value === undefined) throw new Error(`Não foi possível ler o campo: ${text}`);
        extracted[step.key] = result.result.value; continue;
      }
      if (!['click', 'fill', 'select', 'extract', 'wait_for'].includes(step.type) || typeof step.selector !== 'string' || step.selector.length > 500) throw new Error('Etapa ou seletor inválido.');
      const selector = JSON.stringify(step.selector);
      if (step.type === 'wait_for') {
        const deadline = Date.now() + Math.min(15_000, Math.max(1_000, Number(step.timeout_ms) || 8_000)); let found = false;
        while (Date.now() < deadline) { const check = await evaluate(`Boolean(document.querySelector(${selector}))`); if (check.result?.value) { found = true; break; } await sleep(250); }
        if (!found) throw new Error(`Elemento não encontrado: ${step.selector}`); continue;
      }
      if (step.type === 'click') {
        const result = await evaluate(`(() => { const e = document.querySelector(${selector}); if (!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return r.width && r.height ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
        if (!await clickPoint(result.result?.value)) throw new Error(`Não foi possível clicar: ${step.selector}`); continue;
      }
      if (step.type === 'fill' || step.type === 'select') {
        if (typeof step.value !== 'string' || step.value.length > 500) throw new Error('Valor de preenchimento inválido.');
        const result = await evaluate(`(() => { const e = document.querySelector(${selector}); if (!e) return false; e.scrollIntoView({block:'center'}); e.focus(); return document.activeElement === e; })()`);
        if (!result.result?.value) throw new Error(`Não foi possível preencher: ${step.selector}`);
        await typeFocusedValue(step.value);
        continue;
      }
      if (step.type === 'extract') {
        if (typeof step.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/.test(step.key)) throw new Error('Chave de resultado inválida.');
        const result = await evaluate(`(() => { const e = document.querySelector(${selector}); return e ? String(e.value || e.innerText || e.textContent || '').trim().slice(0,1000) : null; })()`);
        if (result.result?.value === null || result.result?.value === undefined) throw new Error(`Não foi possível ler: ${step.selector}`);
        extracted[step.key] = result.result.value;
      }
    }
    return { extracted, completed_at: new Date().toISOString() };
  } finally { cdp.close(); }
}
async function recordCapture(captureId, initial = false) {
  const capture = captures.get(captureId); if (!capture) return;
  try {
    const clicks = await takeBrowserEvents(capture.connectionId);
    const currentUrl = await openCdp(capture.connectionId).then(async (cdp) => { try { const result = await cdp.call('Runtime.evaluate', { expression: 'location.href', returnByValue: true }); return result.result?.value; } finally { cdp.close(); } });
    const events = [];
    if (initial || currentUrl !== capture.lastUrl) { events.push({ event_type: 'page', ...(await snapshot(capture.connectionId)) }); capture.lastUrl = currentUrl; }
    for (const click of clicks) events.push({ event_type: 'click', ...(await snapshot(capture.connectionId, click)) });
    if (!events.length) return;
    for (const event of events) {
      event.sequence = capture.sequence++;
      await request('/agent/capture-events', { method: 'POST', body: JSON.stringify({ capture_session_id: captureId, events: [event] }) });
    }
  } catch (error) { console.error(`Captura ${captureId}: ${error.message}`); }
}
async function startCapture(connectionId, captureId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await openCdp(connectionId).then((cdp) => cdp.close()); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 1_000)); if (attempt === 9) throw new Error('Não foi possível conectar à captura do Chrome. Feche esta janela do painel e abra-a novamente pelo Horizons.'); }
  }
  stopCapture(captureId);
  const capture = { connectionId, sequence: 0, lastUrl: null, timer: null };
  captures.set(captureId, capture);
  await recordCapture(captureId, true);
  capture.timer = setInterval(() => recordCapture(captureId), 2_000);
  return { capture_id: captureId };
}
function stopCapture(captureId) {
  const capture = captures.get(captureId); if (!capture) return { stopped: false };
  clearInterval(capture.timer); captures.delete(captureId); return { stopped: true };
}
async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${config.enrollmentToken}`,
      'x-horizons-agent-id': config.agentId,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `API respondeu ${response.status}`);
  return payload;
}
async function execute(command) {
  if (command.action === 'open_browser') return launchBrowser(command.panel_connection_id, command.payload.base_url);
  if (command.action === 'close_browser') return closeBrowser(command.panel_connection_id);
  if (command.action === 'start_capture') return startCapture(command.panel_connection_id, command.payload.capture_session_id);
  if (command.action === 'stop_capture') return stopCapture(command.payload.capture_session_id);
  if (command.action === 'run_panel_flow') return runPanelFlow(command.panel_connection_id, command.payload.flow, command.payload.base_url);
  throw new Error('Comando não suportado.');
}
async function tick() {
  await request('/agent/heartbeat', { method: 'POST', body: JSON.stringify({ platform: platform(), hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || null }) });
  const { command } = await request('/agent/commands/next');
  if (!command) return;
  try {
    const result = await execute(command);
    await request(`/agent/commands/${command.id}/result`, { method: 'POST', body: JSON.stringify({ ok: true, result }) });
    console.log(`[${new Date().toISOString()}] ${command.action} concluído.`);
  } catch (error) {
    await request(`/agent/commands/${command.id}/result`, { method: 'POST', body: JSON.stringify({ ok: false, error: error.message.slice(0, 1000) }) });
    console.error(`[${new Date().toISOString()}] ${command.action}: ${error.message}`);
  }
}
const interval = Math.max(3, Number(config.pollIntervalSeconds || 5)) * 1000;
console.log(`Horizons Local Panel Agent conectado. Consultando a cada ${interval / 1000}s.`);
setInterval(() => tick().catch((error) => console.error(`Conexão: ${error.message}`)), interval);
tick().catch((error) => console.error(`Conexão: ${error.message}`));
