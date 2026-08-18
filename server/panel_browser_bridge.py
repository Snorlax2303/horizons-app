#!/usr/bin/env python3
"""Private bridge for a manually operated, persistent panel browser.

It only starts a visible browser and VNC session. It never fills credentials,
solves CAPTCHA or clicks inside a panel.
"""
from __future__ import annotations

import json, os, pwd, re, secrets, subprocess, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path('/root/horizons-app/.automation/panel-browser').resolve()
TOKEN_FILE = ROOT / 'vnc-tokens.cfg'
CHROME_LOG = ROOT / 'chrome.log'
BROWSER_USER = 'horizons-browser'
BROWSER_HOME = Path('/var/lib/horizons-panel-browser').resolve()
PROFILE_ROOT = BROWSER_HOME / 'profiles'
DISPLAY = ':99'
VNC_PORT = 5901
UUID_RE = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$', re.I)

class BrowserManager:
    def __init__(self):
        self.lock = threading.Lock(); self.active_id = None; self.chrome = None; self.xvfb = None; self.x11vnc = None; self.tokens = {}
    def _ensure_desktop(self):
        if not self.xvfb or self.xvfb.poll() is not None:
            self.xvfb = subprocess.Popen(['Xvfb', DISPLAY, '-screen', '0', '1440x900x24', '-nolisten', 'tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not self.x11vnc or self.x11vnc.poll() is not None:
            self.x11vnc = subprocess.Popen(['x11vnc', '-display', DISPLAY, '-forever', '-shared', '-localhost', '-rfbport', str(VNC_PORT), '-nopw'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def _write_tokens(self):
        ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
        TOKEN_FILE.write_text(''.join(f'{token}: 127.0.0.1:{VNC_PORT}\n' for token in self.tokens), encoding='utf-8'); TOKEN_FILE.chmod(0o600)
    def _prepare_browser_user(self):
        account = pwd.getpwnam(BROWSER_USER)
        BROWSER_HOME.mkdir(parents=True, exist_ok=True, mode=0o750)
        PROFILE_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chown(BROWSER_HOME, account.pw_uid, account.pw_gid)
        os.chown(PROFILE_ROOT, account.pw_uid, account.pw_gid)
        subprocess.run(['/usr/bin/xhost', f'+SI:localuser:{BROWSER_USER}'], env={**os.environ, 'DISPLAY': DISPLAY}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return account
    def start(self, connection_id, base_url, access_token):
        if not UUID_RE.fullmatch(connection_id): raise ValueError('Identificador de conexão inválido.')
        parsed = urlparse(base_url)
        if parsed.scheme not in {'http', 'https'} or not parsed.netloc: raise ValueError('URL do painel inválida.')
        if len(access_token) < 32 or not re.fullmatch(r'[A-Za-z0-9_-]+', access_token): raise ValueError('Token de acesso inválido.')
        with self.lock:
            if self.active_id and self.active_id != connection_id: raise RuntimeError('Já existe outro painel aberto. Feche-o antes de abrir uma nova sessão.')
            self._ensure_desktop()
            account = self._prepare_browser_user()
            profile = (PROFILE_ROOT / connection_id).resolve()
            if PROFILE_ROOT not in profile.parents: raise ValueError('Perfil inválido.')
            profile.mkdir(parents=True, exist_ok=True, mode=0o700)
            os.chown(profile, account.pw_uid, account.pw_gid)
            if not self.chrome or self.chrome.poll() is not None:
                args = [
                    '/usr/bin/google-chrome', '--no-first-run',
                    '--no-default-browser-check', '--disable-background-networking',
                    '--disable-sync', '--disable-dev-shm-usage', '--disable-gpu',
                    f'--user-data-dir={profile}', '--window-size=1440,900', base_url,
                ]
                proxy = os.environ.get('PANEL_BROWSER_PROXY_URL', '').strip()
                if proxy: args.insert(-1, f'--proxy-server={proxy}')
                ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
                browser_env = {
                    **os.environ, 'DISPLAY': DISPLAY, 'HOME': str(BROWSER_HOME),
                    'XDG_CONFIG_HOME': str(BROWSER_HOME / '.config'),
                    'XDG_CACHE_HOME': str(BROWSER_HOME / '.cache'),
                }
                with CHROME_LOG.open('ab', buffering=0) as chrome_log:
                    self.chrome = subprocess.Popen(
                        ['/usr/sbin/runuser', '-u', BROWSER_USER, '--', '/usr/bin/env', *[f'{key}={value}' for key, value in browser_env.items() if key in {'DISPLAY', 'HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'}], *args], env=browser_env,
                        stdout=chrome_log, stderr=subprocess.STDOUT,
                    )
            self.active_id = connection_id; self.tokens[access_token] = connection_id; self._write_tokens()
    def stop(self, connection_id):
        with self.lock:
            if self.active_id == connection_id and self.chrome and self.chrome.poll() is None:
                self.chrome.terminate()
                try: self.chrome.wait(timeout=8)
                except subprocess.TimeoutExpired: self.chrome.kill()
                self.chrome = None; self.active_id = None
            self.tokens = {token: value for token, value in self.tokens.items() if value != connection_id}; self._write_tokens()

manager = BrowserManager()
BRIDGE_TOKEN = os.environ.get('PANEL_BROWSER_BRIDGE_TOKEN', '')
if len(BRIDGE_TOKEN) < 32: raise RuntimeError('PANEL_BROWSER_BRIDGE_TOKEN não configurado.')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): return
    def _authorized(self): return secrets.compare_digest(self.headers.get('x-horizons-bridge-token', ''), BRIDGE_TOKEN)
    def _json(self, status, payload):
        body = json.dumps(payload).encode(); self.send_response(status); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/health' and self._authorized(): self._json(200, {'status': 'ok', 'active_connection_id': manager.active_id}); return
        self._json(404, {'error': 'Não encontrado.'})
    def do_POST(self):
        if not self._authorized(): self._json(401, {'error': 'Não autorizado.'}); return
        if self.path != '/sessions': self._json(404, {'error': 'Não encontrado.'}); return
        try:
            size = int(self.headers.get('content-length', '0'))
            if size <= 0 or size > 16384: raise ValueError('Requisição inválida.')
            payload = json.loads(self.rfile.read(size)); manager.start(payload['connection_id'], payload['base_url'], payload['access_token']); self._json(201, {'started': True})
        except (KeyError, ValueError, RuntimeError) as error: self._json(409, {'error': str(error)})
    def do_DELETE(self):
        if not self._authorized(): self._json(401, {'error': 'Não autorizado.'}); return
        match = re.fullmatch(r'/sessions/([a-f0-9-]{36})', self.path, re.I)
        if not match: self._json(404, {'error': 'Não encontrado.'}); return
        manager.stop(match.group(1)); self._json(200, {'stopped': True})

if __name__ == '__main__':
    # Docker containers reach the host through its bridge gateway. Binding to
    # that interface keeps this control endpoint off the public VPS network.
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700); manager._write_tokens(); ThreadingHTTPServer(('172.17.0.1', 6081), Handler).serve_forever()
