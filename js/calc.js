// Kreditberechnungen, Charts, Detail-Drilldown.
// Funktionen sind 1:1 aus der Originaldatei finanzierung-visualisierung.html (Z. 1277-2666) übernommen.
// Einzige Erweiterungen:
//   1) loadInputsFromStorage() schreibt persistierte Slider-/Input-Werte vor dem ersten run() in den DOM.
//   2) Bei Slider-Änderung wird der neue Wert zusätzlich in localStorage geschrieben.

const F = n => new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(Math.round(n));
const F2 = n => new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);

const PROP_VALUE = 575000; // Kaufpreis + Modernisierung (Nebenkosten erhöhen nicht den Wert)
const BRUTTO = 130000;

// Grenzsteuersatz bei 130k: 42% ESt + 5.5% Soli auf die ESt = effektiv ~44.31%
// Vereinfacht: 42% + 42%*5.5% = 42% + 2.31% = 44.31%
const MARGINAL_TAX = 0.4431;

// Bundesbank Effektivzins Wohnungsbaukredite 5-10J (aktuell ~3.58%)
const BUNDESBANK_RATE = 3.58;
const BEWERTUNGSABSCHLAG = 0.04; // 4%
const MASSTABSZINS = BUNDESBANK_RATE * (1 - BEWERTUNGSABSCHLAG); // ~3.4368%

// ============================================================
// CALCULATION ENGINE
// ============================================================

function phase1(amt, rateP, monthlyPay, tilgStartM, stPerYear, interestStartM = 1) {
    const mr = rateP / 100 / 12;
    let bal = amt;
    const months = [{ m: 0, bal }];
    let totI = 0, totT = 0, totST = 0;
    for (let m = 1; m <= 120; m++) {
        const interest = m < interestStartM ? 0 : bal * mr;
        let tilg = 0, pay = 0, st = 0;
        if (m >= tilgStartM) {
            pay = monthlyPay;
            tilg = pay - interest;
            if (tilg < 0) tilg = 0;
            if (tilg > bal) { tilg = bal; pay = tilg + interest; }
        } else {
            pay = interest;
        }
        if (stPerYear > 0 && m >= tilgStartM && m % 12 === 8) {
            st = Math.min(stPerYear, bal - tilg);
            if (st < 0) st = 0;
        }
        bal = bal - tilg - st;
        if (bal < 0.5) bal = 0;
        totI += interest; totT += tilg; totST += st;
        months.push({ m, bal, interest, tilg, pay, st });
    }
    return { months, totI, totT, totST, rest: bal };
}

function phase2(startBal, rateP, tilgP) {
    if (startBal <= 0) return { months: [{ m: 0, bal: 0 }], totI: 0, monthlyPay: 0 };
    const mr = rateP / 100 / 12;
    const annuity = startBal * (rateP + tilgP) / 100 / 12;
    let bal = startBal;
    const months = [{ m: 0, bal }];
    let totI = 0;
    for (let m = 1; m <= 360; m++) {
        const interest = bal * mr;
        let tilg = annuity - interest;
        if (tilg < 0) tilg = 0;
        if (tilg > bal) tilg = bal;
        bal -= tilg;
        totI += interest;
        months.push({ m, bal, pay: Math.min(annuity, tilg + interest), interest, tilg });
        if (bal < 1) { bal = 0; break; }
    }
    return { months, totI, monthlyPay: annuity };
}

function calcAGDarlehen(amt, monthlyTilg) {
    let bal = amt;
    const months = [{ m: 0, bal }];
    let totalSteuer = 0;
    for (let m = 1; m <= 420; m++) {
        const zinsvorteil = bal * (MASSTABSZINS / 100) / 12;
        const steuer = zinsvorteil * MARGINAL_TAX;
        totalSteuer += steuer;
        bal -= monthlyTilg;
        if (bal < 1) bal = 0;
        months.push({ m, bal, zinsvorteil, steuer });
        if (bal === 0) break;
    }
    return { months, totalSteuer };
}

function bausparSpar() {
    let bal = -1840;
    const months = [{ m: 0, bal: Math.max(0, bal), raw: bal }];
    for (let m = 1; m <= 121; m++) {
        let pay = (m >= 1 && m <= 117) ? 426.33 : 0;
        let fee = (m % 12 === 8) ? 15 : 0;
        let interest = Math.max(0, bal) * 0.0001 / 12;
        bal = bal + pay - fee + interest;
        months.push({ m, bal: Math.max(0, bal), raw: bal, pay });
    }
    return months;
}

function bausparDarl() {
    const mr = 1.90 / 100 / 12;
    let bal = 67089.28;
    const months = [{ m: 0, bal }];
    let totI = 0;
    for (let m = 1; m <= 140; m++) {
        const interest = bal * mr;
        const pay = Math.min(575, bal + interest);
        const tilg = pay - interest;
        bal -= tilg;
        totI += interest;
        if (bal < 1) bal = 0;
        months.push({ m, bal, interest, tilg, pay });
        if (bal === 0) break;
    }
    return { months, totI };
}

// Helfer: Dezember-Wert aus Phase-1-Daten (Start = April 2026 = Monat 0)
function p1Dec(data, year) {
    const m = (year - 2026) * 12 + 8;
    if (m < 0) return data[0]?.bal ?? 0;
    if (m > 120) return data[data.length - 1]?.bal ?? 0;
    const e = data.find(r => r.m === m);
    return e ? e.bal : data[data.length - 1]?.bal ?? 0;
}

function p2Dec(data, year) {
    const m = (year - 2036) * 12 + 7;
    if (m < 0) return data[0]?.bal ?? 0;
    const e = data.find(r => r.m === m);
    if (e) return e.bal;
    const last = data[data.length - 1];
    return (last && m > last.m) ? last.bal : 0;
}

function agDec(data, year) {
    const m = (year - 2026) * 12 + 8;
    if (m < 0) return data[0]?.bal ?? 0;
    const e = data.find(r => r.m === m);
    if (e) return e.bal;
    const last = data[data.length - 1];
    return (last && m > last.m) ? last.bal : 0;
}

function bspSDec(bspS, year) {
    if (year > 2036) return 0;
    const m = (year - 2026) * 12 + 8;
    const e = bspS.find(r => r.m === m);
    return e ? e.bal : 0;
}

function bspDDec(bspD, year) {
    if (year < 2036) return 0;
    const m = (year - 2036) * 12 + 8;
    if (m < 0) return 0;
    const e = bspD.months.find(r => r.m === m);
    if (e) return e.bal;
    const last = bspD.months[bspD.months.length - 1];
    return (last && m > last.m) ? last.bal : 0;
}

// ============================================================
// RENDER
// ============================================================
let charts = {};
function kill() { Object.values(charts).forEach(c => c?.destroy()); charts = {}; }

function run() {
    kill();
    const stVal = +document.getElementById('inST').value;
    const aRate = +document.getElementById('inAR').value;
    const aTilg = +document.getElementById('inAT').value;
    const agTilg = +document.getElementById('inAG').value;
    const bUse  = document.getElementById('inBU').value;
    const cmp   = document.getElementById('inCmp').checked;

    const zF = +document.getElementById('inZF').value;
    const zS = +document.getElementById('inZS').value;
    const zN = +document.getElementById('inZN').value;
    document.getElementById('vZF').textContent = F2(zF) + '%';
    document.getElementById('vZS').textContent = F2(zS) + '%';
    document.getElementById('vZN').textContent = F2(zN) + '%';

    document.getElementById('vST').textContent = F(stVal) + ' €';
    document.getElementById('vAR').textContent = F2(aRate) + '%';
    document.getElementById('vAT').textContent = F2(aTilg) + '%';

    const atF = 1.7342;
    const atS = 1.501;
    const atN = 1.391;
    const payF = Math.round(100000 * (zF + atF) / 100 / 12 * 100) / 100;
    const payS = Math.round(137000 * (zS + atS) / 100 / 12 * 100) / 100;
    const payN = Math.round(270000 * (zN + atN) / 100 / 12 * 100) / 100;
    const p1F  = phase1(100000, zF, payF, 13, stVal, 5);
    const p1F0 = phase1(100000, zF, payF, 13, 0, 5);
    const p1S  = phase1(137000, zS, payS, 13, 0, 5);
    const p1N  = phase1(270000, zN, payN, 13, 0, 5);

    const agD = calcAGDarlehen(50000, agTilg);

    const bspS = bausparSpar();
    const bspD = bausparDarl();
    const bspGuthaben = bspS[bspS.length - 1].bal;

    let restF = p1F.rest, restS = p1S.rest, restN = p1N.rest;
    let restF0 = p1F0.rest;
    if (bUse === 'foerder')   restF = Math.max(0, restF - bspGuthaben);
    if (bUse === 'sparkasse') restS = Math.max(0, restS - bspGuthaben);
    if (bUse === 'nrw')       restN = Math.max(0, restN - bspGuthaben);

    let restF0a = restF0, restS0 = p1S.rest, restN0 = p1N.rest;
    if (bUse === 'foerder')   restF0a = Math.max(0, restF0a - bspGuthaben);
    if (bUse === 'sparkasse') restS0 = Math.max(0, restS0 - bspGuthaben);
    if (bUse === 'nrw')       restN0 = Math.max(0, restN0 - bspGuthaben);

    const p2F = phase2(restF, aRate, aTilg);
    const p2S = phase2(restS, aRate, aTilg);
    const p2N = phase2(restN, aRate, aTilg);
    const p2F0 = phase2(restF0a, aRate, aTilg);
    const p2S0 = phase2(restS0, aRate, aTilg);
    const p2N0 = phase2(restN0, aRate, aTilg);

    document.getElementById('infoMasstab').textContent = F2(MASSTABSZINS) + ' %';
    const steuerMonatStart = (50000 * MASSTABSZINS / 100 / 12) * MARGINAL_TAX;
    document.getElementById('infoSteuer').textContent = F2(steuerMonatStart) + ' € (sinkt mit Tilgung)';

    const startY = 2026, endY = 2062;
    const years = []; for (let y = startY; y <= endY; y++) years.push(y);

    const data = years.map(y => {
        let fBal, sBal, nBal;
        if (y < 2036) {
            fBal = p1Dec(p1F.months, y); sBal = p1Dec(p1S.months, y); nBal = p1Dec(p1N.months, y);
        } else if (y === 2036) {
            fBal = restF; sBal = restS; nBal = restN;
        } else {
            fBal = p2Dec(p2F.months, y); sBal = p2Dec(p2S.months, y); nBal = p2Dec(p2N.months, y);
        }

        const agBal = agDec(agD.months, y);
        const bspSav = bspSDec(bspS, y);
        const bspDbt = bspDDec(bspD, y);
        const totalDebt = fBal + sBal + nBal + bspDbt + agBal;
        const eigenkapital = PROP_VALUE - totalDebt;
        const ekQuote = eigenkapital / PROP_VALUE * 100;

        const agSteuerJahr = (() => {
            let sum = 0;
            const m1 = (y - 2026) * 12;
            const m2 = m1 + 11;
            for (let m = Math.max(1, m1); m <= m2; m++) {
                const e = agD.months.find(r => r.m === m);
                if (e) sum += e.steuer;
            }
            return sum;
        })();

        let fBal0;
        if (y < 2036) fBal0 = p1Dec(p1F0.months, y);
        else if (y === 2036) fBal0 = restF0a;
        else fBal0 = p2Dec(p2F0.months, y);
        const sBal0 = y < 2036 ? sBal : (y === 2036 ? restS0 : p2Dec(p2S0.months, y));
        const nBal0 = y < 2036 ? nBal : (y === 2036 ? restN0 : p2Dec(p2N0.months, y));
        const total0 = fBal0 + sBal0 + nBal0 + bspDbt + agBal;

        let monatAG = agBal > 1 ? agTilg : 0;
        let monatSteuerAG = agBal > 1 ? (agBal * MASSTABSZINS / 100 / 12) * MARGINAL_TAX : 0;

        const bd = [];
        if (y < 2036) {
            if (y === 2026) {
                bd.push({ label: 'S-Förder/KfW (Zinsen)', amt: 100000*zF/100/12, color: '#e2001a', startMon: 8 });
                bd.push({ label: 'Sparkassendarlehen (Zinsen)', amt: 137000*zS/100/12, color: '#1565c0', startMon: 8 });
                bd.push({ label: 'NRW.BANK (Zinsen)', amt: 270000*zN/100/12, color: '#ef6c00', startMon: 8 });
            } else if (y >= 2027) {
                bd.push({ label: 'S-Förderdarlehen', amt: payF, color: '#e2001a', startMon: 0 });
                bd.push({ label: 'Sparkassendarlehen', amt: payS, color: '#1565c0', startMon: 0 });
                bd.push({ label: 'NRW.BANK', amt: payN, color: '#ef6c00', startMon: 0 });
            }
            bd.push({ label: 'Bauspar-Sparrate', amt: 426.33, color: '#2e7d32', startMon: y === 2026 ? 4 : 0 });
        } else if (y === 2036) {
            if (p2F.monthlyPay > 0) bd.push({ label: 'S-Förder (Anschluss)', amt: p2F.monthlyPay, color: '#e2001a' });
            if (p2S.monthlyPay > 0) bd.push({ label: 'Sparkasse (Anschluss)', amt: p2S.monthlyPay, color: '#1565c0' });
            if (p2N.monthlyPay > 0) bd.push({ label: 'NRW.BANK (Anschluss)', amt: p2N.monthlyPay, color: '#ef6c00' });
            bd.push({ label: 'Bauspardarlehen', amt: 575, color: '#7b1fa2' });
        } else {
            if (fBal > 1) bd.push({ label: 'S-Förder (Anschluss)', amt: p2F.monthlyPay, color: '#e2001a' });
            if (sBal > 1) bd.push({ label: 'Sparkasse (Anschluss)', amt: p2S.monthlyPay, color: '#1565c0' });
            if (nBal > 1) bd.push({ label: 'NRW.BANK (Anschluss)', amt: p2N.monthlyPay, color: '#ef6c00' });
            if (bspDbt > 1) bd.push({ label: 'Bauspardarlehen', amt: 575, color: '#7b1fa2' });
        }
        if (monatAG > 0) bd.push({ label: 'AG-Darlehen Tilgung', amt: monatAG, color: '#00796b', startMon: y === 2026 ? 3 : 0 });
        if (monatSteuerAG > 0) bd.push({ label: 'AG-Steuer (geldw. Vorteil)', amt: monatSteuerAG, color: '#b71c1c', startMon: y === 2026 ? 3 : 0 });

        const monatlich = bd.reduce((s, b) => s + b.amt, 0);

        return { y, fBal, sBal, nBal, agBal, bspSav, bspDbt, totalDebt, total0, eigenkapital, ekQuote, monatlich, agSteuerJahr, monatAG, monatSteuerAG, breakdown: bd };
    });

    let lastNZ = data.length - 1;
    while (lastNZ > 0 && data[lastNZ].totalDebt < 1) lastNZ--;
    const trimmed = data.slice(0, Math.min(lastNZ + 2, data.length));
    window._rateData = data;

    const d0 = data[0];
    const d2036 = data.find(d => d.y === 2036);
    const totalRest10 = d2036.fBal + d2036.sBal + d2036.nBal + d2036.agBal + 67089;

    const ekStart = PROP_VALUE - (507000 + 50000);
    const ekQuoteStart = ekStart / PROP_VALUE * 100;
    document.getElementById('k_ek0').textContent = F2(ekQuoteStart) + ' %';
    document.getElementById('k_ek0s').textContent = `${F(ekStart)} € von ${F(PROP_VALUE)} €`;

    document.getElementById('k_ek10').textContent = F2(d2036.ekQuote) + ' %';
    document.getElementById('k_ek10s').textContent = `${F(d2036.eigenkapital)} € Eigenkapital`;

    document.getElementById('k1').textContent = F(totalRest10) + ' €';
    document.getElementById('k1s').textContent = `Darlehen: ${F(d2036.fBal + d2036.sBal + d2036.nBal)} € + BSP-Darl: ${F(67089)} € + AG: ${F(d2036.agBal)} €`;

    const monthlyP1 = payF + payS + payN + 426.33 + agTilg + steuerMonatStart;
    const monthlyP2 = p2F.monthlyPay + p2S.monthlyPay + p2N.monthlyPay + 575 + (d2036.agBal > 1 ? agTilg : 0) + (d2036.agBal > 1 ? (d2036.agBal * MASSTABSZINS / 100 / 12 * MARGINAL_TAX) : 0);
    document.getElementById('k2').textContent = F(monthlyP1) + ' €';
    document.getElementById('k3').textContent = F(monthlyP2) + ' €';

    const debtFree = trimmed.find(d => d.totalDebt < 1);
    document.getElementById('k4').textContent = debtFree ? '~' + debtFree.y : '>2062';
    document.getElementById('k4s').textContent = `bei ${F2(aRate)}% Anschluss, ${F2(aTilg)}% Tilg.`;

    const totZinsP1 = p1F.totI + p1S.totI + p1N.totI;
    const totZinsP2 = p2F.totI + p2S.totI + p2N.totI + bspD.totI;
    const totAGSteuer = agD.totalSteuer;
    document.getElementById('k5').textContent = F(totZinsP1 + totZinsP2 + totAGSteuer + 1840) + ' €';
    document.getElementById('k5s').textContent = `Zinsen: ${F(totZinsP1 + totZinsP2)} € | AG-Steuer: ${F(totAGSteuer)} € | BSP-Gebühr: 1.840 €`;

    const nkMonat = 544;
    document.getElementById('nk_kredit').textContent = F(monthlyP1) + ' €';
    document.getElementById('nk_gesamt').textContent = F(monthlyP1 + nkMonat) + ' €';
    const kreditPct = (monthlyP1 / (monthlyP1 + nkMonat) * 100);
    const nkPct = 100 - kreditPct;
    document.getElementById('nk_bar_kredit').style.width = kreditPct.toFixed(1) + '%';
    document.getElementById('nk_bar_kredit').textContent = `Kredit ${F(monthlyP1)} € (${kreditPct.toFixed(0)}%)`;
    document.getElementById('nk_bar_nk').style.width = nkPct.toFixed(1) + '%';
    document.getElementById('nk_bar_nk').textContent = `Nebenkosten ${nkMonat} € (${nkPct.toFixed(0)}%)`;

    document.getElementById('db_total').textContent = F(monthlyP1 + nkMonat) + ' €';
    document.getElementById('db_kredit').textContent = F(monthlyP1) + ' €';
    document.getElementById('db_rate_f').textContent = F(payF) + ' €';
    document.getElementById('db_rate_s').textContent = F(payS) + ' €';
    document.getElementById('db_rate_n').textContent = F(payN) + ' €';

    const eF = +document.getElementById('inEF').value;
    const eS = +document.getElementById('inES').value;
    const eN = +document.getElementById('inEN').value;

    const bspMonteSpar = bspS.length - 1;
    const bspGesGeb = 1840;
    const bspP1Sparrate = 426.33;
    const bspP2Rate = 575;
    const bspDarlSoll = 1.80;

    const nrwZinsAb0926 = Math.round(270000 * zN / 100 / 12 * 100) / 100;

    const ko = [
        { key: 'kfw', name: 'KfW / S-Förderdarlehen', betrag: 100000, soll: zF, eff: eF, rate: payF, zP1: p1F.totI, gesamt: p1F.totI + p2F.totI, note: `Zinsen ab 01.09.2026 · Tilgungsstart Mai 2027 · ab Sep ${F2(100000*zF/100/12)} € reine Zinsen`, color: 'var(--red)' },
        { key: 'sparkasse', name: 'Sparkasse', betrag: 137000, soll: zS, eff: eS, rate: payS, zP1: p1S.totI, gesamt: p1S.totI + p2S.totI, note: `Zinsen ab 01.09.2026 · Tilgungsstart Mai 2027 · ab Sep ${F2(137000*zS/100/12)} € reine Zinsen`, color: 'var(--blue)' },
        { key: 'nrw', name: 'NRW.BANK', betrag: 270000, soll: zN, eff: eN, rate: payN, zP1: p1N.totI, gesamt: p1N.totI + p2N.totI, note: `Zinsen ab 01.09.2026 · Tilgungsstart Mai 2027 · ab Sep ${F2(nrwZinsAb0926)} € reine Zinsen`, color: 'var(--orange)' },
        { key: 'ag', name: 'AG-Darlehen', betrag: 50000, soll: 0, eff: 0, rate: agTilg, zP1: 0, gesamt: agD.totalSteuer, note: 'Zinsfrei, Kosten = Steuer auf geldwerten Vorteil (' + F2(MASSTABSZINS) + ' %)', color: 'var(--teal)' },
        { key: 'bauspar', name: 'Bausparvertrag (Spar→Darlehen)', betrag: 115000, soll: bspDarlSoll, eff: bspDarlSoll, rate: bspP1Sparrate, zP1: 0, gesamt: bspD.totI + bspGesGeb, note: `Sparrate ${F2(bspP1Sparrate)} €/Mon bis 2036, danach Darlehen ${F(bspP2Rate)} €/Mon`, color: 'var(--purple)' },
        { key: null, name: 'Miete alte Wohnung (Doppelbelastung)', betrag: 0, soll: 0, eff: 0, rate: 930, zP1: 0, gesamt: 930 * 13, note: `930 €/Mon · läuft Apr 2026 → Apr 2027 (13 Monate, gesamt 12.090 €)`, color: '#5d4037' }
    ];

    let koHTML = '';
    let totBetrag = 0, totRate = 0, totZP1 = 0, totGes = 0;
    for (const r of ko) {
        const isLoan = !!r.key;
        if (isLoan) { totBetrag += r.betrag; totRate += r.rate; totZP1 += r.zP1; }
        totGes += r.gesamt;
        const clickable = !!r.key;
        const rowOpen = clickable
            ? `<tr onclick="openLoanDetail('${r.key}')" title="Klick: Zinsen + Tilgung pro Monat" style="cursor:pointer;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">`
            : `<tr style="background:#fafafa;">`;
        const arrow = clickable ? ` <span style="color:var(--muted);font-size:11px;">▾</span>` : '';
        koHTML += `${rowOpen}
            <td style="padding:8px 10px;border-bottom:1px solid #eee;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.color};margin-right:8px;"></span><strong>${r.name}</strong>${arrow}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.betrag > 0 ? F(r.betrag) + ' €' : '—'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.soll === 0 ? '—' : F2(r.soll) + ' %'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;color:var(--muted);">${r.eff === 0 ? '—' : F2(r.eff) + ' %'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;"><strong>${F2(r.rate)} €</strong></td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;color:var(--red);">${r.zP1 > 0 ? F(r.zP1) + ' €' : '—'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;color:var(--red);"><strong>${F(r.gesamt)} €</strong></td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:11px;color:var(--muted);">${r.note}</td>
        </tr>`;
    }
    document.getElementById('db_kondtab_body').innerHTML = koHTML;
    document.getElementById('db_kondtab_foot').innerHTML = `<tr style="background:#fafafa;font-weight:700;">
        <td style="padding:10px;border-top:2px solid #333;">Summe</td>
        <td style="padding:10px;border-top:2px solid #333;text-align:right;">${F(totBetrag)} €</td>
        <td style="padding:10px;border-top:2px solid #333;"></td>
        <td style="padding:10px;border-top:2px solid #333;"></td>
        <td style="padding:10px;border-top:2px solid #333;text-align:right;">${F2(totRate)} €</td>
        <td style="padding:10px;border-top:2px solid #333;text-align:right;color:var(--red);">${F(totZP1)} €</td>
        <td style="padding:10px;border-top:2px solid #333;text-align:right;color:var(--red);">${F(totGes)} €</td>
        <td style="padding:10px;border-top:2px solid #333;"></td>
    </tr>`;

    document.getElementById('ko_p1').textContent = F(monthlyP1) + ' €';
    document.getElementById('ko_p2').textContent = F(monthlyP2) + ' €';
    document.getElementById('ko_total').textContent = F(totZinsP1 + totZinsP2 + totAGSteuer + bspGesGeb) + ' €';
    document.getElementById('ko_frei').textContent = debtFree ? '~' + debtFree.y : '>2062';

    // === MONATSÜBERSICHT ===
    const monthAbbr = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const startCalY = 2026, startCalM = 3;

    const findM = (arr, m) => arr.find(x => x.m === m);

    const bspSparMax = 117;
    const bspSparAmt = 426.33;
    const bspDarlAmt = 575;

    let mtbody = '';
    let prevYear = null;
    const yearsSeen = new Set();
    const maxIter = 480;

    for (let i = 0; i <= maxIter; i++) {
        const calM = (startCalM + i) % 12;
        const calY = startCalY + Math.floor((startCalM + i) / 12);

        let kfw = 0, kfwST = 0, sk = 0, nrw = 0, ag = 0, agTax = 0, bsp = 0, miete = 0;
        const notes = [];

        if (i <= 12) miete = 930;
        if (i === 12) notes.push('Letzte Mietzahlung alte Wohnung');

        if (i === 0) {
            notes.push('Auszahlung Bankdarlehen + Bauspar-Beginn folgen 05/2026');
        }

        if (i >= 1 && i <= 120) {
            const fM = findM(p1F.months, i);
            const sM = findM(p1S.months, i);
            const nM = findM(p1N.months, i);
            kfw = fM?.pay || 0;
            kfwST = fM?.st || 0;
            sk  = sM?.pay || 0;
            nrw = nM?.pay || 0;
            if (i === 5) notes.push('Erste Zinszahlung aller 3 Bankdarlehen (KfW, Sparkasse, NRW.BANK)');
            if (i === 13) notes.push('Tilgungsstart aller 3 Bankdarlehen');
        } else if (i > 120) {
            const j = i - 120;
            const fM = findM(p2F.months, j);
            const sM = findM(p2S.months, j);
            const nM = findM(p2N.months, j);
            kfw = fM && fM.bal !== undefined ? (fM.pay || 0) : 0;
            sk  = sM && sM.bal !== undefined ? (sM.pay || 0) : 0;
            nrw = nM && nM.bal !== undefined ? (nM.pay || 0) : 0;
            if (i === 121) notes.push('Phase 2 Start: Anschlussfinanzierung + Bauspardarlehen');
        }

        const agM = findM(agD.months, i);
        if (agM && agM.bal !== undefined && i >= 1) {
            const prevAg = findM(agD.months, i - 1);
            if (prevAg && prevAg.bal > 0) {
                ag = agTilg;
                agTax = agM.steuer || 0;
                if (agM.bal === 0 && prevAg.bal > 0) notes.push('AG-Darlehen abbezahlt');
            }
        }

        if (i >= 1 && i <= bspSparMax) {
            bsp = bspSparAmt;
            if (i === 1) notes.push('Bauspar-Sparphase startet');
            if (i === bspSparMax) notes.push('Bauspar-Sparphase endet (Zuteilungsreife)');
        } else if (i > 120) {
            const bspDM = bspD.months[i - 120];
            if (bspDM && bspDM.bal > 0) bsp = bspDarlAmt;
        }

        const total = kfw + kfwST + sk + nrw + ag + agTax + bsp + miete;

        if (i > 130 && total < 1) break;

        if (kfwST > 0) notes.unshift(`Sondertilgung KfW: ${F(kfwST)} €`);

        if (calY !== prevYear) {
            mtbody += `<tr id="mrow_${calY}" style="background:#1a1a1a;color:#fff;">
                <td colspan="11" style="padding:6px 10px;font-weight:700;font-size:12px;letter-spacing:.4px;">${calY}</td>
            </tr>`;
            yearsSeen.add(calY);
            prevYear = calY;
        }

        const isKey = notes.length > 0;
        const rowStyle = isKey ? 'background:#fff8e1;' : '';
        const noteHTML = notes.length ? `<span style="color:#e65100;font-weight:600;font-size:11px;">${notes.join(' · ')}</span>` : '';

        const fmtCell = v => v > 0.5 ? F2(v) + ' €' : '<span style="color:#ddd;">–</span>';

        mtbody += `<tr style="${rowStyle}">
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;white-space:nowrap;font-weight:500;">${monthAbbr[calM]} ${calY}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCell(kfw)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:var(--purple);font-weight:${kfwST > 0 ? '700' : 'normal'};">${fmtCell(kfwST)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCell(sk)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCell(nrw)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCell(ag)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCell(agTax)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCell(bsp)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#5d4037;">${fmtCell(miete)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;background:#fff3e0;font-weight:700;">${F2(total)} €</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${noteHTML}</td>
        </tr>`;
    }
    document.getElementById('db_monthlytab_body').innerHTML = mtbody;

    window._loanDetail = {
        kfw:       { name: 'KfW / S-Förderdarlehen', color: '#e2001a', betrag: 100000, soll: zF, eff: eF, p1: p1F, p2: p2F, hasST: true },
        sparkasse: { name: 'Sparkasse',              color: '#1565c0', betrag: 137000, soll: zS, eff: eS, p1: p1S, p2: p2S, hasST: false },
        nrw:       { name: 'NRW.BANK',               color: '#ef6c00', betrag: 270000, soll: zN, eff: eN, p1: p1N, p2: p2N, hasST: false, interestStartM: 5 },
        ag:        { name: 'AG-Darlehen (zinsfrei)', color: '#00796b', betrag: 50000,  soll: 0,  eff: 0,  ag: agD, agTilg: agTilg },
        bauspar:   { name: 'Bausparvertrag',         color: '#7b1fa2', betrag: 115000, soll: bspDarlSoll, eff: bspDarlSoll, sparPhase: bspS, darlPhase: bspD, sparAmt: bspSparAmt, sparMax: bspSparMax, darlAmt: bspDarlAmt }
    };

    const jumpEl = document.getElementById('db_monthly_jump');
    if (jumpEl) {
        const yearsArr = Array.from(yearsSeen).sort();
        jumpEl.innerHTML = yearsArr.map(y =>
            `<a href="#mrow_${y}" onclick="event.preventDefault(); document.getElementById('mrow_${y}').scrollIntoView({behavior:'smooth',block:'start'}); return false;" style="padding:3px 8px;background:#eee;border-radius:10px;text-decoration:none;color:#333;cursor:pointer;">${y}</a>`
        ).join('');
    }

    const currentDebt = trimmed.length > 1 ? trimmed[1].totalDebt : 557000;
    document.getElementById('db_restschuld').textContent = F(currentDebt) + ' €';
    document.getElementById('db_schuldenfrei').textContent = debtFree ? '~' + debtFree.y : '>2062';
    if (debtFree) document.getElementById('db_tl_frei_y').textContent = '~' + debtFree.y;

    const tilgtPct = ((557000 - currentDebt) / 557000 * 100);
    const circumference = 2 * Math.PI * 58;
    document.getElementById('db_gauge_pct').textContent = tilgtPct.toFixed(1) + '%';
    document.getElementById('db_gauge_circle').setAttribute('stroke-dashoffset', (circumference * (1 - tilgtPct / 100)).toFixed(1));

    const fTilgt = trimmed.length > 1 ? ((100000 - trimmed[1].fBal) / 100000 * 100) : 0;
    const sTilgt = trimmed.length > 1 ? ((137000 - trimmed[1].sBal) / 137000 * 100) : 0;
    const nTilgt = trimmed.length > 1 ? ((270000 - trimmed[1].nBal) / 270000 * 100) : 0;
    const agTilgt = trimmed.length > 1 ? ((50000 - trimmed[1].agBal) / 50000 * 100) : 0;
    document.getElementById('db_prog_f').style.width = Math.max(0, fTilgt).toFixed(1) + '%';
    document.getElementById('db_prog_s').style.width = Math.max(0, sTilgt).toFixed(1) + '%';
    document.getElementById('db_prog_n').style.width = Math.max(0, nTilgt).toFixed(1) + '%';
    document.getElementById('db_prog_ag').style.width = Math.max(0, agTilgt).toFixed(1) + '%';

    document.getElementById('db_qm_kosten').textContent = `= ${F2((monthlyP1 + nkMonat) / 118)} €/m² (bei 118 m² Wohnfläche)`;

    document.getElementById('db_bar_k').style.width = kreditPct.toFixed(1) + '%';
    document.getElementById('db_bar_k').textContent = `Kredit ${F(monthlyP1)} € (${kreditPct.toFixed(0)}%)`;
    document.getElementById('db_bar_n').style.width = nkPct.toFixed(1) + '%';
    document.getElementById('db_bar_n').textContent = `Nebenkosten ${nkMonat} € (${nkPct.toFixed(0)}%)`;

    document.getElementById('db_tl_2036').textContent = `RS: ${F(d2036.fBal + d2036.sBal + d2036.nBal)} €`;

    // === CHARTS ===
    const labels = trimmed.map(d => d.y + '');

    const dsMain = [
        { label: 'Gesamtverbindlichkeiten', data: trimmed.map(d => d.totalDebt), borderColor: '#1a1a1a', backgroundColor: 'rgba(26,26,26,.04)', borderWidth: 3, fill: true, tension: .3, pointRadius: 2 },
        { label: 'S-Förderdarlehen', data: trimmed.map(d => d.fBal), borderColor: '#e2001a', borderWidth: 1.5, tension: .3, pointRadius: 0 },
        { label: 'Sparkassendarlehen', data: trimmed.map(d => d.sBal), borderColor: '#1565c0', borderWidth: 1.5, tension: .3, pointRadius: 0 },
        { label: 'NRW.BANK', data: trimmed.map(d => d.nBal), borderColor: '#ef6c00', borderWidth: 1.5, tension: .3, pointRadius: 0 },
        { label: 'AG-Darlehen', data: trimmed.map(d => d.agBal), borderColor: '#00796b', borderWidth: 1.5, tension: .3, pointRadius: 0, borderDash: [6, 3] },
        { label: 'Bauspardarlehen', data: trimmed.map(d => d.bspDbt), borderColor: '#7b1fa2', borderWidth: 1.5, borderDash: [4, 3], tension: .3, pointRadius: 0 },
        { label: 'Bauspar-Guthaben', data: trimmed.map(d => d.bspSav), borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,.06)', borderWidth: 1.5, fill: true, tension: .3, pointRadius: 0 }
    ];
    if (cmp && stVal > 0) {
        dsMain.push({ label: 'Gesamt OHNE ST', data: trimmed.map(d => d.total0), borderColor: '#bbb', borderWidth: 2, borderDash: [8, 4], tension: .3, pointRadius: 0 });
    }
    charts.main = new Chart(document.getElementById('cMain'), {
        type: 'line', data: { labels, datasets: dsMain },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
            plugins: {
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + F(c.raw) + ' €' } },
                annotation: { annotations: { zb: { type: 'line', xMin: '2036', xMax: '2036', borderColor: 'rgba(0,0,0,.35)', borderWidth: 2, borderDash: [6, 4], label: { content: 'Ende Zinsbindung', display: true, position: 'start', backgroundColor: 'rgba(0,0,0,.6)', font: { size: 11 } } } } }
            },
            scales: { y: { ticks: { callback: v => F(v) + ' €' }, beginAtZero: true } }
        }
    });

    charts.loans = new Chart(document.getElementById('cLoans'), {
        type: 'line',
        data: { labels, datasets: [
            { label: 'S-Förder', data: trimmed.map(d => d.fBal), borderColor: '#e2001a', backgroundColor: 'rgba(226,0,26,.06)', borderWidth: 2, fill: true, tension: .3 },
            { label: 'Sparkasse', data: trimmed.map(d => d.sBal), borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,.06)', borderWidth: 2, fill: true, tension: .3 },
            { label: 'NRW.BANK', data: trimmed.map(d => d.nBal), borderColor: '#ef6c00', backgroundColor: 'rgba(239,108,0,.06)', borderWidth: 2, fill: true, tension: .3 },
            { label: 'AG-Darlehen', data: trimmed.map(d => d.agBal), borderColor: '#00796b', backgroundColor: 'rgba(0,121,107,.06)', borderWidth: 2, fill: true, tension: .3 },
            { label: 'Bauspar-Darl.', data: trimmed.map(d => d.bspDbt), borderColor: '#7b1fa2', backgroundColor: 'rgba(123,31,162,.06)', borderWidth: 2, fill: true, tension: .3 }
        ]},
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
            plugins: {
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + F(c.raw) + ' €' } },
                annotation: { annotations: { zb: { type: 'line', xMin: '2036', xMax: '2036', borderColor: 'rgba(0,0,0,.15)', borderWidth: 1, borderDash: [4, 3] } } }
            },
            scales: { y: { ticks: { callback: v => F(v) + ' €' }, beginAtZero: true } }
        }
    });

    charts.pay = new Chart(document.getElementById('cPay'), {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'S-Förder', data: trimmed.map(d => d.y < 2036 ? (d.y >= 2027 ? payF : 0) : (d.fBal > 1 ? p2F.monthlyPay : 0)), backgroundColor: '#e2001a', stack: 'a' },
            { label: 'Sparkasse', data: trimmed.map(d => d.y < 2036 ? (d.y >= 2027 ? payS : 0) : (d.sBal > 1 ? p2S.monthlyPay : 0)), backgroundColor: '#1565c0', stack: 'a' },
            { label: 'NRW.BANK', data: trimmed.map(d => d.y < 2036 ? (d.y >= 2027 ? payN : 0) : (d.nBal > 1 ? p2N.monthlyPay : 0)), backgroundColor: '#ef6c00', stack: 'a' },
            { label: 'Bauspar-Sparen', data: trimmed.map(d => d.y >= 2026 && d.y < 2036 ? 426.33 : 0), backgroundColor: '#2e7d32', stack: 'a' },
            { label: 'Bauspar-Darl.', data: trimmed.map(d => d.bspDbt > 1 ? 575 : 0), backgroundColor: '#7b1fa2', stack: 'a' },
            { label: 'AG-Tilgung', data: trimmed.map(d => d.monatAG), backgroundColor: '#00796b', stack: 'a' },
            { label: 'AG-Steuer (geldw. Vorteil)', data: trimmed.map(d => d.monatSteuerAG), backgroundColor: '#b71c1c', stack: 'a' }
        ]},
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
            plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + F2(c.raw) + ' €/Monat' } } },
            scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => F(v) + ' €' } } }
        }
    });

    const stScen = [0, 1000, 2000, 3000, 5000];
    const stCol = ['#bbb', '#ef6c00', '#1565c0', '#7b1fa2', '#2e7d32'];
    const stLbl = []; for (let y = 2026; y <= 2036; y++) stLbl.push(y + '');
    charts.st = new Chart(document.getElementById('cST'), {
        type: 'line',
        data: { labels: stLbl, datasets: stScen.map((s, i) => {
            const res = phase1(100000, zF, payF, 12, s);
            const vals = stLbl.map(ys => { const m = (+ys - 2026) * 12 + 8; return m > 120 ? res.rest : (res.months.find(r => r.m === m)?.bal ?? 0); });
            return { label: s === 0 ? 'Ohne ST' : F(s) + ' €/J', data: vals, borderColor: stCol[i], borderWidth: s === stVal ? 3 : 1.5, borderDash: s === 0 ? [6, 3] : [], tension: .3, pointRadius: s === stVal ? 4 : 1 };
        })},
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
            plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + F(c.raw) + ' €' } } },
            scales: { y: { ticks: { callback: v => F(v) + ' €' }, beginAtZero: true } }
        }
    });

    const bspLbl = []; for (let y = 2026; y <= 2047; y++) bspLbl.push(y + '');
    charts.bsp = new Chart(document.getElementById('cBSP'), {
        type: 'line',
        data: { labels: bspLbl, datasets: [
            { label: 'Guthaben', data: bspLbl.map(ys => { const y = +ys; return y > 2036 ? null : bspSDec(bspS, y); }), borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,.08)', fill: true, borderWidth: 2, tension: .3 },
            { label: 'Bauspardarlehen', data: bspLbl.map(ys => bspDDec(bspD, +ys)), borderColor: '#7b1fa2', backgroundColor: 'rgba(123,31,162,.08)', fill: true, borderWidth: 2, tension: .3 }
        ]},
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
            plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + F(c.raw) + ' €' } } },
            scales: { y: { ticks: { callback: v => F(v) + ' €' }, beginAtZero: true } }
        }
    });

    const agLabels = [];
    const agBals = [], agSteuern = [];
    for (let y = 2026; y <= 2045; y++) {
        const b = agDec(agD.months, y);
        if (b < 1 && y > 2030) break;
        agLabels.push(y + '');
        agBals.push(b);
        const d = data.find(dd => dd.y === y);
        agSteuern.push(d ? d.agSteuerJahr : 0);
    }
    const lastAGYear = +agLabels[agLabels.length - 1] + 1;
    agLabels.push(lastAGYear + ''); agBals.push(0); agSteuern.push(0);

    charts.ag = new Chart(document.getElementById('cAG'), {
        type: 'bar',
        data: { labels: agLabels, datasets: [
            { label: 'Restschuld AG-Darlehen', data: agBals, backgroundColor: '#00796b', yAxisID: 'y', order: 2 },
            { label: 'Steuerlast (geldw. Vorteil)', data: agSteuern, type: 'line', borderColor: '#b71c1c', borderWidth: 2, tension: .3, pointRadius: 3, yAxisID: 'y1', order: 1 }
        ]},
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
            plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + F(c.raw) + ' €' + (c.datasetIndex === 1 ? '/Jahr' : '') } } },
            scales: {
                y: { position: 'left', ticks: { callback: v => F(v) + ' €' }, beginAtZero: true },
                y1: { position: 'right', ticks: { callback: v => F(v) + ' €' }, beginAtZero: true, grid: { drawOnChartArea: false } }
            }
        }
    });

    // ============================================================
    // TABS: Detailansicht pro Kredit
    // ============================================================

    function aggregateByYear(monthData, startYear, startCalMonth, endYear) {
        const result = [];
        for (let y = startYear; y <= endYear; y++) {
            let sumPay = 0, sumInt = 0, sumTilg = 0, sumST = 0, bal = 0;
            for (const r of monthData) {
                if (r.m === 0) continue;
                const calYear = startYear + Math.floor((r.m - 1 + startCalMonth - 1) / 12);
                const calMonth = ((r.m - 1 + startCalMonth - 1) % 12) + 1;
                if (calYear === y) {
                    sumPay += r.pay || 0;
                    sumInt += r.interest || 0;
                    sumTilg += r.tilg || 0;
                    sumST += r.st || 0;
                }
                if (calYear === y) bal = r.bal;
            }
            if (sumPay > 0 || bal > 0 || y === startYear) {
                result.push({ y, sumPay, sumInt, sumTilg, sumST, bal });
            }
        }
        return result;
    }

    let html = '<div class="scroll-table"><table><thead><tr>';
    html += '<th>Jahr</th><th class="r">S-Förder</th><th class="r">Sparkasse</th><th class="r">NRW.BANK</th><th class="r">AG-Darl.</th>';
    html += '<th class="r">BSP Guth.</th><th class="r">BSP Darl.</th>';
    html += '<th class="r">Gesamt Schuld</th><th class="r">Eigenkapital</th><th class="r">EK-Quote</th><th class="r">mtl. Rate</th><th class="r">AG Steuer/J</th>';
    html += '</tr></thead><tbody>';
    for (const d of trimmed) {
        const cls = d.y === 2036 ? ' class="hl"' : (d.totalDebt < 1 ? ' class="done"' : '');
        const note = d.y === 2036 ? ' (ZB-Ende)' : '';
        html += `<tr${cls}>
            <td><strong>${d.y}</strong>${note}</td>
            <td class="r" style="color:var(--red)">${F(d.fBal)} €</td>
            <td class="r" style="color:var(--blue)">${F(d.sBal)} €</td>
            <td class="r" style="color:var(--orange)">${F(d.nBal)} €</td>
            <td class="r" style="color:var(--teal)">${d.agBal > 1 ? F(d.agBal) + ' €' : '-'}</td>
            <td class="r" style="color:var(--green)">${d.bspSav > 0 ? F(d.bspSav) + ' €' : '-'}</td>
            <td class="r" style="color:var(--purple)">${d.bspDbt > 10 ? F(d.bspDbt) + ' €' : '-'}</td>
            <td class="r"><strong>${F(d.totalDebt)} €</strong></td>
            <td class="r" style="color:${d.eigenkapital>=0?'var(--green)':'var(--red)'}"><strong>${F(d.eigenkapital)} €</strong></td>
            <td class="r">${F2(d.ekQuote)} %</td>
            <td class="r clickable" onclick="showRate(${d.y})" title="Klick für Details">${d.monatlich > 10 ? F(d.monatlich) + ' €' : '-'}</td>
            <td class="r" style="color:#b71c1c">${d.agSteuerJahr > 1 ? F(d.agSteuerJahr) + ' €' : '-'}</td>
        </tr>`;
    }
    html += '</tbody></table></div>';
    document.getElementById('tab-overview').innerHTML = html;

    function buildLoanTab(containerId, name, color, p1data, p2data, restschuld, rate, p2Rate, p2Tilg, hasST) {
        const p1Yearly = aggregateByYear(p1data, 2026, 4, 2035);
        const p2Yearly = aggregateByYear(p2data, 2036, 5, 2062);

        const totP1Int = p1Yearly.reduce((s, r) => s + r.sumInt, 0);
        const totP1Tilg = p1Yearly.reduce((s, r) => s + r.sumTilg, 0);
        const totP1ST = p1Yearly.reduce((s, r) => s + r.sumST, 0);
        const totP2Int = p2Yearly.reduce((s, r) => s + r.sumInt, 0);
        const totP2Tilg = p2Yearly.reduce((s, r) => s + r.sumTilg, 0);

        let h = `<div class="loan-summary">
            <div class="ls-item"><div class="ls-label">Darlehensbetrag</div><div class="ls-val">${F(p1data[0].bal)} €</div></div>
            <div class="ls-item"><div class="ls-label">Sollzins Phase 1</div><div class="ls-val">${F2(rate)} %</div></div>
            <div class="ls-item"><div class="ls-label">Restschuld 2036</div><div class="ls-val" style="color:${color}">${F(restschuld)} €</div></div>
            <div class="ls-item"><div class="ls-label">Zinsen Phase 1</div><div class="ls-val" style="color:var(--red)">${F(totP1Int)} €</div></div>
            <div class="ls-item"><div class="ls-label">Tilgung Phase 1</div><div class="ls-val" style="color:var(--green)">${F(totP1Tilg + totP1ST)} €</div></div>
            ${restschuld > 0 ? `<div class="ls-item"><div class="ls-label">Anschlusszins</div><div class="ls-val">${F2(p2Rate)} %</div></div>
            <div class="ls-item"><div class="ls-label">Zinsen Phase 2</div><div class="ls-val" style="color:var(--red)">${F(totP2Int)} €</div></div>
            <div class="ls-item"><div class="ls-label">Gesamtzinsen</div><div class="ls-val" style="color:var(--red)">${F(totP1Int + totP2Int)} €</div></div>` : ''}
        </div>`;

        h += '<div class="scroll-table"><table><thead><tr>';
        h += `<th>Jahr</th><th class="r">Zahlung/Jahr</th><th class="r">davon Zinsen</th><th class="r">davon Tilgung</th>`;
        if (hasST) h += `<th class="r">Sondertilgung</th>`;
        h += `<th class="r">Restschuld</th><th class="r">Zins-Anteil</th>`;
        h += '</tr></thead><tbody>';

        let allRows = [];
        for (const r of p1Yearly) {
            allRows.push({ ...r, phase: 1 });
        }
        const p1_2036 = aggregateByYear(p1data, 2026, 4, 2036).find(r => r.y === 2036) || { sumPay:0, sumInt:0, sumTilg:0, sumST:0 };
        const p2_2036 = p2Yearly.find(r => r.y === 2036) || { sumPay:0, sumInt:0, sumTilg:0, sumST:0 };
        allRows.push({
            y: 2036,
            sumPay: p1_2036.sumPay + p2_2036.sumPay,
            sumInt: p1_2036.sumInt + p2_2036.sumInt,
            sumTilg: p1_2036.sumTilg + p2_2036.sumTilg,
            sumST: p1_2036.sumST + p2_2036.sumST,
            bal: restschuld > 0 ? (p2_2036.bal ?? restschuld) : 0,
            phase: 'zb'
        });
        for (const r of p2Yearly) {
            if (r.y <= 2036) continue;
            allRows.push({ ...r, phase: 2 });
        }

        let sumPay = 0, sumInt = 0, sumTilg = 0, sumST = 0;
        for (const r of allRows) {
            if (r.bal < 1 && r.phase === 2 && r.sumPay < 1) continue;
            const cls = r.phase === 'zb' ? ' class="hl"' : (r.bal < 1 ? ' class="done"' : '');
            const note = r.phase === 'zb' ? ' (ZB-Ende)' : (r.phase === 2 && r.y === (p2Yearly.find(x=>x.y>2036)?.y) ? ` (Anschluss ${F2(p2Rate)}%)` : '');
            const zinsPct = r.sumPay > 0 ? (r.sumInt / r.sumPay * 100) : 0;
            sumPay += r.sumPay; sumInt += r.sumInt; sumTilg += r.sumTilg; sumST += r.sumST;
            h += `<tr${cls}>
                <td><strong>${r.y}</strong>${note}</td>
                <td class="r">${r.sumPay > 0 ? F(r.sumPay) + ' €' : '-'}</td>
                <td class="r" style="color:var(--red)">${r.sumInt > 0 ? F(r.sumInt) + ' €' : '-'}</td>
                <td class="r" style="color:var(--green)">${r.sumTilg > 0 ? F(r.sumTilg) + ' €' : '-'}</td>
                ${hasST ? `<td class="r" style="color:var(--purple)">${r.sumST > 0 ? F(r.sumST) + ' €' : '-'}</td>` : ''}
                <td class="r"><strong>${F(r.bal)} €</strong></td>
                <td class="r" style="color:var(--muted)">${r.sumPay > 0 ? F2(zinsPct) + '%' : '-'}</td>
            </tr>`;
            if (r.bal < 1 && r.phase === 2) break;
        }
        h += `<tr style="font-weight:700;border-top:2px solid #333">
            <td>Summe</td>
            <td class="r">${F(sumPay)} €</td>
            <td class="r" style="color:var(--red)">${F(sumInt)} €</td>
            <td class="r" style="color:var(--green)">${F(sumTilg)} €</td>
            ${hasST ? `<td class="r" style="color:var(--purple)">${F(sumST)} €</td>` : ''}
            <td class="r"></td><td class="r"></td>
        </tr>`;
        h += '</tbody></table></div>';
        document.getElementById(containerId).innerHTML = h;
    }

    buildLoanTab('tab-foerder', 'S-Förderdarlehen', 'var(--red)', p1F.months, p2F.months, restF, zF, aRate, aTilg, true);
    buildLoanTab('tab-sparkasse', 'Sparkassendarlehen', 'var(--blue)', p1S.months, p2S.months, restS, zS, aRate, aTilg, false);
    buildLoanTab('tab-nrw', 'NRW.BANK', 'var(--orange)', p1N.months, p2N.months, restN, zN, aRate, aTilg, false);

    {
        const agMonths = agD.months;
        let h = `<div class="loan-summary">
            <div class="ls-item"><div class="ls-label">Darlehensbetrag</div><div class="ls-val">50.000 €</div></div>
            <div class="ls-item"><div class="ls-label">Sollzins</div><div class="ls-val" style="color:var(--green)">0,00 %</div></div>
            <div class="ls-item"><div class="ls-label">Mtl. Tilgung</div><div class="ls-val">${F(agTilg)} €</div></div>
            <div class="ls-item"><div class="ls-label">Maßstabszins (Bundesbank)</div><div class="ls-val">${F2(MASSTABSZINS)} %</div></div>
            <div class="ls-item"><div class="ls-label">Grenzsteuersatz</div><div class="ls-val">${F2(MARGINAL_TAX*100)} %</div></div>
            <div class="ls-item"><div class="ls-label">Steuer gesamt</div><div class="ls-val" style="color:#b71c1c">${F(agD.totalSteuer)} €</div></div>
            <div class="ls-item"><div class="ls-label">Abbezahlt in</div><div class="ls-val">${Math.ceil(50000/agTilg)} Monaten</div></div>
            <div class="ls-item"><div class="ls-label">Echte Kosten (nur Steuer)</div><div class="ls-val" style="color:#b71c1c">${F(agD.totalSteuer)} €</div></div>
        </div>`;

        h += '<p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Monatliche Aufstellung: Wie der geldwerte Vorteil und die Steuerbelastung mit jeder Tilgung sinken.</p>';
        h += '<div class="scroll-table"><table><thead><tr>';
        h += '<th>Monat</th><th class="r">Restschuld vorher</th><th class="r">Tilgung</th><th class="r">Restschuld nachher</th><th class="r">Geldw. Vorteil/Monat</th><th class="r">Steuer/Monat</th><th class="r">Echte Belastung</th>';
        h += '</tr></thead><tbody>';

        const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
        let totalSteuerShown = 0;

        for (let i = 1; i < agMonths.length; i++) {
            const r = agMonths[i];
            const prevBal = agMonths[i-1].bal;
            if (prevBal < 1) break;

            const calMonth = ((r.m - 1 + 3) % 12);
            const calYear = 2026 + Math.floor((r.m - 1 + 3) / 12);
            const mName = monthNames[((r.m + 2) % 12)] + ' ' + (2026 + Math.floor((r.m + 2) / 12));

            const gv = prevBal * (MASSTABSZINS / 100) / 12;
            const steuer = gv * MARGINAL_TAX;
            const echteBelastung = agTilg + steuer;
            totalSteuerShown += steuer;

            const showRow = i <= 24 || i % 6 === 0 || r.bal < 1;
            if (!showRow) continue;

            const cls = r.bal < 1 ? ' class="done"' : '';
            h += `<tr${cls}>
                <td>${mName}</td>
                <td class="r">${F2(prevBal)} €</td>
                <td class="r" style="color:var(--green)">${F2(Math.min(agTilg, prevBal))} €</td>
                <td class="r"><strong>${F2(r.bal)} €</strong></td>
                <td class="r" style="color:var(--orange)">${F2(gv)} €</td>
                <td class="r" style="color:#b71c1c">${F2(steuer)} €</td>
                <td class="r"><strong>${F2(echteBelastung)} €</strong></td>
            </tr>`;
        }

        h += `<tr style="font-weight:700;border-top:2px solid #333">
            <td>Gesamt</td><td></td>
            <td class="r" style="color:var(--green)">${F(50000)} €</td>
            <td></td><td></td>
            <td class="r" style="color:#b71c1c">${F(agD.totalSteuer)} €</td>
            <td class="r"><strong>${F(50000 + agD.totalSteuer)} €</strong></td>
        </tr>`;
        h += '</tbody></table></div>';
        document.getElementById('tab-ag').innerHTML = h;
    }

    {
        let h = `<div class="loan-summary">
            <div class="ls-item"><div class="ls-label">Bausparsumme</div><div class="ls-val">115.000 €</div></div>
            <div class="ls-item"><div class="ls-label">Sparrate/Monat</div><div class="ls-val">426,33 €</div></div>
            <div class="ls-item"><div class="ls-label">Guthaben bei Zuteilung</div><div class="ls-val" style="color:var(--green)">${F(bspGuthaben)} €</div></div>
            <div class="ls-item"><div class="ls-label">Abschlussgebühr</div><div class="ls-val" style="color:var(--red)">1.840 €</div></div>
            <div class="ls-item"><div class="ls-label">Darlehensbetrag</div><div class="ls-val">${F(67089)} €</div></div>
            <div class="ls-item"><div class="ls-label">Darlehenszins</div><div class="ls-val" style="color:var(--green)">1,90 %</div></div>
            <div class="ls-item"><div class="ls-label">Rate Darlehen</div><div class="ls-val">575 €/Monat</div></div>
            <div class="ls-item"><div class="ls-label">Zinsen Darlehen gesamt</div><div class="ls-val" style="color:var(--red)">${F(bspD.totI)} €</div></div>
        </div>`;

        h += '<h3 style="font-size:14px;margin:12px 0 8px;">Sparphase (2026-2036)</h3>';
        h += '<div class="scroll-table" style="max-height:300px"><table><thead><tr>';
        h += '<th>Jahr</th><th class="r">Einzahlungen</th><th class="r">Gebühren</th><th class="r">Zinsen</th><th class="r">Kontostand</th>';
        h += '</tr></thead><tbody>';
        for (let y = 2026; y <= 2036; y++) {
            let sumPay = 0, sumFee = 0, sumInt = 0, bal = 0;
            for (const r of bspS) {
                if (r.m === 0) continue;
                const cY = 2026 + Math.floor((r.m - 1 + 3) / 12);
                if (cY === y) {
                    sumPay += r.pay || 0;
                    sumFee += r.fee || 0;
                    sumInt += r.interest || 0;
                    bal = r.bal;
                }
            }
            h += `<tr${y===2036?' class="hl"':''}>
                <td><strong>${y}</strong>${y===2036?' (Zuteilung)':''}</td>
                <td class="r">${F(sumPay)} €</td>
                <td class="r" style="color:var(--red)">${sumFee > 0 ? F(sumFee) + ' €' : '-'}</td>
                <td class="r" style="color:var(--green)">${F2(sumInt)} €</td>
                <td class="r"><strong>${F(bal)} €</strong></td>
            </tr>`;
        }
        h += '</tbody></table></div>';

        h += '<h3 style="font-size:14px;margin:12px 0 8px;">Darlehensphase (2036-2047)</h3>';
        const bdYearly = aggregateByYear(bspD.months, 2036, 4, 2048);
        h += '<div class="scroll-table" style="max-height:300px"><table><thead><tr>';
        h += '<th>Jahr</th><th class="r">Zahlung/Jahr</th><th class="r">davon Zinsen</th><th class="r">davon Tilgung</th><th class="r">Restschuld</th>';
        h += '</tr></thead><tbody>';
        let bdSumPay = 0, bdSumInt = 0, bdSumTilg = 0;
        for (const r of bdYearly) {
            if (r.sumPay < 1 && r.bal < 1) continue;
            bdSumPay += r.sumPay; bdSumInt += r.sumInt; bdSumTilg += r.sumTilg;
            h += `<tr${r.bal<1?' class="done"':''}>
                <td><strong>${r.y}</strong></td>
                <td class="r">${F(r.sumPay)} €</td>
                <td class="r" style="color:var(--red)">${F(r.sumInt)} €</td>
                <td class="r" style="color:var(--green)">${F(r.sumTilg)} €</td>
                <td class="r"><strong>${F(r.bal)} €</strong></td>
            </tr>`;
            if (r.bal < 1) break;
        }
        h += `<tr style="font-weight:700;border-top:2px solid #333">
            <td>Summe</td>
            <td class="r">${F(bdSumPay)} €</td>
            <td class="r" style="color:var(--red)">${F(bdSumInt)} €</td>
            <td class="r" style="color:var(--green)">${F(bdSumTilg)} €</td>
            <td></td>
        </tr>`;
        h += '</tbody></table></div>';
        document.getElementById('tab-bauspar').innerHTML = h;
    }
}

// === DRILLDOWN: Pro Finanzierung Monat-für-Monat Zinsen + Tilgung ===
function openLoanDetail(key) {
    const L = window._loanDetail?.[key];
    if (!L) return;
    const monthAbbr = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const startCalY = 2026, startCalM = 3;

    const fmtCell = v => v > 0.005 ? F2(v) + ' €' : '<span style="color:#ddd;">–</span>';
    let h = `<div class="overlay-title" style="display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${L.color};"></span>
        ${L.name}
    </div>`;
    h += `<div class="overlay-sub">Monat-für-Monat: Zinsen, Tilgung und Restschuld</div>`;

    let summary = '';
    if (key === 'kfw' || key === 'sparkasse' || key === 'nrw') {
        const totZinsP1 = L.p1.totI;
        const totTilgP1 = L.p1.totT + (L.p1.totST || 0);
        const totZinsP2 = L.p2.totI;
        const restZB = L.p1.rest;
        summary = `<div class="loan-summary" style="margin-bottom:14px;">
            <div class="ls-item"><div class="ls-label">Darlehensbetrag</div><div class="ls-val">${F(L.betrag)} €</div></div>
            <div class="ls-item"><div class="ls-label">Sollzins</div><div class="ls-val">${F2(L.soll)} %</div></div>
            <div class="ls-item"><div class="ls-label">Effektivzins</div><div class="ls-val" style="color:var(--muted)">${F2(L.eff)} %</div></div>
            <div class="ls-item"><div class="ls-label">Zinsen Phase 1</div><div class="ls-val" style="color:var(--red)">${F(totZinsP1)} €</div></div>
            <div class="ls-item"><div class="ls-label">Tilgung Phase 1</div><div class="ls-val" style="color:var(--green)">${F(totTilgP1)} €</div></div>
            <div class="ls-item"><div class="ls-label">Restschuld 2036</div><div class="ls-val" style="color:${L.color}">${F(restZB)} €</div></div>
            <div class="ls-item"><div class="ls-label">Zinsen Phase 2</div><div class="ls-val" style="color:var(--red)">${F(totZinsP2)} €</div></div>
            <div class="ls-item"><div class="ls-label">Gesamtzinsen</div><div class="ls-val" style="color:var(--red)"><strong>${F(totZinsP1 + totZinsP2)} €</strong></div></div>
        </div>`;
    } else if (key === 'ag') {
        summary = `<div class="loan-summary" style="margin-bottom:14px;">
            <div class="ls-item"><div class="ls-label">Darlehensbetrag</div><div class="ls-val">${F(L.betrag)} €</div></div>
            <div class="ls-item"><div class="ls-label">Sollzins</div><div class="ls-val" style="color:var(--green)">0,00 %</div></div>
            <div class="ls-item"><div class="ls-label">Mtl. Tilgung</div><div class="ls-val">${F2(L.agTilg)} €</div></div>
            <div class="ls-item"><div class="ls-label">Steuer gesamt</div><div class="ls-val" style="color:#b71c1c"><strong>${F(L.ag.totalSteuer)} €</strong></div></div>
            <div class="ls-item"><div class="ls-label">Abbezahlt nach</div><div class="ls-val">${L.ag.months.length - 1} Mon.</div></div>
        </div>`;
    } else if (key === 'bauspar') {
        summary = `<div class="loan-summary" style="margin-bottom:14px;">
            <div class="ls-item"><div class="ls-label">Bausparsumme</div><div class="ls-val">${F(L.betrag)} €</div></div>
            <div class="ls-item"><div class="ls-label">Sparrate (bis Jan 2036)</div><div class="ls-val">${F2(L.sparAmt)} €/Mon</div></div>
            <div class="ls-item"><div class="ls-label">Darlehensrate (ab Mai 2036)</div><div class="ls-val">${F2(L.darlAmt)} €/Mon</div></div>
            <div class="ls-item"><div class="ls-label">Bauspar-Darl. Sollzins</div><div class="ls-val">${F2(L.soll)} %</div></div>
            <div class="ls-item"><div class="ls-label">Zinsen Bauspardarl.</div><div class="ls-val" style="color:var(--red)">${F(L.darlPhase.totI)} €</div></div>
        </div>`;
    }
    h += summary;

    h += `<div class="scroll-table" style="max-height:480px;overflow-y:auto;">
        <table><thead style="position:sticky;top:0;background:#fafafa;z-index:1;"><tr>
            <th>Monat</th>
            <th class="r">Restschuld vorher</th>`;
    if (key === 'ag') {
        h += `<th class="r">Tilgung</th><th class="r">Geldw. Vorteil</th><th class="r">Steuer</th>`;
    } else if (key === 'bauspar') {
        h += `<th class="r">Sparrate / Rate</th><th class="r">Zins</th><th class="r">Tilgung</th>`;
    } else {
        h += `<th class="r">Zinsanteil</th><th class="r">Tilgungsanteil</th>`;
        if (L.hasST) h += `<th class="r">Sondertilgung</th>`;
        h += `<th class="r">Mtl. Rate</th>`;
    }
    h += `<th class="r">Restschuld nachher</th><th>Phase</th></tr></thead><tbody>`;

    let rows = '';
    let prevYear = null;

    if (key === 'kfw' || key === 'sparkasse' || key === 'nrw') {
        for (let i = 1; i <= 120; i++) {
            const calM = (startCalM + i) % 12;
            const calY = startCalY + Math.floor((startCalM + i) / 12);
            const m = L.p1.months.find(x => x.m === i);
            if (!m) continue;
            const prev = L.p1.months.find(x => x.m === i - 1);
            const rest0 = prev ? prev.bal : L.betrag;
            const zins = m.interest || 0;
            const tilg = m.tilg || 0;
            const st = m.st || 0;
            const rate = (m.pay || 0) + st;

            if (calY !== prevYear) {
                rows += `<tr style="background:#1a1a1a;color:#fff;"><td colspan="${L.hasST ? 7 : 6}" style="padding:5px 10px;font-weight:700;">${calY}</td></tr>`;
                prevYear = calY;
            }
            const phaseLabel = i < 5 ? 'zinsfrei' : (i < 13 ? 'nur Zins' : 'Annuität');
            const isKey = (i === 5 || i === 13);
            rows += `<tr style="${isKey ? 'background:#fff8e1;' : ''}">
                <td style="white-space:nowrap;">${monthAbbr[calM]} ${calY}</td>
                <td class="r">${F2(rest0)} €</td>
                <td class="r" style="color:var(--red)">${fmtCell(zins)}</td>
                <td class="r" style="color:var(--green)">${fmtCell(tilg)}</td>
                ${L.hasST ? `<td class="r" style="color:var(--purple)">${fmtCell(st)}</td>` : ''}
                <td class="r"><strong>${fmtCell(rate)}</strong></td>
                <td class="r">${F2(m.bal)} €</td>
                <td style="font-size:11px;color:var(--muted)">${phaseLabel}</td>
            </tr>`;
        }
        prevYear = null;
        for (let j = 1; j < L.p2.months.length; j++) {
            const m = L.p2.months[j];
            const i = 120 + j;
            const calM = (startCalM + i) % 12;
            const calY = startCalY + Math.floor((startCalM + i) / 12);
            const prev = L.p2.months[j - 1];
            const rest0 = prev ? prev.bal : 0;
            if (rest0 < 1 && (m.pay || 0) < 1) break;

            if (calY !== prevYear) {
                rows += `<tr style="background:#1a1a1a;color:#fff;"><td colspan="${L.hasST ? 7 : 6}" style="padding:5px 10px;font-weight:700;">${calY}</td></tr>`;
                prevYear = calY;
            }
            rows += `<tr>
                <td style="white-space:nowrap;">${monthAbbr[calM]} ${calY}</td>
                <td class="r">${F2(rest0)} €</td>
                <td class="r" style="color:var(--red)">${fmtCell(m.interest)}</td>
                <td class="r" style="color:var(--green)">${fmtCell(m.tilg)}</td>
                ${L.hasST ? `<td class="r" style="color:var(--purple)">–</td>` : ''}
                <td class="r"><strong>${fmtCell(m.pay)}</strong></td>
                <td class="r">${F2(m.bal)} €</td>
                <td style="font-size:11px;color:var(--muted)">Phase 2</td>
            </tr>`;
        }
    } else if (key === 'ag') {
        for (let i = 1; i < L.ag.months.length; i++) {
            const m = L.ag.months[i];
            const prev = L.ag.months[i - 1];
            const calM = (startCalM + i) % 12;
            const calY = startCalY + Math.floor((startCalM + i) / 12);
            if (calY !== prevYear) {
                rows += `<tr style="background:#1a1a1a;color:#fff;"><td colspan="6" style="padding:5px 10px;font-weight:700;">${calY}</td></tr>`;
                prevYear = calY;
            }
            rows += `<tr>
                <td style="white-space:nowrap;">${monthAbbr[calM]} ${calY}</td>
                <td class="r">${F2(prev.bal)} €</td>
                <td class="r" style="color:var(--green)">${fmtCell(L.agTilg)}</td>
                <td class="r" style="color:var(--muted)">${fmtCell(m.zinsvorteil)}</td>
                <td class="r" style="color:#b71c1c">${fmtCell(m.steuer)}</td>
                <td class="r">${F2(m.bal)} €</td>
                <td style="font-size:11px;color:var(--muted)">${m.bal === 0 ? 'abbezahlt' : 'aktiv'}</td>
            </tr>`;
        }
    } else if (key === 'bauspar') {
        for (let i = 1; i <= L.sparMax; i++) {
            const m = L.sparPhase.find(x => x.m === i);
            const prev = L.sparPhase.find(x => x.m === i - 1);
            if (!m) continue;
            const calM = (startCalM + i) % 12;
            const calY = startCalY + Math.floor((startCalM + i) / 12);
            if (calY !== prevYear) {
                rows += `<tr style="background:#1a1a1a;color:#fff;"><td colspan="6" style="padding:5px 10px;font-weight:700;">${calY} — Sparphase</td></tr>`;
                prevYear = calY;
            }
            rows += `<tr>
                <td style="white-space:nowrap;">${monthAbbr[calM]} ${calY}</td>
                <td class="r">Guthaben: ${F2(prev?.bal || 0)} €</td>
                <td class="r" style="color:var(--green)"><strong>${F2(L.sparAmt)} €</strong></td>
                <td class="r" style="color:var(--muted)">–</td>
                <td class="r" style="color:var(--muted)">–</td>
                <td class="r" style="color:var(--green)">Guthaben: ${F2(m.bal)} €</td>
                <td style="font-size:11px;color:var(--muted)">Sparphase</td>
            </tr>`;
        }
        prevYear = null;
        for (let j = 1; j < L.darlPhase.months.length; j++) {
            const m = L.darlPhase.months[j];
            const prev = L.darlPhase.months[j - 1];
            const i = 120 + j;
            const calM = (startCalM + i) % 12;
            const calY = startCalY + Math.floor((startCalM + i) / 12);
            if (m.bal === undefined) break;
            if (calY !== prevYear) {
                rows += `<tr style="background:#1a1a1a;color:#fff;"><td colspan="6" style="padding:5px 10px;font-weight:700;">${calY} — Darlehensphase</td></tr>`;
                prevYear = calY;
            }
            rows += `<tr>
                <td style="white-space:nowrap;">${monthAbbr[calM]} ${calY}</td>
                <td class="r">${F2(prev.bal)} €</td>
                <td class="r"><strong>${fmtCell(m.pay)}</strong></td>
                <td class="r" style="color:var(--red)">${fmtCell(m.interest)}</td>
                <td class="r" style="color:var(--green)">${fmtCell(m.tilg)}</td>
                <td class="r">${F2(m.bal)} €</td>
                <td style="font-size:11px;color:var(--muted)">Darlehensphase</td>
            </tr>`;
            if (m.bal < 1) break;
        }
    }

    h += rows + `</tbody></table></div>`;
    const overlayContent = document.getElementById('overlayContent');
    overlayContent.innerHTML = h;
    document.getElementById('rateOverlay').classList.add('open');
}

function showRate(year) {
    const d = window._rateData?.find(r => r.y === year);
    if (!d || d.monatlich < 10) return;

    const bd = d.breakdown;
    const total = d.monatlich;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    let h = `<div class="overlay-title">Monatliche Belastung ${year}</div>`;
    h += `<div class="overlay-sub">Zusammensetzung der ${F2(total)} € Rate pro Monat</div>`;

    for (const b of bd) {
        const pct = total > 0 ? (b.amt / total * 100) : 0;
        h += `<div class="breakdown-row">
            <div class="breakdown-dot" style="background:${b.color}"></div>
            <div style="flex:1">
                <div class="breakdown-label">${b.label}</div>
                <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${pct}%;background:${b.color}"></div></div>
            </div>
            <div class="breakdown-val">${F2(b.amt)} €</div>
        </div>`;
    }

    h += `<div class="breakdown-total"><span>Gesamt pro Monat</span><span>${F2(total)} €</span></div>`;
    h += `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-top:2px;">
        <span>Pro Jahr</span><span style="font-weight:600;">${F(total * 12)} €</span>
    </div>`;

    h += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;">
        <div style="font-size:14px;font-weight:600;margin-bottom:10px;">Monatsübersicht ${year}</div>`;
    h += `<div style="max-height:300px;overflow-y:auto;"><table style="font-size:12px;">
        <thead><tr><th>Monat</th>`;
    for (const b of bd) {
        h += `<th class="r" style="color:${b.color};font-size:11px;">${b.label.split(' ')[0].replace('(','')}</th>`;
    }
    h += `<th class="r"><strong>Gesamt</strong></th></tr></thead><tbody>`;

    const agTilg = +document.getElementById('inAG').value;
    const hasAGSteuer = bd.some(b => b.label.includes('AG-Steuer'));
    const hasAGTilg = bd.some(b => b.label.includes('AG-Darlehen'));

    function getMonthVal(b, mi) {
        const sm = b.startMon || 0;
        if (mi < sm) return 0;
        let val = b.amt;
        if (b.label.includes('AG-Steuer')) {
            const monthsActive = mi - sm;
            const reducedBal = Math.max(0, d.agBal - agTilg * monthsActive);
            val = reducedBal > 0 ? (reducedBal * MASSTABSZINS / 100 / 12) * MARGINAL_TAX : 0;
        }
        return val;
    }

    for (let mi = 0; mi < 12; mi++) {
        let rowTotal = 0;
        h += `<tr><td>${monthNames[mi]}</td>`;
        for (const b of bd) {
            const val = getMonthVal(b, mi);
            rowTotal += val;
            h += `<td class="r">${val > 0.5 ? F2(val) : '-'}</td>`;
        }
        h += `<td class="r"><strong>${rowTotal > 0.5 ? F2(rowTotal) : '-'}</strong></td></tr>`;
    }

    h += `<tr style="font-weight:700;border-top:2px solid #333;"><td>Summe</td>`;
    let grandTotal = 0;
    for (const b of bd) {
        let colSum = 0;
        for (let mi = 0; mi < 12; mi++) { colSum += getMonthVal(b, mi); }
        grandTotal += colSum;
        h += `<td class="r">${colSum > 0.5 ? F(colSum) + ' €' : '-'}</td>`;
    }
    h += `<td class="r"><strong>${F(grandTotal)} €</strong></td></tr>`;
    h += `</tbody></table></div></div>`;

    h += `<div class="breakdown-note">Die AG-Steuer sinkt monatlich, da der geldwerte Vorteil mit jeder Tilgung kleiner wird. Alle anderen Raten bleiben im Jahr konstant.</div>`;

    document.getElementById('overlayContent').innerHTML = h;
    document.getElementById('rateOverlay').classList.add('open');
}

// === INIT für Calc-Modul: vor erstem run() Inputs aus Storage laden ===
function calcLoadInputsFromStorage() {
    if (!window.Storage) return;
    const state = window.Storage.loadState();
    const k = state.kredite || {};
    const sz = state.szenario || {};
    const map = [
        ['inZF', k.kfw?.sollzins], ['inZFnum', k.kfw?.sollzins],
        ['inEF', k.kfw?.effektiv],
        ['inZS', k.sparkasse?.sollzins], ['inZSnum', k.sparkasse?.sollzins],
        ['inES', k.sparkasse?.effektiv],
        ['inZN', k.nrwBank?.sollzins], ['inZNnum', k.nrwBank?.sollzins],
        ['inEN', k.nrwBank?.effektiv],
        ['inST', sz.sondertilgungSFoerder],
        ['inAR', sz.anschlusszins], ['inARnum', sz.anschlusszins],
        ['inAT', sz.anschlussTilgung], ['inATnum', sz.anschlussTilgung],
        ['inAG', k.agDarlehen?.monatlicheRate],
        ['inBU', sz.bausparTilgtKredit]
    ];
    for (const [id, val] of map) {
        if (val === undefined || val === null) continue;
        const el = document.getElementById(id);
        if (el) el.value = val;
    }
}

function calcInit() {
    calcLoadInputsFromStorage();

    // Slider <-> Number Input Sync (1:1 aus dem Original)
    const numSync = [
        ['inZF','inZFnum'], ['inZS','inZSnum'], ['inZN','inZNnum'],
        ['inAR','inARnum'], ['inAT','inATnum']
    ];
    numSync.forEach(([slider, num]) => {
        const sEl = document.getElementById(slider);
        const nEl = document.getElementById(num);
        if (!sEl || !nEl) return;
        sEl.addEventListener('input', () => { nEl.value = (+sEl.value).toFixed(2); });
        nEl.addEventListener('input', () => {
            let v = parseFloat(nEl.value);
            if (isNaN(v)) return;
            const min = +sEl.min, max = +sEl.max;
            if (v < min) v = min; if (v > max) v = max;
            sEl.value = v;
            run();
        });
    });

    ['inST', 'inAR', 'inAT', 'inZF', 'inZS', 'inZN'].forEach(id => document.getElementById(id).addEventListener('input', run));
    ['inBU', 'inCmp'].forEach(id => document.getElementById(id).addEventListener('change', run));
    ['inEF', 'inES', 'inEN'].forEach(id => document.getElementById(id).addEventListener('input', run));

    // Persistierung der Eingaben in localStorage (zusätzlich zu run)
    const persistMap = [
        ['inZF', 'kredite.kfw.sollzins'],
        ['inEF', 'kredite.kfw.effektiv'],
        ['inZS', 'kredite.sparkasse.sollzins'],
        ['inES', 'kredite.sparkasse.effektiv'],
        ['inZN', 'kredite.nrwBank.sollzins'],
        ['inEN', 'kredite.nrwBank.effektiv'],
        ['inST', 'szenario.sondertilgungSFoerder'],
        ['inAR', 'szenario.anschlusszins'],
        ['inAT', 'szenario.anschlussTilgung'],
        ['inAG', 'kredite.agDarlehen.monatlicheRate'],
        ['inBU', 'szenario.bausparTilgtKredit']
    ];
    let persistTimer = null;
    persistMap.forEach(([id, path]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const handler = () => {
            clearTimeout(persistTimer);
            persistTimer = setTimeout(() => {
                const raw = el.value;
                const val = (el.tagName === 'SELECT') ? raw : (raw === '' ? null : parseFloat(raw));
                if (val !== null && !Number.isNaN(val)) window.Storage.savePath(path, val);
                else if (el.tagName === 'SELECT') window.Storage.savePath(path, raw);
            }, 250);
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    });

    // Loan-Tabs Switching
    const loanTabsEl = document.getElementById('loanTabs');
    if (loanTabsEl) {
        loanTabsEl.addEventListener('click', e => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;
            document.querySelectorAll('#loanTabs .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    }

    // Overlay
    const overlay = document.getElementById('rateOverlay');
    document.getElementById('overlayClose').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('open'); });

    run();
}

window.run = run;
window.openLoanDetail = openLoanDetail;
window.showRate = showRate;
window.calcInit = calcInit;
