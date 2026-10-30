// Komunikacja z lokalnym API klienta League of Legends (LCU).
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Klient LCU używa certyfikatu podpisanego przez Riot, łączymy się wyłącznie z 127.0.0.1.
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout));
    });
  });
}

function parseCommandLine(cmdline) {
  const port = /--app-port=(\d+)/.exec(cmdline);
  const token = /--remoting-auth-token=([\w-]+)/.exec(cmdline);
  if (!port || !token) return null;
  return { protocol: 'https', host: '127.0.0.1', port: Number(port[1]), password: token[1] };
}

function parseLockfile(content) {
  // Format: LeagueClient:pid:port:password:protocol
  const parts = content.trim().split(':');
  if (parts.length < 5) return null;
  return { protocol: parts[4], host: '127.0.0.1', port: Number(parts[2]), password: parts[3] };
}

const LOCKFILE_CANDIDATES = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'E:\\Riot Games\\League of Legends\\lockfile',
  '/Applications/League of Legends.app/Contents/LoL/lockfile',
];

async function findCredentials() {
  if (process.env.LCU_MOCK) {
    const u = new URL(process.env.LCU_MOCK);
    return { protocol: u.protocol.replace(':', ''), host: u.hostname, port: Number(u.port), password: 'mock' };
  }
  let cmdline = '';
  if (process.platform === 'win32') {
    cmdline = await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
    ]);
  } else if (process.platform === 'darwin') {
    cmdline = (await run('ps', ['-A', '-o', 'args'])).split('\n').find((l) => l.includes('LeagueClientUx')) || '';
  }
  const fromProcess = parseCommandLine(cmdline);
  if (fromProcess) return fromProcess;

  const installDir = /--install-directory=([^"]+?)(?:"|\s--|$)/.exec(cmdline);
  const candidates = installDir ? [path.join(installDir[1].trim(), 'lockfile'), ...LOCKFILE_CANDIDATES] : LOCKFILE_CANDIDATES;
  for (const file of candidates) {
    try {
      const creds = parseLockfile(fs.readFileSync(file, 'utf8'));
      if (creds) return creds;
    } catch { /* plik nie istnieje */ }
  }
  return null;
}

class LcuClient {
  constructor(creds) {
    this.creds = creds;
    this.auth = 'Basic ' + Buffer.from('riot:' + creds.password).toString('base64');
  }

  raw(method, urlPath, body) {
    const { protocol, host, port } = this.creds;
    const lib = protocol === 'https' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = lib.request({
        host, port, method, path: urlPath,
        agent: protocol === 'https' ? agent : undefined,
        timeout: 5000,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async request(method, urlPath, body) {
    const res = await this.raw(method, urlPath, body);
    let data = null;
    const text = res.body.toString('utf8');
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, data };
  }

  async get(urlPath) {
    const res = await this.request('GET', urlPath);
    return res.ok ? res.data : null;
  }
}

module.exports = { findCredentials, LcuClient, parseCommandLine, parseLockfile };
