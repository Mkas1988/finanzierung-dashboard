// Export/Import aller Daten als JSON-Datei.
// Sammelt alle relevanten localStorage-Keys (eigene + Umbau-Bestandskeys) und schreibt eine
// einzige .json-Datei. Der Import überschreibt alle Keys und lädt die Seite neu.

(function() {
    function exportAll() {
        const dump = { version: 1, exportedAt: new Date().toISOString(), data: {} };
        for (const key of window.Storage.ALL_KEYS) {
            const val = localStorage.getItem(key);
            if (val !== null) dump.data[key] = val;
        }
        const json = JSON.stringify(dump, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `finanzierung-backup-${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importAll(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const dump = JSON.parse(e.target.result);
                    if (!dump || !dump.data || typeof dump.data !== 'object') {
                        throw new Error('Ungültiges Backup-Format');
                    }
                    if (!confirm('Achtung: Bestehende Daten werden überschrieben. Fortfahren?')) {
                        return reject(new Error('Abgebrochen'));
                    }
                    for (const key of Object.keys(dump.data)) {
                        localStorage.setItem(key, dump.data[key]);
                    }
                    alert('Import erfolgreich. Die Seite wird neu geladen.');
                    location.reload();
                    resolve();
                } catch (err) {
                    alert('Import fehlgeschlagen: ' + err.message);
                    reject(err);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    function triggerImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = () => {
            if (input.files && input.files[0]) importAll(input.files[0]);
        };
        input.click();
    }

    function resetAll() {
        if (!confirm('Alle gespeicherten Werte zurücksetzen? Die Defaults werden wiederhergestellt. Möchtest du vorher exportieren?')) return;
        for (const key of window.Storage.ALL_KEYS) localStorage.removeItem(key);
        alert('Alle Daten zurückgesetzt. Die Seite wird neu geladen.');
        location.reload();
    }

    window.Backup = { exportAll, importAll, triggerImport, resetAll };
})();
