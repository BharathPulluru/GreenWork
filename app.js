/* ================================================================
   GreenWork — app.js  v8
   ================================================================
   Video storage: Admin uploads MP4/WebM files via admin.html.
   Files are stored as base64 in localStorage per language+module.
   Users watch the native HTML5 player — no YouTube embedding.
   ================================================================ */

/* ── Language definitions ── */
const LANG_INFO = {
  en: { label: 'English',           flag: '🇬🇧' },
  hi: { label: 'हिन्दी (Hindi)',    flag: '🇮🇳' },
  te: { label: 'తెలుగు (Telugu)',   flag: '🏵️'  },
  ta: { label: 'தமிழ் (Tamil)',     flag: '🌺'  },
  kn: { label: 'ಕನ್ನಡ (Kannada)',  flag: '🌸'  },
  mr: { label: 'मराठी (Marathi)',   flag: '🌼'  },
};

/* ── Module definitions ── */
const MODULE_INFO = {
  basics:     { title: 'Organic Farming Basics',    icon: '🌱' },
  compost:    { title: 'Composting Techniques',      icon: '♻️' },
  soil:       { title: 'Soil Health Improvement',    icon: '🌾' },
  fertilizer: { title: 'Natural Fertilizers',        icon: '🌿' },
  pest:       { title: 'Organic Pest Control',       icon: '🐛' },
};

/* ================================================================
   VIDEO STORAGE HELPERS
   Key format: gw_vid_{lang}_{moduleId}
   Value: { name, size, type, base64 }
   ================================================================ */
const VID = {
  _key: (lang, mod) => `gw_vid_${lang}_${mod}`,

  /* Save a video file as base64 */
  save: (lang, mod, file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => {
      try {
        const data = {
          name:   file.name,
          size:   file.size,
          type:   file.type || 'video/mp4',
          base64: e.target.result,   // full data URL
          saved:  new Date().toISOString(),
        };
        localStorage.setItem(VID._key(lang, mod), JSON.stringify(data));
        resolve(data);
      } catch(err) {
        reject(new Error('Storage full or file too large. Try a smaller video file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  }),

  /* Get video data (returns null if not uploaded) */
  get: (lang, mod) => {
    try {
      const raw = localStorage.getItem(VID._key(lang, mod));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  /* Delete a video */
  remove: (lang, mod) => {
    localStorage.removeItem(VID._key(lang, mod));
  },

  /* Check if a video exists for lang+module */
  exists: (lang, mod) => !!VID.get(lang, mod),

  /* Get a blob URL for playback (recreated each session) */
  getBlobUrl: (lang, mod) => {
    const data = VID.get(lang, mod);
    if (!data) return null;
    try {
      const byteStr = atob(data.base64.split(',')[1]);
      const ab      = new ArrayBuffer(byteStr.length);
      const ia      = new Uint8Array(ab);
      for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
      const blob = new Blob([ab], { type: data.type });
      return URL.createObjectURL(blob);
    } catch { return null; }
  },

  /* Format bytes */
  formatSize: bytes => {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1048576).toFixed(1) + ' MB';
  },

  /* List all uploaded videos: returns [{lang, mod, name, size}] */
  listAll: () => {
    const result = [];
    const langs  = Object.keys(LANG_INFO);
    const mods   = Object.keys(MODULE_INFO);
    langs.forEach(lang => mods.forEach(mod => {
      const d = VID.get(lang, mod);
      if (d) result.push({ lang, mod, name: d.name, size: d.size, saved: d.saved });
    }));
    return result;
  },
};

/* ================================================================
   GW — Core data store (localStorage, progress scoped per user)
   ================================================================ */
const GW = {
  get:   k      => { try { return JSON.parse(localStorage.getItem('gw_' + k)); } catch { return null; } },
  set:   (k, v) => localStorage.setItem('gw_' + k, JSON.stringify(v)),
  clear: k      => localStorage.removeItem('gw_' + k),

  /* Progress key scoped to logged-in user's email */
  _pk: () => {
    const u = GW.getUser();
    return u ? 'prog_' + u.email.replace(/[^a-z0-9]/gi,'_') : 'prog_guest';
  },

  getCompleted:     () => GW.get(GW._pk()) || [],
  markComplete:     id  => {
    const a = GW.getCompleted();
    if (!a.includes(id)) { a.push(id); GW.set(GW._pk(), a); }
  },
  isModuleComplete: id  => GW.getCompleted().includes(id),
  completionPct:    ()  => Math.round((GW.getCompleted().length / 5) * 100),
  allComplete:      ()  => GW.getCompleted().length === 5,

  /* Auth */
  isLoggedIn:   () => !!GW.get('user'),
  getUser:      () => GW.get('user') || null,
  login:        u  => GW.set('user', u),
  logout:       () => { GW.clear('user'); window.location.href = 'login.html'; },
  requireLogin: () => {
    if (!GW.isLoggedIn()) { window.location.href = 'login.html'; return false; }
    return true;
  },

  /* Language */
  getUserLang:       () => (GW.getUser() || {}).lang || 'en',
  getLangData:       lang => ({ ...LANG_INFO[lang], ...(LANG_INFO[lang] ? {} : LANG_INFO['en']) }) || LANG_INFO['en'],
  getAvailableLangs: () => Object.entries(LANG_INFO).map(([code, d]) => ({ code, ...d })),
};

/* ── Nav scroll shadow ── */
window.addEventListener('scroll', () => {
  const n = document.querySelector('nav');
  if (n) n.classList.toggle('scrolled', window.scrollY > 10);
});

/* ── Scroll reveal ── */
function initReveal() {
  const obs = new IntersectionObserver(e => {
    e.forEach(x => { if (x.isIntersecting) x.target.classList.add('visible'); });
  }, { threshold: 0.07 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ── Toast ── */
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.classList.remove('show'), 4000);
}

/* ── Update nav based on login state ── */
function updateNavAuth() {
  const loggedIn = GW.isLoggedIn();
  const user     = GW.getUser();
  const $        = id => document.getElementById(id);

  if (loggedIn && user) {
    if ($('navLoginBtn'))  $('navLoginBtn').style.display  = 'none';
    if ($('navRegBtn'))    $('navRegBtn').style.display    = 'none';
    if ($('navDashBtn'))   $('navDashBtn').style.display   = 'inline-flex';
    if ($('navLogoutBtn')) $('navLogoutBtn').style.display = 'inline-flex';
    if ($('navUserInfo')) {
      const lang = LANG_INFO[user.lang || 'en'] || LANG_INFO['en'];
      $('navUserInfo').style.display = 'flex';
      $('navUserInfo').innerHTML = `
        <div onclick="window.location.href='dashboard.html'"
             style="display:flex;align-items:center;gap:8px;padding:5px 14px 5px 7px;
                    background:var(--green-pale);border-radius:50px;cursor:pointer;border:1px solid var(--border);">
          <div style="width:30px;height:30px;border-radius:50%;
                      background:linear-gradient(135deg,var(--green-bright),var(--green-mid));
                      display:flex;align-items:center;justify-content:center;font-size:.9rem;">🧑‍🌾</div>
          <span style="font-size:.82rem;font-weight:600;color:var(--green-dark);
                       max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${user.name.split(' ')[0]}</span>
          <span style="font-size:.75rem;color:var(--text-muted);">${lang.flag}</span>
        </div>`;
    }
  } else {
    if ($('navLoginBtn'))  $('navLoginBtn').style.display  = 'inline-flex';
    if ($('navRegBtn'))    $('navRegBtn').style.display    = 'inline-flex';
    if ($('navDashBtn'))   $('navDashBtn').style.display   = 'none';
    if ($('navLogoutBtn')) $('navLogoutBtn').style.display = 'none';
    if ($('navUserInfo'))  $('navUserInfo').style.display  = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  updateNavAuth();
});
