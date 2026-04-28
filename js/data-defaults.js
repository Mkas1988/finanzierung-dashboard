// Default-Werte (1:1 aus der Originaldatei finanzierung-visualisierung.html übernommen).
// Diese Werte sind die "Werkseinstellungen" — werden beim ersten Start geladen,
// können vom Nutzer überall im Dashboard editiert und persistent in localStorage gespeichert werden.

window.DEFAULTS = {
    immobilie: {
        propValue: 575000,
        kaufpreis: 425000,
        modernisierung: 150000,
        nebenkostenKauf: 52000,
        wohnflaeche: 118,
        nutzflaeche: 173.1,
        baujahr: 1968,
        ortStrasse: 'Herbrüggenbusch 39, Essen',
        eigentumSeit: 2025,
        kapitalbedarf: 627000
    },

    nebenkostenKaufDetail: {
        grunderwerbsteuer: 27625,
        notarkosten: 8500,
        maklergebuehr: 15173
    },

    einkommen: {
        brutto: 130000,
        marginalTax: 0.4431,
        bundesbankRate: 3.58,
        bewertungsabschlag: 0.04
    },

    eigenkapital: {
        ek: 70000,
        ekQuote: 11.2,
        agDarlehen: 50000,
        bankDarlehen: 507000,
        bauspar: 115000,
        gesamtschuldStart: 557000
    },

    kredite: {
        kfw:       { name: 'KfW / S-Förderdarlehen', betrag: 100000, sollzins: 3.76, effektiv: 3.82, anfangstilgung: 1.7342, zinsbeginnMonat: 5, tilgStartMonat: 13 },
        sparkasse: { name: 'Sparkasse',              betrag: 137000, sollzins: 3.95, effektiv: 4.02, anfangstilgung: 1.501,  zinsbeginnMonat: 5, tilgStartMonat: 13 },
        nrwBank:   { name: 'NRW.BANK',               betrag: 270000, sollzins: 3.84, effektiv: 3.91, anfangstilgung: 1.391,  zinsbeginnMonat: 5, tilgStartMonat: 13, hinweis: 'Zinsen erst ab 01.09.2026' },
        agDarlehen:{ name: 'AG-Darlehen',            betrag: 50000,  sollzins: 0,    monatlicheRate: 416.67, laufzeitJahre: 10 },
        bauspar:   { name: 'Bausparvertrag',         summe: 115000, sparrate: 426.33, darlehensrate: 575, darlehenszins: 1.90, abschlussgebuehr: 1840, sparMaxMonate: 117, darlehensbetrag: 67089.28 }
    },

    szenario: {
        sondertilgungSFoerder: 5000,
        anschlusszins: 3.50,
        anschlussTilgung: 2.00,
        bausparTilgtKredit: 'nrw'
    },

    nebenkosten: {
        // Monatliche Beträge in €
        monatlich: {
            gas: 225,
            strom: 83,
            wasser: 41,
            versicherung: 56,
            wartung: 38,
            buMarvin: 186,
            rlvMarvin: 24,
            grundsteuer: 50,
            muell: 33,
            sonstiges: 63
        },
        gesamtMonat: 544,
        gesamtJahr: 6531,
        // Jahreswerte
        jahr: {
            gas: 2296,
            strom: 939,
            wasser: 412,
            versicherung: 675,
            wartung: 453,
            buMarvin: 2230,
            rlvMarvin: 288,
            grundsteuerJ: 600,
            muellJ: 400,
            sonstigesJ: 756
        },
        guthaben: {
            gas: 465,
            strom: 179,
            gesamt: 644
        },
        verbrauch: {
            gasKwh: 18157,
            stromKwh: 1917,
            wasserM3: 74,
            gasTrendPct: 9.7,
            stromTrendPct: -21
        },
        anbieter: {
            gas: 'Stadtwerke Essen',
            strom: 'E.ON',
            wasser: 'Stadtwerke Essen',
            versicherung: 'HUK-COBURG'
        },
        energieausweis: {
            klasse: 'F',
            kwhPerM2: 199.2,
            co2PerM2: 49.9,
            heizung: 'Junkers Gaskessel (2004)',
            gueltigBis: '2036-02-08'
        }
    },

    meilensteine: [
        { jahr: '2025',     titel: 'Kauf & Modernisierung',      wert: '627.000 €',         farbe: '' },
        { jahr: '09/2026',  titel: 'Erste Zinszahlung Bankdarlehen', wert: 'KfW + Sparkasse + NRW', farbe: 'orange' },
        { jahr: '2027',     titel: 'Tilgungsstart Bankdarlehen', wert: 'Mai 2027 (alle 3)', farbe: '' },
        { jahr: '2035',     titel: 'AG-Darlehen abbezahlt',      wert: '50.000 € ✓',        farbe: 'green' },
        { jahr: '2036',     titel: 'Zinsbindung endet',          wert: 'Anschluss',         farbe: '' },
        { jahr: '~2057',    titel: 'Schuldenfrei',               wert: '0 € 🎉',            farbe: 'green' }
    ],

    miete: {
        alteWohnung: 930,
        doppelbelastungVon: '2026-04',
        doppelbelastungBis: '2027-04',
        doppelbelastungMonate: 13,
        doppelbelastungSumme: 12090
    },

    auth: {
        sha256Hash: '29dda16d076e42aa41c9cd4be7b64111c4ec2358dac5c6acd47cf8ee22268847'
    }
};
