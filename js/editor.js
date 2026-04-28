// Generisches Inline-Edit-System.
// HTML-Elemente mit Attribut [data-edit-path="immobilie.propValue"] werden editierbar.
// Klick → Input erscheint → Enter speichert in localStorage und aktualisiert die Anzeige.
// Optional: data-edit-format steuert die Formatierung beim Anzeigen.
//
// Unterstützte Formate:
//   currency       → "225 €"            (Ganzzahl)
//   currency2      → "426,33 €"         (zwei Nachkommastellen)
//   currency-k     → "100.000 €"        (Tausender-Trennzeichen, Ganzzahl)
//   kwh            → "18.157 kWh"
//   m3             → "74 m³"
//   percent        → "11,2 %"
//   percent2       → "3,76 %"
//   number         → reine Zahl
//   text           → Text 1:1

(function() {
    const fmtInt = n => new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(Math.round(n));
    const fmt2 = n => new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
    const fmt1 = n => new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n);

    function format(value, mode) {
        if (value === null || value === undefined) return '–';
        switch (mode) {
            case 'currency':     return fmtInt(value) + ' €';
            case 'currency2':    return fmt2(value) + ' €';
            case 'currency-k':   return fmtInt(value) + ' €';
            case 'kwh':          return fmtInt(value) + ' kWh';
            case 'm3':           return fmtInt(value) + ' m³';
            case 'percent':      return fmt1(value) + ' %';
            case 'percent2':     return fmt2(value) + ' %';
            case 'number':       return String(value);
            case 'text':
            default:             return String(value);
        }
    }

    function parseValue(input, mode) {
        if (mode === 'text' || mode === undefined && isNaN(parseFloat(input))) return input;
        // Deutsches Format: "12.345,67" → "12345.67"
        const cleaned = String(input).replace(/[€%]/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');
        const n = parseFloat(cleaned);
        return Number.isNaN(n) ? input : n;
    }

    function getStateValue(path) {
        if (!window.Storage) return undefined;
        return window.Storage.getByPath(window.Storage.loadState(), path);
    }

    function applyValues() {
        document.querySelectorAll('[data-edit-path]').forEach(el => {
            const path = el.dataset.editPath;
            const mode = el.dataset.editFormat || 'text';
            const value = getStateValue(path);
            if (value === undefined || value === null) return;
            el.textContent = format(value, mode);
        });
    }

    function startEdit(el) {
        if (el.querySelector('.edit-input')) return; // bereits im Edit-Modus
        const path = el.dataset.editPath;
        const mode = el.dataset.editFormat || 'text';
        const stored = getStateValue(path);
        const currentValue = stored !== undefined && stored !== null ? stored : '';

        const input = document.createElement('input');
        input.type = (mode === 'text') ? 'text' : 'text';
        input.className = 'edit-input';
        input.value = (mode === 'text') ? String(currentValue) : (typeof currentValue === 'number' ? String(currentValue).replace('.',',') : String(currentValue));
        input.style.width = Math.max(60, el.offsetWidth) + 'px';

        const oldHTML = el.innerHTML;
        el.innerHTML = '';
        el.appendChild(input);
        input.focus();
        input.select();

        let cancelled = false;
        const commit = () => {
            if (cancelled) return;
            const parsed = parseValue(input.value, mode);
            window.Storage.savePath(path, parsed);
            el.textContent = format(parsed, mode);
            // Re-Render der Berechnungen ist nicht zwingend nötig, weil die Edit-Felder
            // nicht in run() einfließen (run() liest Slider). Falls doch:
            if (typeof window.run === 'function' && el.dataset.editTrigger === 'recalc') {
                window.run();
            }
        };
        const cancel = () => {
            cancelled = true;
            el.innerHTML = oldHTML;
        };

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', () => commit());
    }

    function bind() {
        document.addEventListener('click', e => {
            const el = e.target.closest('[data-edit-path]');
            if (!el) return;
            // Klicks auf Buttons, Links, Sliders weiter durchreichen
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            startEdit(el);
        });
    }

    function init() {
        applyValues();
        bind();
    }

    window.Editor = { init, applyValues, format };
})();
