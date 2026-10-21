// Recibo Monet: layout, BR Code Pix e valor por extenso. Usado pela prévia e pela exportação.
(function () {
  const money = v => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const plain = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---------- valor por extenso ----------
  const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
    'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, parts = [];
    if (c) parts.push(C[c]);
    if (r < 20) { if (r) parts.push(U[r]); }
    else { parts.push(D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : '')); }
    return parts.join(' e ');
  }

  function inteiro(n) {
    if (n === 0) return 'zero';
    const groups = [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil'], [1, '', '']];
    const out = [];
    let rest = n;
    for (const [base, sing, plur] of groups) {
      const g = Math.floor(rest / base);
      rest %= base;
      if (!g) continue;
      let txt = base === 1e3 && g === 1 ? 'mil' : ate999(g) + (sing ? ' ' + (g === 1 ? sing : plur) : '');
      out.push({ txt, g });
    }
    return out.reduce((acc, cur, i) => {
      if (i === 0) return cur.txt;
      const joinE = cur.g < 100 || cur.g % 100 === 0;
      return acc + (joinE ? ' e ' : ' ') + cur.txt;
    }, '');
  }

  function extenso(valor) {
    const cents = Math.round(valor * 100);
    const r = Math.floor(cents / 100), c = cents % 100;
    let s = '';
    if (r) {
      s = inteiro(r);
      const deReais = r >= 1e6 && r % 1e6 === 0;
      s += r === 1 ? ' real' : (deReais ? ' de reais' : ' reais');
    }
    if (c) s += (r ? ' e ' : '') + inteiro(c) + (c === 1 ? ' centavo' : ' centavos');
    if (!s) s = 'zero reais';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- Pix (BR Code estático, padrão EMV do Banco Central) ----------
  function normalizeKey(key, type) {
    const k = String(key || '').trim();
    const digits = k.replace(/\D/g, '');
    if (type === 'email') return k.toLowerCase();
    if (type === 'doc') return digits;
    if (type === 'phone') {
      if (k.startsWith('+')) return '+' + digits;
      return '+' + (digits.length <= 11 ? '55' + digits : digits);
    }
    return k.toLowerCase(); // chave aleatória
  }

  function crc16(s) {
    const bytes = new TextEncoder().encode(s);
    let c = 0xffff;
    for (const b of bytes) {
      c ^= b << 8;
      for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }

  function pixPayload({ key, type, name, city, amount, txid }) {
    const f = (id, v) => id + String(new TextEncoder().encode(v).length).padStart(2, '0') + v;
    const nm = plain(name || 'RECEBEDOR').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25) || 'RECEBEDOR';
    const ct = plain(city || 'BRASIL').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 15) || 'BRASIL';
    const tx = plain(txid || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 25) || '***';
    let p = f('00', '01') + f('26', f('00', 'br.gov.bcb.pix') + f('01', normalizeKey(key, type))) + f('52', '0000') + f('53', '986');
    if (amount > 0) p += f('54', amount.toFixed(2));
    p += f('58', 'BR') + f('59', nm) + f('60', ct) + f('62', f('05', tx)) + '6304';
    return p + crc16(p);
  }

  // ---------- layout ----------
  const CSS = `
:root{--navy:#040813;--ink:#0B1226;--muted:#5D6681;--line:#E3E7F2;--c1:#18BCFD;--c2:#4A48FE}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;background:var(--navy);font-family:'Jakarta',sans-serif;color:var(--ink);overflow:hidden}
.top{height:208px;padding:0 64px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center}
.brand img{height:138px;display:block}
.tag{text-align:right;color:#fff}
.tag b{display:block;font-family:'Unbounded';font-weight:700;font-size:40px;letter-spacing:.14em}
.tag span{display:block;margin-top:10px;font-size:20px;font-weight:500;color:#9AA6C6;letter-spacing:.04em}
.sheet{position:relative;margin:0 56px;background:#fff;border-radius:28px 28px 0 0;padding:56px 56px 66px}
.tear{display:block;width:968px;height:19px;margin:-1px 56px 0}
@media print{.total .v{background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;color:#3A6CFE;-webkit-text-fill-color:#3A6CFE}}
.bar{position:absolute;left:0;right:0;top:0;height:10px;border-radius:28px 28px 0 0;background:linear-gradient(90deg,var(--c1),var(--c2))}
.meta{display:flex;justify-content:space-between;align-items:flex-end;gap:40px}
.lab{font-size:17px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.client{font-family:'Unbounded';font-weight:500;font-size:44px;margin-top:12px;letter-spacing:-.01em;line-height:1.15;overflow-wrap:anywhere}
.client.s{font-size:34px}
.date{text-align:right;flex:none}
.date div:last-child{font-size:26px;font-weight:700;margin-top:12px}
.items{margin-top:44px;border-top:2px solid var(--ink)}
.row{display:flex;justify-content:space-between;align-items:center;gap:32px;padding:28px 0;border-bottom:1.5px solid var(--line)}
.row h3{font-size:29px;font-weight:700;overflow-wrap:anywhere}
.row p{font-size:20px;color:var(--muted);margin-top:6px;font-weight:500;overflow-wrap:anywhere}
.row .v{font-size:30px;font-weight:700;white-space:nowrap}
.items.dense .row{padding:20px 0}.items.dense .row h3{font-size:25px}.items.dense .row .v{font-size:26px}.items.dense .row p{font-size:18px}
.total{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:30px 0 0}
.total .lab{color:var(--ink)}
.total small{display:block;font-size:19px;color:var(--muted);margin-top:8px;font-weight:500;max-width:420px}
.total .v{font-family:'Unbounded';font-weight:700;font-size:66px;letter-spacing:-.02em;white-space:nowrap;
  background:linear-gradient(90deg,var(--c1),var(--c2));-webkit-background-clip:text;color:transparent}
.total .v.s{font-size:52px}
.pix{margin-top:40px;background:#F2F5FD;border-radius:22px;padding:32px}
.pix .grid{display:flex;gap:36px;align-items:center;margin-bottom:26px}
.qr{width:276px;height:276px;background:#fff;padding:18px;border-radius:14px;flex:none}
.qr svg{width:100%;height:100%;display:block}
.pix h2{font-family:'Unbounded';font-weight:700;font-size:34px;line-height:1.15}
.pix .how{font-size:21px;color:var(--muted);margin-top:14px;line-height:1.45;font-weight:500}
.pix .amt{margin-top:18px;font-size:21px;font-weight:600}
.pix .amt b{color:var(--c2)}
.key{background:var(--navy);border-radius:14px;padding:20px 26px;display:flex;justify-content:space-between;align-items:center;gap:24px}
.key span{font-size:16px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#8FA0C9;flex:none}
.key b{font-size:26px;font-weight:700;color:#fff;letter-spacing:.005em;overflow-wrap:anywhere;text-align:right}
.key b.s{font-size:21px}
.paylink{text-decoration:none}
.paylink b{background:linear-gradient(90deg,var(--c1),var(--c2));padding:12px 26px;border-radius:10px;font-size:24px}
.qr.wait{display:flex;align-items:center;justify-content:center;text-align:center;border:3px dashed var(--line);font-size:19px;font-weight:600;color:var(--muted);line-height:1.4}
.obs{margin-top:28px;font-size:19px;color:var(--muted);line-height:1.5;font-weight:500;white-space:pre-wrap;overflow-wrap:anywhere}
.obs b{color:var(--ink);font-weight:700}
.foot{padding:52px 0 52px;text-align:center;color:#8592B5;font-size:19px;font-weight:500;letter-spacing:.03em}
.foot b{color:#fff;font-weight:700}`;

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(iso);
  }

  function totals(items) {
    return items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  }

  const TEAR = (() => {
    const n = 27, w = 968 / n;
    let d = 'M0 -1';
    for (let i = 0; i < n; i++) d += ` L${((i + 0.5) * w).toFixed(2)} 18 L${((i + 1) * w).toFixed(2)} 0`;
    return `<svg class="tear" viewBox="0 -1 968 19" preserveAspectRatio="none"><path d="${d} L968 -1Z" fill="#fff"/></svg>`;
  })();

  // Bloco de pagamento no cartão (link do Mercado Pago). Sem link ainda: mostra só o aviso, para a prévia.
  // O link do Mercado Pago é comprido demais para imprimir; vira um botão clicável (no PDF) e o QR leva ao mesmo lugar.
  function cardBlock(card, total, qrSvg) {
    const url = card && card.url;
    const qr = url && qrSvg ? `<div class="qr">${qrSvg}</div>` : '<div class="qr wait">O link é gerado<br>ao salvar<br>o recibo</div>';
    const n = card ? card.installments : 0;
    const amt = n > 1 ? `Em até <b>${n}x</b> · Total: <b>${money(total)}</b>` : `Valor: <b>${money(total)}</b>`;
    const link = url ? `<a class="key paylink" href="${esc(url)}"><span>Pagamento seguro · Mercado Pago</span><b>Pagar com cartão →</b></a>` : '';
    return `<div class="pix"><div class="grid">${qr}<div>
          <h2>Pague com<br>cartão</h2>
          <p class="how">Aponte a câmera do celular para o QR Code${url ? ' ou toque no botão abaixo' : ''} e pague com cartão de crédito.</p>
          <p class="amt">${amt}</p></div></div>${link}</div>`;
  }

  // data: {client, date, number, items:[{name,desc,qty,price}], pix:{key,type,name,city,showQr}, pay:'pix'|'card', card:{url,installments}, obs}
  // assets: {fontCss, m, word}; qrSvg: string | '' (QR do Pix, ou do link do cartão quando pay === 'card')
  function build(data, assets, qrSvg) {
    const items = (data.items || []).filter(it => (it.name || '').trim() || Number(it.price));
    const total = totals(items);
    const rows = items.map(it => {
      const qty = Number(it.qty) || 0, price = Number(it.price) || 0;
      const sub = [esc(it.desc)].filter(Boolean);
      if (qty !== 1) sub.push(`${qty.toLocaleString('pt-BR')} × ${money(price)}`);
      return `<div class="row"><div><h3>${esc(it.name) || '&nbsp;'}</h3>${sub.length ? `<p>${sub.join(' · ')}</p>` : ''}</div><div class="v">${money(qty * price)}</div></div>`;
    }).join('');

    const pix = data.pix || {};
    const key = (pix.key || '').trim();
    let pixHtml = '';
    if (data.pay === 'card') {
      if (total > 0) pixHtml = cardBlock(data.card, total, qrSvg);
    } else if (key) {
      const shown = normalizeKey(key, pix.type);
      const keyHtml = `<div class="key"><span>Chave Pix</span><b class="${shown.length > 32 ? 's' : ''}">${esc(pix.type === 'phone' || pix.type === 'doc' ? key : shown)}</b></div>`;
      const qrHtml = pix.showQr && qrSvg && total > 0 ? `<div class="grid"><div class="qr">${qrSvg}</div><div>
          <h2>Pague<br>com Pix</h2>
          <p class="how">Abra o app do seu banco, escolha Pix e aponte a câmera para o QR Code.</p>
          <p class="amt">Valor já preenchido: <b>${money(total)}</b></p></div></div>` : '';
      pixHtml = `<div class="pix">${qrHtml}${keyHtml}</div>`;
    }

    const client = (data.client || '').trim();
    const totalTxt = money(total);
    const num = String(data.number || '').trim();
    const obs = (data.obs || '').trim();

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${assets.fontCss}${CSS}</style></head><body>
  <div class="top">
    <div class="brand"><img src="${assets.logo}" alt="Monet"></div>
    <div class="tag"><b>RECIBO</b><span>${num ? 'Nº ' + esc(/^\d+$/.test(num) ? num.padStart(3, '0') : num) : 'Monet Creative'}</span></div>
  </div>
  <div class="sheet">
    <div class="bar"></div>
    <div class="meta">
      <div><div class="lab">Cliente</div><div class="client ${client.length > 24 ? 's' : ''}">${esc(client) || '&nbsp;'}</div></div>
      <div class="date"><div class="lab">Emissão</div><div>${fmtDate(data.date)}</div></div>
    </div>
    <div class="items ${items.length > 4 ? 'dense' : ''}">${rows}</div>
    <div class="total">
      <div><div class="lab">Total</div><small>${extenso(total)}</small></div>
      <div class="v ${totalTxt.length > 12 ? 's' : ''}">${totalTxt}</div>
    </div>
    ${pixHtml}
    ${obs ? `<div class="obs"><b>Observações:</b> ${esc(obs)}</div>` : ''}
  </div>
  ${TEAR}
  <div class="foot"><b>Monet Creative</b> &nbsp;·&nbsp; Sites, landing pages e criativos &nbsp;·&nbsp; monetcreative.com.br</div>
</body></html>`;
  }

  const api = { build, pixPayload, extenso, money, totals, normalizeKey };
  if (typeof module !== 'undefined') module.exports = api;
  else window.Recibo = api;
})();
