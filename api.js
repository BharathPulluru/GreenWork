/* ================================================================
   GreenWork — api.js
   Frontend API client — connects to the Node.js backend
   ================================================================
   HOW TO USE:
   1. Start your backend server (see greenwork-backend/README.md)
   2. Set API_BASE below to your backend URL
   3. All API calls go through this file
   ================================================================ */

/* ── Backend URL — change this to your deployed server URL ── */
const API_BASE = 'http://localhost:5000/api';
//  Production example: const API_BASE = 'https://greenwork-api.onrender.com/api';

/* ================================================================
   API — Core fetch helper
   ================================================================ */
const API = {

  /* ── Get stored JWT token ── */
  getToken: () => localStorage.getItem('gw_token'),
  setToken: t  => localStorage.setItem('gw_token', t),
  clearToken: () => localStorage.removeItem('gw_token'),

  /* ── Base fetch with auth header ── */
  _fetch: async (endpoint, options = {}) => {
    const token = API.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      const data = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));

      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      // Network error (server down)
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Make sure the backend is running.');
      }
      throw err;
    }
  },

  get:    (url)          => API._fetch(url, { method: 'GET' }),
  post:   (url, body)    => API._fetch(url, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (url, body)    => API._fetch(url, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (url)          => API._fetch(url, { method: 'DELETE' }),
  upload: (url, formData)=> API._fetch(url, { method: 'POST',   body: formData }),

  /* ── Health check ── */
  ping: () => API.get('/health'),

  /* ================================================================
     AUTH
     ================================================================ */
  auth: {
    register: (data) => API.post('/auth/register', data),
    login:    (data) => API.post('/auth/login',    data),
    profile:  ()     => API.get('/auth/profile'),
    update:   (data) => API.put('/auth/profile',   data),
  },

  /* ================================================================
     TRAINING
     ================================================================ */
  training: {
    status:      ()         => API.get('/training/status'),
    markComplete:(moduleId) => API.post('/training/complete', { moduleId }),
    certificate: ()         => API.get('/training/certificate'),
  },

  /* ================================================================
     VIDEOS
     ================================================================ */
  videos: {
    /* Check which modules have videos for a language */
    check:  (lang)               => API.get(`/videos/check/${lang}`),

    /* Stream URL — use as <video src="..."> */
    streamUrl: (lang, moduleId)  => `${API_BASE}/videos/stream/${lang}/${moduleId}`,

    /* Admin: upload a video */
    upload: (lang, moduleId, file) => {
      const fd = new FormData();
      fd.append('video',    file);
      fd.append('lang',     lang);
      fd.append('moduleId', moduleId);
      return API.upload('/videos/upload', fd);
    },

    /* Admin: list all uploaded videos */
    list:   ()                   => API.get('/videos/list'),

    /* Admin: delete a video */
    delete: (lang, moduleId)     => API.delete(`/videos/${lang}/${moduleId}`),
  },

  /* ================================================================
     ADMIN
     ================================================================ */
  admin: {
    stats:          ()                       => API.get('/admin/stats'),
    users:          ()                       => API.get('/admin/users'),
    approveTraining:(userId)                 => API.post('/admin/approve-training', { userId }),
    work:           ()                       => API.get('/admin/work'),
    createWork:     (data)                   => API.post('/admin/work', data),
    assignWork:     (userId, workId)         => API.post('/admin/assign-work', { userId, workId }),
    updatePayment:  (workId, status)         => API.post('/admin/update-payment', { workId, status }),
  },
};

/* ================================================================
   GW_API — Wrapper that keeps GW localStorage in sync with backend
   Replaces localStorage-only GW for pages that need backend sync
   ================================================================ */
const GW_API = {

  /* ── Login: call API, store token + user ── */
  login: async (email, password) => {
    const data = await API.auth.login({ email, password });
    API.setToken(data.token);
    GW.login(data.user);
    // Sync training progress from server
    await GW_API.syncProgress();
    return data;
  },

  /* ── Register: call API, store token + user ── */
  register: async (userData) => {
    const data = await API.auth.register(userData);
    API.setToken(data.token);
    GW.login(data.user);
    return data;
  },

  /* ── Logout ── */
  logout: () => {
    API.clearToken();
    GW.clear('user');
    window.location.href = 'login.html';
  },

  /* ── Sync training progress from server → localStorage ── */
  syncProgress: async () => {
    try {
      const data = await API.training.status();
      // Overwrite local progress with server truth
      const key = 'prog_' + (GW.getUser()?.email || '').replace(/[^a-z0-9]/gi,'_');
      GW.set(key, data.completedModules || []);
    } catch(e) {
      console.warn('Could not sync training progress:', e.message);
    }
  },

  /* ── Mark module complete: call API then update local ── */
  markComplete: async (moduleId) => {
    const data = await API.training.markComplete(moduleId);
    // Sync updated progress to localStorage
    const key = 'prog_' + (GW.getUser()?.email || '').replace(/[^a-z0-9]/gi,'_');
    GW.set(key, data.completedModules || []);
    return data;
  },

  /* ── Check if backend is reachable ── */
  isBackendOnline: async () => {
    try {
      await API.ping();
      return true;
    } catch {
      return false;
    }
  },
};

/* ── Show a connection warning if backend is offline ── */
async function checkBackendConnection() {
  const online = await GW_API.isBackendOnline();
  if (!online) {
    console.warn('⚠️ Backend server is not reachable. Running in offline mode.');
    const banner = document.getElementById('backendOfflineBanner');
    if (banner) banner.style.display = 'flex';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Check backend connection on every page load
  checkBackendConnection();
});
