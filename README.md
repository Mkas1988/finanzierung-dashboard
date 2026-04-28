# Finanzierung Dashboard

Single-Page-Webapp zur Übersicht der Hausfinanzierung Herbrüggenbusch 39, Essen.

**⚠️ Privates Repository.** Enthält reale Finanzdaten (Adresse, Brutto-Einkommen, Kreditsummen, Passwort-Hash). Nicht öffentlich machen.

## Aufbau

```
index.html              schlanke HTML-Hülle (Tabs, Strukturen, lädt CSS+JS)
css/styles.css          komplettes Stylesheet
js/data-defaults.js     alle Werte als Default-Werkseinstellungen
js/storage.js           localStorage-Wrapper mit Deep-Merge
js/backup.js            JSON Export/Import/Reset
js/editor.js            Inline-Edit-System (Klick auf Wert → Edit)
js/auth.js              SHA-256 Passwortprüfung
js/calc.js              Kreditberechnungen, Charts, Drilldown
js/umbau.js             Maßnahmen-CRUD, Gantt, Kostenrechner
js/gist-sync.js         Auto-Sync der Eingaben in einen privaten GitHub-Gist
js/app.js               Entry-Point, Tab-Navigation
finanzierung-visualisierung.html    Original-Datei als Backup (nicht löschen)
```

## Lokal öffnen

Doppelklick auf `index.html`. Kein Build, kein Server.

## Auto-Sync (GitHub Gist)

Eingaben können automatisch in einen privaten Gist synchronisiert werden, damit sie geräteübergreifend verfügbar sind.

**Setup (einmalig pro Browser):**

1. GitHub Personal Access Token erstellen: https://github.com/settings/tokens
   - Scope: nur `gist` (kein `repo`!)
   - Ablauf: nach Bedarf, z.B. 90 Tage
2. Im Dashboard auf das Sync-Symbol (☁) im Header klicken
3. Token einfügen → "Verbinden"
4. Auf einem zweiten Gerät dasselbe — der bereits existierende Gist wird automatisch erkannt und geladen

Der Token wird **nur lokal im Browser-localStorage** gespeichert, geht nirgendwo anders hin.

## Backup / Wiederherstellen

- **Export**: Header-Button "⬇ Export" → JSON-Datei wird heruntergeladen
- **Import**: Header-Button "⬆ Import" → JSON-Datei auswählen (überschreibt alles)
- **Reset**: Header-Button "↺ Reset" → setzt alle Werte auf die Defaults zurück
