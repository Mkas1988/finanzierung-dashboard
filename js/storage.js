// Zentraler localStorage-Wrapper.
// Mergt User-Werte (was im Browser gespeichert wurde) über die Defaults aus data-defaults.js.
// Bestehende Storage-Keys aus dem Original (umbau_measures, umbau_categories, umbau_collapsed,
// umbau_gantt_start) bleiben unter ihren Namen erhalten — keine Datenmigration nötig.

(function() {
    const STATE_KEY = 'finanzierung_state_v1';

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (const key in source) {
            if (source[key] === null || source[key] === undefined) continue;
            if (Array.isArray(source[key])) {
                target[key] = deepClone(source[key]);
            } else if (typeof source[key] === 'object') {
                if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    function loadState() {
        const state = deepClone(window.DEFAULTS);
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (raw) {
                const stored = JSON.parse(raw);
                deepMerge(state, stored);
            }
        } catch (e) {
            console.warn('[storage] State konnte nicht geladen werden:', e);
        }
        return state;
    }

    function saveState(state) {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('[storage] State konnte nicht gespeichert werden:', e);
            alert('Speichern fehlgeschlagen: ' + e.message);
        }
    }

    function getByPath(state, path) {
        return path.split('.').reduce((acc, key) => acc?.[key], state);
    }

    function setByPath(state, path, value) {
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((acc, key) => {
            if (!acc[key] || typeof acc[key] !== 'object') acc[key] = {};
            return acc[key];
        }, state);
        target[last] = value;
    }

    function savePath(path, value) {
        const state = loadState();
        setByPath(state, path, value);
        saveState(state);
        return state;
    }

    function resetState() {
        localStorage.removeItem(STATE_KEY);
    }

    // Schlüssel, die zum Backup gehören (alle finanzbezogenen Daten + Umbau-Bestandskeys)
    const ALL_KEYS = [
        STATE_KEY,
        'umbau_measures',
        'umbau_collapsed',
        'umbau_categories',
        'umbau_gantt_start'
    ];

    window.Storage = {
        STATE_KEY,
        ALL_KEYS,
        loadState,
        saveState,
        savePath,
        getByPath,
        setByPath,
        resetState
    };
})();
