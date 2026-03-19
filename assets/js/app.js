'use strict';

/* ===================== SABITLER ===================== */
const DB_NAME = 'CRM_DB', DB_VER = 4;

const CITIES = {
  'istanbul':'İstanbul','ankara':'Ankara','izmir':'İzmir','bursa':'Bursa','antalya':'Antalya',
  'adana':'Adana','konya':'Konya','gaziantep':'Gaziantep','kocaeli':'Kocaeli','izmit':'Kocaeli',
  'mersin':'Mersin','diyarbakir':'Diyarbakır','hatay':'Hatay','manisa':'Manisa','kayseri':'Kayseri',
  'samsun':'Samsun','balikesir':'Balıkesir','tekirdag':'Tekirdağ','denizli':'Denizli',
  'eskisehir':'Eskişehir','sakarya':'Sakarya','adapazari':'Sakarya','trabzon':'Trabzon',
  'malatya':'Malatya','erzurum':'Erzurum','van':'Van','zonguldak':'Zonguldak','batman':'Batman',
  'elazig':'Elazığ','erzincan':'Erzincan','rize':'Rize','ordu':'Ordu','giresun':'Giresun',
  'sivas':'Sivas','kahramanmaras':'Kahramanmaraş','maras':'Kahramanmaraş','afyon':'Afyonkarahisar',
  'afyonkarahisar':'Afyonkarahisar','aydin':'Aydın','mugla':'Muğla','canakkale':'Çanakkale',
  'edirne':'Edirne','kirikkale':'Kırıkkale','urfa':'Şanlıurfa','sanliurfa':'Şanlıurfa',
  'yalova':'Yalova','isparta':'Isparta','karabuk':'Karabük','kastamonu':'Kastamonu',
  'usak':'Uşak','nigde':'Niğde','nevsehir':'Nevşehir','tokat':'Tokat','sinop':'Sinop',
  'aksaray':'Aksaray','karaman':'Karaman','kutahya':'Kütahya','bolu':'Bolu','amasya':'Amasya',
  'corum':'Çorum','artvin':'Artvin','ardahan':'Ardahan','agri':'Ağrı','bitlis':'Bitlis',
  'mus':'Muş','siirt':'Siirt','sirnak':'Şırnak','hakkari':'Hakkari','bingol':'Bingöl',
  'tunceli':'Tunceli','mardin':'Mardin','adiyaman':'Adıyaman','kilis':'Kilis',
  'osmaniye':'Osmaniye','duzce':'Düzce','bartin':'Bartın','bayburt':'Bayburt',
  'igdir':'Iğdır','kars':'Kars','gumushane':'Gümüşhane','kirklareli':'Kırklareli',
  'kirsehir':'Kırşehir','yozgat':'Yozgat','cankiri':'Çankırı','burdur':'Burdur',
  'bilecik':'Bilecik'
};

const DISTRICTS = {
  'kadikoy':'İstanbul','besiktas':'İstanbul','sisli':'İstanbul','beyoglu':'İstanbul',
  'fatih':'İstanbul','uskudar':'İstanbul','umraniye':'İstanbul','maltepe':'İstanbul',
  'kartal':'İstanbul','pendik':'İstanbul','tuzla':'İstanbul','bakirkoy':'İstanbul',
  'bagcilar':'İstanbul','bahcelievler':'İstanbul','esenyurt':'İstanbul','avcilar':'İstanbul',
  'sancaktepe':'İstanbul','sultanbeyli':'İstanbul','gaziosmanpasa':'İstanbul',
  'kagithane':'İstanbul','kucukcekmece':'İstanbul','buyukcekmece':'İstanbul',
  'basaksehir':'İstanbul','arnavutkoy':'İstanbul','beykoz':'İstanbul','sariyer':'İstanbul',
  'sultangazi':'İstanbul','zeytinburnu':'İstanbul','gungoren':'İstanbul','esenler':'İstanbul',
  'eyupsultan':'İstanbul','eyup':'İstanbul','bayrampaşa':'İstanbul','adalar':'İstanbul',
  'cankaya':'Ankara','kecioren':'Ankara','mamak':'Ankara','altindag':'Ankara',
  'yenimahalle':'Ankara','sincan':'Ankara','etimesgut':'Ankara','pursaklar':'Ankara',
  'golbasi':'Ankara','kizilay':'Ankara','ulus':'Ankara',
  'bornova':'İzmir','buca':'İzmir','karsiyaka':'İzmir','konak':'İzmir',
  'bayrakli':'İzmir','cigli':'İzmir','gaziemir':'İzmir','karabaglar':'İzmir',
  'osmangazi':'Bursa','nilufer':'Bursa','yildirim':'Bursa','gemlik':'Bursa',
  'muratpasa':'Antalya','kepez':'Antalya','konyaalti':'Antalya','alanya':'Antalya','manavgat':'Antalya',
  'seyhan':'Adana','yuregir':'Adana','cukurova':'Adana',
  'karatay':'Konya','selcuklu':'Konya','meram':'Konya',
  'sahinbey':'Gaziantep','sehitkamil':'Gaziantep',
  'atakum':'Samsun','ilkadim':'Samsun','canik':'Samsun',
  'melikgazi':'Kayseri','kocasinan':'Kayseri','talas':'Kayseri'
};

const DISTRICT_NAMES = {
  'kadikoy':'Kadıköy','besiktas':'Beşiktaş','sisli':'Şişli','beyoglu':'Beyoğlu',
  'fatih':'Fatih','uskudar':'Üsküdar','umraniye':'Ümraniye','maltepe':'Maltepe',
  'kartal':'Kartal','pendik':'Pendik','tuzla':'Tuzla','bakirkoy':'Bakırköy',
  'bagcilar':'Bağcılar','bahcelievler':'Bahçelievler','esenyurt':'Esenyurt',
  'avcilar':'Avcılar','sancaktepe':'Sancaktepe','sultanbeyli':'Sultanbeyli',
  'gaziosmanpasa':'Gaziosmanpaşa','kagithane':'Kağıthane','kucukcekmece':'Küçükçekmece',
  'buyukcekmece':'Büyükçekmece','basaksehir':'Başakşehir','arnavutkoy':'Arnavutköy',
  'beykoz':'Beykoz','sariyer':'Sarıyer','sultangazi':'Sultangazi','zeytinburnu':'Zeytinburnu',
  'gungoren':'Güngören','esenler':'Esenler','eyupsultan':'Eyüpsultan','eyup':'Eyüp',
  'cankaya':'Çankaya','kecioren':'Keçiören','mamak':'Mamak','altindag':'Altındağ',
  'yenimahalle':'Yenimahalle','sincan':'Sincan','etimesgut':'Etimesgut','pursaklar':'Pursaklar',
  'bornova':'Bornova','buca':'Buca','karsiyaka':'Karşıyaka','konak':'Konak',
  'bayrakli':'Bayraklı','cigli':'Çiğli','gaziemir':'Gaziemir','karabaglar':'Karabağlar',
  'osmangazi':'Osmangazi','nilufer':'Nilüfer','yildirim':'Yıldırım',
  'muratpasa':'Muratpaşa','kepez':'Kepez','konyaalti':'Konyaaltı','alanya':'Alanya',
  'manavgat':'Manavgat','seyhan':'Seyhan','yuregir':'Yüreğir','cukurova':'Çukurova',
  'karatay':'Karatay','selcuklu':'Selçuklu','meram':'Meram',
  'sahinbey':'Şahinbey','sehitkamil':'Şehitkamil',
  'atakum':'Atakum','ilkadim':'İlkadım','canik':'Canik',
  'melikgazi':'Melikgazi','kocasinan':'Kocasinan','talas':'Talas'
};

const SECTOR_KEYWORDS = {
  'İnşaat & Yapı':['insaat','yapi','müteahhit','beton','çelik','pvc','cam','pencere','kapi','boya','çati','tesisat','izolasyon','prefabrik','yüklenici'],
  'Tekstil & Giyim':['tekstil','giyim','konfeksiyon','kumas','iplik','dokuma','deri','ayakkabi','çanta','moda','giysi','uniform','hazir giyim'],
  'Gıda & İçecek':['gida','yiyecek','içecek','restoran','kafe','lokanta','pastane','firin','market','kasap','süt','catering','yemek','gida uretim'],
  'Sağlık & Medikal':['saglik','hastane','klinik','doktor','eczane','ilac','medikal','dental','dis','optik','veteriner','rehabilitasyon','tip'],
  'Eğitim':['egitim','okul','kurs','dershane','universite','kolej','akademi','etüt','anaokulu','kres','sertifika','seminer'],
  'Otomotiv':['otomotiv','arac','araba','oto ','servis','lastik','yedek parca','kaporta','motor','bakim','muayene','kiralama','otomobil'],
  'Teknoloji & BT':['teknoloji','yazilim','bilgisayar',' it ','internet','web','uygulama','mobil','eticaret','dijital','siber','network','cloud'],
  'Finans & Sigorta':['finans','sigorta','banka','kredi','leasing','muhasebe','mali musavir','vergi','denetim','yatirim','borsa'],
  'Perakende & Ticaret':['ticaret','satis','magaza','dukkan','toptan','perakende','ithalat','ihracat','distribütor','bayi'],
  'Lojistik & Nakliye':['lojistik','nakliye','tasimacilık','kargo','kurye','depo','gümrük','yük','filo','sevkiyat'],
  'Turizm & Konaklama':['turizm','otel','pansiyon','konaklama','tatil','seyahat','acente','tur ','resort','transfer'],
  'Gayrimenkul':['gayrimenkul','emlak','konut','daire','kirali','satilık','arsa','plaza','site yonetim'],
  'Tarım & Hayvancılık':['tarim','hayvancilik','çiftlik','sera','tohum','gübre','zirai','ziraat','balikcilik','aricilik'],
  'Enerji':['enerji','elektrik','dogalgaz','petrol','akaryakit','günes','solar','rüzgar','yenilenebilir','isitma'],
  'Medya & Reklam':['medya','reklam','ajans','gazete','dergi',' tv ','radyo','prodüksiyon','fotograf','tasarim','baski','matbaa'],
  'Hukuk & Danışmanlık':['hukuk','avukat','danismanlik','consultant','noter','icra','arabuluculuk'],
  'Temizlik & Güvenlik':['temizlik','hijyen','güvenlik','koruma','facility','bina yonetim','özel güvenlik']
};

/* ===================== DURUM ===================== */
let db = null;
let dbMode = 'idb'; // 'idb' | 'local'
const LS_DB_KEY = 'CRM_LOCAL_DB_V1';
let selectedCompIds = new Set();
let selectedContIds = new Set();
let charts = {};
let currentModalCompanyId = null;
let currentModalContactId = null;
let importFileData = [];
let importMapping = {};   // col → CRM field name
let importCols    = [];   // ordered list of Excel column names (for dropdown index lookup)
let importDuplicates = [];
let importPendingNonDupes = [];
let importPendingContacts = [];
let compSort = { field: 'name', asc: true };
let contSort = { field: 'name', asc: true };

/* ===================== BAŞLANGIÇ ===================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Menüler her koşulda çalışsın — önce event listener kur
  setupEventListeners();
  populateSelects();

  try {
    await initDB();
    await loadCompanies();
  } catch (err) {
    console.error('Başlangıç hatası:', err);
    toast('Veritabanı başlatılamadı: ' + err.message + ' — Tarayıcı izinlerini kontrol edin.', 'error');
  }
});

/* ===================== IndexedDB ===================== */
function initDB() {
  return new Promise((resolve, reject) => {
    try {
      if (!('indexedDB' in window)) throw new Error('IndexedDB desteklenmiyor');
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = () => {
        // file:// + Safari gibi ortamlarda IndexedDB kapalı olabilir → localStorage fallback
        console.warn('IndexedDB açılamadı, localStorage moduna geçiliyor:', req.error);
        dbMode = 'local';
        db = { mode: 'local' };
        try { _lsEnsure(); } catch (lsErr) { console.warn('localStorage da açılamadı:', lsErr); }
        resolve();
      };
      req.onsuccess = () => { dbMode = 'idb'; db = req.result; resolve(); };
      req.onupgradeneeded = e => {
        const idb = e.target.result;
        ['companies','contacts','imports'].forEach(s => {
          if (!idb.objectStoreNames.contains(s))
            idb.createObjectStore(s, { keyPath:'id', autoIncrement:true });
        });
      };
    } catch (e) {
      console.warn('IndexedDB kullanılamıyor, localStorage moduna geçiliyor:', e.message);
      dbMode = 'local';
      db = { mode: 'local' };
      try { _lsEnsure(); } catch (lsErr) { console.warn('localStorage da açılamadı:', lsErr); }
      resolve();
    }
  });
}

// ── localStorage fallback (file:// uyumlu) ───────────────────────────────────
function _lsEnsure() {
  try {
    const raw = localStorage.getItem(LS_DB_KEY);
    let obj = null;
    if (raw) {
      try { obj = JSON.parse(raw); } catch (_) { obj = null; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      // Bozuk veri varsa sıfırla — hata atmak yerine temiz başla
      obj = { companies: [], contacts: [], imports: [], _seq: { companies: 1, contacts: 1, imports: 1 } };
    }
    if (!obj._seq || typeof obj._seq !== 'object') obj._seq = { companies: 1, contacts: 1, imports: 1 };
    ['companies', 'contacts', 'imports'].forEach(s => { if (!Array.isArray(obj[s])) obj[s] = []; });
    localStorage.setItem(LS_DB_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('localStorage erişimi başarısız:', e);
    // localStorage tamamen kullanılamıyorsa hata verme — uygulamanın çalışmasına izin ver
  }
}
function _lsRead() { _lsEnsure(); return JSON.parse(localStorage.getItem(LS_DB_KEY)); }
function _lsWrite(obj) { localStorage.setItem(LS_DB_KEY, JSON.stringify(obj)); }

function dbAll(store) {
  if (dbMode === 'local') {
    return Promise.resolve((_lsRead()[store] || []).slice());
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onerror = () => x(req.error);
    req.onsuccess = () => r(req.result);
  });
}
function dbGet(store, id) {
  if (dbMode === 'local') {
    const obj = _lsRead();
    const row = (obj[store] || []).find(x => x && x.id === id);
    return Promise.resolve(row || null);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(id);
    req.onerror = () => x(req.error);
    req.onsuccess = () => r(req.result);
  });
}
function dbAdd(store, obj) {
  if (dbMode === 'local') {
    const dbObj = _lsRead();
    const id = (dbObj._seq && dbObj._seq[store]) ? dbObj._seq[store] : 1;
    dbObj._seq[store] = id + 1;
    const row = { ...obj, id };
    dbObj[store].push(row);
    _lsWrite(dbObj);
    return Promise.resolve(id);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).add(obj);
    req.onerror = () => x(req.error);
    req.onsuccess = () => r(req.result);
  });
}
function dbPut(store, obj) {
  if (dbMode === 'local') {
    const dbObj = _lsRead();
    if (obj.id == null) return dbAdd(store, obj);
    const arr = dbObj[store] || [];
    const idx = arr.findIndex(x => x && x.id === obj.id);
    if (idx >= 0) arr[idx] = { ...obj };
    else arr.push({ ...obj });
    dbObj[store] = arr;
    _lsWrite(dbObj);
    return Promise.resolve(obj.id);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(obj);
    req.onerror = () => x(req.error);
    req.onsuccess = () => r(req.result);
  });
}
function dbDelete(store, id) {
  if (dbMode === 'local') {
    const dbObj = _lsRead();
    dbObj[store] = (dbObj[store] || []).filter(x => x && x.id !== id);
    _lsWrite(dbObj);
    return Promise.resolve(true);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    req.onerror = () => x(req.error);
    req.onsuccess = () => r(req.result);
  });
}

/**
 * Tek seferde tüm objeleri tek bir transaction'da yazar.
 * N ayrı transaction yerine 1 transaction: 10-100x hızlı.
 * @returns {Promise<number[]>} Eklenen kayıtların ID listesi
 */
function dbAddBatch(store, objects) {
  if (dbMode === 'local') {
    if (!objects.length) return Promise.resolve([]);
    const dbObj = _lsRead();
    if (!dbObj._seq) dbObj._seq = { companies: 1, contacts: 1, imports: 1 };
    const ids = [];
    for (const obj of objects) {
      const id = dbObj._seq[store] ? dbObj._seq[store] : 1;
      dbObj._seq[store] = id + 1;
      dbObj[store].push({ ...obj, id });
      ids.push(id);
    }
    _lsWrite(dbObj);
    return Promise.resolve(ids);
  }
  return new Promise((resolve, reject) => {
    if (!objects.length) { resolve([]); return; }
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const ids = new Array(objects.length).fill(null);
    objects.forEach((obj, i) => {
      const req = os.add(obj);
      req.onsuccess = () => { ids[i] = req.result; };
      req.onerror   = e  => { e.preventDefault(); }; // hatalı satırı atla, transaction devam etsin
    });
    tx.oncomplete = () => resolve(ids);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(new Error('Transaction iptal edildi'));
  });
}

/** UI'yi bloke etmeden asenkron yield — büyük döngülerde her N adımda çağır */
const yieldToUI = () => new Promise(r => setTimeout(r, 0));

/**
 * Büyük veri setleri için dbAddBatch'i 500'erli parçalara böler.
 * Tek transaction timeout/abort sorununu engeller.
 * @returns {Promise<number[]>} Eklenen kayıtların ID listesi
 */
async function dbAddBatchChunked(store, objects) {
  if (!objects.length) return [];
  const CHUNK = 500;
  const allIds = [];
  for (let i = 0; i < objects.length; i += CHUNK) {
    const chunk = objects.slice(i, i + CHUNK);
    const ids   = await dbAddBatch(store, chunk);
    allIds.push(...ids);
    if (i + CHUNK < objects.length) await yieldToUI(); // her chunk'tan sonra UI nefes alsın
  }
  return allIds;
}

/**
 * Sadece name→id eşlemesini cursor ile okur.
 * dbAll gibi tüm alanları belleğe almak yerine sadece id ve name çeker.
 * Büyük veri setlerinde bellek kullanımını 10-50x azaltır.
 */
function dbBuildNameIdMap(store) {
  return new Promise((resolve, reject) => {
    if (dbMode === 'local') {
      const out = {};
      dbAll(store).then(list => {
        list.forEach(v => {
          if (v && v.name) out[trLow(v.name)] = v.id;
        });
        resolve(out);
      }).catch(reject);
      return;
    }
    const tx  = db.transaction(store, 'readonly');
    const os  = tx.objectStore(store);
    const map = {};
    const req = os.openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const { id, name } = cursor.value;
        if (name) map[trLow(name)] = id;
        cursor.continue();
      }
    };
    req.onerror  = () => reject(req.error);
    tx.oncomplete = () => resolve(map);
    tx.onerror    = () => reject(tx.error);
  });
}

/* ===================== YARDIMCILAR ===================== */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }

function trLow(s) {
  return String(s||'')
    .replace(/İ/g,'i').replace(/I/g,'ı').replace(/Ğ/g,'ğ')
    .replace(/Ş/g,'ş').replace(/Ç/g,'ç').replace(/Ö/g,'ö').replace(/Ü/g,'ü')
    .toLowerCase();
}

function normalizePhone(phone) {
  const p = String(phone||'').replace(/\D/g,'');
  if (!p) return {valid:false,normalized:'',type:'',error:'Boş'};
  let num = p.startsWith('90') ? p.substring(2) : p;
  if (num.startsWith('0')) num = num.substring(1);
  if (num.length !== 10) return {valid:false,normalized:'',type:'',error:'Yanlış uzunluk'};
  const prefix = num.substring(0,3);
  const type = ['530','531','532','533','534','535','536','537','538','539'].includes(prefix) ? 'Turkcell'
    : ['540','541','542','543','544','545','546','547','548','549'].includes(prefix) ? 'Vodafone'
    : ['550','551','552','553','554','555','556','501','502','503','504','505'].includes(prefix) ? 'Türk Telekom'
    : 'Diğer';
  return {valid:true, normalized:'+90'+num, type, error:null};
}

function normalizeCity(raw) {
  if (!raw) return null;
  const k = trLow(String(raw).trim());
  return CITIES[k] || (Object.values(CITIES).find(v => trLow(v)===k)) || String(raw).trim();
}

// Excel standart kolon desteği (alias'lar)
const STANDARD_FIELD_ALIASES = {
  // ── Firma ──────────────────────────────────────────────────────────────────
  'Firma':         ['Business', 'Firma', 'Firma Adı', 'Firma Adi', 'Şirket', 'Sirket',
                    'Cari', 'Cari Ünvan', 'Cari Ünvanı', 'Ünvan', 'Unvan', 'Company', 'Name'],
  // ── İletişim ────────────────────────────────────────────────────────────────
  'Telefon':       ['Phone', 'Telefon', 'Tel', 'GSM', 'GSM No', 'Cep', 'Cep Telefonu', 'Mobile'],
  'E-posta':       ['Email', 'E-posta', 'Eposta', 'E Mail', 'E-mail', 'Mail'],
  'Website':       ['Website', 'Web', 'Web Site', 'Websitesi', 'URL', 'Site'],
  'Faks':          ['Faks', 'Fax', 'Faks No', 'Fax No', 'Faks Numarası'],
  // ── Konum ───────────────────────────────────────────────────────────────────
  'Adres':         ['Street', 'Adres', 'Address', 'Sokak', 'Cadde'],
  'Şehir':         ['City', 'Şehir', 'Sehir', 'İl', 'Il'],
  'İlçe':          ['İlçe', 'Ilçe', 'Ilce', 'District'],
  'State':         ['State', 'Province', 'Eyalet', 'İl/Eyalet', 'Region'],
  'Posta Kodu':    ['Postcode', 'Postal Code', 'Zip', 'Zip Code', 'Posta Kodu', 'PostaKodu'],
  'Ülke':          ['Country', 'Ülke', 'Ulke'],
  'Enlem':         ['Lat', 'Enlem', 'Latitude'],
  'Boylam':        ['Lng', 'Boylam', 'Lon', 'Longitude'],
  // ── İş Bilgileri ────────────────────────────────────────────────────────────
  'Sektör':        ['Categories', 'Category', 'Sektör', 'Sektor', 'Sector', 'Kategori'],
  'Açıklama':      ['Description', 'Açıklama', 'About', 'Hakkında', 'Aciklama'],
  'Çalışan':       ['Employees', 'Çalışan', 'Calisan', 'Personel', 'Personel Sayısı', 'Employee Count'],
  'Ciro':          ['Revenue', 'Ciro', 'Gelir', 'Yıllık Ciro', 'Turnover'],
  'Vergi No':      ['Vergi No', 'Vergi Numarası', 'Vergi Numarasi', 'VKN', 'TCKN', 'TC No', 'Vergi/TC', 'Tax'],
  'Vergi Dairesi': ['Vergi Dairesi', 'V. Dairesi', 'Vergi Dai.', 'VergiDairesi'],
  'SIC':           ['Sic', 'SIC', 'SIC Kodu', 'SIC Code'],
  'NAICS':         ['Naics', 'NAICS', 'NAICS Code'],
  // ── Sosyal Medya ────────────────────────────────────────────────────────────
  'LinkedIn':      ['Linkedin', 'LinkedIn', 'LinkedIn URL'],
  'Facebook':      ['Facebook', 'Facebook URL', 'FB'],
  'Instagram':     ['Instagram', 'Instagram URL', 'IG'],
  'Twitter':       ['X', 'Twitter', 'Twitter URL', 'Tweet'],
  'YouTube':       ['Youtube', 'YouTube', 'YouTube URL'],
  // ── Notlar ──────────────────────────────────────────────────────────────────
  'Notlar':        ['Notlar', 'Not', 'Notes', 'Notlar/Açıklama'],
  // ── Kişi kolonları ──────────────────────────────────────────────────────────
  'Adı':           ['Contact First Name', 'First Name', 'Adı', 'Adi', 'Ad Soyad',
                    'İsim', 'Isim', 'Yetkili', 'Yetkili Adı', 'Yetkili Ad Soyad', 'Yetkili Kişi'],
  'Soyadı':        ['Contact Last Name',  'Last Name',  'Soyadı', 'Soyad', 'Yetkili Soyadı'],
  'Unvan':         ['Contact Role', 'Role', 'Unvan', 'Pozisyon', 'Görev', 'Gorev', 'Title', 'Yetkili Unvanı'],
  'Kişi E-posta':  ['Contact Email', 'Yetkili E-posta', 'İletişim E-posta'],
  'Durum':         ['Durum', 'Status']
};

function buildHeaderIndexMap(headers) {
  const map = {};
  (headers || []).forEach(h => { map[trLow(String(h).trim())] = String(h); });
  return map;
}

function _normHeaderForFuzzy(h) {
  return trLow(String(h || ''))
    .replace(/[\(\)\[\]\{\}\-_.:;,#/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _bestFuzzyHeader(headers, includeTerms, excludeTerms) {
  const hs = (headers || []).map(h => ({ raw: String(h), n: _normHeaderForFuzzy(h) }));
  let best = null;
  for (const h of hs) {
    if (!h.n) continue;
    if (excludeTerms && excludeTerms.some(t => h.n.includes(t))) continue;
    const score = includeTerms.reduce((s, t) => s + (h.n.includes(t) ? 1 : 0), 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { raw: h.raw, score };
  }
  return best ? best.raw : null;
}

function buildStandardFieldAccessor(headers) {
  const headerMap = buildHeaderIndexMap(headers);
  const fieldToCol = {};
  for (const [field, aliases] of Object.entries(STANDARD_FIELD_ALIASES)) {
    for (const a of aliases) {
      const key = trLow(a);
      if (headerMap[key]) { fieldToCol[field] = headerMap[key]; break; }
    }
  }
  // Fuzzy fallback: başlıklar aynı ama küçük varyasyonlu olabiliyor
  if (!fieldToCol['Firma']) {
    fieldToCol['Firma'] = _bestFuzzyHeader(
      headers,
      ['firma', 'cari', 'unvan', 'ünvan', 'sirket', 'şirket'],
      ['telefon', 'tel', 'gsm', 'mail', 'email', 'e posta', 'vergi', 'vkn', 'tc', 'adres', 'ilce', 'ilçe', 'sehir', 'şehir', 'website', 'web']
    );
  }
  if (!fieldToCol['Vergi No']) {
    fieldToCol['Vergi No'] = _bestFuzzyHeader(headers, ['vergi', 'vkn', 'tckn', 'tc'], ['adres', 'ilce', 'ilçe', 'sehir', 'şehir']);
  }
  if (!fieldToCol['Telefon']) {
    fieldToCol['Telefon'] = _bestFuzzyHeader(headers, ['telefon', 'tel', 'gsm', 'phone'], ['firma', 'cari', 'unvan', 'ünvan']);
  }
  if (!fieldToCol['E-posta']) {
    fieldToCol['E-posta'] = _bestFuzzyHeader(headers, ['email', 'e mail', 'e posta', 'mail'], null);
  }
  if (!fieldToCol['Website']) {
    fieldToCol['Website'] = _bestFuzzyHeader(headers, ['website', 'web', 'url', 'site'], null);
  }
  if (!fieldToCol['Adres']) {
    fieldToCol['Adres'] = _bestFuzzyHeader(headers, ['adres', 'address'], null);
  }
  if (!fieldToCol['Şehir']) {
    fieldToCol['Şehir'] = _bestFuzzyHeader(headers, ['şehir', 'sehir', 'il', 'city'], ['ilce', 'ilçe']);
  }
  if (!fieldToCol['İlçe']) {
    fieldToCol['İlçe'] = _bestFuzzyHeader(headers, ['ilçe', 'ilce', 'district'], ['şehir', 'sehir']);
  }
  if (!fieldToCol['Sektör']) {
    fieldToCol['Sektör'] = _bestFuzzyHeader(headers, ['sekt', 'sector'], null);
  }
  if (!fieldToCol['Notlar']) {
    fieldToCol['Notlar'] = _bestFuzzyHeader(headers, ['not', 'açıklama', 'aciklama', 'notes'], ['vergi']);
  }
  if (!fieldToCol['Faks']) {
    fieldToCol['Faks'] = _bestFuzzyHeader(headers, ['faks', 'fax'], null);
  }
  if (!fieldToCol['Vergi Dairesi']) {
    fieldToCol['Vergi Dairesi'] = _bestFuzzyHeader(headers, ['vergi dairesi', 'v dairesi', 'vergi dai'], ['vergi no', 'vkn']);
  }
  if (!fieldToCol['State']) {
    fieldToCol['State'] = _bestFuzzyHeader(headers, ['state', 'province', 'eyalet', 'region'], ['status', 'durum']);
  }
  if (!fieldToCol['Posta Kodu']) {
    fieldToCol['Posta Kodu'] = _bestFuzzyHeader(headers, ['posta kodu', 'postcode', 'postal', 'zip'], null);
  }
  if (!fieldToCol['Ülke']) {
    fieldToCol['Ülke'] = _bestFuzzyHeader(headers, ['ülke', 'ulke', 'country'], null);
  }
  if (!fieldToCol['Açıklama']) {
    fieldToCol['Açıklama'] = _bestFuzzyHeader(headers, ['description', 'açıklama', 'about', 'hakkında'], ['vergi']);
  }
  if (!fieldToCol['Çalışan']) {
    fieldToCol['Çalışan'] = _bestFuzzyHeader(headers, ['employee', 'çalışan', 'calisan', 'personel'], null);
  }
  if (!fieldToCol['Ciro']) {
    fieldToCol['Ciro'] = _bestFuzzyHeader(headers, ['revenue', 'ciro', 'gelir', 'turnover'], null);
  }
  if (!fieldToCol['SIC']) {
    fieldToCol['SIC'] = _bestFuzzyHeader(headers, ['sic'], null);
  }
  if (!fieldToCol['NAICS']) {
    fieldToCol['NAICS'] = _bestFuzzyHeader(headers, ['naics'], null);
  }
  if (!fieldToCol['LinkedIn']) {
    fieldToCol['LinkedIn'] = _bestFuzzyHeader(headers, ['linkedin'], null);
  }
  if (!fieldToCol['Facebook']) {
    fieldToCol['Facebook'] = _bestFuzzyHeader(headers, ['facebook', ' fb '], null);
  }
  if (!fieldToCol['Instagram']) {
    fieldToCol['Instagram'] = _bestFuzzyHeader(headers, ['instagram', ' ig '], null);
  }
  if (!fieldToCol['Twitter']) {
    fieldToCol['Twitter'] = _bestFuzzyHeader(headers, ['twitter', ' x '], null);
  }
  if (!fieldToCol['YouTube']) {
    fieldToCol['YouTube'] = _bestFuzzyHeader(headers, ['youtube'], null);
  }
  if (!fieldToCol['Soyadı']) {
    fieldToCol['Soyadı'] = _bestFuzzyHeader(headers, ['last name', 'soyad', 'yetkili soyadı'], null);
  }
  if (!fieldToCol['Kişi E-posta']) {
    fieldToCol['Kişi E-posta'] = _bestFuzzyHeader(headers, ['contact email', 'yetkili e-posta', 'kişi e-posta'], null);
  }

  const getField = (row, field) => {
    const col = fieldToCol[field];
    if (!col) return null;
    const v = row[col];
    return (v !== undefined && v !== null && v !== '') ? String(v).trim() : null;
  };
  return { fieldToCol, getField };
}

function companyDupKeyFromRow(row, getField) {
  const name = getField(row, 'Firma');
  const tax  = getField(row, 'Vergi No');
  return {
    name: name ? trLow(name) : null,
    tax:  tax  ? String(tax).replace(/\s+/g,'') : null
  };
}

function calculateCompanyQuality(c) {
  let s = 0;
  if (c.name)       s += 20;
  if (c.city)       s += 15;
  if (c.sector)     s += 10;
  if (c.address)    s += 10;
  if (c.phoneValid) s += 10;
  if (c.email)      s += 10;
  if (c.website)    s += 8;
  if (c.lat && c.lon) s += 7;
  if (c.linkedin || c.facebook || c.instagram || c.twitter || c.youtube) s += 5;
  if (c.description) s += 3;
  if (c.taxNumber)   s += 2;
  return Math.min(s, 100);
}

function calculateContactQuality(c) {
  let s = 0;
  if (c.name)       s += 30;
  if (c.phoneValid) s += 30;
  if (c.email)      s += 20;
  if (c.companyId)  s += 15;
  if (c.title)      s += 5;
  return Math.min(s, 100);
}

function parseAddressForLocation(a) {
  if (!a) return {city:null, district:null};
  const l = trLow(a);
  let city = null, district = null;
  for (const [k,v] of Object.entries(DISTRICTS)) {
    if (l.includes(k)) { city = v; district = DISTRICT_NAMES[k] || k; break; }
  }
  for (const [k,v] of Object.entries(CITIES)) {
    if (l.includes(k)) { if (!city) city = v; break; }
  }
  return {city, district};
}

function detectSector(name, notes) {
  const txt = trLow((name||'') + ' ' + (notes||''));
  let best = null, score = 0;
  for (const [sect, kws] of Object.entries(SECTOR_KEYWORDS)) {
    const s = kws.filter(k => txt.includes(k)).length;
    if (s > score) { score = s; best = sect; }
  }
  return score > 0 ? best : null;
}

function qualityClass(q) { return q >= 80 ? 'high' : q >= 50 ? 'mid' : 'low'; }
function qualityBadgeClass(q) { return q >= 80 ? 'bg-success' : q >= 50 ? 'bg-warning text-dark' : 'bg-danger'; }

function phoneLink(phone, normalized) {
  if (!phone) return '-';
  const href = normalized || phone;
  return `<a href="tel:${href}" class="phone-link">${phone}</a>`;
}
function emailLink(email) {
  if (!email) return '-';
  return `<a href="mailto:${email}">${email}</a>`;
}
function websiteLink(url) {
  if (!url) return '-';
  const href = url.startsWith('http') ? url : 'https://' + url;
  return `<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
}

function toast(msg, type='success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `<i class="bi bi-${type==='success'?'check-circle-fill text-success':type==='error'?'x-circle-fill text-danger':'info-circle-fill text-primary'} me-2"></i>${msg}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLoading(msg='Yükleniyor…') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.add('show');
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }

/* ===================== NAVİGASYON ===================== */
function showPage(name) {
  // 1. Sayfaları gizle / göster
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(name);
  if (pg) { pg.classList.add('active'); } else { console.warn('showPage: bilinmeyen sayfa =', name); return; }

  // 2. Nav aktif durumu
  document.querySelectorAll('[data-page]').forEach(a => a.classList.remove('active'));
  const nav = document.querySelector(`[data-page="${name}"]`);
  if (nav) nav.classList.add('active');

  window.scrollTo(0, 0);

  // 3. Form sıfırla (form sayfaları için)
  if (name === 'add-company') {
    const f = document.getElementById('add-company-form'); if (f) f.reset();
    return;
  }
  if (name === 'add-contact') {
    const f = document.getElementById('add-contact-form'); if (f) f.reset();
    refreshCompanyDatalist().catch(console.error);
    return;
  }

  // 4. İçerik yükle — DB hazır değilse sessizce geç
  if (!db) { console.warn('showPage: DB henüz hazır değil, içerik yüklenemedi'); return; }

  if      (name === 'companies')  loadCompanies().catch(console.error);
  else if (name === 'contacts')   loadContacts().catch(console.error);
  else if (name === 'dashboard')  loadDashboard().catch(console.error);
  else if (name === 'import')     loadImportHistory().catch(console.error);
  else if (name === 'reports')    loadReports().catch(console.error);
  else if (name === 'duplicates') loadDuplicates().catch(console.error);
  else if (name === 'fuarbot')        loadFuarbotPage();
  else if (name === 'fuar-dashboard') loadFuarDashboard();
  else if (name === 'fuar-users')     loadFuarUsers();
  else if (name === 'teklifler')      loadTeklifler();
  else if (name === 'fatura')         loadFatura();
}

function setupEventListeners() {
  // Nav tıklama — inline onclick zaten var, bu ikinci güvence katmanı
  document.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showPage(a.getAttribute('data-page')); });
  });
  // Arama & filtre — null-safe
  const bind = (id, event, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(event, fn); };
  bind('company-search',         'input',  debounce(loadCompanies, 280));
  bind('company-city-filter',    'change', loadCompanies);
  bind('company-sector-filter',  'change', loadCompanies);
  bind('contact-search',         'input',  debounce(loadContacts, 280));
  bind('contact-company-filter', 'change', loadContacts);
  bind('contact-status-filter',  'change', loadContacts);
}

function populateSelects() {
  const sectorEls = ['ac-sector','ec-sector','company-sector-filter'];
  sectorEls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id === 'company-sector-filter';
    if (!isFilter) el.innerHTML = '<option value="">Seçin…</option>';
    Object.keys(SECTOR_KEYWORDS).forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      el.appendChild(o);
    });
  });
  // Şehir filtresi
  const cityEl = document.getElementById('company-city-filter');
  if (cityEl) {
    [...new Set(Object.values(CITIES))].sort().forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      cityEl.appendChild(o);
    });
  }
}

async function refreshCompanyDatalist() {
  const cos = await dbAll('companies');
  const names = cos.map(c => c.name).filter(Boolean).sort();
  ['company-datalist','company-datalist-edit'].forEach(id => {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
  });
}

function autoDetectLocation(formId) {
  const pre = formId === 'add-company' ? 'ac' : 'ec';
  const addr = document.getElementById(`${pre}-address`).value;
  const cityEl = document.getElementById(`${pre}-city`);
  const distEl = document.getElementById(`${pre}-district`);
  if (!addr) return;
  const loc = parseAddressForLocation(addr);
  if (loc.city && !cityEl.value) cityEl.value = loc.city;
  if (loc.district && !distEl.value) distEl.value = loc.district;
}

function clearCompanyFilters() {
  document.getElementById('company-search').value = '';
  document.getElementById('company-city-filter').value = '';
  document.getElementById('company-sector-filter').value = '';
  loadCompanies();
}

function clearContactFilters() {
  document.getElementById('contact-search').value = '';
  document.getElementById('contact-company-filter').value = '';
  document.getElementById('contact-status-filter').value = '';
  loadContacts();
}

/* ===================== FİRMALAR ===================== */
async function loadCompanies() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);

  // Kişi sayısı Map
  const countMap = new Map();
  cons.forEach(cn => { if (cn.companyId) countMap.set(cn.companyId, (countMap.get(cn.companyId)||0)+1); });

  const s  = trLow(document.getElementById('company-search')?.value || '');
  const cf = document.getElementById('company-city-filter')?.value || '';
  const sf = document.getElementById('company-sector-filter')?.value || '';

  let f = cos.filter(c => {
    if (s && !trLow(c.name||'').includes(s) && !trLow(c.city||'').includes(s) && !trLow(c.sector||'').includes(s)) return false;
    if (cf && c.city !== cf) return false;
    if (sf && c.sector !== sf) return false;
    return true;
  });

  // Sıralama
  const { field, asc } = compSort;
  f.sort((a,b) => {
    let av, bv;
    if (field === 'name')     { av = trLow(a.name||''); bv = trLow(b.name||''); }
    else if (field === 'city'){ av = trLow(a.city||''); bv = trLow(b.city||''); }
    else if (field === 'contacts') { av = countMap.get(a.id)||0; bv = countMap.get(b.id)||0; }
    else if (field === 'quality')  { av = a.qualityScore||0; bv = b.qualityScore||0; }
    else { av = trLow(a.name||''); bv = trLow(b.name||''); }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  document.getElementById('company-count').textContent = `(${f.length} firma)`;

  // Kişi filtresi dropdown
  const cs = document.getElementById('contact-company-filter');
  if (cs) {
    const prev = cs.value;
    cs.innerHTML = '<option value="">Tüm Firmalar</option>';
    [...new Set(cos.map(c=>c.name))].sort().forEach(n => {
      const o = document.createElement('option'); o.value = n; o.textContent = n; cs.appendChild(o);
    });
    cs.value = prev;
  }

  const b = document.getElementById('companies-table-body');
  if (f.length === 0) {
    b.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-building"></i>${s||cf||sf?'Arama sonucu bulunamadı':'Henüz firma eklenmedi'}</div></td></tr>`;
    return;
  }

  const frag = document.createDocumentFragment();
  f.forEach(c => {
    const cc = countMap.get(c.id) || 0;
    const q = c.qualityScore || 0;
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="form-check-input" data-id="${c.id}" onchange="toggleCompanyRow(this)"></td>
      <td onclick="showCompanyModal(${c.id})">
        <strong>${esc(c.name)}</strong>
        ${c.sector ? `<span class="badge-sector ms-1">${esc(c.sector)}</span>` : ''}
        ${c.companyType === 'Alt Bayi' ? '<span class="badge ms-1" style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;">Alt Bayi</span>' : ''}
        ${(c.companyType === 'Ana Firma' || c.companyType === 'Ana \u00dcretici') ? '<span class="badge ms-1" style="background:#f0fdf4;color:#15803d;font-size:10px;font-weight:600;">' + esc(c.companyType) + '</span>' : ''}
      </td>
      <td onclick="showCompanyModal(${c.id})">${esc(c.city||'-')}${c.district?' / '+esc(c.district):''}</td>
      <td onclick="showCompanyModal(${c.id})">${cc}</td>
      <td onclick="showCompanyModal(${c.id})">
        <div class="d-flex align-items-center gap-1">
          <div class="quality-bar flex-grow-1"><div class="fill ${qualityClass(q)}" style="width:${q}%"></div></div>
          <small style="font-size:11px;color:#9ca3af;">${q}</small>
        </div>
      </td>
      <td><button class="icon-btn" onclick="showCompanyModal(${c.id})" title="Görüntüle"><i class="bi bi-eye"></i></button></td>`;
    frag.appendChild(tr);
  });
  b.innerHTML = '';
  b.appendChild(frag);
}

function sortCompanies(field) {
  if (compSort.field === field) compSort.asc = !compSort.asc;
  else { compSort.field = field; compSort.asc = true; }
  // Simgeleri güncelle
  document.querySelectorAll('[id^="sort-companies-"]').forEach(el => { el.textContent = '↕'; el.classList.remove('active'); });
  const ico = document.getElementById(`sort-companies-${field}`);
  if (ico) { ico.textContent = compSort.asc ? '↑' : '↓'; ico.classList.add('active'); }
  loadCompanies();
}

async function showCompanyModal(id) {
  const [c, cons] = await Promise.all([dbGet('companies', id), dbAll('contacts')]);
  if (!c) return;
  currentModalCompanyId = id;
  const employees = cons.filter(cc => cc.companyId === id);

  document.getElementById('comp-name').textContent = c.name;
  const qb = document.getElementById('comp-quality-badge');
  qb.textContent = `${c.qualityScore||0}%`;
  qb.className = `badge ${qualityBadgeClass(c.qualityScore||0)}`;

  document.getElementById('comp-phone-wrap').innerHTML   = phoneLink(c.phone, c.phoneNormalized);
  document.getElementById('comp-email-wrap').innerHTML   = emailLink(c.email);
  document.getElementById('comp-website-wrap').innerHTML = websiteLink(c.website);
  document.getElementById('comp-sector').textContent    = c.sector || '-';
  document.getElementById('comp-tax').textContent       = c.taxNumber || '-';

  // Faks
  const faxWrap = document.getElementById('comp-fax-wrap');
  if (faxWrap) faxWrap.style.display = c.fax ? '' : 'none';
  const faxEl = document.getElementById('comp-fax');
  if (faxEl) faxEl.textContent = c.fax || '';

  // Vergi Dairesi
  const taxOfficeWrap = document.getElementById('comp-tax-office-wrap');
  if (taxOfficeWrap) taxOfficeWrap.style.display = c.taxOffice ? '' : 'none';
  const taxOfficeEl = document.getElementById('comp-tax-office');
  if (taxOfficeEl) taxOfficeEl.textContent = c.taxOffice || '';

  document.getElementById('comp-address').textContent  = c.address || '-';
  document.getElementById('comp-city').textContent     = c.city || '-';
  document.getElementById('comp-district').textContent = c.district || '-';

  // Mahalle
  const neighWrap = document.getElementById('comp-neighbourhood-wrap');
  const neighEl   = document.getElementById('comp-neighbourhood');
  if (neighWrap && neighEl) {
    if (c.neighbourhood) {
      neighEl.textContent = c.neighbourhood;
      neighWrap.style.display = '';
    } else {
      neighWrap.style.display = 'none';
      neighEl.textContent = '';
    }
  }

  // State / Posta Kodu / Ülke
  const stateWrap = document.getElementById('comp-state-wrap');
  if (stateWrap) { stateWrap.style.display = c.state ? '' : 'none'; }
  const stateEl = document.getElementById('comp-state');
  if (stateEl) stateEl.textContent = c.state || '';
  const postcodeWrap = document.getElementById('comp-postcode-wrap');
  if (postcodeWrap) { postcodeWrap.style.display = c.postcode ? '' : 'none'; }
  const postcodeEl = document.getElementById('comp-postcode');
  if (postcodeEl) postcodeEl.textContent = c.postcode || '';
  const countryWrap = document.getElementById('comp-country-wrap');
  if (countryWrap) { countryWrap.style.display = (c.country && c.country !== 'Türkiye') ? '' : 'none'; }
  const countryEl = document.getElementById('comp-country');
  if (countryEl) countryEl.textContent = c.country || '';

  // Pazarlama Durumu
  const mktStatus = c.marketingStatus || 'Aranacak';
  const mktColors = {
    'Aranacak': 'bg-secondary', 'Arandı': 'bg-info text-dark',
    'Teklifte': 'bg-primary', 'Takipte': 'bg-warning text-dark',
    'Müşteri': 'bg-success', 'Hayır': 'bg-danger'
  };
  const mktBadge = document.getElementById('comp-marketing-status-badge');
  if (mktBadge) {
    mktBadge.textContent = mktStatus;
    mktBadge.className = 'badge fs-6 px-3 py-2 ' + (mktColors[mktStatus] || 'bg-secondary');
  }
  const headerMktBadge = document.getElementById('comp-marketing-badge');
  if (headerMktBadge) {
    headerMktBadge.textContent = mktStatus;
    headerMktBadge.className = 'badge ms-1 ' + (mktColors[mktStatus] || 'bg-secondary');
    headerMktBadge.style.fontSize = '11px';
  }
  const prioBadge = document.getElementById('comp-priority-badge');
  if (prioBadge) {
    if (c.priority && c.priority !== 'Normal') {
      prioBadge.textContent = c.priority;
      prioBadge.className = 'badge ms-1 ' + (c.priority === 'Yüksek' ? 'bg-danger' : c.priority === 'Düşük' ? 'bg-light text-dark' : 'bg-secondary');
      prioBadge.style.display = '';
    } else {
      prioBadge.style.display = 'none';
    }
  }

  // Sosyal Medya
  const socialWrap = document.getElementById('comp-social-wrap');
  const socialLinks = document.getElementById('comp-social-links');
  if (socialWrap && socialLinks) {
    const socials = [
      { key: 'linkedin',  icon: 'bi-linkedin',  label: 'LinkedIn', color: '#0a66c2' },
      { key: 'facebook',  icon: 'bi-facebook',  label: 'Facebook', color: '#1877f2' },
      { key: 'instagram', icon: 'bi-instagram', label: 'Instagram', color: '#e4405f' },
      { key: 'twitter',   icon: 'bi-twitter-x', label: 'Twitter/X', color: '#000' },
      { key: 'youtube',   icon: 'bi-youtube',   label: 'YouTube',  color: '#ff0000' }
    ];
    const socialHtml = socials.filter(s => c[s.key]).map(s => {
      const href = c[s.key].startsWith('http') ? c[s.key] : 'https://' + c[s.key];
      return `<a href="${href}" target="_blank" rel="noopener" class="btn btn-sm" style="background:${s.color};color:#fff;font-size:12px;padding:3px 10px;">
        <i class="bi ${s.icon} me-1"></i>${s.label}</a>`;
    }).join('');
    if (socialHtml) {
      socialLinks.innerHTML = socialHtml;
      socialWrap.style.display = '';
    } else {
      socialWrap.style.display = 'none';
    }
  }

  // İş Metrikleri
  const metricsWrap = document.getElementById('comp-metrics-wrap');
  const hasMetrics = c.revenue || c.employees || c.sic || c.naics;
  if (metricsWrap) metricsWrap.style.display = hasMetrics ? '' : 'none';
  const _showMetricField = (wrapId, elId, val) => {
    const w = document.getElementById(wrapId);
    const e = document.getElementById(elId);
    if (w) w.style.display = val ? '' : 'none';
    if (e) e.textContent = val || '';
  };
  _showMetricField('comp-revenue-wrap',   'comp-revenue',   c.revenue);
  _showMetricField('comp-employees-wrap', 'comp-employees', c.employees ? c.employees.toLocaleString('tr-TR') : null);
  _showMetricField('comp-sic-wrap',       'comp-sic',       c.sic);
  _showMetricField('comp-naics-wrap',     'comp-naics',     c.naics);

  // Açıklama
  const descWrap = document.getElementById('comp-description-wrap');
  const descEl   = document.getElementById('comp-description');
  if (descWrap && descEl) {
    if (c.description) {
      descEl.textContent = c.description;
      descWrap.style.display = '';
    } else {
      descWrap.style.display = 'none';
      descEl.textContent = '';
    }
  }

  // Hiyerarşi bilgisi — varsa göster
  const hierEl = document.getElementById('comp-hierarchy-info');
  if (hierEl) {
    if (c.companyType && c.companyType !== 'Normal') {
      let hierHtml = '<div class="modal-section-title mt-2">Firma Türü</div>';
      const typeColors = {'Ana Firma':'#f0fdf4;color:#15803d', 'Ana Üretici':'#fdf4ff;color:#7c3aed', 'Alt Bayi':'#dbeafe;color:#1d4ed8'};
      const tColor = typeColors[c.companyType] || '#f8fafc;color:#374151';
      hierHtml += '<span class="badge" style="background:' + tColor + ';font-size:12px;font-weight:600;padding:5px 10px;">' + esc(c.companyType) + '</span>';
      if (c.parentCompanyId) {
        hierHtml += '<br><small class="text-muted mt-1 d-block">Bağlı Firma: <span class="badge-company" style="cursor:pointer;" onclick="showCompanyModal(' + c.parentCompanyId + ');bootstrap.Modal.getInstance(document.getElementById(\\\"compModal\\\")).hide();">ID #' + c.parentCompanyId + '</span></small>';
      }
      hierEl.innerHTML = hierHtml;
      hierEl.style.display = '';
    } else {
      hierEl.innerHTML = '';
      hierEl.style.display = 'none';
    }
  }

  // Harita — HER açılışta temizle
  const mapsEl = document.getElementById('comp-maps-links');
  if (c.lat && c.lon) {
    mapsEl.innerHTML = `<small class="text-muted">Harita: </small>
      <a href="https://maps.google.com/?q=${c.lat},${c.lon}" target="_blank" class="me-2">Google Maps</a>
      <a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}" target="_blank" class="me-2">OSM</a>
      <a href="https://maps.apple.com/?ll=${c.lat},${c.lon}" target="_blank">Apple Maps</a>`;
  } else {
    mapsEl.innerHTML = '';
  }

  // Statik harita (enlem/boylam varsa)
  const staticMapEl = document.getElementById('comp-static-map');
  if (c.lat && c.lon) {
    const smUrl = 'https://staticmap.openstreetmap.de/staticmap.php?center=' +
      c.lat + ',' + c.lon + '&zoom=16&size=400x180&markers=' + c.lat + ',' + c.lon + ',red-pushpin';
    staticMapEl.innerHTML = '<a href="https://www.google.com/maps?q=' + c.lat + ',' + c.lon +
      '" target="_blank"><img src="' + smUrl + '" style="width:100%;border-radius:6px;" ' +
      'alt="Harita" onerror="this.parentElement.parentElement.style.display=\'none\'"></a>';
    staticMapEl.style.display = '';
  } else {
    staticMapEl.style.display = 'none';
    staticMapEl.innerHTML = '';
  }

  // Firma fotograflari
  const photoWrap   = document.getElementById('comp-photo-wrap');
  const photoGallery = document.getElementById('comp-photo-gallery');
  const photosStrip  = document.getElementById('comp-photos-strip');
  photoWrap.innerHTML = '';
  if (c.photos && c.photos.length > 0) {
    photoGallery.style.display = '';
    photosStrip.innerHTML = c.photos.map((src, i) =>
      '<img src="' + src + '" alt="Foto ' + (i+1) + '" style="height:120px;border-radius:6px;object-fit:cover;cursor:pointer;" ' +
      'onclick="window.open(this.src)">'
    ).join('');
  } else {
    photoGallery.style.display = 'none';
    photosStrip.innerHTML = '';
  }

  // Notlar
  const notesWrapEl = document.getElementById('comp-notes-wrap');
  const notesEl     = document.getElementById('comp-notes');
  if (notesWrapEl && notesEl) {
    if (c.notes) {
      notesEl.textContent    = c.notes;
      notesWrapEl.style.display = '';
    } else {
      notesWrapEl.style.display = 'none';
      notesEl.textContent    = '';
    }
  }

  document.getElementById('comp-contact-count').textContent = employees.length;
  const cl = document.getElementById('comp-contacts-list');
  if (employees.length === 0) {
    cl.innerHTML = '<p class="text-muted small">Bu firmaya bağlı kişi yok.</p>';
  } else {
    cl.innerHTML = '';
    const frag = document.createDocumentFragment();
    employees.forEach(cc => {
      const d = document.createElement('div');
      d.className = 'contact-row';
      d.innerHTML = `
        <div class="contact-info">
          <strong style="cursor:pointer;" onclick="showContactModal(${cc.id});bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).hide();">${esc(cc.name)}</strong>
          ${cc.title ? `<small class="text-muted ms-1">— ${esc(cc.title)}</small>` : ''}
          <br><small class="text-muted">${cc.phone ? phoneLink(cc.phone, cc.phoneNormalized) : '-'}</small>
        </div>`;
      frag.appendChild(d);
    });
    cl.appendChild(frag);
  }
  // Adres güncelle panelini her açılışta kapat
  document.getElementById('comp-update-panel').style.display = 'none';
  new bootstrap.Modal(document.getElementById('compModal')).show();
}

function editCompanyModal() {
  (async () => {
    const c = await dbGet('companies', currentModalCompanyId);
    if (!c) return;
    document.getElementById('ec-id').value              = c.id;
    document.getElementById('ec-name').value            = c.name || '';
    document.getElementById('ec-sector').value          = c.sector || '';
    document.getElementById('ec-phone').value           = c.phone || '';
    document.getElementById('ec-fax').value             = c.fax || '';
    document.getElementById('ec-email').value           = c.email || '';
    document.getElementById('ec-website').value         = c.website || '';
    document.getElementById('ec-tax').value             = c.taxNumber || '';
    document.getElementById('ec-tax-office').value      = c.taxOffice || '';
    document.getElementById('ec-address').value         = c.address || '';
    document.getElementById('ec-city').value            = c.city || '';
    document.getElementById('ec-district').value        = c.district || '';
    document.getElementById('ec-postcode').value        = c.postcode || '';
    document.getElementById('ec-lat').value             = c.lat || '';
    document.getElementById('ec-lon').value             = c.lon || '';
    document.getElementById('ec-employees').value       = c.employees || '';
    document.getElementById('ec-revenue').value         = c.revenue || '';
    document.getElementById('ec-linkedin').value        = c.linkedin || '';
    document.getElementById('ec-instagram').value       = c.instagram || '';
    document.getElementById('ec-facebook').value        = c.facebook || '';
    document.getElementById('ec-twitter').value         = c.twitter || '';
    document.getElementById('ec-description').value     = c.description || '';
    document.getElementById('ec-notes').value           = c.notes || '';
    const mktEl = document.getElementById('ec-marketing-status');
    if (mktEl) mktEl.value = c.marketingStatus || 'Aranacak';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).hide();
    new bootstrap.Modal(document.getElementById('editCompModal')).show();
  })();
}

function setMarketingStatus(status) {
  (async () => {
    const id = currentModalCompanyId;
    if (!id) return;
    const c = await dbGet('companies', id);
    if (!c) return;
    const updated = Object.assign({}, c, { marketingStatus: status, updatedAt: new Date().toISOString() });
    await dbPut('companies', updated);
    // Update modal badges
    const mktColors = {
      'Aranacak': 'bg-secondary', 'Arandı': 'bg-info text-dark',
      'Teklifte': 'bg-primary', 'Takipte': 'bg-warning text-dark',
      'Müşteri': 'bg-success', 'Hayır': 'bg-danger'
    };
    const cls = 'badge fs-6 px-3 py-2 ' + (mktColors[status] || 'bg-secondary');
    const mktBadge = document.getElementById('comp-marketing-status-badge');
    if (mktBadge) { mktBadge.textContent = status; mktBadge.className = cls; }
    const headerMktBadge = document.getElementById('comp-marketing-badge');
    if (headerMktBadge) {
      headerMktBadge.textContent = status;
      headerMktBadge.className = 'badge ms-1 ' + (mktColors[status] || 'bg-secondary');
    }
    toast('✓ ' + status + ' olarak işaretlendi', 'success');
    // Refresh list in background
    loadCompanies().catch(() => {});
  })();
}

// ── Adres Kontrol Paneli ─────────────────────────────────────────────────────
function toggleUpdatePanel() {
  const panel = document.getElementById('comp-update-panel');
  const visible = panel.style.display !== 'none';
  if (visible) {
    panel.style.display = 'none';
    return;
  }
  // Paneli aç ve mevcut değerleri doldur
  (async () => {
    const c = await dbGet('companies', currentModalCompanyId);
    if (!c) return;

    // Arama linkleri oluştur
    const q   = encodeURIComponent(c.name + (c.city ? ' ' + c.city : ''));
    const qAd = encodeURIComponent((c.name || '') + ' adres telefon');
    const links = [
      { label:'Google',      icon:'bi-google',       url:`https://www.google.com/search?q=${qAd}` },
      { label:'Google Maps', icon:'bi-map-fill',     url:`https://www.google.com/maps/search/${q}` },
      { label:'Yandex',      icon:'bi-search',       url:`https://yandex.com.tr/search/?text=${qAd}` },
      { label:'Yandex Hrt.', icon:'bi-pin-map-fill', url:`https://yandex.com.tr/harita/?text=${q}` },
      { label:'LinkedIn',    icon:'bi-linkedin',     url:`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.name)}` },
      { label:'Şirket Bilgi',icon:'bi-building',     url:`https://www.google.com/search?q=${encodeURIComponent(c.name+' vergi no şirket bilgi')}` },
    ];
    const linksEl = document.getElementById('comp-search-links');
    linksEl.innerHTML = '';
    links.forEach(lk => {
      const a = document.createElement('a');
      a.href   = lk.url;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.className = 'btn btn-outline-secondary btn-sm';
      a.innerHTML = `<i class="bi ${lk.icon} me-1"></i>${esc(lk.label)}`;
      linksEl.appendChild(a);
    });

    // Mevcut değerleri doldur
    document.getElementById('cu-address').value       = c.address       || '';
    document.getElementById('cu-neighbourhood').value = c.neighbourhood  || '';
    document.getElementById('cu-city').value          = c.city          || '';
    document.getElementById('cu-district').value      = c.district      || '';
    document.getElementById('cu-phone').value         = c.phone         || '';
    document.getElementById('cu-email').value         = c.email         || '';
    document.getElementById('cu-website').value       = c.website       || '';
    document.getElementById('cu-lat').value           = c.lat           || '';
    document.getElementById('cu-lon').value           = c.lon           || '';

    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  })();
}

async function saveCompanyContactUpdate() {
  const id = currentModalCompanyId;
  if (!id) return;
  const c = await dbGet('companies', id);
  if (!c) return;

  const address       = document.getElementById('cu-address').value.trim()       || null;
  const neighbourhood = document.getElementById('cu-neighbourhood').value.trim() || null;
  const city          = document.getElementById('cu-city').value.trim()          || null;
  const district      = document.getElementById('cu-district').value.trim()      || null;
  const phone         = document.getElementById('cu-phone').value.trim()         || null;
  const email         = document.getElementById('cu-email').value.trim()         || null;
  const website       = document.getElementById('cu-website').value.trim()       || null;
  const latVal        = parseFloat(document.getElementById('cu-lat').value)      || null;
  const lonVal        = parseFloat(document.getElementById('cu-lon').value)      || null;

  const pd = phone ? normalizePhone(phone) : {valid:false, normalized:null, type:null};

  const updated = {
    ...c,
    address, neighbourhood, city, district,
    phone,
    phoneNormalized: pd.normalized || null,
    phoneValid:      pd.valid,
    phoneType:       pd.type || null,
    email, website,
    lat: latVal !== null ? latVal : (c.lat || null),
    lon: lonVal !== null ? lonVal : (c.lon || null),
    photoUrl: c.photoUrl || null,
    updatedAt: new Date().toISOString()
  };
  updated.qualityScore = calculateCompanyQuality(updated);

  await dbPut('companies', updated);

  // Modalı güncelle (kapamadan)
  document.getElementById('comp-address').textContent  = address  || '-';
  document.getElementById('comp-city').textContent     = city     || '-';
  document.getElementById('comp-district').textContent = district || '-';
  const neighWrap2 = document.getElementById('comp-neighbourhood-wrap');
  const neighEl2   = document.getElementById('comp-neighbourhood');
  if (neighWrap2 && neighEl2) {
    neighEl2.textContent = neighbourhood || '';
    neighWrap2.style.display = neighbourhood ? '' : 'none';
  }
  document.getElementById('comp-phone-wrap').innerHTML = phoneLink(phone, pd.normalized);
  document.getElementById('comp-email-wrap').innerHTML = emailLink(email);
  document.getElementById('comp-website-wrap').innerHTML = websiteLink(website);
  const qb = document.getElementById('comp-quality-badge');
  qb.textContent = `${updated.qualityScore||0}%`;
  qb.className   = `badge ${qualityBadgeClass(updated.qualityScore||0)}`;

  // Paneli kapat
  document.getElementById('comp-update-panel').style.display = 'none';

  toast(`✓ "${updated.name}" güncellendi`, 'success');
}
// ─────────────────────────────────────────────────────────────────────────────

function deleteCompanyModal() {
  (async () => {
    const c    = await dbGet('companies', currentModalCompanyId);
    const cons = await dbAll('contacts');
    const emp  = cons.filter(cc => cc.companyId === currentModalCompanyId);
    if (!confirm(`"${c?.name}" firmasını silmek istiyor musunuz?\n(${emp.length} çalışan da silinecek)`)) return;
    await dbDelete('companies', currentModalCompanyId);
    for (const cc of emp) await dbDelete('contacts', cc.id);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('compModal')).hide();
    toast(`"${c?.name}" firması silindi`);
    await loadCompanies();
  })();
}

async function saveCompany(e) {
  e.preventDefault();
  const ph = document.getElementById('ac-phone').value;
  const pd = normalizePhone(ph);
  const c = buildCompanyObj('ac', null, pd, ph);
  c.createdAt = new Date().toISOString();
  c.qualityScore = calculateCompanyQuality(c);
  await dbAdd('companies', c);
  toast('Firma eklendi');
  showPage('companies');
}

async function saveEditedCompany() {
  const ph = document.getElementById('ec-phone').value;
  const pd = normalizePhone(ph);
  const oldId = parseInt(document.getElementById('ec-id').value);
  const existing = await dbGet('companies', oldId);
  const c = buildCompanyObj('ec', oldId, pd, ph);
  c.createdAt   = existing?.createdAt || new Date().toISOString();
  c.sourceFile  = existing?.sourceFile || null;
  c.qualityScore = calculateCompanyQuality(c);
  await dbPut('companies', c);
  toast('Firma güncellendi');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editCompModal')).hide();
  await loadCompanies();
}

function _getVal(id) {
  const el = document.getElementById(id);
  return el ? (el.value.trim() || null) : null;
}

function buildCompanyObj(pre, id, pd, ph) {
  const o = {
    name:             _getVal(`${pre}-name`) || '',
    sector:           _getVal(`${pre}-sector`),
    phone:            ph || null,
    phoneNormalized:  pd.normalized || null,
    phoneValid:       pd.valid,
    phoneType:        pd.type || null,
    fax:              _getVal(`${pre}-fax`),
    email:            _getVal(`${pre}-email`),
    website:          _getVal(`${pre}-website`),
    taxNumber:        _getVal(`${pre}-tax`),
    taxOffice:        _getVal(`${pre}-tax-office`),
    address:          _getVal(`${pre}-address`),
    city:             _getVal(`${pre}-city`),
    district:         _getVal(`${pre}-district`),
    postcode:         _getVal(`${pre}-postcode`),
    lat:              parseFloat(document.getElementById(`${pre}-lat`)?.value) || null,
    lon:              parseFloat(document.getElementById(`${pre}-lon`)?.value) || null,
    employees:        _getVal(`${pre}-employees`),
    revenue:          _getVal(`${pre}-revenue`),
    linkedin:         _getVal(`${pre}-linkedin`),
    instagram:        _getVal(`${pre}-instagram`),
    facebook:         _getVal(`${pre}-facebook`),
    twitter:          _getVal(`${pre}-twitter`),
    description:      _getVal(`${pre}-description`),
    notes:            _getVal(`${pre}-notes`),
    marketingStatus:  _getVal(`${pre}-marketing-status`) || 'Aranacak',
    country:          'Türkiye',
    updatedAt:        new Date().toISOString(),
    errors:           []
  };
  if (id !== null) o.id = id;
  return o;
}

/* ===================== KİŞİLER ===================== */
async function loadContacts() {
  const [cons, cos] = await Promise.all([dbAll('contacts'), dbAll('companies')]);
  const compMap = new Map(cos.map(c => [c.id, c]));

  const s  = trLow(document.getElementById('contact-search')?.value || '');
  const cf = document.getElementById('contact-company-filter')?.value || '';
  const st = document.getElementById('contact-status-filter')?.value || '';

  let f = cons.filter(c => {
    if (s && !trLow(c.name||'').includes(s) && !trLow(c.title||'').includes(s) && !trLow(c.phone||'').includes(s)) return false;
    const co = compMap.get(c.companyId);
    if (cf && (!co || co.name !== cf)) return false;
    if (st && c.status !== st) return false;
    return true;
  });

  // Sıralama
  const { field, asc } = contSort;
  f.sort((a,b) => {
    let av = field === 'quality' ? (a.qualityScore||0) : trLow(a.name||'');
    let bv = field === 'quality' ? (b.qualityScore||0) : trLow(b.name||'');
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  document.getElementById('contact-count').textContent = `(${f.length} kişi)`;
  const b = document.getElementById('contacts-table-body');

  if (f.length === 0) {
    b.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-people"></i>${s||cf||st?'Arama sonucu bulunamadı':'Henüz kişi eklenmedi'}</div></td></tr>`;
    return;
  }

  const frag = document.createDocumentFragment();
  const statusColors = { 'Aktif':'success', 'Pasif':'secondary', 'Aday':'info' };
  f.forEach(c => {
    const co  = compMap.get(c.companyId);
    const q   = c.qualityScore || 0;
    const sbc = statusColors[c.status] || 'secondary';
    const tr  = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="form-check-input" data-id="${c.id}" onchange="toggleContactRow(this)"></td>
      <td onclick="showContactModal(${c.id})">
        <strong>${esc(c.name)}</strong>
        ${c.title ? `<br><small class="text-muted">${esc(c.title)}</small>` : ''}
      </td>
      <td onclick="showContactModal(${c.id})">${co ? `<span class="badge-company" onclick="event.stopPropagation();showCompanyModal(${co.id})">${esc(co.name)}</span>` : '-'}</td>
      <td onclick="showContactModal(${c.id})">${c.phone ? `<small>${esc(c.phone)}</small>` : '-'}</td>
      <td onclick="showContactModal(${c.id})"><span class="badge bg-${sbc} bg-opacity-10 text-${sbc}" style="font-size:11px;">${c.status||'-'}</span></td>
      <td onclick="showContactModal(${c.id})">
        <div class="d-flex align-items-center gap-1">
          <div class="quality-bar flex-grow-1"><div class="fill ${qualityClass(q)}" style="width:${q}%"></div></div>
          <small style="font-size:11px;color:#9ca3af;">${q}</small>
        </div>
      </td>
      <td><button class="icon-btn" onclick="showContactModal(${c.id})" title="Görüntüle"><i class="bi bi-eye"></i></button></td>`;
    frag.appendChild(tr);
  });
  b.innerHTML = '';
  b.appendChild(frag);
}

function sortContacts(field) {
  if (contSort.field === field) contSort.asc = !contSort.asc;
  else { contSort.field = field; contSort.asc = true; }
  document.querySelectorAll('[id^="sort-contacts-"]').forEach(el => { el.textContent = '↕'; el.classList.remove('active'); });
  const ico = document.getElementById(`sort-contacts-${field}`);
  if (ico) { ico.textContent = contSort.asc ? '↑' : '↓'; ico.classList.add('active'); }
  loadContacts();
}

async function showContactModal(id) {
  const c = await dbGet('contacts', id);
  if (!c) return;
  currentModalContactId = id;
  const co = c.companyId ? await dbGet('companies', c.companyId) : null;

  document.getElementById('cont-name').textContent = c.name;
  const qb = document.getElementById('cont-quality-badge');
  qb.textContent = `${c.qualityScore||0}%`;
  qb.className = `badge ${qualityBadgeClass(c.qualityScore||0)}`;
  document.getElementById('cont-title').textContent = c.title || '-';
  document.getElementById('cont-phone-wrap').innerHTML  = phoneLink(c.phone, c.phoneNormalized);
  document.getElementById('cont-email-wrap').innerHTML  = emailLink(c.email);
  document.getElementById('cont-company-badge').innerHTML = co
    ? `<span class="badge-company" onclick="showCompanyModal(${co.id})">${esc(co.name)}</span>` : '-';
  document.getElementById('cont-status').textContent = c.status || '-';
  document.getElementById('cont-notes').textContent  = c.notes || '-';

  new bootstrap.Modal(document.getElementById('contModal')).show();
}

function editContactModal() {
  (async () => {
    const c  = await dbGet('contacts', currentModalContactId);
    if (!c) return;
    const co = c.companyId ? await dbGet('companies', c.companyId) : null;
    await refreshCompanyDatalist();
    document.getElementById('ect-id').value      = c.id;
    document.getElementById('ect-name').value    = c.name || '';
    document.getElementById('ect-title').value   = c.title || '';
    document.getElementById('ect-phone').value   = c.phone || '';
    document.getElementById('ect-email').value   = c.email || '';
    document.getElementById('ect-company').value = co?.name || '';
    document.getElementById('ect-status').value  = c.status || 'Aktif';
    document.getElementById('ect-notes').value   = c.notes || '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('contModal')).hide();
    new bootstrap.Modal(document.getElementById('editContModal')).show();
  })();
}

function deleteContactModal() {
  (async () => {
    const c = await dbGet('contacts', currentModalContactId);
    if (!c || !confirm(`"${c.name}" kişisini silmek istiyor musunuz?`)) return;
    await dbDelete('contacts', c.id);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('contModal')).hide();
    toast(`"${c.name}" kişisi silindi`);
    await loadContacts();
  })();
}

async function saveContact(e) {
  e.preventDefault();
  const ph = document.getElementById('act-phone').value;
  const pd = normalizePhone(ph);
  const cos = await dbAll('companies');
  const cn = document.getElementById('act-company').value.trim();
  const cid = cn ? (cos.find(c => trLow(c.name) === trLow(cn))?.id || null) : null;
  const c = buildContactObj('act', null, pd, ph, cid);
  c.createdAt = new Date().toISOString();
  c.qualityScore = calculateContactQuality(c);
  await dbAdd('contacts', c);
  toast('Kişi eklendi');
  showPage('contacts');
}

async function saveEditedContact() {
  const ph = document.getElementById('ect-phone').value;
  const pd = normalizePhone(ph);
  const cos = await dbAll('companies');
  const cn = document.getElementById('ect-company').value.trim();
  const cid = cn ? (cos.find(c => trLow(c.name) === trLow(cn))?.id || null) : null;
  const oldId = parseInt(document.getElementById('ect-id').value);
  const existing = await dbGet('contacts', oldId);
  const c = buildContactObj('ect', oldId, pd, ph, cid);
  c.createdAt  = existing?.createdAt || new Date().toISOString();
  c.sourceFile = existing?.sourceFile || null;
  c.qualityScore = calculateContactQuality(c);
  await dbPut('contacts', c);
  toast('Kişi güncellendi');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editContModal')).hide();
  await loadContacts();
}

function buildContactObj(pre, id, pd, ph, cid) {
  const o = {
    companyId:       cid || null,
    name:            document.getElementById(`${pre}-name`).value.trim(),
    title:           document.getElementById(`${pre}-title`).value.trim() || null,
    phone:           ph || null,
    phoneNormalized: pd.normalized || null,
    phoneValid:      pd.valid,
    phoneType:       pd.type || null,
    email:           document.getElementById(`${pre}-email`).value.trim() || null,
    notes:           document.getElementById(`${pre}-notes`).value.trim() || null,
    status:          document.getElementById(`${pre}-status`).value || 'Aktif',
    updatedAt:       new Date().toISOString(),
    errors:          []
  };
  if (id !== null) o.id = id;
  return o;
}

/* ===================== TOPLU İŞLEMLER ===================== */
function toggleCompanyRow(cb) { cb.checked ? selectedCompIds.add(+cb.dataset.id) : selectedCompIds.delete(+cb.dataset.id); updateCompanyBulkBar(); }
function toggleCompanySelectAll() { const a=document.getElementById('company-select-all').checked; document.querySelectorAll('#companies-table-body input[type="checkbox"]').forEach(cb=>{cb.checked=a;toggleCompanyRow(cb);}); }
function clearCompanySelection() { selectedCompIds.clear(); document.querySelectorAll('#companies-table-body input[type="checkbox"]').forEach(cb=>cb.checked=false); document.getElementById('company-select-all').checked=false; updateCompanyBulkBar(); }
function updateCompanyBulkBar() { const b=document.getElementById('company-bulk-bar'); b.classList.toggle('show',selectedCompIds.size>0); document.getElementById('company-bulk-count').textContent=`${selectedCompIds.size} firma seçildi`; }
async function bulkDeleteCompanies() {
  if (!confirm(`${selectedCompIds.size} firmayı (ve bağlı kişileri) silmek istiyor musunuz?`)) return;
  showLoading('Siliniyor…');
  const cons = await dbAll('contacts');
  for (const id of selectedCompIds) {
    await dbDelete('companies', id);
    for (const c of cons.filter(cc=>cc.companyId===id)) await dbDelete('contacts',c.id);
  }
  toast(`${selectedCompIds.size} firma silindi`);
  clearCompanySelection();
  hideLoading();
  await loadCompanies();
}

function toggleContactRow(cb) { cb.checked ? selectedContIds.add(+cb.dataset.id) : selectedContIds.delete(+cb.dataset.id); updateContactBulkBar(); }
function toggleContactSelectAll() { const a=document.getElementById('contact-select-all').checked; document.querySelectorAll('#contacts-table-body input[type="checkbox"]').forEach(cb=>{cb.checked=a;toggleContactRow(cb);}); }
function clearContactSelection() { selectedContIds.clear(); document.querySelectorAll('#contacts-table-body input[type="checkbox"]').forEach(cb=>cb.checked=false); document.getElementById('contact-select-all').checked=false; updateContactBulkBar(); }
function updateContactBulkBar() { const b=document.getElementById('contact-bulk-bar'); b.classList.toggle('show',selectedContIds.size>0); document.getElementById('contact-bulk-count').textContent=`${selectedContIds.size} kişi seçildi`; }
async function bulkDeleteContacts() {
  if (!confirm(`${selectedContIds.size} kişiyi silmek istiyor musunuz?`)) return;
  showLoading('Siliniyor…');
  for (const id of selectedContIds) await dbDelete('contacts', id);
  toast(`${selectedContIds.size} kişi silindi`);
  clearContactSelection();
  hideLoading();
  await loadContacts();
}

/* ===================== EXCEL AKTARIM ===================== */
function handleDragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function handleDragLeave()  { document.getElementById('upload-zone').classList.remove('drag-over'); }
function handleDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag-over'); if (e.dataTransfer.files.length) handleFileSelect({target:{files:e.dataTransfer.files}}); }

function handleFileSelect(e) {
  const f = e.target.files[0];
  if (!f) return;
  showLoading('Excel okunuyor…');
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      // cellDates:false + raw:false → en hızlı parse
      const wb = XLSX.read(ev.target.result, {
        type: 'array',
        cellDates: false,
        cellNF: false,
        cellStyles: false,
        sheetRows: 0   // tüm satırlar
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // header:1 sonra object dönüşümü — daha hızlı
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: false });
      importFileData = raw;
      hideLoading();
      const prev = document.getElementById('import-preview');
      document.getElementById('import-preview-msg').textContent =
        `✓ "${f.name}" yüklendi — ${raw.length.toLocaleString('tr-TR')} satır, ${wb.SheetNames.length} sayfa`;
      prev.style.display = 'block';
      if (raw.length > 0) showSmartPreview(Object.keys(raw[0]));
    } catch(err) {
      hideLoading();
      toast('Dosya okunamadı: ' + err.message, 'error');
    }
  };
  reader.onerror = () => { hideLoading(); toast('Dosya okunamadı', 'error'); };
  reader.readAsArrayBuffer(f);
}

const FIELD_TYPES = [
  'Firma','Adı','Soyadı','Unvan','Kişi E-posta',
  'Telefon','E-posta','Website','Faks',
  'Sektör','Açıklama','Çalışan','Ciro','SIC','NAICS',
  'Adres','Şehir','İlçe','State','Posta Kodu','Ülke',
  'Vergi No','Vergi Dairesi',
  'LinkedIn','Facebook','Instagram','Twitter','YouTube',
  'Enlem','Boylam','Notlar','Durum','Atla'
];

function detectColType(col) {
  const l = trLow(col);
  // Uzun/spesifik eşleşmeler önce
  if (l.includes('vergi dairesi') || l.includes('v. dairesi') || l.includes('v dairesi'))        return 'Vergi Dairesi';
  if (l.includes('contact first') || l.includes('first name'))                                    return 'Adı';
  if (l.includes('contact last')  || l.includes('last name'))                                     return 'Soyadı';
  if (l.includes('contact role')  || l === 'role')                                                return 'Unvan';
  if (l.includes('contact email') || l.includes('yetkili e-posta') || l.includes('iletişim e'))  return 'Kişi E-posta';
  if (l.includes('posta kodu') || l.includes('postcode') || l.includes('postal') ||
      l.includes('zip'))                                                                            return 'Posta Kodu';
  if (l.includes('naics'))                                                                         return 'NAICS';
  if (l === 'sic' || l.includes('sic kod') || l.includes('sic code'))                            return 'SIC';
  if (l.includes('linkedin'))                                                                      return 'LinkedIn';
  if (l.includes('facebook') || l === 'fb')                                                       return 'Facebook';
  if (l.includes('nstagram') || l === 'ig')                                                       return 'Instagram';
  if (l === 'x' || l.includes('twitter'))                                                         return 'Twitter';
  if (l.includes('youtube'))                                                                       return 'YouTube';
  if (l.includes('faks') || l.includes('fax'))                                                    return 'Faks';
  if (l.includes('firma') || l.includes('cari') || l.includes('sirket') ||
      l.includes('şirket') || l.includes('company') || l.includes('business') ||
      l.includes('kurum'))                                                                          return 'Firma';
  if (l.includes('calisan') || l.includes('çalışan') || l.includes('employees') ||
      l.includes('personel'))                                                                       return 'Çalışan';
  if (l.includes('ciro') || l.includes('revenue') || l.includes('gelir') ||
      l.includes('turnover'))                                                                       return 'Ciro';
  if (l.includes('description') || l.includes('açıklama') || l.includes('aciklama') ||
      l.includes('about') || l.includes('hakkında'))                                               return 'Açıklama';
  if (l.includes('ulke') || l.includes('ülke') || l.includes('country'))                         return 'Ülke';
  if ((l.includes('state') || l.includes('province') || l.includes('eyalet') ||
       l.includes('region')) && !l.includes('status'))                                             return 'State';
  if (l.includes('yetkili') || l.includes('isim') || l === 'name')                               return 'Adı';
  if (l.includes('pozisyon') || l.includes('gorev') || l.includes('görev') || l === 'title')     return 'Unvan';
  if (l.includes('telefon') || l.includes('phone') || (l.startsWith('tel') && l.length <= 8) ||
      l.includes('gsm') || l.includes('cep'))                                                     return 'Telefon';
  if (l.includes('email') || l.includes('e mail') || l.includes('e-mail') ||
      l.includes('mail') || l === 'e-posta')                                                      return 'E-posta';
  if (l.includes('sektor') || l.includes('sektör') || l.includes('sector') ||
      l.includes('categor') || l.includes('kategori'))                                            return 'Sektör';
  if (l.includes('adres') || l.includes('address') || l.includes('street') ||
      l.includes('sokak') || l.includes('cadde'))                                                 return 'Adres';
  if ((l.includes('sehir') || l.includes('şehir') || l.includes('city') || l === 'il') &&
      !l.includes('ilce') && !l.includes('ilçe'))                                                 return 'Şehir';
  if (l.includes('ilce') || l.includes('ilçe') || l.includes('district'))                        return 'İlçe';
  if (l.includes('enlem') || l === 'lat' || l === 'latitude')                                     return 'Enlem';
  if (l.includes('boylam') || l === 'lon' || l === 'lng' || l === 'longitude')                   return 'Boylam';
  if ((l.includes('vergi') || l.includes('vkn') || l.includes('tckn') || l.includes('tax')) &&
      !l.includes('dairesi'))                                                                      return 'Vergi No';
  if (l.includes('website') || l.includes('web') || l.includes('url') || l.includes('site'))     return 'Website';
  if (l.includes('durum') || l.includes('status'))                                                return 'Durum';
  if (l.includes('not') || l.includes('notes'))                                                   return 'Notlar';
  return 'Atla';
}

function showSmartPreview(cols) {
  // ── 1. Auto-detect initial mapping ────────────────────────────────────────
  const { fieldToCol } = buildStandardFieldAccessor(cols);

  // Invert fieldToCol → colToField (col → CRM field)
  const colToField = {};
  Object.entries(fieldToCol).forEach(function(e) { colToField[e[1]] = e[0]; });

  // Store column order globally (for dropdown onchange index lookup)
  importCols = cols.slice();

  // Build importMapping: col → field (auto-detected or 'Atla')
  importMapping = {};
  cols.forEach(function(col) {
    importMapping[col] = colToField[col] || detectColType(col);
  });

  // ── 2. Build editable mapping table ──────────────────────────────────────
  const sampleRow = importFileData[0] || {};
  const fieldOptions = FIELD_TYPES.map(function(ft) { return { val: ft, label: ft }; });

  const rowsHtml = cols.map(function(col, idx) {
    const cur = importMapping[col];
    const sample = String(sampleRow[col] || '').substring(0, 50);
    const rowClass = cur === 'Firma' ? 'table-success' : (cur === 'Atla' ? '' : '');
    const badge = cur === 'Firma'
      ? '<span class="badge bg-success ms-1" style="font-size:10px;">★ Zorunlu</span>'
      : '';
    const opts = fieldOptions.map(function(o) {
      return '<option value="' + o.val + '"' + (o.val === cur ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
    return '<tr class="' + rowClass + '" id="mrow-' + idx + '">' +
      '<td style="font-weight:600;white-space:nowrap;">' + esc(col) + badge + '</td>' +
      '<td class="text-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(sample) + '">' +
        (sample ? esc(sample) : '<em style="color:#94a3b8;">—</em>') +
      '</td>' +
      '<td><select class="form-select form-select-sm" style="min-width:150px;" ' +
        'data-ci="' + idx + '" onchange="updateImportMapping(+this.dataset.ci, this.value)">' +
        opts + '</select></td>' +
      '</tr>';
  }).join('');

  document.getElementById('smart-mapping-list').innerHTML = rowsHtml;

  // ── 3. Data preview ──────────────────────────────────────────────────────
  const previewFields = ['Firma','Telefon','E-posta','Şehir','İlçe','Sektör','Vergi No']
    .filter(function(f) { return fieldToCol[f]; }).slice(0, 6);
  let tbl = '<table class="table table-sm mb-0"><thead><tr>';
  previewFields.forEach(function(f) { tbl += '<th style="white-space:nowrap;">' + esc(f) + '</th>'; });
  tbl += '</tr></thead><tbody>';
  importFileData.slice(0, 5).forEach(function(row) {
    tbl += '<tr>';
    previewFields.forEach(function(f) {
      const v = String(fieldToCol[f] ? (row[fieldToCol[f]] || '') : '');
      tbl += '<td title="' + esc(v) + '" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(v.substring(0,34)) + '</td>';
    });
    tbl += '</tr>';
  });
  tbl += '</tbody></table>';
  if (importFileData.length > 5) {
    tbl += '<p class="text-muted mt-1 mb-0" style="font-size:11px;">… ve ' + (importFileData.length - 5).toLocaleString('tr-TR') + ' satır daha</p>';
  }
  document.getElementById('smart-data-preview').innerHTML = tbl;

  // ── 4. Row count badge ───────────────────────────────────────────────────
  const rcEl = document.getElementById('import-row-count');
  if (rcEl) rcEl.textContent = importFileData.length.toLocaleString('tr-TR') + ' satır';

  document.getElementById('smart-preview-ui').style.display = 'block';
  document.getElementById('duplicate-review-ui').style.display = 'none';
  updateImportButtonState();
}

function updateImportMapping(colIdx, field) {
  const col = importCols[colIdx];
  if (col === undefined) return;
  importMapping[col] = field;
  // Update row styling
  const row = document.getElementById('mrow-' + colIdx);
  if (row) {
    row.className = field === 'Firma' ? 'table-success' : '';
    // Update/remove the "★ Zorunlu" badge in that row
    const td = row.querySelector('td:first-child');
    if (td) {
      // Remove old badge
      const oldBadge = td.querySelector('.badge');
      if (oldBadge) oldBadge.remove();
      if (field === 'Firma') {
        const b = document.createElement('span');
        b.className = 'badge bg-success ms-1';
        b.style.fontSize = '10px';
        b.textContent = '★ Zorunlu';
        td.appendChild(b);
      }
    }
  }
  updateImportButtonState();
}

function updateImportButtonState() {
  const firmaMapped = Object.values(importMapping).includes('Firma');
  const btn  = document.getElementById('btn-import');
  const warn = document.getElementById('import-firma-warning');
  if (btn)  btn.disabled = !firmaMapped;
  if (warn) warn.style.display = firmaMapped ? 'none' : '';
}

function cancelImport() {
  importFileData = [];
  importMapping = {};
  importCols    = [];
  importDuplicates = [];
  importPendingNonDupes = [];
  importPendingContacts = [];
  document.getElementById('smart-preview-ui').style.display = 'none';
  document.getElementById('duplicate-review-ui').style.display = 'none';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('file-input').value = '';
}

// ─── Helper: build company object from Excel row ───────────────────────────
function buildCompanyFromRow(row, getField, firmAdi, now) {
  const addrVal = getField(row, 'Adres');
  const loc     = parseAddressForLocation(addrVal || '');
  const rawCity = getField(row, 'Şehir');
  const rawDist = getField(row, 'İlçe');
  const rawPh   = getField(row, 'Telefon');
  const pd      = rawPh ? normalizePhone(rawPh) : {valid:false,normalized:null,type:null};

  // Sektör: Excel'den al ya da isimden tespit et
  const rawSector = getField(row, 'Sektör');
  const sectorVal = rawSector || detectSector(firmAdi, getField(row, 'Açıklama') || getField(row, 'Notlar'));

  // Revenue: sayısal değer parse et
  const rawRevenue  = getField(row, 'Ciro');
  const rawEmployees = getField(row, 'Çalışan');

  const co = {
    name:            firmAdi,
    sector:          sectorVal,
    address:         addrVal || null,
    city:            rawCity ? normalizeCity(rawCity) : (loc.city || null),
    district:        rawDist || loc.district || null,
    state:           getField(row, 'State') || null,
    postcode:        getField(row, 'Posta Kodu') || null,
    country:         getField(row, 'Ülke') || 'Türkiye',
    phone:           rawPh || null,
    phoneNormalized: pd.normalized || null,
    phoneValid:      pd.valid,
    phoneType:       pd.type || null,
    email:           getField(row, 'E-posta') || null,
    website:         getField(row, 'Website') || null,
    fax:             getField(row, 'Faks') || null,
    taxNumber:       getField(row, 'Vergi No') || null,
    taxOffice:       getField(row, 'Vergi Dairesi') || null,
    description:     getField(row, 'Açıklama') || null,
    revenue:         rawRevenue || null,
    employees:       rawEmployees ? parseInt(rawEmployees, 10) || rawEmployees : null,
    sic:             getField(row, 'SIC') || null,
    naics:           getField(row, 'NAICS') || null,
    linkedin:        getField(row, 'LinkedIn') || null,
    facebook:        getField(row, 'Facebook') || null,
    instagram:       getField(row, 'Instagram') || null,
    twitter:         getField(row, 'Twitter') || null,
    youtube:         getField(row, 'YouTube') || null,
    lat:             getField(row, 'Enlem')  ? parseFloat(getField(row, 'Enlem'))  : null,
    lon:             getField(row, 'Boylam') ? parseFloat(getField(row, 'Boylam')) : null,
    notes:           getField(row, 'Notlar') || null,
    marketingStatus: 'Aranacak',
    priority:        'Normal',
    companyType:     'Normal',
    parentCompanyId: null,
    qualityScore:    0,
    errors:          [],
    createdAt:       now,
    updatedAt:       now,
    sourceFile:      'Excel İçe Aktarım'
  };
  co.qualityScore = calculateCompanyQuality(co);
  return co;
}

// ─── Step 1: Pre-check — find duplicates ───────────────────────────────────
async function doImportPreCheck() {
  if (!importFileData.length) { toast('\u00d6nce dosya se\u00e7in', 'error'); return; }

  // ── Build fieldToCol from the user's current importMapping (col → field) ──
  const fieldToCol = {};
  Object.entries(importMapping).forEach(function(e) {
    const col = e[0], field = e[1];
    if (field && field !== 'Atla' && !fieldToCol[field]) fieldToCol[field] = col;
  });
  if (!fieldToCol['Firma']) {
    toast('"Firma Adı" alanını eşleştirmeniz gerekiyor. Listede doğru sütunu seçin.', 'error');
    updateImportButtonState();
    return;
  }
  const getField = function(row, field) {
    const col = fieldToCol[field];
    if (!col) return null;
    const v = row[col];
    return (v !== undefined && v !== null && v !== '') ? String(v).trim() : null;
  };

  const totalRows = importFileData.length;
  showLoading('Veriler kontrol ediliyor\u2026');
  await yieldToUI();

  try {

    const nameCache = await dbBuildNameIdMap('companies'); // sadece cari adı üzerinden benzer kayıt kontrolü
    const now = new Date().toISOString();

    const nonDupes   = [];   // new companies (no duplicate)
    const newByKey   = {};   // trLow(name) → nonDupes index
    const duplicates = [];   // {existingId, existingName, newCompData, compKey}
    const dupByKey   = {};   // existingId → duplicates index
    const contactsBuf = [];  // {compKey, isDup, obj}

    for (let i = 0; i < totalRows; i++) {
      if (i > 0 && i % 1000 === 0) {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = i.toLocaleString('tr-TR') + ' / ' + totalRows.toLocaleString('tr-TR') + ' sat\u0131r\u2026';
        await yieldToUI();
      }

      const row     = importFileData[i];
      const firmAdi = getField(row, 'Firma');
      let   compKey = null;

      if (firmAdi) {
        compKey = trLow(firmAdi);
        const dk = companyDupKeyFromRow(row, getField);
        const existingId = (dk.name && nameCache[dk.name]) ? nameCache[dk.name] : null;
        if (existingId) {
          // DUPLICATE — firm already exists in DB
          const grpKey = String(existingId);
          if (!(grpKey in dupByKey)) {
            dupByKey[grpKey] = duplicates.length;
            duplicates.push({
              existingId:   existingId,
              existingName: firmAdi,
              newCompData:  buildCompanyFromRow(row, getField, firmAdi, now),
              compKey,
              match: 'name'
            });
          }
        } else if (!(compKey in newByKey)) {
          newByKey[compKey] = nonDupes.length;
          nonDupes.push(buildCompanyFromRow(row, getField, firmAdi, now));
        }
      }

      const kisiAd     = getField(row, 'Adı');
      const kisiSoyad  = getField(row, 'Soyadı');
      const kisiAdi    = kisiAd && kisiSoyad ? kisiAd + ' ' + kisiSoyad : (kisiAd || kisiSoyad);
      if (kisiAdi) {
        const kisiTel = getField(row, 'Telefon');
        const pd2 = kisiTel ? normalizePhone(kisiTel) : {valid:false,normalized:null,type:null};
        contactsBuf.push({
          compKey,
          isDup: false,
          obj: {
            companyId:       null,
            name:            kisiAdi || '(İsimsiz)',
            title:           getField(row, 'Unvan') || null,
            phone:           kisiTel || null,
            phoneNormalized: pd2.normalized || null,
            phoneValid:      pd2.valid,
            phoneType:       pd2.type || null,
            email:           getField(row, 'Kişi E-posta') || getField(row, 'E-posta') || null,
            notes:           getField(row, 'Notlar') || null,
            status:          getField(row, 'Durum') || 'Aktif',
            qualityScore:    0,
            errors:          [],
            createdAt:       now,
            updatedAt:       now,
            sourceFile:      'Excel İçe Aktarım'
          }
        });
      }
    }

    hideLoading();
    importDuplicates      = duplicates;
    importPendingNonDupes = nonDupes;
    importPendingContacts = contactsBuf;

    if (duplicates.length > 0) {
      showDuplicateReview(duplicates, nonDupes.length, contactsBuf.length);
    } else {
      await executeImport(nonDupes, [], contactsBuf);
    }
  } catch (err) {
    hideLoading();
    console.error('Import \u00f6n kontrol hatas\u0131:', err);
    toast('Hata: ' + (err.message || String(err)), 'error');
  }
}

// ─── Step 2: Show duplicate review screen ──────────────────────────────────
function showDuplicateReview(duplicates, nonDupeCount, contactCount) {
  let html = '<div class="table-responsive">';
  html += '<table class="table" style="font-size:13px;">';
  html += '<thead><tr>';
  html += '<th>Yeni Kay\u0131t</th>';
  html += '<th>Mevcut Kay\u0131t</th>';
  html += '<th style="min-width:320px;">Yap\u0131lacak \u0130\u015flem</th>';
  html += '</tr></thead><tbody>';

  duplicates.forEach(function(dup, i) {
    const d = dup.newCompData;
    const info = [d.city, d.phone].filter(Boolean).join(' \u2022 ');
    html += '<tr>';
    html += '<td><strong>' + esc(dup.existingName) + '</strong>';
    if (info) html += '<br><small class="text-muted">' + esc(info) + '</small>';
    html += '</td>';
    html += '<td><span class="badge-company" style="cursor:pointer;" onclick="showCompanyModal(' + dup.existingId + ')">' + esc(dup.existingName) + '</span>';
    html += '<br><small class="text-muted">ID #' + dup.existingId + '</small></td>';
    html += '<td><div class="d-flex flex-wrap gap-1">';
    const opts = [
      {v:'sub',    cls:'primary',   lbl:'Alt Bayi Kaydet'},
      {v:'parent', cls:'purple',    lbl:'Ana Firma/\u00dcretici'},
      {v:'update', cls:'success',   lbl:'Bilgileri G\u00fcncelle'},
      {v:'new',    cls:'secondary', lbl:'Yeni Kay\u0131t'},
      {v:'skip',   cls:'warning',   lbl:'Atla'}
    ];
    opts.forEach(function(o) {
      const chk = (o.v === 'sub') ? ' checked' : '';
      const style = o.cls === 'purple' ? ' style="background:#7c3aed!important;"' : '';
      html += '<label style="cursor:pointer;"><input type="radio" name="dup_' + i + '" value="' + o.v + '"' + chk + '> ';
      html += '<span class="badge bg-' + o.cls + '"' + style + '>' + o.lbl + '</span></label>';
    });
    html += '</div></td></tr>';
  });

  html += '</tbody></table></div>';

  const summary = '<div class="alert alert-info py-2 mb-3" style="font-size:13px;">' +
    '<i class="bi bi-info-circle me-1"></i>' +
    '<strong>' + duplicates.length + '</strong> benzer firma \u2022 ' +
    '<strong>' + nonDupeCount + '</strong> yeni firma \u2022 ' +
    '<strong>' + contactCount + '</strong> ki\u015fi aktar\u0131lacak' +
    '</div>';

  document.getElementById('duplicate-review-table').innerHTML = summary + html;
  document.getElementById('smart-preview-ui').style.display = 'none';
  document.getElementById('duplicate-review-ui').style.display = 'block';
}

function setBulkDupAction(action) {
  document.querySelectorAll('#duplicate-review-table input[type="radio"]').forEach(function(r) {
    if (r.value === action) r.checked = true;
  });
}

async function finalizeDuplicatesAndImport() {
  const resolvedDupes = importDuplicates.map(function(dup, i) {
    const checked = document.querySelector('input[name="dup_' + i + '"]:checked');
    return Object.assign({}, dup, { action: checked ? checked.value : 'skip' });
  });
  await executeImport(importPendingNonDupes, resolvedDupes, importPendingContacts);
}

// ─── Step 3: Execute actual DB writes ──────────────────────────────────────
async function executeImport(nonDupeCompanies, resolvedDupes, contactsBuf) {
  showLoading('\u0130\u00e7eri al\u0131n\u0131yor\u2026');
  await yieldToUI();
  const setStatus = txt => { const el = document.getElementById('loading-text'); if (el) el.textContent = txt; };

  try {
    const now = new Date().toISOString();
    const compCache = await dbBuildNameIdMap('companies');

    // 1. Add non-duplicate companies
    setStatus(nonDupeCompanies.length.toLocaleString('tr-TR') + ' yeni firma ekleniyor\u2026');
    await yieldToUI();
    const newIds = await dbAddBatchChunked('companies', nonDupeCompanies);
    nonDupeCompanies.forEach(function(co, i) {
      if (newIds[i] != null) compCache[trLow(co.name)] = newIds[i];
    });

    let updatedCount = 0, subCount = 0, parentCount = 0, newExtraCount = 0, skipCount = 0;

    // 2. Handle each duplicate
    for (const dup of resolvedDupes) {
      if (dup.action === 'skip') { skipCount++; continue; }

      if (dup.action === 'update') {
        const existing = await dbGet('companies', dup.existingId);
        if (existing) {
          const nd = dup.newCompData;
          const updated = Object.assign({}, existing);
          // "Bilgileri güncelle" = Excel'de dolu gelen alanlarla yenile (overwrite)
          const overwrite = (k) => { if (nd[k] !== undefined && nd[k] !== null && nd[k] !== '') updated[k] = nd[k]; };
          ['phone','email','website','fax','address','city','district','state','postcode','country',
           'taxNumber','taxOffice','sector','description','revenue','employees','sic','naics',
           'linkedin','facebook','instagram','twitter','youtube','lat','lon','notes'].forEach(overwrite);
          updated.updatedAt    = now;
          updated.qualityScore = calculateCompanyQuality(updated);
          await dbPut('companies', updated);
          if (dup.compKey) compCache[dup.compKey] = dup.existingId;
          updatedCount++;
        }
      } else if (dup.action === 'sub') {
        // New record = Alt Bayi, linked to existing (parent)
        const co    = Object.assign({}, dup.newCompData, { companyType: 'Alt Bayi', parentCompanyId: dup.existingId });
        const newId = await dbAdd('companies', co);
        if (dup.compKey) compCache[dup.compKey] = newId;
        // Promote existing to Ana Firma if it was Normal
        const existing = await dbGet('companies', dup.existingId);
        if (existing && (!existing.companyType || existing.companyType === 'Normal')) {
          await dbPut('companies', Object.assign({}, existing, { companyType: 'Ana Firma', updatedAt: now }));
        }
        subCount++;
      } else if (dup.action === 'parent') {
        // New record = Ana Firma (parent of existing)
        const co    = Object.assign({}, dup.newCompData, { companyType: 'Ana Firma' });
        const newId = await dbAdd('companies', co);
        if (dup.compKey) compCache[dup.compKey] = newId;
        // Existing becomes Alt Bayi under new parent
        const existing = await dbGet('companies', dup.existingId);
        if (existing) {
          await dbPut('companies', Object.assign({}, existing, { companyType: 'Alt Bayi', parentCompanyId: newId, updatedAt: now }));
        }
        parentCount++;
      } else if (dup.action === 'new') {
        // Completely new separate record
        const newId = await dbAdd('companies', Object.assign({}, dup.newCompData));
        if (dup.compKey) compCache[dup.compKey] = newId;
        newExtraCount++;
      }
    }

    // 3. Assign company IDs to contacts (skip contacts of skipped companies)
    const skippedKeys = new Set(resolvedDupes.filter(d => d.action === 'skip').map(d => d.compKey));
    const contacts = contactsBuf
      .filter(function(item) {
        if (item.compKey && skippedKeys.has(item.compKey)) return false;
        return true;
      })
      .map(function(item) {
        item.obj.companyId    = item.compKey ? (compCache[item.compKey] || null) : null;
        item.obj.qualityScore = calculateContactQuality(item.obj);
        return item.obj;
      });

    setStatus(contacts.length.toLocaleString('tr-TR') + ' ki\u015fi ekleniyor\u2026');
    await yieldToUI();
    await dbAddBatchChunked('contacts', contacts);

    // 4. Save import log
    const fname = (document.getElementById('file-input').value || 'Excel')
      .split(/[\\\/]/).pop().replace(/^C:\\fakepath\\/i, '');
    const totalAdded = nonDupeCompanies.length + subCount + parentCount + newExtraCount;
    await dbAdd('imports', {
      filename:     fname,
      date:         now,
      companyCount: totalAdded,
      contactCount: contacts.length,
      totalRows:    importFileData.length,
      updatedCount, subCount, parentCount, skipCount
    });

    hideLoading();

    let msg = '\u2713 ' + nonDupeCompanies.length + ' yeni firma, ' + contacts.length + ' ki\u015fi aktar\u0131ld\u0131';
    if (updatedCount)   msg += ' \u2022 ' + updatedCount + ' g\u00fcncellendi';
    if (subCount)       msg += ' \u2022 ' + subCount + ' alt bayi eklendi';
    if (parentCount)    msg += ' \u2022 ' + parentCount + ' ana firma eklendi';
    if (newExtraCount)  msg += ' \u2022 ' + newExtraCount + ' yeni kay\u0131t';
    if (skipCount)      msg += ' \u2022 ' + skipCount + ' atland\u0131';
    toast(msg, 'success');
    cancelImport();

  } catch (err) {
    hideLoading();
    console.error('Import hatas\u0131:', err);
    toast('Aktar\u0131m hatas\u0131: ' + (err.message || String(err)), 'error');
    return;
  }

  try {
    await Promise.all([loadCompanies(), loadContacts(), loadImportHistory()]);
  } catch (uiErr) {
    console.warn('Liste yenileme hatas\u0131:', uiErr);
  }
}

async function loadImportHistory() {
  const list = await dbAll('imports');
  const el   = document.getElementById('import-history-list');
  if (!list.length) { el.innerHTML = '<p class="text-muted small">Henüz aktarım yapılmadı.</p>'; return; }
  el.innerHTML = '';
  list.slice(-10).reverse().forEach(imp => {
    const d = document.createElement('div');
    d.className = 'import-history-item';
    d.innerHTML = `<strong>${esc(imp.filename)}</strong> <span class="text-muted small ms-2">${new Date(imp.date).toLocaleDateString('tr-TR')}</span><br>
      <small class="text-muted">${imp.companyCount} firma · ${imp.contactCount} kişi · ${imp.totalRows||'?'} satır</small>`;
    el.appendChild(d);
  });
}

/* ===================== DASHBOARD ===================== */
async function loadDashboard() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);
  document.getElementById('stat-companies').textContent = cos.length;
  document.getElementById('stat-contacts').textContent  = cons.length;
  const aq = cos.length ? Math.round(cos.reduce((a,b) => a + (b.qualityScore||0), 0) / cos.length) : 0;
  document.getElementById('stat-avg-quality').textContent  = aq;
  document.getElementById('stat-high-quality').textContent = cos.filter(c => (c.qualityScore||0) >= 80).length;

  // Şehir grafiği
  const cc = {};
  cos.forEach(c => { if (c.city) cc[c.city] = (cc[c.city]||0)+1; });
  const tc = Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,10);
  if (charts.cities) charts.cities.destroy();
  if (tc.length) {
    charts.cities = new Chart(document.getElementById('chart-cities').getContext('2d'), {
      type:'bar',
      data:{ labels:tc.map(c=>c[0]), datasets:[{label:'Firma',data:tc.map(c=>c[1]),backgroundColor:'#3b82f6',borderRadius:5}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
  }

  // Sektör grafiği
  const sc = {};
  cos.forEach(c => { if (c.sector) sc[c.sector] = (sc[c.sector]||0)+1; });
  if (charts.sector) charts.sector.destroy();
  if (Object.keys(sc).length) {
    charts.sector = new Chart(document.getElementById('chart-sector').getContext('2d'), {
      type:'doughnut',
      data:{ labels:Object.keys(sc), datasets:[{data:Object.values(sc), backgroundColor:['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6']}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}} }
    });
  }

  // Kalite grafiği
  const hc = cos.filter(c=>(c.qualityScore||0)>=80).length;
  const mc = cos.filter(c=>(c.qualityScore||0)>=50&&(c.qualityScore||0)<80).length;
  const lc = cos.filter(c=>(c.qualityScore||0)<50).length;
  if (charts.quality) charts.quality.destroy();
  if (cos.length) {
    charts.quality = new Chart(document.getElementById('chart-quality').getContext('2d'), {
      type:'pie',
      data:{ labels:['Yüksek (80+)','Orta (50-79)','Düşük (<50)'], datasets:[{data:[hc,mc,lc],backgroundColor:['#10b981','#f59e0b','#ef4444']}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
    });
  }
}

/* ===================== RAPORLAR ===================== */
async function loadReports() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);

  const sc = {};
  cos.forEach(c => { if (c.sector) sc[c.sector] = (sc[c.sector]||0)+1; });
  document.getElementById('report-sector-table').innerHTML =
    Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
      `<tr><td>${esc(k)}</td><td class="text-end">${v}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">Veri yok</td></tr>';

  const cc = {};
  cos.forEach(c => { if (c.city) cc[c.city] = (cc[c.city]||0)+1; });
  document.getElementById('report-city-table').innerHTML =
    Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
      `<tr><td>${esc(k)}</td><td class="text-end">${v}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">Veri yok</td></tr>';

  const hc = cos.filter(c=>(c.qualityScore||0)>=80).length;
  const mc = cos.filter(c=>(c.qualityScore||0)>=50&&(c.qualityScore||0)<80).length;
  const lc = cos.filter(c=>(c.qualityScore||0)<50).length;
  const hct = cons.filter(c=>(c.qualityScore||0)>=80).length;
  const mct = cons.filter(c=>(c.qualityScore||0)>=50&&(c.qualityScore||0)<80).length;
  const lct = cons.filter(c=>(c.qualityScore||0)<50).length;
  document.getElementById('report-quality-table').innerHTML =
    `<tr><td>🟢 Yüksek (80+)</td><td class="text-end">${hc}</td><td class="text-end">${hct}</td></tr>
     <tr><td>🟡 Orta (50-79)</td><td class="text-end">${mc}</td><td class="text-end">${mct}</td></tr>
     <tr><td>🔴 Düşük (&lt;50)</td><td class="text-end">${lc}</td><td class="text-end">${lct}</td></tr>`;
}

/* ===================== TEKRAR KAYITLAR ===================== */
async function loadDuplicates() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);

  // Firma adı tekrarları
  const cbn = {};
  cos.forEach(c => { const k = trLow(c.name||''); if (!cbn[k]) cbn[k]=[]; cbn[k].push(c); });
  const dcGroups = Object.values(cbn).filter(g => g.length > 1);
  const cdEl = document.getElementById('duplicate-companies');
  if (!dcGroups.length) {
    cdEl.innerHTML = '<p class="text-muted small">Tekrar eden firma adı bulunamadı.</p>';
  } else {
    cdEl.innerHTML = '';
    dcGroups.forEach(g => {
      const d = document.createElement('div');
      d.className = 'dup-group';
      d.innerHTML = `<strong>${esc(g[0].name)}</strong> <span class="badge bg-danger ms-1">${g.length} kayıt</span><br>` +
        g.map(c => `<small class="text-muted">#${c.id} — ${c.city||'-'} · ${c.phone||'-'}</small>`).join('<br>');
      cdEl.appendChild(d);
    });
  }

  // Telefon tekrarları
  const cbp = {};
  cons.forEach(c => { if (c.phone) { if (!cbp[c.phone]) cbp[c.phone]=[]; cbp[c.phone].push(c); } });
  const dcGroups2 = Object.values(cbp).filter(g => g.length > 1);
  const cd2El = document.getElementById('duplicate-contacts');
  if (!dcGroups2.length) {
    cd2El.innerHTML = '<p class="text-muted small">Tekrar eden telefon numarası bulunamadı.</p>';
  } else {
    cd2El.innerHTML = '';
    dcGroups2.forEach(g => {
      const d = document.createElement('div');
      d.className = 'dup-group';
      d.innerHTML = `<strong>${esc(g[0].phone)}</strong> <span class="badge bg-danger ms-1">${g.length} kayıt</span><br>` +
        g.map(c => `<small class="text-muted">#${c.id} — ${esc(c.name||'-')}</small>`).join('<br>');
      cd2El.appendChild(d);
    });
  }
}

/* ===================== CSV İNDİR ===================== */
async function exportCSV() {
  const [cos, cons] = await Promise.all([dbAll('companies'), dbAll('contacts')]);
  const which = confirm('Firmaları mı (Tamam) yoksa Kişileri mi (İptal) indirmek istiyorsunuz?');
  if (which) {
    const h = ['Firma Adı','Sektör','Telefon','E-posta','Website','Vergi No','Adres','Şehir','İlçe','Enlem','Boylam','Kalite %','Oluşturma'];
    const r = cos.map(c => [c.name,c.sector||'',c.phone||'',c.email||'',c.website||'',c.taxNumber||'',c.address||'',c.city||'',c.district||'',c.lat||'',c.lon||'',c.qualityScore||0,c.createdAt||'']);
    downloadCSV(h, r, 'firmalar.csv');
  } else {
    const compMap = new Map(cos.map(c => [c.id, c]));
    const h = ['Ad Soyad','Unvan','Telefon','E-posta','Firma','Durum','Kalite %'];
    const r = cons.map(c => {
      const co = compMap.get(c.companyId);
      return [c.name,c.title||'',c.phone||'',c.email||'',co?co.name:'',c.status||'',c.qualityScore||0];
    });
    downloadCSV(h, r, 'kisiler.csv');
  }
}

function downloadCSV(headers, rows, filename) {
  const bom = '\uFEFF';
  const csv = bom + [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ===================== YARDIMCI ===================== */
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------- Otomatik Doldur ----------
let _enrichCandidates = [];

// Sunucu (localhost:8765) erisilebilir mi?
async function _serverAvailable() {
  try {
    const r = await fetch('http://localhost:8765/', { method: 'HEAD', signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch (_) { return false; }
}

// Sunucu uzerinden Google araması
async function _searchViaServer(name, city, out) {
  try {
    const r = await fetch('http://localhost:8765/api/enrich-company', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, city }),
      signal:  AbortSignal.timeout(15000)
    });
    if (!r.ok) return;
    const d = await r.json();
    if (d.error) return;
    if (d.address || d.phone || d.city) {
      out.push({
        source:   'Google (Sunucu)',
        priority: 0,
        name,
        address:  d.address  || null,
        city:     d.city     || null,
        district: d.district || null,
        phone:    d.phone    || null,
        website:  d.website  || null,
        lat:      d.lat      || null,
        lon:      d.lon      || null
      });
    }
  } catch(e) { console.warn('[Sunucu]', e.message); }
}


// CORS proxy ile beyazsayfa.com.tr aramasi
async function _searchViaProxy(name, city, out) {
  const proxies = [
    'https://corsproxy.io/?url=',
    'https://api.allorigins.win/raw?url='
  ];
  const target = 'https://www.beyazsayfa.com.tr/search/?' +
    'q=' + encodeURIComponent(name + (city ? ' ' + city : ''));

  for (const proxy of proxies) {
    try {
      const r = await fetch(proxy + encodeURIComponent(target), {
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) continue;
      const html = await r.text();

      // JSON-LD parse
      const jm = html.match(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/i);
      if (jm) {
        try {
          const jld = JSON.parse(jm[1]);
          const items = Array.isArray(jld) ? jld : [jld];
          for (const it of items) {
            const t = String(it['@type']||'').toLowerCase();
            if (!/(business|organization|store|place|company|service)/.test(t)) continue;
            const addr = it.address || {};
            const street = (typeof addr === 'string') ? addr : (addr.streetAddress||'');
            const c    = (typeof addr === 'object') ? (addr.addressLocality||addr.addressRegion||'') : '';
            const full = [street, c].filter(Boolean).join(', ');
            const ph   = String(it.telephone||it.phone||'').replace(/[\s\-\(\)\+\.]/g,'');
            const web  = String(it.url||'');
            if (full || (ph && ph.length >= 10)) {
              out.push({
                source: 'beyazsayfa.com.tr',
                priority: 0, name,
                address:  full   || null,
                city:     c      || city || null,
                district: null,
                phone:    (ph.length >= 10) ? ph : null,
                website:  web    || null,
                lat: null, lon: null
              });
              return;
            }
          }
        } catch(_e) {}
      }

      // Telefon regex fallback
      const pm = html.match(/(?:\+90|0)[\s\-]?\(?[1-9]\d{2}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
      if (pm) {
        const ph = pm[0].replace(/[\s\-\(\)\+\.]/g,'');
        if (ph.length >= 10) {
          out.push({
            source: 'beyazsayfa.com.tr', priority: 0, name,
            address: null, city: city||null, district: null,
            phone: ph, website: null, lat: null, lon: null
          });
          return;
        }
      }
      break;
    } catch(e) { console.warn('[Proxy]', e.message); }
  }
}

// Overpass (OSM) -- sehir bbox ile
const CITY_BBOX = {
  'istanbul':[40.55,27.95,41.35,29.95],'ankara':[39.65,32.35,40.25,33.20],
  'izmir':[37.80,26.70,38.65,27.45],'bursa':[39.75,28.70,40.40,29.60],
  'antalya':[36.60,30.20,37.25,31.20],'kocaeli':[40.48,29.40,40.95,30.60],
  'izmit':[40.48,29.40,40.95,30.60],'adana':[36.80,35.10,37.30,35.90],
  'gaziantep':[36.75,37.00,37.25,37.70],'konya':[37.40,31.90,38.20,32.80],
  'mersin':[36.60,33.50,37.10,34.70],'diyarbakir':[37.70,40.00,38.10,40.40],
  'hatay':[36.10,35.90,37.00,36.70],'manisa':[38.40,27.30,39.00,28.30],
  'kayseri':[38.40,35.20,38.90,35.90],'samsun':[41.10,35.70,41.50,36.50],
  'balikesir':[39.30,26.90,40.00,28.20],'tekirdag':[40.75,26.80,41.20,27.90],
  'denizli':[37.50,28.80,38.20,29.50],'eskisehir':[39.55,30.30,39.90,31.00],
  'sakarya':[40.60,30.20,41.00,30.80],'trabzon':[40.80,39.40,41.15,40.00],
  'malatya':[38.10,37.90,38.50,38.50],'erzurum':[39.80,41.10,40.10,41.60],
  'van':[38.30,43.20,38.60,43.60],'kahramanmaras':[37.40,36.60,37.80,37.10],
  'urfa':[36.90,38.60,37.40,39.00],'sanliurfa':[36.90,38.60,37.40,39.00],
  'aydin':[37.50,27.50,38.10,28.10],'mugla':[36.60,27.90,37.40,29.20],
  'canakkale':[39.80,25.90,40.40,27.10],'edirne':[41.40,26.00,41.90,26.80],
  'yalova':[40.55,29.10,40.80,29.55],'isparta':[37.55,30.40,38.10,31.20],
  'zonguldak':[41.20,31.40,41.65,32.00],'bolu':[40.55,31.40,40.90,31.90],
  'kastamonu':[41.20,33.50,41.60,34.20],'afyon':[38.30,30.30,38.90,30.80],
  'afyonkarahisar':[38.30,30.30,38.90,30.80],'usak':[38.40,29.10,38.80,29.60],
  'elazig':[38.50,39.00,38.90,39.60],'mardin':[37.10,40.40,37.60,41.00],
  'batman':[37.75,41.00,38.10,41.50],'ordu':[40.80,36.90,41.20,37.50],
  'giresun':[40.80,38.20,41.15,38.90],'rize':[40.90,40.40,41.20,41.00],
  'artvin':[41.00,41.50,41.40,42.20]
};

async function _searchOverpass(name, city, out) {
  try {
    const safe = name.replace(/["'\[\]()\{\}\\]/g,'').substring(0,60);
    const k    = trLow(city||'').replace(/\s+/g,'');
    const bbox = CITY_BBOX[k];
    const b    = bbox ? bbox[0]+','+bbox[1]+','+bbox[2]+','+bbox[3] : '36,26,42,45';
    const q    = '[out:json][timeout:12];\n(\n' +
      '  node["name"~"'+safe+'","i"]('+b+');\n' +
      '  way["name"~"'+safe+'","i"]('+b+');\n' +
      ');\nout 6 qt;';
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
      signal: AbortSignal.timeout(14000)
    });
    if (!r.ok) return;
    const d = await r.json();
    for (const el of (d.elements||[])) {
      const t = el.tags||{};
      if (!t.name) continue;
      const aC = t['addr:city']||t['addr:province']||'';
      // addr:district = ilçe, addr:suburb/neighbourhood = mahalle
      const aD = t['addr:district']||t['addr:suburb']||t['addr:neighbourhood']||'';
      const st = [t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ');
      const fa = t['addr:full']||(st?(st+(aC?', '+aC:'')):'');
      const ph = (t.phone||t['contact:phone']||'').replace(/\s/g,'');
      const wb = t.website||t['contact:website']||'';
      const ok = !city||!aC||trLow(aC).includes(trLow(city).substring(0,5))||trLow(city).includes(trLow(aC).substring(0,5));
      out.push({ source:'OpenStreetMap', priority:ok?0:1, name:t.name,
        address:fa||null, city:aC||null, district:aD||null,
        phone:ph||null, website:wb||null, lat:el.lat||null, lon:el.lon||null });
    }
  } catch(e) { console.warn('[Overpass]', e.message); }
}

// Ana fonksiyon
async function enrichCompanyFromGoogle() {
  if (!currentModalCompanyId) return;
  const c = await dbGet('companies', currentModalCompanyId);
  if (!c||!c.name) { toast('Firma adı bulunamadı. Önce bir firmayı açıp "Adres Kontrol" panelinden deneyin.', 'error'); return; }

  const name = c.name.trim();
  const city = (c.city||'').trim();
  _enrichCandidates = [];

  const panel = document.getElementById('enrich-candidates');
  const list  = document.getElementById('enrich-candidates-list');
  if (panel) panel.style.display = 'none';
  if (list)  list.innerHTML = '';

  showLoading('Arama yap\u0131l\u0131yor\u2026');

  const hasSrv = await _serverAvailable();

  if (hasSrv) {
    // Sunucu varsa: Google dogru sonuc verir
    await _searchViaServer(name, city, _enrichCandidates);
  }
  // beyazsayfa.com.tr - CORS proxy (sunucu olmasa da calisir)
  await _searchViaProxy(name, city, _enrichCandidates);
  // OpenStreetMap
  await _searchOverpass(name, city, _enrichCandidates);

  hideLoading();

  // Oncelik sirala, tekrar kaldir
  _enrichCandidates.sort((a,b)=>{
    if (a.priority!==b.priority) return a.priority-b.priority;
    const ord={'Google (Sunucu)':0,'OpenStreetMap':1};
    return (ord[a.source]||9)-(ord[b.source]||9);
  });
  const seen=new Set();
  _enrichCandidates=_enrichCandidates.filter(x=>{
    const k=(x.city||'')+(x.phone||'')+(x.address||'').substring(0,15);
    if(seen.has(k)) return false; seen.add(k); return true;
  });

  if (_enrichCandidates.length===0) {
    // Sonuc yok: Google arama linki goster
    const gq = encodeURIComponent(name + (city ? ' ' + city : '') + ' iletisim adres telefon');
    const gUrl = 'https://www.google.com/search?q=' + gq;
    if (list) {
      list.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border-radius:6px;border:1px solid #ffc107;">'+
        '<b>\u26a0\ufe0f Otomatik sonu\u00e7 bulunamad\u0131.</b><br>'+
        '<small>\u201c'+esc(name)+'\u201d i\u00e7in veritabanlar\u0131nda kay\u0131t yok.</small><br><br>'+
        '<a href="'+gUrl+'" target="_blank" class="btn btn-sm btn-outline-primary">'+
        '\uD83D\uDD0D Google\u2019da A\u00e7 \u2192</a>'+
        '<small class="text-muted ms-2">Buldu\u011funuz bilgileri forma kendiniz girebilirsiniz.</small>'+
        '</div>';
      if (panel) panel.style.display='';
    }
    return;
  }

  list.innerHTML='';
  _enrichCandidates.forEach((cand,idx)=>{
    const srcColor = {'Google (Sunucu)':'#1a73e8','OpenStreetMap':'#198754'}[cand.source]||'#6c757d';
    const warn = cand.priority===1
      ? '<span style="background:#ffc107;color:#000;border-radius:4px;padding:1px 6px;font-size:10px;margin-left:4px;">\u26a0 Farkl\u0131 \u015fehir</span>' : '';
    const lines=[];
    if (cand.city||cand.district)
      lines.push('<b>'+esc(cand.city||'')+(cand.district?' / '+esc(cand.district):'')+'</b>');
    if (cand.address)  lines.push('\uD83D\uDCCD '+esc(cand.address));
    if (cand.phone)    lines.push('\uD83D\uDCDE '+esc(cand.phone));
    if (cand.website)  lines.push('\uD83C\uDF10 '+esc(cand.website));
    const card=document.createElement('div');
    card.style.cssText='cursor:pointer;border:1px solid #dee2e6;border-radius:6px;padding:8px 10px;margin-bottom:6px;background:#fff;';
    card.onmouseover=()=>{card.style.background='#f0f7ff';card.style.borderColor='#0d6efd';};
    card.onmouseout =()=>{card.style.background='#fff';   card.style.borderColor='#dee2e6';};
    card.onclick    =()=>selectEnrichResult(idx);
    card.innerHTML=
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px;margin-bottom:4px;">'+
        '<span style="background:'+srcColor+';color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;">'+esc(cand.source)+'</span>'+
        warn+
        '<span style="font-size:13px;font-weight:600;margin-left:5px;">'+esc(cand.name||name)+'</span>'+
      '</div>'+
      (lines.length
        ? '<div style="font-size:12px;color:#444;line-height:1.8;">'+lines.join('<br>')+'</div>'
        : '<div style="font-size:12px;color:#999;">Adres/iletisim yok</div>')+
      '<div style="text-align:right;margin-top:5px;">'+
        '<button class="btn btn-sm btn-primary" style="font-size:11px;padding:2px 10px;" '+
        'onclick="event.stopPropagation();selectEnrichResult('+idx+')">Bu bilgiyi kullan \u2192</button>'+
      '</div>';
    list.appendChild(card);
  });

  panel.style.display='';
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  const ok=_enrichCandidates.filter(x=>x.priority===0).length;
  toast(ok+' e\u015fle\u015fen sonu\u00e7 bulundu. Do\u011fru olan\u0131 se\u00e7in.','info');
}

function selectEnrichResult(idx) {
  const cand=_enrichCandidates[idx];
  if (!cand) return;
  if (cand.address)  document.getElementById('cu-address').value =cand.address;
  if (cand.city)     document.getElementById('cu-city').value    =cand.city;
  if (cand.district) document.getElementById('cu-district').value=cand.district;
  if (cand.phone)    document.getElementById('cu-phone').value   =cand.phone;
  if (cand.website)  document.getElementById('cu-website').value =cand.website;
  if (cand.lat&&cand.lon&&currentModalCompanyId) {
    dbGet('companies',currentModalCompanyId).then(c=>{
      if(c) dbPut('companies',{...c,lat:cand.lat,lon:cand.lon,updatedAt:new Date().toISOString()});
    });
  }
  const panel=document.getElementById('enrich-candidates');
  if (panel) panel.style.display='none';
  toast('\u2713 Bilgiler forma aktar\u0131ld\u0131. "G\u00fcncelle & Kaydet" butonuna bas\u0131n.','success');
}

// ─── Nominatim adres objesinden il/ilçe/mahalle/sokak ayıklar ─────────────────
function _parseNominatimAddress(a, displayName) {
  // ── İL (city) ──────────────────────────────────────────────────────────────
  // Nominatim TR'de en güvenilir İl alanları: province, state
  // a.city büyükşehir adını taşır (İstanbul, Bursa, Ankara)
  // a.town = ilçe kasabası → İL için KULLANMA, ilçe fallback'inde kullan
  const city =
    a.province        ||   // en güvenilir: Türkiye'de il = province
    a.state           ||   // alternatif il alanı
    a.city            ||   // büyükşehir adı (İstanbul, Bursa, Ankara...)
    a.state_district  ||
    '';

  // ── İLÇE (district) ────────────────────────────────────────────────────────
  // Nominatim TR'de ilçe için olası tüm alanlar (büyükşehir ve taşra):
  // county        = taşra ilçesi (Bursa: Osmangazi, Nilüfer)
  // city_district = büyükşehir ilçesi (İstanbul: Kadıköy, Beşiktaş)
  // borough       = bazı büyükşehirlerde kullanılır
  // district      = alternatif admin alanı
  // municipality  = belediye
  // town          = ilçe kasabası (taşra fallback)
  // KESİNLİKLE suburb/quarter/neighbourhood KULLANMA → bunlar MAHALLE
  const district =
    a.county          ||   // taşra ilçesi (en yaygın TR ilçe alanı)
    a.city_district   ||   // büyükşehir ilçesi
    a.borough         ||   // alternatif büyükşehir ilçesi
    a.district        ||   // alternatif admin alanı
    a.municipality    ||   // belediye
    a.town            ||   // ilçe kasabası (küçük yerleşim fallback)
    '';

  // ── MAHALLE (neighbourhood) ────────────────────────────────────────────────
  // suburb / quarter / neighbourhood = mahalle seviyesi
  // village = köy (mahalle benzeri küçük yerleşim)
  const neighbourhood =
    a.suburb          ||
    a.quarter         ||
    a.neighbourhood   ||
    a.village         ||
    '';

  // ── ADRES (address): Sokak + Kapı No ──────────────────────────────────────
  const street = [a.road, a.house_number].filter(Boolean).join(' ');

  // Tam adres = sokak + mahalle (ilçe veya il DEĞİL)
  const addrParts = [street, neighbourhood].filter(Boolean);
  const address   = addrParts.length
    ? addrParts.join(', ')
    : (displayName || '').replace(/, T[uü]rkiye$/i, '').replace(/, Turkey$/i, '');

  return { city, district, neighbourhood, street, address };
}

// -- Enlem/Boylamdan Ters Kodlama (Nominatim) ---------------------------------
async function reverseGeocodeFromPanel() {
  const lat = parseFloat(document.getElementById('cu-lat').value);
  const lon = parseFloat(document.getElementById('cu-lon').value);
  if (!lat || !lon) {
    toast('Enlem ve Boylam girin (örn. 40.1885 / 29.0610)', 'error');
    return;
  }
  showLoading('Adres sorgulanıyor…');
  try {
    // addressdetails=1 tüm hiyerarşiyi getirir
    // zoom parametresi KULLANMA — address alanlarını etkilemez, sadece display_name'i etkiler
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
      lat + '&lon=' + lon + '&addressdetails=1&accept-language=tr';
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CRM-App/1.0', 'Accept-Language': 'tr' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    hideLoading();
    if (!d || d.error) {
      toast('Bu koordinatlar için adres bulunamadı.', 'error');
      return;
    }

    const a = d.address || {};

    // ── Ham Nominatim alanlarını console'a yaz (diagnoz) ──────────────────────
    const rawKeys = ['road','house_number','suburb','quarter','neighbourhood','village',
      'hamlet','city_district','district','borough','municipality','county',
      'town','city','state_district','state','province','postcode','country'];
    const rawDebug = {};
    rawKeys.forEach(k => { if (a[k]) rawDebug[k] = a[k]; });
    console.log('[ReverseGeo] Ham Nominatim alanları:', JSON.stringify(rawDebug, null, 2));
    console.log('[ReverseGeo] Tüm address objesi:', JSON.stringify(a, null, 2));

    const parsed = _parseNominatimAddress(a, d.display_name);

    // Alanları doldur
    if (parsed.address)       document.getElementById('cu-address').value       = parsed.address;
    const mahEl = document.getElementById('cu-neighbourhood');
    if (mahEl) mahEl.value = parsed.neighbourhood || '';
    if (parsed.city)          document.getElementById('cu-city').value          = parsed.city;
    if (parsed.district)      document.getElementById('cu-district').value      = parsed.district;

    // Sonuç özeti toast
    const info = [];
    if (parsed.city)          info.push('İl: ' + parsed.city);
    if (parsed.district)      info.push('İlçe: ' + parsed.district);
    else {
      // İlçe bulunamadıysa ham alanlarda ne var göster
      const altDistrict = a.county || a.city_district || a.district || a.municipality || a.borough || a.town || '';
      if (altDistrict) info.push('İlçe(?): ' + altDistrict);
      else             info.push('İlçe: —bulunamadı—');
    }
    if (parsed.neighbourhood) info.push('Mahalle: ' + parsed.neighbourhood);
    if (parsed.street)        info.push('Sokak: ' + parsed.street);

    toast('✓ ' + info.join(' · ') + ' | Kontrol edip kaydedin.', 'success');
  } catch(e) {
    hideLoading();
    toast('Adres sorgulanamadı: ' + e.message, 'error');
  }
}

// -- Google Maps Fotograflari (Sunucu gerektirir) ------------------------------
async function fetchCompanyPhotos() {
  if (!currentModalCompanyId) return;
  const c = await dbGet('companies', currentModalCompanyId);
  if (!c) return;

  const gallery = document.getElementById('comp-photo-gallery');
  const strip   = document.getElementById('comp-photos-strip');

  // Sunucu varsa gercek fotograflar al
  const hasSrv = await _serverAvailable();
  if (hasSrv) {
    const btn = document.getElementById('btn-fetch-photos');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Getiriliyor\u2026'; }
    try {
      const r = await fetch('http://localhost:8765/api/place-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: c.name, city: c.city||'', lat: c.lat||null, lon: c.lon||null }),
        signal: AbortSignal.timeout(30000)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d.photos && d.photos.length > 0) {
        const updated = { ...c, photos: d.photos, updatedAt: new Date().toISOString() };
        await dbPut('companies', updated);
        if (gallery && strip) {
          strip.innerHTML = d.photos.map((src, i) =>
            '<img src="' + src + '" alt="Foto ' + (i+1) + '" ' +
            'style="height:120px;border-radius:6px;object-fit:cover;cursor:pointer;flex-shrink:0;" ' +
            'onclick="window.open(this.src)">'
          ).join('');
          gallery.style.display = '';
        }
        toast('\u2713 ' + d.photos.length + ' foto\u011fraf eklendi!', 'success');
        return;
      }
    } catch(e) {
      console.warn('[Photos]', e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-download me-1"></i>Google Maps\u0027tan Getir'; }
    }
  }

  // Sunucu yok veya fotograf bulunamadi: Google Maps embed + link goster
  if (!gallery || !strip) return;
  const q   = encodeURIComponent(c.name + (c.city ? ' ' + c.city : ''));
  const lat = c.lat || '';
  const lon = c.lon || '';
  const mapsUrl = lat && lon
    ? 'https://www.google.com/maps/search/' + q + '/@' + lat + ',' + lon + ',17z'
    : 'https://www.google.com/maps/search/' + q;
  const embedSrc = lat && lon
    ? 'https://maps.google.com/maps?q=' + lat + ',' + lon + '&z=17&output=embed'
    : 'https://maps.google.com/maps?q=' + q + '&output=embed';

  strip.innerHTML =
    '<div style="width:100%;">' +
    '<iframe src="' + embedSrc + '" width="100%" height="250" style="border:0;border-radius:8px;" ' +
    'allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
    '<div class="mt-2 d-flex gap-2">' +
    '<a href="' + mapsUrl + '" target="_blank" class="btn btn-sm btn-outline-primary">' +
    '<i class="bi bi-map-fill me-1"></i>Google Maps\u0027ta Foto\u011fraflar\u0131 G\u00f6r</a>' +
    '</div></div>';
  gallery.style.display = '';
}

