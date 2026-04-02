// Split from app.js — IndexedDB + localStorage database management

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
  const _sync = () => { if (['companies','contacts'].includes(store) && typeof _syncSchedule === 'function') _syncSchedule(); };
  if (dbMode === 'local') {
    const dbObj = _lsRead();
    const id = (dbObj._seq && dbObj._seq[store]) ? dbObj._seq[store] : 1;
    dbObj._seq[store] = id + 1;
    const row = { ...obj, id };
    dbObj[store].push(row);
    _lsWrite(dbObj);
    _sync();
    return Promise.resolve(id);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).add(obj);
    req.onerror = () => x(req.error);
    req.onsuccess = () => { _sync(); r(req.result); };
  });
}
function dbPut(store, obj) {
  const _sync = () => { if (['companies','contacts'].includes(store) && typeof _syncSchedule === 'function') _syncSchedule(); };
  if (dbMode === 'local') {
    const dbObj = _lsRead();
    if (obj.id == null) return dbAdd(store, obj);
    const arr = dbObj[store] || [];
    const idx = arr.findIndex(x => x && x.id === obj.id);
    if (idx >= 0) arr[idx] = { ...obj };
    else arr.push({ ...obj });
    dbObj[store] = arr;
    _lsWrite(dbObj);
    _sync();
    return Promise.resolve(obj.id);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(obj);
    req.onerror = () => x(req.error);
    req.onsuccess = () => { _sync(); r(req.result); };
  });
}
function dbDelete(store, id) {
  const _sync = () => { if (['companies','contacts'].includes(store) && typeof _syncSchedule === 'function') _syncSchedule(); };
  if (dbMode === 'local') {
    const dbObj = _lsRead();
    dbObj[store] = (dbObj[store] || []).filter(x => x && x.id !== id);
    _lsWrite(dbObj);
    _sync();
    return Promise.resolve(true);
  }
  return new Promise((r, x) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    req.onerror = () => x(req.error);
    req.onsuccess = () => { _sync(); r(req.result); };
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
    if (['companies','contacts'].includes(store) && typeof _syncSchedule === 'function') _syncSchedule();
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
    tx.oncomplete = () => {
      if (['companies','contacts'].includes(store) && typeof _syncSchedule === 'function') _syncSchedule();
      resolve(ids);
    };
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
