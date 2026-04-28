// Auto-Sync zwischen Geräten via privatem GitHub-Gist.
//
// Funktionsweise:
//   - Beim ersten Setup gibt der Nutzer ein Personal Access Token (Scope: gist) ein.
//   - Token wird NUR im localStorage gespeichert, nirgendwo sonst.
//   - Beim Init wird der zuletzt verwendete Gist geladen und mit dem lokalen State gemerged.
//   - Bei jeder Änderung wird der Gist nach 2 Sekunden Stille gepusht (debounced).
//
// Sicherheit:
//   - Token-Scope ist auf `gist` begrenzt — keine Repo-Zugriffe, keine Org-Daten.
//   - Gist wird als "secret" angelegt (nur über die direkte URL erreichbar).
//   - Auf 401 wird der Token gelöscht und der Nutzer informiert.

(function() {
    const TOKEN_KEY  = 'finanzierung_gist_token';
    const GIST_ID_KEY = 'finanzierung_gist_id';
    const SYNC_TS_KEY = 'finanzierung_gist_lastSync';
    const FILENAME = 'finanzierung-state.json';
    const API = 'https://api.github.com';

    let syncTimer = null;
    let inFlight = false;
    let listeners = [];

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function getGistId() { return localStorage.getItem(GIST_ID_KEY); }
    function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
    function setGistId(id) { localStorage.setItem(GIST_ID_KEY, id); }
    function clearAll() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(GIST_ID_KEY);
        localStorage.removeItem(SYNC_TS_KEY);
        notify();
    }

    function notify() {
        listeners.forEach(fn => { try { fn(getStatus()); } catch(_){} });
    }

    function onStatusChange(fn) { listeners.push(fn); }

    function getStatus() {
        const token = getToken();
        const gistId = getGistId();
        const ts = localStorage.getItem(SYNC_TS_KEY);
        if (!token) return { state: 'off', text: 'Sync aus' };
        if (inFlight) return { state: 'syncing', text: 'synchronisiere…' };
        if (gistId && ts) return { state: 'ok', text: 'synchron · ' + new Date(+ts).toLocaleTimeString('de-DE') };
        if (gistId) return { state: 'connected', text: 'verbunden' };
        return { state: 'connecting', text: 'verbinde…' };
    }

    async function api(path, opts = {}) {
        const token = getToken();
        if (!token) throw new Error('Kein Token gesetzt.');
        const res = await fetch(API + path, {
            ...opts,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                ...(opts.headers || {})
            }
        });
        if (res.status === 401) {
            clearAll();
            throw new Error('Token ungültig. Neu eingeben bitte.');
        }
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`GitHub API ${res.status}: ${text.slice(0,200)}`);
        }
        return res.status === 204 ? null : res.json();
    }

    function snapshotLocalKeys() {
        const data = {};
        for (const key of window.Storage.ALL_KEYS) {
            const val = localStorage.getItem(key);
            if (val !== null) data[key] = val;
        }
        return data;
    }

    function applyRemoteData(remote) {
        if (!remote || typeof remote !== 'object') return;
        for (const key of window.Storage.ALL_KEYS) {
            if (remote[key] !== undefined) {
                localStorage.setItem(key, remote[key]);
            }
        }
    }

    async function findExistingGist() {
        // Sucht über alle Gists des Users nach unserem Filename.
        const list = await api('/gists?per_page=100');
        for (const g of list) {
            if (g.files && g.files[FILENAME]) return g;
        }
        return null;
    }

    async function createGist(payload) {
        const body = {
            description: 'Finanzierung Dashboard State (privat, auto-sync)',
            public: false,
            files: { [FILENAME]: { content: JSON.stringify(payload, null, 2) } }
        };
        return api('/gists', { method: 'POST', body: JSON.stringify(body) });
    }

    async function updateGist(gistId, payload) {
        const body = {
            files: { [FILENAME]: { content: JSON.stringify(payload, null, 2) } }
        };
        return api('/gists/' + gistId, { method: 'PATCH', body: JSON.stringify(body) });
    }

    async function fetchGistData(gistId) {
        const g = await api('/gists/' + gistId);
        const file = g.files && g.files[FILENAME];
        if (!file) return null;
        let content = file.content;
        if (file.truncated && file.raw_url) {
            const raw = await fetch(file.raw_url, { headers: { 'Authorization': 'Bearer ' + getToken() }});
            content = await raw.text();
        }
        try { return JSON.parse(content); } catch(_) { return null; }
    }

    async function pullFromGist() {
        if (!getToken()) return false;
        let gistId = getGistId();
        if (!gistId) {
            const existing = await findExistingGist();
            if (existing) {
                gistId = existing.id;
                setGistId(gistId);
            } else {
                return false;
            }
        }
        const remote = await fetchGistData(gistId);
        if (remote && remote.data) {
            applyRemoteData(remote.data);
            return true;
        }
        return false;
    }

    async function pushNow() {
        if (!getToken()) return;
        if (inFlight) return;
        inFlight = true;
        notify();
        try {
            const payload = {
                version: 1,
                updatedAt: new Date().toISOString(),
                device: navigator.userAgent.slice(0, 80),
                data: snapshotLocalKeys()
            };
            let gistId = getGistId();
            if (!gistId) {
                const created = await createGist(payload);
                setGistId(created.id);
            } else {
                await updateGist(gistId, payload);
            }
            localStorage.setItem(SYNC_TS_KEY, String(Date.now()));
        } catch (err) {
            console.error('[gist-sync] push fehlgeschlagen:', err);
        } finally {
            inFlight = false;
            notify();
        }
    }

    function schedulePush() {
        if (!getToken()) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(pushNow, 2000);
    }

    async function connect(token) {
        token = (token || '').trim();
        if (!token) throw new Error('Token ist leer.');
        setToken(token);
        // Versuche bestehenden Gist zu finden + zu laden, sonst neuen anlegen.
        try {
            const pulled = await pullFromGist();
            notify();
            if (!pulled) {
                await pushNow();
            } else {
                // Lokales State + run() refresh, damit gemergte Werte sichtbar werden
                if (window.Editor) window.Editor.applyValues();
                if (typeof window.run === 'function') window.run();
                if (typeof window.umbauInit === 'function') {
                    // Maßnahmen sind im localStorage, nur das UI re-rendern reicht nicht — Reload triggern
                    location.reload();
                }
            }
            return true;
        } catch (err) {
            // Token war vermutlich ungültig — wurde via api() schon gelöscht
            throw err;
        }
    }

    function disconnect() {
        if (!confirm('Sync trennen? Der Token wird aus diesem Browser entfernt. Der Gist auf GitHub bleibt bestehen.')) return;
        clearAll();
    }

    function isConnected() { return !!getToken(); }

    window.GistSync = {
        connect,
        disconnect,
        pushNow,
        schedulePush,
        pullFromGist,
        getStatus,
        onStatusChange,
        isConnected
    };
})();
