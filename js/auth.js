// Passwortprüfung. Hash bleibt 1:1 aus dem Original (SHA-256). Wird nach erfolgreichem
// Login durch Anzeige von #appContent freigeschaltet und triggert calc.run() + umbau init.

async function checkAuth() {
    const pw = document.getElementById('authPw').value;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    const expected = (window.DEFAULTS && window.DEFAULTS.auth && window.DEFAULTS.auth.sha256Hash)
        || '29dda16d076e42aa41c9cd4be7b64111c4ec2358dac5c6acd47cf8ee22268847';
    if (hash === expected) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        // Nach Login: App initialisieren
        if (typeof window.appInit === 'function') {
            window.appInit();
        }
    } else {
        document.getElementById('authErr').style.display = 'block';
        document.getElementById('authPw').value = '';
        document.getElementById('authPw').focus();
    }
}

window.checkAuth = checkAuth;
