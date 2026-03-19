// ═══════════════════════════════════════════════════════════
// WINDOFORM AI ASİSTAN — chatbot.js
// Uses Google Gemini API (browser-compatible) + local intent matching
// ═══════════════════════════════════════════════════════════

const CHAT_GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

let _chatOpen    = false;
let _chatHistory = []; // { role:'user'|'model', text:string, action?:{type,params} }
let _chatTyping  = false;

// ── Bootstrap ─────────────────────────────────────────────
function initChatbot() {
  if (document.getElementById('chat-fab')) return;

  // ── Inject HTML ──
  document.body.insertAdjacentHTML('beforeend', `
    <button id="chat-fab" onclick="toggleChat()" title="AI Asistan" aria-label="Chatbot aç">
      <i class="bi bi-robot" style="font-size:20px;"></i>
    </button>

    <div id="chat-panel" role="dialog" aria-label="AI Asistan">
      <div id="chat-header">
        <div class="d-flex align-items-center gap-2">
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
            <i class="bi bi-robot text-white"></i>
          </div>
          <div>
            <div class="fw-semibold text-white" style="line-height:1.2;font-size:14px;">Windoform AI</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.7);">Akıllı Asistan</div>
          </div>
          <span id="chat-online-badge"
            style="margin-left:4px;font-size:9px;background:rgba(74,222,128,0.2);color:#4ade80;border:1px solid rgba(74,222,128,0.4);
                   border-radius:20px;padding:1px 7px;">● Online</span>
        </div>
        <div class="d-flex gap-2">
          <button onclick="chatClear()" title="Sohbeti temizle"
            style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;font-size:13px;padding:2px 6px;"
            title="Temizle"><i class="bi bi-trash3"></i></button>
          <button onclick="toggleChat()"
            style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:16px;padding:2px 6px;">
            <i class="bi bi-x-lg"></i></button>
        </div>
      </div>

      <div id="chat-messages"></div>

      <div id="chat-chips">
        <button onclick="chatQuickSend('Stok durumunu göster')">📦 Stok durumu</button>
        <button onclick="chatQuickSend('Son 5 teklifi göster')">📄 Son teklifler</button>
        <button onclick="chatQuickSend('Ne yapabilirsin?')">❓ Yardım</button>
      </div>

      <div id="chat-input-wrap">
        <div class="d-flex gap-2">
          <input id="chat-input" type="text" autocomplete="off"
            placeholder="Soru sor veya teklif oluştur…"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSend();}">
          <button id="chat-send-btn" onclick="chatSend()" title="Gönder">
            <i class="bi bi-send-fill"></i>
          </button>
        </div>
        <div id="chat-hint">Örn: "Ege Akustik stokta kaç var?" · "Angebot an Müller mit WD-40 à 5€ 100 Stk."</div>
      </div>
    </div>
  `);

  // ── Inject CSS ──
  if (!document.getElementById('chat-css')) {
    const s = document.createElement('style');
    s.id = 'chat-css';
    s.textContent = `
      #chat-fab {
        position:fixed; bottom:24px; right:24px; z-index:9999;
        width:54px; height:54px; border-radius:50%;
        background:linear-gradient(135deg,#1a56db,#0d3fa8);
        border:none; color:white; cursor:pointer;
        box-shadow:0 4px 20px rgba(26,86,219,0.5);
        transition:transform 0.2s,box-shadow 0.2s;
        display:flex; align-items:center; justify-content:center;
      }
      #chat-fab:hover { transform:scale(1.1); box-shadow:0 6px 28px rgba(26,86,219,0.65); }

      #chat-panel {
        position:fixed; bottom:90px; right:24px; z-index:9998;
        width:390px; height:560px;
        background:#fff; border-radius:18px;
        box-shadow:0 8px 48px rgba(0,0,0,0.22);
        display:none; flex-direction:column; overflow:hidden;
        animation:chatIn 0.18s ease-out;
      }
      @keyframes chatIn {
        from{opacity:0;transform:translateY(18px) scale(0.97);}
        to  {opacity:1;transform:translateY(0)    scale(1);}
      }

      #chat-header {
        background:linear-gradient(135deg,#1a56db,#0d3fa8);
        padding:12px 14px;
        display:flex; justify-content:space-between; align-items:center;
        flex-shrink:0;
      }

      #chat-messages {
        flex:1; overflow-y:auto; padding:14px 12px;
        display:flex; flex-direction:column; gap:10px;
        background:#f8fafc;
        scroll-behavior:smooth;
      }
      #chat-messages::-webkit-scrollbar { width:4px; }
      #chat-messages::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }

      .cm { display:flex; flex-direction:column; max-width:84%; }
      .cm-user { align-self:flex-end; }
      .cm-bot  { align-self:flex-start; }

      .cm-bubble {
        padding:9px 13px; border-radius:14px;
        font-size:13px; line-height:1.5; word-break:break-word;
      }
      .cm-user .cm-bubble {
        background:linear-gradient(135deg,#1a56db,#1d4ed8);
        color:#fff; border-bottom-right-radius:4px;
      }
      .cm-bot .cm-bubble {
        background:#fff; color:#1a1a1a;
        border:1px solid #e2e8f0; border-bottom-left-radius:4px;
        box-shadow:0 1px 4px rgba(0,0,0,0.06);
      }
      .cm-bot .cm-bubble b  { color:#1a56db; }
      .cm-bot .cm-bubble ul { margin:4px 0 4px 16px; padding:0; }
      .cm-bot .cm-bubble li { margin-bottom:2px; }

      .cm-time {
        font-size:10px; color:#94a3b8; margin-top:3px;
        padding:0 4px;
      }
      .cm-user .cm-time { text-align:right; }

      .cm-action-btn {
        margin-top:7px; display:inline-flex; align-items:center; gap:5px;
        padding:5px 12px; font-size:12px; border-radius:8px; cursor:pointer;
        background:#eff6ff; color:#1a56db; border:1px solid #bfdbfe;
        font-weight:600; transition:background 0.15s;
      }
      .cm-action-btn:hover { background:#dbeafe; }

      .chat-typing {
        align-self:flex-start;
        background:#fff; border:1px solid #e2e8f0;
        border-radius:14px; border-bottom-left-radius:4px;
        padding:10px 16px; box-shadow:0 1px 4px rgba(0,0,0,0.06);
      }
      .chat-typing span {
        display:inline-block; width:7px; height:7px;
        background:#94a3b8; border-radius:50%; margin:0 2px;
        animation:chatBounce 1.3s infinite ease-in-out;
      }
      .chat-typing span:nth-child(2) { animation-delay:0.18s; }
      .chat-typing span:nth-child(3) { animation-delay:0.36s; }
      @keyframes chatBounce {
        0%,60%,100% { transform:translateY(0); }
        30%          { transform:translateY(-6px); }
      }

      #chat-chips {
        display:flex; gap:6px; padding:8px 12px 0;
        overflow-x:auto; flex-shrink:0;
        scrollbar-width:none;
      }
      #chat-chips::-webkit-scrollbar { display:none; }
      #chat-chips button {
        white-space:nowrap; font-size:11px; padding:4px 10px;
        border-radius:20px; border:1px solid #e2e8f0;
        background:#fff; color:#475569; cursor:pointer;
        transition:all 0.15s; flex-shrink:0;
      }
      #chat-chips button:hover { background:#f1f5f9; border-color:#94a3b8; }

      #chat-input-wrap {
        padding:10px 12px 12px; background:#fff;
        border-top:1px solid #e2e8f0; flex-shrink:0;
      }
      #chat-input {
        flex:1; padding:8px 12px; border:1px solid #e2e8f0;
        border-radius:10px; font-size:13px; outline:none;
        transition:border-color 0.15s;
      }
      #chat-input:focus { border-color:#1a56db; }
      #chat-send-btn {
        width:36px; height:36px; border-radius:10px;
        background:#1a56db; border:none; color:#fff; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        flex-shrink:0; transition:background 0.15s;
      }
      #chat-send-btn:hover { background:#1d4ed8; }
      #chat-send-btn:disabled { background:#94a3b8; cursor:not-allowed; }
      #chat-hint { font-size:10px; color:#94a3b8; margin-top:5px; line-height:1.3; }

      @media(max-width:480px){
        #chat-panel { width:calc(100vw - 24px); right:12px; bottom:80px; height:70vh; }
      }
    `;
    document.head.appendChild(s);
  }

  // Welcome message
  _chatAddMsg('model',
    '👋 Merhaba! Ben **Windoform AI Asistanı**\'yım.\n\n' +
    'Bana sorabilirsin:\n' +
    '- 📦 "Ege Akustik stokta kaç var?"\n' +
    '- 📄 "Cem Yuksel son teklif"\n' +
    '- ✍️ "Schreib ein Angebot an Müller mit WD-40 à 5 EUR 100 Stk."\n' +
    '- 📊 "Toplam stok değeri nedir?"\n\n' +
    '_Gemini API anahtarı ile daha karmaşık sorulara da yanıt verebilirim._'
  );
}

// ── Chat open/close ───────────────────────────────────────
function toggleChat() {
  _chatOpen = !_chatOpen;
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  if (_chatOpen) {
    panel.style.display = 'flex';
    setTimeout(() => {
      document.getElementById('chat-input')?.focus();
      _scrollChatBottom();
    }, 50);
  } else {
    panel.style.display = 'none';
  }
}

function chatClear() {
  _chatHistory = [];
  const el = document.getElementById('chat-messages');
  if (el) el.innerHTML = '';
  initChatbot(); // re-add welcome
}

function chatQuickSend(text) {
  document.getElementById('chat-input').value = text;
  chatSend();
}

// ── Send + routing ────────────────────────────────────────
async function chatSend() {
  const input = document.getElementById('chat-input');
  const text  = (input?.value || '').trim();
  if (!text || _chatTyping) return;
  input.value = '';

  _chatAddMsg('user', text);

  // 1. Try local fast intent
  const local = _chatLocalIntent(text);
  if (local) {
    setTimeout(() => _chatAddMsg('model', local.text, local.action), 120);
    return;
  }

  // 2. Gemini API fallback
  const key = _loadGeminiKey();
  if (!key) {
    _chatAddMsg('model',
      '⚠️ Gemini API anahtarı bulunamadı.\n\n' +
      '**Nasıl eklersiniz:**\nSol menüden **Fuarbot** → ayarlar ikonuna tıklayın → **Gemini API Key** alanını doldurun.\n\n' +
      '[🔑 Google AI Studio\'dan ücretsiz alın](https://aistudio.google.com/app/apikey)'
    );
    return;
  }

  _chatSetTyping(true);
  try {
    const reply = await _callGemini(text, key);
    _chatSetTyping(false);

    // Parse CREATE_QUOTE action
    const m = reply.match(/ACTION:CREATE_QUOTE:(\{[\s\S]*?\})/);
    if (m) {
      try {
        const params = JSON.parse(m[1]);
        const cleanText = reply.replace(/ACTION:CREATE_QUOTE:[\s\S]*?(\n|$)/, '').trim();
        _chatAddMsg('model', cleanText || '✅ Teklif oluşturuldu.', { type: 'CREATE_QUOTE', params });
      } catch {
        _chatAddMsg('model', reply);
      }
    } else {
      _chatAddMsg('model', reply);
    }
  } catch(e) {
    _chatSetTyping(false);
    _chatAddMsg('model', `❌ **Gemini Hatası:** ${e.message}\n\nAPI anahtarınızı kontrol edin.`);
  }
}

// ── Render helpers ────────────────────────────────────────
function _chatAddMsg(role, text, action) {
  _chatHistory.push({ role, text, action });
  _renderLastMsg();
}

function _renderLastMsg() {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  const m = _chatHistory[_chatHistory.length - 1];
  if (!m) return;

  const time = new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  const div  = document.createElement('div');
  div.className = `cm cm-${m.role}`;

  if (m.role === 'user') {
    div.innerHTML = `<div class="cm-bubble">${_escHtml(m.text)}</div><div class="cm-time">${time}</div>`;
  } else {
    let inner = `<div class="cm-bubble">${_mdToHtml(m.text)}</div>`;
    if (m.action?.type === 'CREATE_QUOTE') {
      const p = JSON.stringify(m.action.params).replace(/"/g, '&quot;');
      inner += `<div class="cm-action-btn" onclick="chatExecCreateQuote(${p})">
        <i class="bi bi-file-earmark-plus"></i>Teklif Formunu Aç
      </div>`;
    }
    div.innerHTML = inner + `<div class="cm-time">${time}</div>`;
  }

  el.appendChild(div);
  _scrollChatBottom();
}

function _chatSetTyping(on) {
  _chatTyping = on;
  const el = document.getElementById('chat-messages');
  if (!el) return;
  const existing = el.querySelector('.chat-typing');
  if (on && !existing) {
    const d = document.createElement('div');
    d.className = 'chat-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    el.appendChild(d);
    _scrollChatBottom();
  } else if (!on && existing) {
    existing.remove();
  }
  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.disabled = on;
}

function _scrollChatBottom() {
  const el = document.getElementById('chat-messages');
  if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function _escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
}

function _mdToHtml(text) {
  return String(text || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, s => `<ul>${s}</ul>`)
    .replace(/\n/g, '<br>');
}

// ── Local intent engine ───────────────────────────────────
function _chatLocalIntent(rawText) {
  const t = rawText.toLowerCase();

  // HELP
  if (['hilfe','yardım','ne yapabilir','was kannst','neler yapabilir','help'].some(k => t.includes(k))) {
    return { text:
      '🤖 **Neler yapabilirim:**\n\n' +
      '- **Stok sorgula:** "Ege Akustik stokta kaç var?" · "Wieviel WD-40 auf Lager?"\n' +
      '- **Tüm stoku göster:** "Tüm ürünler" · "Gesamter Lagerbestand"\n' +
      '- **Teklif sorgula:** "Cem Yuksel son teklif" · "Letztes Angebot Müller"\n' +
      '- **Teklif oluştur:** "Schreib Angebot an [Müşteri] mit [Ürün] à [Fiyat] [Döviz] [Miktar] Stk."\n' +
      '- **Son teklifler:** "Son 5 teklifi göster"\n' +
      '- **Stok değeri:** "Toplam stok değeri"\n\n' +
      '_Karmaşık sorular için Gemini API key gereklidir._'
    };
  }

  // STOCK — total value
  if ((t.includes('toplam') || t.includes('gesamt') || t.includes('total')) &&
      (t.includes('stok değer') || t.includes('lagerwert') || t.includes('inventory value'))) {
    const prods = _chatGetProducts();
    if (!prods.length) return { text: '⚠️ Ürün kataloğu henüz yüklenmemiş. **Ürünler** sekmesini açın.' };
    const total = prods.reduce((s, p) => s + (Number(p.stock||0) * Number(p.priceNet||0)), 0);
    return { text: `💰 Toplam stok değeri (VK fiyatlarına göre):\n\n**${total.toLocaleString('de-DE',{minimumFractionDigits:2})} EUR**\n\n(${prods.length} ürün, ${prods.reduce((s,p)=>s+Number(p.stock||0),0)} toplam adet)` };
  }

  // STOCK — all products
  if ((t.includes('tüm') || t.includes('alle') || t.includes('hepsi') || t.includes('gesamte')) &&
      (t.includes('stok') || t.includes('lager') || t.includes('ürün') || t.includes('produkt'))) {
    const prods = _chatGetProducts();
    if (!prods.length) return { text: '⚠️ Ürün kataloğu henüz yüklenmemiş. **Ürünler** sekmesini açın.' };
    const lines = prods.map(p =>
      `${_stockEmoji(p.stock)} **${p.name}** (${p.sku||'—'}): ${p.stock??0} ${p.unit||'Stk.'}`
    );
    return { text: `📦 **Tüm Lagerbestand** (${prods.length} ürün):\n\n${lines.join('\n')}` };
  }

  // STOCK — specific product search
  const stockTriggers = ['lager','stok','bestand','stokta','kaç var','wieviel','wie viel','auf lager','kalan'];
  if (stockTriggers.some(k => t.includes(k))) {
    const prods = _chatGetProducts();
    if (prods.length) {
      const hits = _findProductsByText(rawText, prods);
      if (hits.length) {
        const lines = hits.map(p =>
          `${_stockEmoji(p.stock)} **${p.name}** (${p.sku||'—'}): **${p.stock??0} ${p.unit||'Stk.'}**` +
          (p.priceNet ? ` · VK: ${Number(p.priceNet).toFixed(2)} EUR` : '')
        );
        return { text: `📦 Lagerbestand:\n\n${lines.join('\n')}` };
      }
      // No match — list all
      const lines = prods.map(p => `${_stockEmoji(p.stock)} **${p.name}**: ${p.stock??0} ${p.unit||'Stk.'}`);
      return { text: `📦 Ürün bulunamadı. Tüm stok:\n\n${lines.join('\n')}` };
    }
    return { text: '⚠️ Ürün kataloğu henüz yüklenmemiş. **Ürünler** sekmesini açın.' };
  }

  // LAST N QUOTES
  const lastN = t.match(/son\s+(\d+)\s+teklif|letzten?\s+(\d+)\s+angebot/i);
  if (lastN) {
    const n = parseInt(lastN[1] || lastN[2]) || 5;
    const quotes = _chatGetQuotes();
    if (!quotes.length) return { text: '⚠️ Teklif verisi henüz yüklenmemiş.' };
    const recent = quotes.slice(0, Math.min(n, 10));
    const lines = recent.map(q => {
      const d = q.createdAt ? q.createdAt.slice(0,10) : '?';
      const c = [q.contactName, q.contactCompany].filter(Boolean).join(' / ') || '—';
      const sym = {EUR:'€',USD:'$',TRY:'₺'}[q.currency]||'€';
      return `**${q.quoteNumber||q._id?.slice(0,8)||'?'}** — ${c} — ${Number(q.totalNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})}${sym} (${d})`;
    });
    return { text: `📄 **Son ${recent.length} Teklif:**\n\n${lines.join('\n')}` };
  }

  // QUOTE for a customer (not create)
  const quoteTriggers = ['teklif','angebot','angebote','teklifler'];
  const isCreate = _isCreateIntent(t);
  if (!isCreate && quoteTriggers.some(k => t.includes(k))) {
    const quotes = _chatGetQuotes();
    if (quotes.length) {
      const words = rawText.split(/\s+/).filter(w =>
        w.length > 2 && !['son','teklif','angebot','letztes','letzten','von','für','für','kunde','müşteri','das'].includes(w.toLowerCase())
      );
      if (words.length > 0) {
        const hits = quotes.filter(q => {
          const hay = [q.contactName||'', q.contactCompany||'', q.quoteNumber||''].join(' ').toLowerCase();
          return words.some(w => hay.includes(w.toLowerCase()));
        });
        if (hits.length) {
          const q   = hits[0];
          const sym = {EUR:'€',USD:'$',TRY:'₺'}[q.currency]||'€';
          const d   = q.createdAt ? new Date(q.createdAt).toLocaleDateString('tr-TR') : '?';
          const linesTxt = (q.lines||[]).map(l =>
            `  - ${l.product||'?'}: ${l.qty||0} × ${Number(l.unitPrice||0).toFixed(2)}${sym} = **${((l.qty||0)*(l.unitPrice||0)).toLocaleString('de-DE',{minimumFractionDigits:2})}${sym}**`
          ).join('\n');
          let resp = `📄 **${q.quoteNumber||'?'}** — ${[q.contactName,q.contactCompany].filter(Boolean).join(' / ')||'?'}\n`;
          resp    += `Tarih: ${d} | Durum: ${q.status==='sent'?'✅ Gönderildi':'📝 Taslak'}\n`;
          resp    += `Toplam: **${Number(q.totalNet||0).toLocaleString('de-DE',{minimumFractionDigits:2})} ${sym}**`;
          if (linesTxt) resp += `\n\nKalemler:\n${linesTxt}`;
          if (hits.length > 1) resp += `\n\n_+${hits.length-1} daha teklif bulundu_`;
          return { text: resp };
        }
        return { text: `❌ "${words.join(' ')}" için teklif bulunamadı.` };
      }
    }
  }

  // CREATE QUOTE (local simple parse)
  if (isCreate) {
    return _parseCreateQuote(rawText);
  }

  return null; // no local match → Gemini
}

function _isCreateIntent(t) {
  return ['erstell','schreib','yaz ','oluştur','yeni angebot','neues angebot','create quote',
          'yeni teklif oluştur','teklif oluştur'].some(k => t.includes(k));
}

function _parseCreateQuote(text) {
  // Simple regex extraction for: "angebot an [customer] mit [product] à [price] [currency] [qty] stk"
  const customerMatch = text.match(/(?:an|için|to)\s+([A-ZÇĞİÖŞÜa-züçğışöü][a-züçğışöü\s]+?)(?:\s+mit|\s+with|\s+ile|\s*,|à|@|\d)/i);
  const productMatch  = text.match(/(?:mit|with|ile|ürün:?)\s+([A-Za-züçğışöü\s\-\/]+?)(?:\s+à|@|\s+\d|\s*,|\s+für|\s+for)/i);
  const priceMatch    = text.match(/(?:à|@|price:|preis:?)\s*([\d,\.]+)/i);
  const qtyMatch      = text.match(/(\d+)\s*(?:stk|stück|adet|pcs|pieces|tane)/i) ||
                        text.match(/(\d+)\s*$/i);
  const currencyMatch = text.match(/\b(EUR|USD|TRY|€|\$|₺)\b/i);

  const customerName = customerMatch?.[1]?.trim() || '';
  const product      = productMatch?.[1]?.trim()  || '';
  const priceStr     = (priceMatch?.[1] || '0').replace(',','.');
  const unitPrice    = parseFloat(priceStr) || 0;
  const qty          = parseInt(qtyMatch?.[1] || '1') || 1;
  const rawCur       = (currencyMatch?.[1] || 'EUR').toUpperCase();
  const currency     = rawCur === '€' ? 'EUR' : rawCur === '$' ? 'USD' : rawCur === '₺' ? 'TRY' : rawCur;

  if (!customerName && !product) return null; // can't parse → Gemini

  const sym   = {EUR:'€',USD:'$',TRY:'₺'}[currency]||'€';
  const total = (qty * unitPrice).toLocaleString('de-DE',{minimumFractionDigits:2});

  const params = { customerName, customerCompany:'', product, qty, unitPrice, currency, unit:'Stk.', description:'' };

  return {
    text: `✅ Teklif parametreleri hazırlandı:\n\n**Müşteri:** ${customerName||'—'}\n**Ürün:** ${product||'—'}\n**Miktar:** ${qty} Stk.\n**Birim fiyat:** ${unitPrice.toFixed(2)} ${sym}\n**Toplam:** ${total} ${sym}\n\nAşağıdaki butona tıklayarak formu açın ve düzenleyebilirsiniz.`,
    action: { type:'CREATE_QUOTE', params }
  };
}

function _findProductsByText(rawText, products) {
  // Extract content words (skip short/common words)
  const stopwords = new Set(['wieviel','wie','viel','haben','wir','stokta','kaç','var','auf','lager','bitte',
    'stok','lager','bestand','kalan','ne','kadar','nasıl']);
  const words = rawText.split(/\s+/)
    .map(w => w.replace(/[?!.,]/g,'').toLowerCase())
    .filter(w => w.length > 2 && !stopwords.has(w));
  if (!words.length) return [];
  return products.filter(p => {
    const hay = (p.name + ' ' + (p.sku||'') + ' ' + (p.category||'')).toLowerCase();
    return words.some(w => hay.includes(w));
  });
}

function _stockEmoji(s) {
  const n = Number(s ?? 0);
  if (n <= 0) return '🔴';
  if (n < 10)  return '🟡';
  return '🟢';
}

function _chatGetProducts() {
  return (typeof prProducts !== 'undefined' && prProducts) ? prProducts : [];
}
function _chatGetQuotes() {
  return (typeof tkAllQuotes !== 'undefined' && tkAllQuotes) ? tkAllQuotes : [];
}

// ── Gemini API ────────────────────────────────────────────
async function _callGemini(userMsg, apiKey) {
  const context = _buildContext();

  const systemPrompt = `Du bist ein intelligenter Assistent für das Windoform Lager- und Teklif-System.
Antworte auf Deutsch oder Türkisch je nach Benutzersprache (gemischte Sprache OK).
Nutze **fett** für wichtige Zahlen/Namen. Halte Antworten kurz und präzise.

WENN der Benutzer ein Angebot erstellen will, schreibe in der ersten Zeile:
ACTION:CREATE_QUOTE:{"customerName":"...","customerCompany":"...","product":"...","qty":1,"unitPrice":0.00,"currency":"EUR","unit":"Stk.","description":""}

Danach kurze Bestätigung auf Deutsch/Türkisch.

AKTUELLE DATEN:
${context}`;

  // Build conversation (last 8 turns)
  const contents = [];
  const hist = _chatHistory.slice(-9, -1);

  if (hist.length === 0) {
    // First message — include system in user turn
    contents.push({ role:'user', parts:[{ text: systemPrompt + '\n\nFrage: ' + userMsg }] });
  } else {
    // Include prior turns (Gemini needs alternating user/model)
    for (const h of hist) {
      const role = h.role === 'user' ? 'user' : 'model';
      contents.push({ role, parts:[{ text: h.text }] });
    }
    contents.push({ role:'user', parts:[{ text: userMsg }] });
  }

  const body = {
    system_instruction: { parts:[{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature:0.2, maxOutputTokens:600, topP:0.85 }
  };

  const res = await fetch(`${CHAT_GEMINI_URL}?key=${apiKey}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const e = await res.json().catch(()=>({}));
    throw new Error(e.error?.message || 'HTTP ' + res.status);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Yanıt alınamadı.';
}

function _buildContext() {
  const lines = [];

  const prods = _chatGetProducts();
  if (prods.length) {
    lines.push('=== LAGER (Ürünler) ===');
    prods.forEach(p => {
      lines.push(`${p.sku||'?'} | ${p.name||'?'} | Stok:${p.stock??0} ${p.unit||'Stk.'} | VK:${p.priceNet||0}EUR | EK:${p.pricePurchase||0}EUR | Kat:${p.category||''}`);
    });
  }

  const quotes = _chatGetQuotes();
  if (quotes.length) {
    lines.push('\n=== TEKLİFLER (son 80) ===');
    quotes.slice(0,80).forEach(q => {
      const d = q.createdAt ? q.createdAt.slice(0,10) : '?';
      const c = [q.contactName,q.contactCompany].filter(Boolean).join('/');
      const p = q.product || q.lines?.[0]?.product || '?';
      lines.push(`${q.quoteNumber||'?'} | ${c} | ${p} | ${q.totalNet||0}${q.currency||'EUR'} | ${d} | ${q.status||'draft'}`);
    });
  }

  return lines.join('\n') || '(Veri henüz yüklenmemiş)';
}

// ── Execute create quote from chat action button ──────────
function chatExecCreateQuote(params) {
  // Navigate to Teklifler and open the edit modal pre-filled
  showPage('teklifler');

  // Wait a tick for page to render
  setTimeout(() => {
    tkEditingId = null;
    document.getElementById('tk-edit-title').textContent = 'Yeni Teklif (AI)';
    document.getElementById('tk-edit-num').value      = _tkAutoQuoteNum();
    document.getElementById('tk-edit-date').value     = new Date().toISOString().slice(0,10);
    document.getElementById('tk-edit-currency').value = params.currency || 'EUR';
    document.getElementById('tk-edit-vat').value      = '19';
    document.getElementById('tk-edit-status').value   = 'draft';
    document.getElementById('tk-edit-cname').value    = params.customerName    || '';
    document.getElementById('tk-edit-ccompany').value = params.customerCompany || '';
    document.getElementById('tk-edit-cemail').value   = '';
    document.getElementById('tk-edit-cphone').value   = '';
    document.getElementById('tk-edit-caddr').value    = '';
    document.getElementById('tk-edit-notes').value    = '';
    document.getElementById('tk-edit-lines').innerHTML = '';
    tkAddModalLine({
      product:     params.product     || '',
      description: params.description || '',
      qty:         params.qty         || 1,
      unit:        params.unit        || 'Stk.',
      unitPrice:   params.unitPrice   || 0,
    });
    tkModalRecalc();
    new bootstrap.Modal(document.getElementById('teklifEditModal')).show();
    // Close chat
    if (_chatOpen) toggleChat();
  }, 150);
}

// ── Config helpers ────────────────────────────────────────
function _loadGeminiKey() {
  try { return JSON.parse(localStorage.getItem('windoform_cfg') || '{}').geminiKey || ''; }
  catch { return ''; }
}
function saveGeminiKey(key) {
  try {
    const cfg = JSON.parse(localStorage.getItem('windoform_cfg') || '{}');
    cfg.geminiKey = key;
    localStorage.setItem('windoform_cfg', JSON.stringify(cfg));
  } catch { /* ignore */ }
}
