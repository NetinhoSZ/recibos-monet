const R = window.Recibo;
const $ = id => document.getElementById(id);

let store, assets, qrSvg = '';
let state = { client: '', date: '', number: 1, items: [], obs: '', pay: 'pix', card: null };

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const uid = () => Math.random().toString(36).slice(2, 9);

// "1.234,56" / "650" / "650,5" / "650.50" -> número
function parseMoney(s) {
  s = String(s ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}
const fmtMoney = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente';
}

// ---------- persistência ----------
let saveTimer;
function saveNow() {
  clearTimeout(saveTimer);
  store.draft = { client: state.client, date: state.date, items: state.items, obs: state.obs, pay: state.pay, card: state.card };
  return window.api.saveStore(store);
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

// ---------- atualização ----------
window.api.onUpdate(u => {
  const box = $('update');
  const b = document.createElement('button');
  b.className = 'primary';
  if (u.kind === 'ready') {
    b.textContent = 'Reiniciar e atualizar';
    b.onclick = async () => { b.disabled = true; await saveNow(); window.api.installUpdate(); };
    box.replaceChildren(Object.assign(document.createElement('span'), { textContent: `Versão ${u.version} pronta para instalar.` }), b);
  } else {
    b.textContent = 'Baixar';
    b.onclick = () => window.api.open(u.url);
    box.replaceChildren(Object.assign(document.createElement('span'), { textContent: `Nova versão ${u.version} disponível.` }), b);
  }
  box.hidden = false;
});

// ---------- validação da chave Pix ----------
function pixProblem() {
  const s = store.settings, k = (s.pixKey || '').trim(), d = k.replace(/\D/g, '');
  if (!k) return 'Informe a chave Pix para aparecer no recibo.';
  if (s.pixType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return 'E-mail inválido.';
  if (s.pixType === 'doc' && d.length !== 11 && d.length !== 14) return 'CPF tem 11 dígitos e CNPJ tem 14.';
  if (s.pixType === 'phone' && (d.length < 10 || d.length > 13)) return 'Telefone com DDD, ex.: (83) 99999-9999.';
  if (s.pixType === 'evp' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return 'Chave aleatória tem o formato 0000aaaa-00aa-00aa-00aa-000000aaaaaa.';
  return '';
}

// ---------- dados do recibo ----------
function receiptData() {
  const s = store.settings;
  return {
    client: state.client, date: state.date, number: s.numbered ? state.number : '', obs: state.obs,
    items: state.items,
    pix: { key: s.pixKey, type: s.pixType, name: s.pixName, city: s.pixCity, showQr: s.showQr && !pixProblem() },
    pay: state.pay, card: cardValid() ? state.card : null,
  };
}

let qrToken = 0;
async function refreshQr() {
  const s = store.settings, total = R.totals(state.items), tok = ++qrToken;
  if (state.pay === 'card') {
    const svg = cardValid() ? await window.api.qr(state.card.url) : '';
    if (tok === qrToken) qrSvg = svg;
    return;
  }
  if (!s.showQr || pixProblem() || total <= 0) { qrSvg = ''; return; }
  const payload = R.pixPayload({ key: s.pixKey, type: s.pixType, name: s.pixName, city: s.pixCity, amount: total,
    txid: s.numbered ? 'RECIBO' + state.number : '' });
  const svg = await window.api.qr(payload);
  if (tok === qrToken) qrSvg = svg;
}

// ---------- cartão (Mercado Pago) ----------
const STATUS = { PENDING: 'Aguardando pagamento', PROCESSING: 'Pagamento em análise', PAID: 'Pago ✓',
  REJECTED: 'Cartão recusado (o cliente pode tentar de novo)', REFUNDED: 'Devolvido' };
let hasKey = false, cardBusy = false;

// O link vale enquanto o total e as parcelas forem os mesmos de quando foi gerado.
function cardStale() {
  const c = state.card, s = store.settings;
  return !!c && (c.cents !== Math.round(R.totals(state.items) * 100) || c.maxSet !== s.cardMaxInstallments);
}
const cardValid = () => !!(state.card && state.card.url) && !cardStale();

function renderCard() {
  const c = state.card, valid = cardValid();
  const info = $('cardInfo');
  if (!hasKey) info.textContent = 'Salve o Access Token acima para gerar o link de pagamento.';
  else if (!c) info.textContent = 'O link de pagamento é gerado ao salvar o recibo (ou agora, em "Gerar link").';
  else if (!valid) info.textContent = 'O total ou as parcelas mudaram desde o último link. Um novo link será gerado ao salvar.';
  else {
    info.replaceChildren('Link: ', Object.assign(document.createElement('b'), { textContent: c.url }),
      document.createElement('br'), 'Situação: ', Object.assign(document.createElement('b'), { textContent: STATUS[c.status] || c.status || '—' }));
    if (c.devMode) info.append(Object.assign(document.createElement('span'), { className: 'tagdev', textContent: 'modo teste' }));
  }
  $('cardGen').textContent = c && !valid ? 'Gerar novo link' : 'Gerar link';
  $('cardGen').hidden = valid;
  $('cardGen').disabled = cardBusy || !hasKey;
  for (const id of ['cardCopy', 'cardOpen', 'cardCheck']) $(id).disabled = cardBusy || !valid;
  $('mpKeyNote').className = 'note' + (hasKey ? ' ok' : '');
  $('mpKeyNote').textContent = hasKey ? 'Token salvo neste computador (cifrado). Para trocar, cole outro e salve.' : 'Pegue em Suas integrações → sua aplicação → Credenciais de produção → Access Token.';
}

function syncPay() {
  for (const r of document.querySelectorAll('input[name="pay"]')) r.checked = r.value === state.pay;
  $('secCard').hidden = state.pay !== 'card';
  $('secPix').hidden = state.pay === 'card';
  renderCard();
}

async function ensureCardLink() {
  if (cardValid()) return;
  if (!hasKey) throw new Error('Cadastre o Access Token do Mercado Pago.');
  const s = store.settings, total = R.totals(state.items);
  if (total < 1) throw new Error('O valor mínimo para cobrar no cartão é R$ 1,00.');
  const num = s.numbered ? String(state.number).padStart(3, '0') : '';
  const client = state.client.trim();
  const items = state.items.filter(it => (it.name || '').trim()).map(it => (Number(it.qty) !== 1 ? `${it.qty}x ` : '') + it.name.trim());
  cardBusy = true; renderCard();
  try {
    const c = await window.api.mp.create({
      amount: total, name: `Recibo ${num ? 'Nº ' + num + ' — ' : ''}${client || 'Monet Creative'}`,
      description: items.join(', ') || 'Serviços Monet Creative', ref: num || slug(client),
      maxInstallments: s.cardMaxInstallments,
    });
    state.card = { ...c, maxSet: s.cardMaxInstallments };
    persist();
  } finally {
    cardBusy = false; renderCard();
  }
}

function bindCard() {
  const s = store.settings;
  const sel = $('cardInst');
  for (let n = 1; n <= 12; n++) sel.add(new Option(n === 1 ? '1x (à vista)' : `${n}x`, n));
  bind('cardInst', el => el.value = s.cardMaxInstallments, el => { s.cardMaxInstallments = Number(el.value) || 1; renderCard(); }, 'change');
  for (const r of document.querySelectorAll('input[name="pay"]')) r.addEventListener('change', () => {
    state.pay = r.value; syncPay(); persist(); schedule();
  });
  $('mpKeySave').addEventListener('click', async () => {
    const v = $('mpKey').value.trim();
    if (!v && !(hasKey && confirm('Apagar o Access Token do Mercado Pago salvo neste computador?'))) return;
    hasKey = await window.api.mp.setKey(v);
    $('mpKey').value = '';
    renderCard();
    toast(hasKey ? 'Access Token do Mercado Pago salvo.' : 'Access Token do Mercado Pago apagado.');
  });
  $('cardGen').addEventListener('click', async () => {
    if (R.totals(state.items) <= 0) return toast('Adicione pelo menos um item com valor.', true);
    try { await ensureCardLink(); schedule(); toast(state.card.devMode ? 'Link gerado (credencial de teste do Mercado Pago).' : 'Link de pagamento gerado.'); }
    catch (e) { toast(e.message || String(e), true); }
  });
  $('cardCopy').addEventListener('click', async () => { await window.api.copy(state.card.url); toast('Link copiado. É só colar no WhatsApp.'); });
  $('cardOpen').addEventListener('click', () => window.api.open(state.card.url));
  $('cardCheck').addEventListener('click', async () => {
    cardBusy = true; renderCard();
    try {
      const r = await window.api.mp.status(state.card.id);
      state.card.status = r.status; persist();
      toast(r.status === 'PAID' ? 'Pagamento confirmado ✓' : 'Situação: ' + (STATUS[r.status] || r.status), r.status === 'REJECTED');
    } catch (e) { toast(e.message || String(e), true); }
    finally { cardBusy = false; renderCard(); }
  });
}

// ---------- prévia ----------
const frame = $('preview'), paper = $('paper'), stage = $('stage');
let renderTimer;
function schedule() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 120);
}
async function renderPreview() {
  await refreshQr();
  frame.srcdoc = R.build(receiptData(), assets, qrSvg);
}
frame.addEventListener('load', fit);
function fit() {
  const doc = frame.contentDocument;
  if (!doc || !doc.body) return;
  const h = Math.ceil(doc.body.getBoundingClientRect().height);
  const scale = Math.min(1, (stage.clientWidth - 64) / 1080);
  frame.style.height = h + 'px';
  frame.style.transform = `scale(${scale})`;
  paper.style.width = 1080 * scale + 'px';
  paper.style.height = h * scale + 'px';
}
window.addEventListener('resize', fit);

// ---------- totais ----------
function updateTotals() {
  const t = R.totals(state.items);
  $('total').textContent = R.money(t);
  $('extenso').textContent = R.extenso(t);
  renderCard();
}

// ---------- itens ----------
function itemEl(it) {
  const el = document.createElement('div');
  el.className = 'item';
  el.innerHTML = `
    <div class="r1"><input data-f="name" placeholder="Produto ou serviço"><button class="icon" data-a="save" title="Salvar nos produtos cadastrados">☆</button><button class="icon del" data-a="del" title="Remover item">×</button></div>
    <div class="r2"><input data-f="desc" placeholder="Descrição (opcional)"></div>
    <div class="r3">
      <label><small>Qtd.</small><input data-f="qty" type="number" min="0" step="1"></label>
      <label><small>Valor unitário (R$)</small><input data-f="price" inputmode="decimal" placeholder="0,00"></label>
      <div class="sub"></div>
    </div>`;
  const q = f => el.querySelector(`[data-f="${f}"]`);
  q('name').value = it.name || '';
  q('desc').value = it.desc || '';
  q('qty').value = it.qty ?? 1;
  q('price').value = it.price ? fmtMoney(it.price) : '';
  const sub = () => { el.querySelector('.sub').textContent = R.money((Number(it.qty) || 0) * (Number(it.price) || 0)); };
  sub();
  el.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    if (f === 'price') it.price = parseMoney(e.target.value);
    else if (f === 'qty') it.qty = Math.max(0, Number(e.target.value) || 0);
    else it[f] = e.target.value;
    sub(); updateTotals(); persist(); schedule();
  });
  q('price').addEventListener('blur', e => { e.target.value = it.price ? fmtMoney(it.price) : ''; });
  el.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'del') {
      state.items = state.items.filter(x => x !== it);
      renderItems(); updateTotals(); persist(); schedule();
    } else if (a === 'save') {
      if (!(it.name || '').trim()) return toast('Dê um nome ao item antes de salvar.', true);
      const found = store.catalog.find(c => c.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if (found) Object.assign(found, { desc: it.desc || '', price: Number(it.price) || 0 });
      else store.catalog.push({ id: uid(), name: it.name.trim(), desc: it.desc || '', price: Number(it.price) || 0 });
      persist(); fillCatalogSelect();
      toast(found ? `"${it.name}" atualizado nos produtos.` : `"${it.name}" salvo nos produtos.`);
    }
  });
  return el;
}
function renderItems() {
  const box = $('items');
  box.replaceChildren(...state.items.map(itemEl));
}
function addItem(it, focus) {
  state.items.push(it);
  renderItems(); updateTotals(); persist(); schedule();
  if (focus) $('items').lastElementChild.querySelector('[data-f="name"]').focus();
}

// ---------- catálogo ----------
function fillCatalogSelect() {
  const sel = $('addFromCatalog');
  sel.replaceChildren(new Option('+ Adicionar produto cadastrado…', ''));
  for (const c of store.catalog) sel.add(new Option(`${c.name} — ${R.money(c.price)}`, c.id));
}
$('addFromCatalog').addEventListener('change', e => {
  const c = store.catalog.find(x => x.id === e.target.value);
  e.target.value = '';
  if (c) addItem({ name: c.name, desc: c.desc, qty: 1, price: c.price });
});
$('btnAddCustom').addEventListener('click', () => addItem({ name: '', desc: '', qty: 1, price: 0 }, true));

function renderCatalog() {
  const list = $('catList');
  list.replaceChildren(...store.catalog.map(c => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `<input data-f="name" placeholder="Nome"><input data-f="desc" placeholder="Descrição"><input data-f="price" inputmode="decimal" placeholder="0,00"><button class="icon del" title="Excluir produto">×</button>`;
    row.querySelector('[data-f="name"]').value = c.name;
    row.querySelector('[data-f="desc"]').value = c.desc || '';
    row.querySelector('[data-f="price"]').value = c.price ? fmtMoney(c.price) : '';
    row.addEventListener('input', e => {
      const f = e.target.dataset.f;
      c[f] = f === 'price' ? parseMoney(e.target.value) : e.target.value;
      persist(); fillCatalogSelect();
    });
    row.querySelector('[data-f="price"]').addEventListener('blur', e => { e.target.value = c.price ? fmtMoney(c.price) : ''; });
    row.querySelector('button').addEventListener('click', () => {
      if (!confirm(`Excluir "${c.name || 'produto'}" dos produtos cadastrados?`)) return;
      store.catalog = store.catalog.filter(x => x !== c);
      persist(); fillCatalogSelect(); renderCatalog();
    });
    return row;
  }));
}
$('btnCatalog').addEventListener('click', () => { renderCatalog(); $('catalog').showModal(); });
$('catalogClose').addEventListener('click', () => $('catalog').close());
$('catAdd').addEventListener('click', () => {
  store.catalog.push({ id: uid(), name: '', desc: '', price: 0 });
  renderCatalog(); persist();
  $('catList').lastElementChild.querySelector('input').focus();
});

// ---------- campos simples ----------
function bind(id, get, set, evt = 'input') {
  const el = $(id);
  get(el);
  el.addEventListener(evt, () => { set(el); persist(); schedule(); });
}
function syncNumber() { $('number').disabled = !store.settings.numbered; }
function syncPixWarn() { $('pixWarn').textContent = pixProblem(); }

function bindAll() {
  const s = store.settings;
  bind('client', el => el.value = state.client, el => state.client = el.value);
  bind('date', el => el.value = state.date, el => state.date = el.value);
  bind('obs', el => el.value = state.obs, el => state.obs = el.value);
  bind('numbered', el => el.checked = s.numbered, el => { s.numbered = el.checked; syncNumber(); }, 'change');
  bind('number', el => el.value = state.number, el => state.number = Math.max(1, parseInt(el.value) || 1));
  bind('pixType', el => el.value = s.pixType, el => { s.pixType = el.value; syncPixWarn(); }, 'change');
  bind('pixKey', el => el.value = s.pixKey, el => { s.pixKey = el.value; syncPixWarn(); });
  bind('pixName', el => el.value = s.pixName, el => s.pixName = el.value);
  bind('pixCity', el => el.value = s.pixCity, el => s.pixCity = el.value);
  bind('showQr', el => el.checked = s.showQr, el => s.showQr = el.checked, 'change');
  syncNumber(); syncPixWarn();
}

$('btnNew').addEventListener('click', () => {
  if ((state.client || state.items.length) && !confirm('Limpar o recibo atual e começar um novo?')) return;
  state.client = ''; state.obs = ''; state.items = []; state.date = todayISO(); state.card = null;
  state.number = store.settings.nextNumber;
  $('client').value = ''; $('obs').value = ''; $('date').value = state.date; $('number').value = state.number;
  renderItems(); updateTotals(); persist(); schedule();
  $('client').focus();
});

// ---------- exportação ----------
let toastTimer;
function toast(msg, err, file) {
  const t = $('toast');
  t.className = 'toast on' + (err ? ' err' : '');
  t.replaceChildren(document.createTextNode(msg));
  if (file) {
    const b = document.createElement('button');
    b.className = 'ghost'; b.textContent = 'Abrir pasta';
    b.onclick = () => window.api.show(file);
    t.append(b);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), file ? 7000 : 3500);
}

async function doExport(kind) {
  if (!state.client.trim()) { $('client').focus(); return toast('Preencha o nome do cliente.', true); }
  if (R.totals(state.items) <= 0) return toast('Adicione pelo menos um item com valor.', true);
  const btns = [$('btnPng'), $('btnPdf')];
  btns.forEach(b => b.disabled = true);
  try {
    if (state.pay === 'card') {
      try { await ensureCardLink(); }
      catch (e) { return toast('Não foi possível gerar o link do cartão: ' + (e.message || e), true); }
    }
    await refreshQr();
    const html = R.build(receiptData(), assets, qrSvg);
    const s = store.settings;
    const name = `recibo-${s.numbered ? state.number + '-' : ''}${slug(state.client)}-${state.date}`;
    const file = await window.api.exportReceipt({ html, kind, name, outDir: s.outDir });
    if (!file) return;
    s.outDir = file.replace(/[\\/][^\\/]+$/, '');
    if (s.numbered && state.number >= s.nextNumber) s.nextNumber = state.number + 1;
    persist();
    toast(`Recibo salvo: ${file.split(/[\\/]/).pop()}`, false, file);
  } catch (e) {
    toast('Não foi possível salvar: ' + (e.message || e), true);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
$('btnPng').addEventListener('click', () => doExport('png'));
$('btnPdf').addEventListener('click', () => doExport('pdf'));

// ---------- início ----------
(async function init() {
  let version;
  [store, assets, hasKey, version] = await Promise.all([window.api.loadStore(), window.api.assets(), window.api.mp.hasKey(), window.api.version()]);
  $('appVersion').textContent = 'Monet Creative · v' + version;
  const d = store.draft || {};
  state = {
    client: d.client || '', date: d.date || todayISO(), obs: d.obs || '',
    items: Array.isArray(d.items) ? d.items : [], number: store.settings.nextNumber,
    pay: d.pay === 'card' ? 'card' : 'pix', card: d.card && /mercadopago/.test(d.card.url || '') ? d.card : null,
  };
  bindAll(); bindCard(); syncPay(); fillCatalogSelect(); renderItems(); updateTotals();
  renderPreview();
})();
