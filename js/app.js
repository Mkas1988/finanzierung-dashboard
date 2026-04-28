// Entry-Point der App.
// Wird nach erfolgreichem Auth-Check (auth.js → checkAuth()) durch window.appInit() getriggert.
// Aufgaben:
//   1) Falls Gist-Sync verbunden: zuerst Daten vom Gist laden (Pull), dann State refreshen
//   2) Inline-Edit-Werte aus Storage in den DOM schreiben (Editor.init())
//   3) Tab-Navigation zwischen den 4 Hauptsektionen verdrahten
//   4) Backup-Buttons + Sync-Button im Header verdrahten
//   5) Kreditberechnungen starten (calcInit() → run())
//   6) Umbau-Modul initialisieren

function switchDash(section, btn) {
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
    const target = document.getElementById('sec-' + section);
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');
    else {
        const nav = document.querySelector(`.dash-nav-btn[data-section="${section}"]`);
        if (nav) nav.classList.add('active');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchDash = switchDash;

function updateSyncUI() {
    if (!window.GistSync) return;
    const status = window.GistSync.getStatus();
    const label = document.getElementById('syncLabel');
    if (label) label.textContent = status.text;
    const btn = document.getElementById('btnSync');
    if (btn) {
        const colors = {
            off:        'rgba(255,255,255,.18)',
            connecting: '#ffd54f',
            connected:  '#81c784',
            syncing:    '#ffd54f',
            ok:         '#81c784'
        };
        btn.style.background = colors[status.state] || 'rgba(255,255,255,.18)';
        btn.style.color = (status.state === 'connected' || status.state === 'ok') ? '#1a1a1a' : '#fff';
    }
    const overlayConnected = document.getElementById('syncConnected');
    const overlaySetup = document.getElementById('syncSetup');
    if (window.GistSync.isConnected()) {
        if (overlaySetup) overlaySetup.style.display = 'none';
        if (overlayConnected) overlayConnected.style.display = 'block';
        const statusText = document.getElementById('syncStatusText');
        if (statusText) statusText.textContent = 'Status: ' + status.text;
    } else {
        if (overlaySetup) overlaySetup.style.display = 'block';
        if (overlayConnected) overlayConnected.style.display = 'none';
    }
}

function bindSyncUI() {
    const btn = document.getElementById('btnSync');
    if (btn) {
        btn.addEventListener('click', () => {
            updateSyncUI();
            document.getElementById('syncOverlay').classList.add('open');
        });
    }
    const overlay = document.getElementById('syncOverlay');
    if (overlay) {
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
    }
    const connectBtn = document.getElementById('syncConnectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            const tokenInput = document.getElementById('syncToken');
            const errEl = document.getElementById('syncErr');
            errEl.style.display = 'none';
            connectBtn.disabled = true;
            connectBtn.textContent = 'Verbinde…';
            try {
                await window.GistSync.connect(tokenInput.value);
                tokenInput.value = '';
                updateSyncUI();
            } catch (err) {
                errEl.textContent = err.message;
                errEl.style.display = 'block';
            } finally {
                connectBtn.disabled = false;
                connectBtn.textContent = 'Verbinden';
            }
        });
    }
    const pushBtn = document.getElementById('syncPushNowBtn');
    if (pushBtn) {
        pushBtn.addEventListener('click', async () => {
            pushBtn.disabled = true;
            pushBtn.textContent = 'Synchronisiere…';
            await window.GistSync.pushNow();
            pushBtn.disabled = false;
            pushBtn.textContent = 'Jetzt synchronisieren';
            updateSyncUI();
        });
    }
    if (window.GistSync && window.GistSync.onStatusChange) {
        window.GistSync.onStatusChange(updateSyncUI);
    }
}

async function appInit() {
    // 1) Falls Sync aktiv: erst Daten vom Gist holen (überschreibt lokale Werte)
    if (window.GistSync && window.GistSync.isConnected()) {
        try {
            await window.GistSync.pullFromGist();
        } catch (err) {
            console.warn('[app] Gist-Pull fehlgeschlagen:', err);
        }
    }

    // 2) Editierbare Werte aus localStorage in die hardcoded Stellen einsetzen
    if (window.Editor) window.Editor.init();

    // 3) Tab-Navigation
    document.querySelectorAll('.dash-nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sec = this.dataset.section || 'overview';
            switchDash(sec, this);
        });
    });

    // 4) Backup-Buttons + Sync
    const exportBtn = document.getElementById('btnExport');
    const importBtn = document.getElementById('btnImport');
    const resetBtn  = document.getElementById('btnReset');
    if (exportBtn) exportBtn.addEventListener('click', () => window.Backup.exportAll());
    if (importBtn) importBtn.addEventListener('click', () => window.Backup.triggerImport());
    if (resetBtn)  resetBtn.addEventListener('click', () => window.Backup.resetAll());
    bindSyncUI();
    updateSyncUI();

    // 5) Kreditberechnungen
    if (typeof window.calcInit === 'function') window.calcInit();

    // 6) Umbau & Maßnahmen
    if (typeof window.umbauInit === 'function') window.umbauInit();
}

window.appInit = appInit;
