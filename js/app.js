// Entry-Point der App.
// Wird nach erfolgreichem Auth-Check (auth.js → checkAuth()) durch window.appInit() getriggert.
// Aufgaben:
//   1) Inline-Edit-Werte aus Storage in den DOM schreiben (Editor.init())
//   2) Tab-Navigation zwischen den 4 Hauptsektionen verdrahten
//   3) Backup-Buttons im Header verdrahten
//   4) Kreditberechnungen starten (calcInit() → run())
//   5) Umbau-Modul initialisieren

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

function appInit() {
    // 1) Editierbare Werte aus localStorage in die hardcoded Stellen einsetzen
    if (window.Editor) window.Editor.init();

    // 2) Tab-Navigation
    document.querySelectorAll('.dash-nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sec = this.dataset.section || 'overview';
            switchDash(sec, this);
        });
    });

    // 3) Backup-Buttons
    const exportBtn = document.getElementById('btnExport');
    const importBtn = document.getElementById('btnImport');
    const resetBtn  = document.getElementById('btnReset');
    if (exportBtn) exportBtn.addEventListener('click', () => window.Backup.exportAll());
    if (importBtn) importBtn.addEventListener('click', () => window.Backup.triggerImport());
    if (resetBtn)  resetBtn.addEventListener('click', () => window.Backup.resetAll());

    // 4) Kreditberechnungen
    if (typeof window.calcInit === 'function') window.calcInit();

    // 5) Umbau & Maßnahmen
    if (typeof window.umbauInit === 'function') window.umbauInit();
}

window.appInit = appInit;
