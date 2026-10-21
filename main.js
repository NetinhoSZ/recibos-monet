const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

// Onde ficam dados e recibos:
// - pasta solta ou versão portátil: ao lado do .exe (se der para gravar lá);
// - instalado pelo Setup (ou pasta sem permissão): AppData do usuário + Documentos\Recibos Monet.
function canWrite(dir) {
  try {
    const f = path.join(dir, `.teste-${process.pid}`);
    fs.writeFileSync(f, '');
    fs.rmSync(f);
    return true;
  } catch { return false; }
}
function pickPaths() {
  if (!app.isPackaged) return { data: path.join(__dirname, 'dados-app'), out: path.join(__dirname, 'Recibos') };
  const exeDir = path.dirname(app.getPath('exe'));
  const dir = process.env.PORTABLE_EXECUTABLE_DIR || exeDir;
  const installed = !process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(path.join(exeDir, 'Uninstall Recibos Monet.exe'));
  if (!installed && canWrite(dir)) return { data: path.join(dir, 'dados-app'), out: path.join(dir, 'Recibos') };
  return { data: path.join(app.getPath('appData'), 'Recibos Monet'), out: path.join(app.getPath('documents'), 'Recibos Monet') };
}
const PATHS = pickPaths();
app.setPath('userData', PATHS.data);
const STORE = path.join(PATHS.data, 'recibos.json');
const ASSETS = path.join(__dirname, 'src', 'assets');

const DEFAULT_STORE = {
  settings: {
    pixKey: 'contato.monetcreative@gmail.com', pixType: 'email', pixName: 'Monet Creative', pixCity: 'Joao Pessoa',
    showQr: true, numbered: false, nextNumber: 1, outDir: PATHS.out,
    cardMaxInstallments: 1,
  },
  catalog: [
    { id: 'lp', name: 'Landing Page', desc: 'Criação e desenvolvimento de landing page', price: 650 },
    { id: 'feed', name: 'Pacote promocional de feed', desc: 'Artes para o feed do Instagram', price: 200 },
    { id: '1yyg04y', name: 'Imagem Única', desc: 'Uma única imagem para o Instagram', price: 35 },
    { id: 'wtvoikn', name: 'Pacote de 3 Imagens', desc: 'Um Pacote com 3 Imagens para o Instagram', price: 89.7 },
    { id: '0z4657z', name: 'Pacote de 5 Imagens', desc: 'Um Pacote com 5 Imagens para o Instagram', price: 129.5 },
    { id: '3r60ee4', name: 'Vídeo Único', desc: 'Um único vídeo para o Instagram', price: 60 },
    { id: 'qgljbjs', name: 'Pacote de 3 Vídeos', desc: 'Um Pacote com 3 Vídeos para o Instagram', price: 149.7 },
    { id: 'hyyx9hq', name: 'Pacote de 5 Vídeos', desc: 'Um Pacote com 5 Vídeos para o Instagram', price: 229.5 },
    { id: 'fp0ck14', name: 'Plano Agência', desc: 'A Monet fica responsável por cuidar do Instagram', price: 450 },
  ],
};

function loadStore() {
  try {
    const s = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    return { settings: { ...DEFAULT_STORE.settings, ...s.settings }, catalog: s.catalog || DEFAULT_STORE.catalog, draft: s.draft };
  } catch { return structuredClone(DEFAULT_STORE); }
}

function saveStore(s) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE + '.tmp', JSON.stringify(s, null, 2));
  fs.renameSync(STORE + '.tmp', STORE);
}

let assetsCache;
function assets() {
  if (assetsCache) return assetsCache;
  const b64 = f => fs.readFileSync(path.join(ASSETS, f)).toString('base64');
  const font = (fam, f, w) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(data:font/woff2;base64,${b64(f)}) format('woff2');}`;
  const fontCss = [
    font('Unbounded', 'unbounded-latin-500-normal.woff2', 500),
    font('Unbounded', 'unbounded-latin-700-normal.woff2', 700),
    ...[400, 500, 600, 700, 800].map(w => font('Jakarta', `plus-jakarta-sans-latin-${w}-normal.woff2`, w)),
  ].join('');
  assetsCache = { fontCss, logo: `data:image/png;base64,${b64('logo.png')}` };
  return assetsCache;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 1080, minHeight: 700, backgroundColor: '#040813', autoHideMenuBar: true,
    title: 'Recibos Monet', icon: path.join(ASSETS, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.once('did-finish-load', () => setTimeout(checkUpdates, 3000));
}

// ---------- atualização automática (versões publicadas no GitHub) ----------
// Instalado: baixa sozinho em segundo plano e oferece reiniciar. Portátil: só avisa e leva à página de download.
const REPO = 'NetinhoSZ/recibos-monet';
const UPDATE_LOG = path.join(PATHS.data, 'atualizacao.log');
// Uma linha por erro; o arquivo recomeça quando passa de 50 KB.
function logUpdate(msg) {
  try {
    if (fs.existsSync(UPDATE_LOG) && fs.statSync(UPDATE_LOG).size > 50000) fs.rmSync(UPDATE_LOG);
    fs.appendFileSync(UPDATE_LOG, `${new Date().toISOString()} ${String(msg).split('\n')[0]}\n`);
  } catch {}
}
const sendUpdate = msg => { if (win && !win.isDestroyed()) win.webContents.send('update', msg); };
function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
async function checkUpdates() {
  if (!app.isPackaged) return;
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return logUpdate(`portátil: GitHub respondeu ${r.status}`);
      const j = await r.json();
      const v = String(j.tag_name || '').replace(/^v/, '');
      if (newer(v, app.getVersion())) sendUpdate({ kind: 'portable', version: v, url: j.html_url });
    } catch (e) { logUpdate('portátil: ' + e.message); }
    return;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.logger = null;
  autoUpdater.on('update-downloaded', info => sendUpdate({ kind: 'ready', version: info.version }));
  autoUpdater.on('error', e => logUpdate('instalado: ' + (e && e.message)));
  autoUpdater.checkForUpdates().catch(() => {}); // o erro já chega pelo evento 'error'
}
ipcMain.handle('update:install', () => require('electron-updater').autoUpdater.quitAndInstall(true, true));
ipcMain.handle('version', () => app.getVersion());

ipcMain.handle('store:load', () => loadStore());
ipcMain.handle('store:save', (_e, s) => { saveStore(s); return true; });
ipcMain.handle('assets', () => assets());
ipcMain.handle('qr', (_e, text) => QRCode.toString(text, {
  type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#040813', light: '#ffffff' },
}));
ipcMain.handle('show', (_e, file) => shell.showItemInFolder(file));
ipcMain.handle('clipboard', (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle('open', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

// ---------- Mercado Pago (cobrança no cartão, Checkout Pro) ----------
// O Access Token fica num arquivo próprio, cifrado pelo Windows (safeStorage), e nunca volta para a tela.
const KEY_FILE = path.join(PATHS.data, 'mercadopago.key');
function readKey() {
  try {
    const raw = fs.readFileSync(KEY_FILE);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
  } catch { return ''; }
}
function writeKey(key) {
  key = String(key || '').trim();
  if (!key) { fs.rmSync(KEY_FILE, { force: true }); return; }
  fs.mkdirSync(PATHS.data, { recursive: true });
  fs.writeFileSync(KEY_FILE, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : key);
}

async function mp(method, route, body) {
  const key = readKey();
  if (!key) throw new Error('Cadastre o Access Token do Mercado Pago.');
  let res;
  try {
    res = await fetch('https://api.mercadopago.com' + route, {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    });
  } catch { throw new Error('Sem conexão com o Mercado Pago. Confira a internet e tente de novo.'); }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error('Access Token do Mercado Pago inválido ou sem permissão.');
  if (!res.ok) {
    const cause = Array.isArray(j.cause) && j.cause[0] && (j.cause[0].description || j.cause[0].code);
    throw new Error('Mercado Pago: ' + (cause || j.message || j.error || `erro ${res.status}`));
  }
  return j;
}
const isTest = () => readKey().startsWith('TEST-');

ipcMain.handle('mp:hasKey', () => !!readKey());
ipcMain.handle('mp:setKey', (_e, key) => { writeKey(key); return !!readKey(); });

// Cria uma preferência do Checkout Pro com o total do recibo, aceitando só cartão.
ipcMain.handle('mp:create', async (_e, { amount, name, description, ref, maxInstallments }) => {
  const cents = Math.round(amount * 100);
  const extRef = `recibo-${ref}-${Date.now().toString(36)}`;
  const installments = Math.max(1, Math.min(12, maxInstallments || 1));
  const pref = await mp('POST', '/checkout/preferences', {
    items: [{ id: extRef, title: name.slice(0, 120), description: description.slice(0, 250), quantity: 1, currency_id: 'BRL', unit_price: cents / 100 }],
    external_reference: extRef,
    statement_descriptor: 'MONET CREATIVE',
    // Fora: boleto (ticket), Pix (bank_transfer) e lotérica (atm). "Dinheiro em conta" o Mercado Pago não deixa tirar.
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }], installments },
  });
  const test = isTest();
  return { id: extRef, url: test && pref.sandbox_init_point ? pref.sandbox_init_point : pref.init_point, status: 'PENDING', devMode: test, cents, installments };
});

// Sem servidor para receber avisos: procura os pagamentos feitos com a referência do link.
const MP_STATUS = { approved: 'PAID', authorized: 'PROCESSING', pending: 'PROCESSING', in_process: 'PROCESSING', in_mediation: 'PROCESSING',
  rejected: 'REJECTED', cancelled: 'PENDING', refunded: 'REFUNDED', charged_back: 'REFUNDED' };
ipcMain.handle('mp:status', async (_e, id) => {
  const r = await mp('GET', '/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(id));
  const pays = r.results || [];
  const paid = pays.find(p => p.status === 'approved');
  return { status: paid ? 'PAID' : pays.length ? (MP_STATUS[pays[0].status] || 'PENDING') : 'PENDING', devMode: isTest() };
});

// Renderiza o HTML do recibo numa janela fora da tela e grava PNG (2x) ou PDF.
async function renderReceipt(html, kind, file) {
  const tmp = path.join(app.getPath('userData'), `render-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const scale = 2;
  const w = new BrowserWindow({
    show: false, width: 1080 * scale, height: 1440 * scale, useContentSize: true, frame: false,
    webPreferences: { offscreen: true, zoomFactor: scale, backgroundThrottling: false },
  });
  try {
    await w.loadFile(tmp);
    // Força o carregamento de todas as fontes (fonts.ready sozinho pode resolver antes de elas começarem a carregar).
    await w.webContents.executeJavaScript('Promise.all([...document.fonts].map(f => f.load().catch(() => 0))).then(() => document.fonts.ready).then(() => 1)');
    const h = Math.ceil(await w.webContents.executeJavaScript('document.body.getBoundingClientRect().height'));
    if (kind === 'pdf') {
      await w.webContents.insertCSS(`@page{size:1080px ${h}px;margin:0}html,body{-webkit-print-color-adjust:exact}`);
      const pdf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
      fs.writeFileSync(file, pdf);
    } else {
      // Janela offscreen entrega cada quadro pronto no evento 'paint'; espera um quadro no tamanho final.
      const W = 1080 * scale, H = h * scale;
      const img = await new Promise((resolve, reject) => {
        // Guarda o quadro mais recente no tamanho final e só entrega depois de 400 ms nesse tamanho,
        // para o texto ter tempo de ser desenhado.
        let last = null, settle = null;
        const done = (err, image) => { clearTimeout(timer); clearTimeout(settle); clearInterval(kick); err ? reject(err) : resolve(image); };
        const timer = setTimeout(() => last ? done(null, last) : done(new Error('tempo esgotado ao desenhar o recibo')), 15000);
        const kick = setInterval(() => w.webContents.invalidate(), 100);
        w.webContents.on('paint', (_e, _dirty, image) => {
          const sz = image.getSize();
          // Com escala do Windows acima de 100% o quadro vem maior; vale se a proporção bater.
          if (sz.width >= W && Math.abs(sz.height / sz.width - H / W) < 0.002) {
            last = image;
            if (!settle) settle = setTimeout(() => done(null, last), 400);
          }
        });
        w.setContentSize(W, H);
      });
      const sz = img.getSize();
      fs.writeFileSync(file, (sz.width === W ? img : img.resize({ width: W, height: H, quality: 'best' })).toPNG());
    }
  } finally {
    await new Promise(r => { w.once('closed', r); w.destroy(); });
    fs.rmSync(tmp, { force: true });
  }
}

ipcMain.handle('export', async (_e, { html, kind, name, outDir }) => {
  fs.mkdirSync(outDir, { recursive: true });
  const ext = kind === 'pdf' ? 'pdf' : 'png';
  const res = await dialog.showSaveDialog(win, {
    title: kind === 'pdf' ? 'Salvar recibo em PDF' : 'Salvar recibo em imagem',
    defaultPath: path.join(outDir, `${name}.${ext}`),
    filters: [kind === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Imagem PNG', extensions: ['png'] }],
  });
  if (res.canceled || !res.filePath) return null;
  await renderReceipt(html, kind, res.filePath);
  return res.filePath;
});

// Autoteste: electron . --selftest <pasta>  -> grava exemplo em PNG e PDF e fecha.
async function selftest(dir) {
  const R = require('./src/receipt.js');
  const data = {
    client: 'Extra Transportes', date: '2026-10-20', number: '',
    items: [{ name: 'Landing Page', desc: 'Criação e desenvolvimento de landing page', qty: 1, price: 650 },
      { name: 'Pacote promocional de feed', desc: 'Artes para o feed do Instagram', qty: 1, price: 200 }],
    pix: { key: 'contato.monetcreative@gmail.com', type: 'email', name: 'Monet Creative', city: 'Joao Pessoa', showQr: true },
  };
  const st = loadStore();
  if (st.draft && st.draft.items && st.draft.items.length) Object.assign(data, st.draft, { number: st.settings.numbered ? String(st.settings.nextNumber) : '' });
  const payload = R.pixPayload({ ...data.pix, amount: R.totals(data.items), txid: 'RECIBO' });
  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#040813', light: '#ffffff' } });
  const html = R.build(data, assets(), svg);
  fs.mkdirSync(dir, { recursive: true });
  await renderReceipt(html, 'pdf', path.join(dir, 'teste.pdf'));
  await renderReceipt(html, 'png', path.join(dir, 'teste.png'));
  fs.writeFileSync(path.join(dir, 'teste.txt'), payload);
  // Versão cartão, com link fictício (não chama a API).
  const url = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123456789-abcdef';
  const cardData = { ...data, pay: 'card', card: { url, installments: 3 } };
  const cardSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#040813', light: '#ffffff' } });
  const cardHtml = R.build(cardData, assets(), cardSvg);
  await renderReceipt(cardHtml, 'pdf', path.join(dir, 'teste-cartao.pdf'));
  await renderReceipt(cardHtml, 'png', path.join(dir, 'teste-cartao.png'));
  await renderReceipt(R.build({ ...data, pay: 'card', card: null }, assets(), ''), 'png', path.join(dir, 'teste-cartao-sem-link.png'));
}

app.whenReady().then(async () => {
  const i = process.argv.indexOf('--selftest');
  if (i > -1) { await selftest(process.argv[i + 1]); app.quit(); return; }
  createWindow();
});
app.on('window-all-closed', () => { if (!process.argv.includes('--selftest')) app.quit(); });
