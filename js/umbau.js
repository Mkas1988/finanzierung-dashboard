// Umbau & Maßnahmen — Maßnahmen-CRUD, Kategorien, Kostenrechner und Gantt-Diagramm.
// Code 1:1 aus der Originaldatei finanzierung-visualisierung.html (Z. 2671-3484) übernommen,
// nur die ehemalige IIFE wurde in die Funktion umbauInit() umbenannt, damit wir sie nach
// erfolgreichem Auth-Check explizit triggern können.

function umbauInit() {
    const COLORS = ['#e2001a','#1565c0','#ef6c00','#2e7d32','#7b1fa2','#00796b','#c62828','#f57c00'];
    const STORAGE_KEY = 'umbau_measures';
    const GANTT_START_KEY = 'umbau_gantt_start';
    let measures = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let selectedColor = COLORS[0];
    let selectedDeps = [];
    let dragState = null;
    let tooltipEl = null;

    measures.forEach(m => {
        if (m.durationDays !== undefined && m.startDate === undefined) {
            const ganttStart = localStorage.getItem(GANTT_START_KEY) || '2026-09-01';
            if (m.startDay !== null && m.startDay !== undefined) {
                const s = new Date(ganttStart + 'T00:00:00');
                s.setDate(s.getDate() + m.startDay);
                m.startDate = s.toISOString().slice(0,10);
                const e = new Date(s);
                e.setDate(e.getDate() + m.durationDays);
                m.endDate = e.toISOString().slice(0,10);
            } else {
                m.startDate = null;
                m.endDate = null;
            }
            delete m.startDay;
            delete m.durationDays;
        }
        if (!m.dependsOn) m.dependsOn = [];
        if (!m.id) m.id = crypto.randomUUID();
        if (m.parentId === undefined) m.parentId = null;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measures));

    const ganttDateInput = document.getElementById('ganttStartDate');
    ganttDateInput.value = localStorage.getItem(GANTT_START_KEY) || '2026-09-01';
    ganttDateInput.addEventListener('change', () => {
        localStorage.setItem(GANTT_START_KEY, ganttDateInput.value);
    });

    const esc = s => { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; };
    const fmt = n => new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(Math.round(n));
    const dateFmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '-';
    const daysBetween = (a,b) => Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/(1000*60*60*24));
    const addDays = (dateStr, n) => { const d = new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    const findById = id => measures.find(m => m.id === id);
    const findIdxById = id => measures.findIndex(m => m.id === id);
    const getChildren = parentId => measures.filter(m => m.parentId === parentId);
    const isParent = id => measures.some(m => m.parentId === id);
    const collapsedParents = new Set(JSON.parse(localStorage.getItem('umbau_collapsed') || '[]'));
    function saveCollapsed() { localStorage.setItem('umbau_collapsed', JSON.stringify([...collapsedParents])); }

    function getDisplayOrder() {
        const topLevel = measures.filter(m => !m.parentId);
        const ordered = [];
        topLevel.forEach(m => {
            ordered.push(m);
            const children = getChildren(m.id);
            children.forEach(c => ordered.push(c));
        });
        return ordered;
    }

    window.toggleCollapse = function(id) {
        if (collapsedParents.has(id)) collapsedParents.delete(id);
        else collapsedParents.add(id);
        saveCollapsed();
        renderGantt();
    };

    function renderParentSelector(currentId) {
        const sel = document.getElementById('mf_parentId');
        sel.innerHTML = '<option value="">— Keine (Hauptaufgabe) —</option>';
        measures.forEach(m => {
            if (currentId && m.id === currentId) return;
            if (currentId && m.parentId === currentId) return;
            if (m.parentId) return;
            sel.innerHTML += `<option value="${m.id}">${esc(m.name)}</option>`;
        });
    }

    const CAT_STORAGE_KEY = 'umbau_categories';
    let categories = JSON.parse(localStorage.getItem(CAT_STORAGE_KEY) || '[]');
    measures.forEach(m => { if (m.categoryId === undefined) m.categoryId = null; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measures));

    function saveCategories() { localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(categories)); }
    function getCategoryName(catId) { const c = categories.find(x => x.id === catId); return c ? c.name : ''; }

    function renderCategorySelector(selectedCatId) {
        const sel = document.getElementById('mf_categoryId');
        sel.innerHTML = '<option value="">— Keine —</option>';
        categories.forEach(c => {
            sel.innerHTML += `<option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${esc(c.name)}</option>`;
        });
    }

    function renderCategoryList() {
        const wrap = document.getElementById('cat_list');
        if (categories.length === 0) {
            wrap.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Noch keine Kategorien. Füge oben eine hinzu.</div>';
            return;
        }
        wrap.innerHTML = categories.map((c, i) => {
            const count = measures.filter(m => m.categoryId === c.id).length;
            return `<div class="cat-item">
                <span class="cat-item-name">${esc(c.name)}</span>
                <span class="cat-item-count">${count} Maßnahme${count !== 1 ? 'n' : ''}</span>
                <button class="cat-item-edit" onclick="renameCategoryPrompt(${i})" title="Umbenennen">✏️</button>
                <button class="cat-item-edit" onclick="deleteCategory(${i})" title="Löschen">🗑️</button>
            </div>`;
        }).join('');
    }

    window.openCategoryManager = function() {
        renderCategoryList();
        document.getElementById('cat_newName').value = '';
        document.getElementById('categoryOverlay').classList.add('open');
    };
    window.closeCategoryManager = function() {
        document.getElementById('categoryOverlay').classList.remove('open');
        const catSel = document.getElementById('mf_categoryId');
        const currentVal = catSel.value;
        renderCategorySelector(currentVal);
    };
    document.getElementById('categoryOverlay').addEventListener('click', e => {
        if (e.target.id === 'categoryOverlay') window.closeCategoryManager();
    });

    window.addCategory = function() {
        const input = document.getElementById('cat_newName');
        const name = input.value.trim();
        if (!name) return;
        if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            alert('Kategorie "' + name + '" existiert bereits.');
            return;
        }
        categories.push({ id: crypto.randomUUID(), name });
        saveCategories();
        input.value = '';
        renderCategoryList();
    };

    window.renameCategoryPrompt = function(idx) {
        const c = categories[idx];
        const newName = prompt('Kategorie umbenennen:', c.name);
        if (newName === null || !newName.trim()) return;
        c.name = newName.trim();
        saveCategories();
        renderCategoryList();
    };

    window.deleteCategory = function(idx) {
        const c = categories[idx];
        const count = measures.filter(m => m.categoryId === c.id).length;
        let msg = 'Kategorie "' + c.name + '" löschen?';
        if (count > 0) msg += '\n\n' + count + ' Maßnahme(n) verlieren diese Kategorie.';
        if (!confirm(msg)) return;
        const removedId = c.id;
        categories.splice(idx, 1);
        measures.forEach(m => { if (m.categoryId === removedId) m.categoryId = null; });
        saveCategories();
        save();
        renderCategoryList();
    };

    function cascadeDependents(movedIdx) {
        const moved = measures[movedIdx];
        if (!moved.endDate) return;
        measures.forEach((m, i) => {
            if (i === movedIdx || !m.dependsOn || !m.dependsOn.length) return;
            if (!m.dependsOn.includes(moved.id)) return;
            let latestEnd = null;
            for (const depId of m.dependsOn) {
                const dep = findById(depId);
                if (dep && dep.endDate) {
                    if (!latestEnd || dep.endDate > latestEnd) latestEnd = dep.endDate;
                }
            }
            if (!latestEnd) return;
            if (m.startDate && m.startDate < latestEnd) {
                const dur = m.endDate ? daysBetween(m.startDate, m.endDate) : 7;
                m.startDate = latestEnd;
                m.endDate = addDays(m.startDate, dur);
                cascadeDependents(i);
            } else if (!m.startDate) {
                m.startDate = latestEnd;
                m.endDate = addDays(m.startDate, 7);
                cascadeDependents(i);
            }
        });
    }

    document.getElementById('umbauTabs').addEventListener('click', e => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        document.querySelectorAll('#umbauTabs .tab-btn').forEach(b => b.classList.remove('active'));
        ['tab-massnahmen','tab-zeitplan','tab-kostenrechner'].forEach(id => document.getElementById(id).classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'tab-zeitplan') renderGantt();
        if (btn.dataset.tab === 'tab-kostenrechner') renderKostenrechner();
    });

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(measures));
        renderTable();
        renderKPIs();
        if (window.GistSync && window.GistSync.isConnected && window.GistSync.isConnected()) {
            window.GistSync.schedulePush();
        }
    }

    function renderKPIs() {
        document.getElementById('um_count').textContent = measures.length;
        const confirmed = measures.filter(m => m.confirmed).length;
        document.getElementById('um_confirmed').textContent = confirmed;
        document.getElementById('um_confirmed_sub').textContent = measures.length ? `${confirmed} von ${measures.length}` : '-';
        const planned = measures.reduce((s,m) => s + (m.plannedCost||0), 0);
        const actual = measures.reduce((s,m) => s + (m.actualCost||0), 0);
        document.getElementById('um_planned').textContent = fmt(planned) + ' €';
        document.getElementById('um_actual').textContent = actual > 0 ? fmt(actual) + ' €' : '0 €';
        const diff = actual - planned;
        document.getElementById('um_diff_sub').textContent = actual > 0 ? (diff >= 0 ? '+' : '') + fmt(diff) + ' € vs. Planung' : '-';

        const scheduled = measures.filter(m => m.startDate && m.endDate);
        if (scheduled.length > 0) {
            const starts = scheduled.map(m => m.startDate).sort();
            const ends = scheduled.map(m => m.endDate).sort();
            const totalDays = daysBetween(starts[0], ends[ends.length-1]);
            document.getElementById('um_duration').textContent = totalDays + ' Tage';
            document.getElementById('um_duration_sub').textContent = dateFmt(starts[0]) + ' – ' + dateFmt(ends[ends.length-1]);
        } else {
            document.getElementById('um_duration').textContent = '-';
            document.getElementById('um_duration_sub').textContent = 'Noch keine eingeplant';
        }
    }

    function renderTable() {
        const body = document.getElementById('measuresBody');
        const empty = document.getElementById('measuresEmpty');
        if (measures.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
        empty.style.display = 'none';
        const ordered = getDisplayOrder();
        body.innerHTML = ordered.map(m => {
            const i = measures.indexOf(m);
            const isSub = !!m.parentId;
            const hasChildren = isParent(m.id);
            const dur = (m.startDate && m.endDate) ? daysBetween(m.startDate, m.endDate) : null;
            const depNames = (m.dependsOn||[]).map(id => { const d = findById(id); return d ? d.name : null; }).filter(Boolean);
            const childCount = hasChildren ? ' <span style="font-size:10px;color:var(--muted);">(' + getChildren(m.id).length + ' Unteraufgaben)</span>' : '';
            const addSubBtn = !isSub ? `<button onclick="event.stopPropagation();openSubtaskForm(${i})" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Unteraufgabe hinzufügen">➕</button>` : '';
            return `<tr class="${isSub ? 'table-subtask' : ''} ${hasChildren ? 'table-parent' : ''}">
                <td><div style="width:${isSub?12:16}px;height:${isSub?12:16}px;border-radius:${isSub?3:4}px;background:${m.color};${isSub?'margin-left:16px;opacity:.8;':''}"></div></td>
                <td>${isSub ? '<span style="color:var(--muted);font-size:10px;">↳</span> ' : ''}${isSub ? '' : '<strong>'}${esc(m.name)}${isSub ? '' : '</strong>'}${m.categoryId ? '<span class="cat-badge">'+esc(getCategoryName(m.categoryId))+'</span>' : ''}${childCount}${m.description ? '<br><span style="font-size:11px;color:var(--muted);">'+esc(m.description)+'</span>' : ''}</td>
                <td>${esc(m.executor)}</td>
                <td class="r">${m.plannedCost ? fmt(m.plannedCost) + ' €' : '<span style="color:var(--muted);">-</span>'}</td>
                <td class="r">${m.actualCost !== null && m.actualCost !== undefined && m.actualCost !== '' ? fmt(m.actualCost) + ' €' : '<span style="color:var(--muted);">-</span>'}</td>
                <td style="white-space:nowrap;font-size:11px;">${m.startDate ? dateFmt(m.startDate) + ' – ' + dateFmt(m.endDate) : '<span style="color:var(--muted);">nicht geplant</span>'}${dur !== null ? '<br><span style="color:var(--muted);">'+dur+' Tage</span>' : ''}</td>
                <td style="font-size:11px;">${depNames.length ? depNames.map(n => '<span style="background:#eee;padding:1px 6px;border-radius:4px;margin:1px;">'+esc(n)+'</span>').join(' ') : '<span style="color:var(--muted);">-</span>'}</td>
                <td><span class="um-badge ${m.confirmed ? 'um-badge-yes' : 'um-badge-no'}">${m.confirmed ? 'Ja' : 'Nein'}</span></td>
                <td style="white-space:nowrap;">
                    <button onclick="editMeasure(${i})" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Bearbeiten">✏️</button>
                    ${addSubBtn}
                    <button onclick="deleteMeasure(${i})" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Löschen">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderDepsSelector(currentIdx) {
        const wrap = document.getElementById('mf_depends');
        if (measures.length <= 1 && currentIdx === undefined) {
            wrap.innerHTML = '<span style="font-size:12px;color:var(--muted);">Erst bei mehreren Maßnahmen verfügbar</span>';
            return;
        }
        const currentId = currentIdx !== undefined ? measures[currentIdx].id : null;
        const currentParentId = currentIdx !== undefined ? measures[currentIdx].parentId : document.getElementById('mf_parentId').value || null;
        wrap.innerHTML = measures.map((m, i) => {
            if (currentIdx !== undefined && i === currentIdx) return '';
            if (currentId && m.parentId === currentId) return '';
            if (currentParentId && m.id === currentParentId) return '';
            const isSelected = selectedDeps.includes(m.id);
            const prefix = m.parentId ? '↳ ' : '';
            return `<div class="um-dep-toggle ${isSelected ? 'active' : ''}" onclick="toggleDep('${m.id}')" style="${isSelected ? 'background:'+m.color+';border-color:'+m.color+';' : ''}">
                <div style="width:8px;height:8px;border-radius:2px;background:${isSelected ? '#fff' : m.color};"></div>
                ${prefix}${esc(m.name)}</div>`;
        }).join('');
    }

    window.toggleDep = function(id) {
        const i = selectedDeps.indexOf(id);
        if (i >= 0) selectedDeps.splice(i, 1);
        else selectedDeps.push(id);
        const currentIdx = document.getElementById('mf_id').value;
        renderDepsSelector(currentIdx !== '' ? parseInt(currentIdx) : undefined);
    };

    window.openMeasureForm = function(idx, presetParentId) {
        const form = document.getElementById('measureForm');
        form.reset();
        document.getElementById('mf_id').value = '';
        document.getElementById('measureFormTitle').textContent = 'Neue Maßnahme';
        selectedColor = COLORS[measures.length % COLORS.length];
        selectedDeps = [];
        const currentId = (idx !== undefined) ? measures[idx].id : null;
        renderParentSelector(currentId);
        renderCategorySelector(null);
        document.getElementById('mf_parentId').value = presetParentId || '';
        if (idx !== undefined) {
            const m = measures[idx];
            document.getElementById('mf_id').value = idx;
            document.getElementById('mf_name').value = m.name;
            document.getElementById('mf_desc').value = m.description || '';
            document.getElementById('mf_planned').value = m.plannedCost || '';
            document.getElementById('mf_actual').value = m.actualCost !== null && m.actualCost !== undefined ? m.actualCost : '';
            document.getElementById('mf_executor').value = m.executor;
            document.getElementById('mf_startDate').value = m.startDate || '';
            document.getElementById('mf_endDate').value = m.endDate || '';
            document.getElementById('mf_confirmed').checked = m.confirmed;
            selectedColor = m.color;
            selectedDeps = [...(m.dependsOn || [])];
            document.getElementById('mf_parentId').value = m.parentId || '';
            renderCategorySelector(m.categoryId);
            document.getElementById('measureFormTitle').textContent = 'Maßnahme bearbeiten';
            document.getElementById('mf_parent_wrap').style.display = isParent(m.id) ? 'none' : '';
        } else {
            document.getElementById('mf_parent_wrap').style.display = '';
        }
        renderColorSwatches();
        renderDepsSelector(idx);
        document.getElementById('measureOverlay').classList.add('open');
    };

    window.editMeasure = function(idx) { window.openMeasureForm(idx); };
    window.openSubtaskForm = function(parentIdx) {
        const parentId = measures[parentIdx].id;
        window.openMeasureForm(undefined, parentId);
        document.getElementById('measureFormTitle').textContent = 'Neue Unteraufgabe';
        selectedColor = measures[parentIdx].color;
        renderColorSwatches();
    };

    window.closeMeasureForm = function() {
        document.getElementById('measureOverlay').classList.remove('open');
    };

    document.getElementById('measureOverlay').addEventListener('click', e => {
        if (e.target.id === 'measureOverlay') window.closeMeasureForm();
    });

    function renderColorSwatches() {
        const wrap = document.getElementById('mf_colors');
        wrap.innerHTML = COLORS.map(c =>
            `<div class="um-color-swatch ${c === selectedColor ? 'selected' : ''}" style="background:${c};" onclick="selectMColor('${c}')"></div>`
        ).join('');
    }

    window.selectMColor = function(c) {
        selectedColor = c;
        renderColorSwatches();
    };

    window.saveMeasure = function(e) {
        e.preventDefault();
        const idVal = document.getElementById('mf_id').value;
        const actualVal = document.getElementById('mf_actual').value;
        const plannedVal = document.getElementById('mf_planned').value;
        const startVal = document.getElementById('mf_startDate').value;
        const endVal = document.getElementById('mf_endDate').value;
        const parentVal = document.getElementById('mf_parentId').value;
        const data = {
            id: idVal !== '' ? measures[parseInt(idVal)].id : crypto.randomUUID(),
            name: document.getElementById('mf_name').value.trim(),
            description: document.getElementById('mf_desc').value.trim(),
            plannedCost: plannedVal !== '' ? parseFloat(plannedVal) : 0,
            actualCost: actualVal !== '' ? parseFloat(actualVal) : null,
            executor: document.getElementById('mf_executor').value.trim(),
            startDate: startVal || null,
            endDate: endVal || null,
            confirmed: document.getElementById('mf_confirmed').checked,
            color: selectedColor,
            dependsOn: [...selectedDeps],
            parentId: parentVal || null,
            categoryId: document.getElementById('mf_categoryId').value || null,
        };
        if (idVal !== '') {
            const idx = parseInt(idVal);
            measures[idx] = data;
            cascadeDependents(idx);
        } else {
            measures.push(data);
        }
        save();
        window.closeMeasureForm();
    };

    window.deleteMeasure = function(idx) {
        const m = measures[idx];
        const children = getChildren(m.id);
        let msg = 'Maßnahme "' + m.name + '" wirklich löschen?';
        if (children.length > 0) msg += '\n\nAchtung: ' + children.length + ' Unteraufgabe(n) werden ebenfalls gelöscht!';
        if (!confirm(msg)) return;
        const removedIds = [m.id, ...children.map(c => c.id)];
        for (let i = measures.length - 1; i >= 0; i--) {
            if (removedIds.includes(measures[i].id)) measures.splice(i, 1);
        }
        measures.forEach(m2 => {
            if (m2.dependsOn) m2.dependsOn = m2.dependsOn.filter(id => !removedIds.includes(id));
        });
        save();
    };

    function renderKostenrechner() {
        const planned = measures.reduce((s,m) => s + (m.plannedCost||0), 0);
        const actual = measures.reduce((s,m) => s + (m.actualCost||0), 0);
        const withActual = measures.filter(m => m.actualCost !== null && m.actualCost !== undefined);
        const withoutActual = measures.filter(m => m.actualCost === null || m.actualCost === undefined);
        const projectedTotal = withActual.reduce((s,m) => s + m.actualCost, 0) + withoutActual.reduce((s,m) => s + (m.plannedCost||0), 0);
        const diff = actual - planned;
        const confirmedPlanned = measures.filter(m => m.confirmed).reduce((s,m) => s + (m.plannedCost||0), 0);

        document.getElementById('kostenSummary').innerHTML = `
            <div style="background:#fff8e1;border-radius:10px;padding:16px;border:1px solid #ffe082;text-align:center;">
                <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Geplante Gesamtkosten</div>
                <div style="font-size:28px;font-weight:800;color:var(--orange);">${fmt(planned)} €</div>
                <div style="font-size:11px;color:var(--muted);">${measures.length} Maßnahmen</div>
            </div>
            <div style="background:${actual > planned && actual > 0 ? '#fce4ec' : '#e8f5e9'};border-radius:10px;padding:16px;border:1px solid ${actual > planned && actual > 0 ? '#ef9a9a' : '#a5d6a7'};text-align:center;">
                <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Ist-Kosten bisher</div>
                <div style="font-size:28px;font-weight:800;color:${actual > planned && actual > 0 ? 'var(--red)' : 'var(--green)'};">${fmt(actual)} €</div>
                <div style="font-size:11px;color:var(--muted);">${withActual.length} von ${measures.length} erfasst</div>
            </div>
            <div style="background:#e3f2fd;border-radius:10px;padding:16px;border:1px solid #90caf9;text-align:center;">
                <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Hochrechnung gesamt</div>
                <div style="font-size:28px;font-weight:800;color:var(--blue);">${fmt(projectedTotal)} €</div>
                <div style="font-size:11px;color:var(--muted);">Ist + Planung (offene)</div>
            </div>
            <div style="background:#f3e5f5;border-radius:10px;padding:16px;border:1px solid #ce93d8;text-align:center;">
                <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Bestätigte Kosten</div>
                <div style="font-size:28px;font-weight:800;color:var(--purple);">${fmt(confirmedPlanned)} €</div>
                <div style="font-size:11px;color:var(--muted);">mit Zusage</div>
            </div>
        `;

        const maxCost = Math.max(...measures.map(m => Math.max(m.plannedCost||0, m.actualCost||0)), 1);
        let chartHtml = '<div style="margin-bottom:8px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;">Kosten pro Maßnahme</div>';
        if (measures.length === 0) {
            chartHtml += '<div style="text-align:center;color:var(--muted);padding:20px;">Keine Maßnahmen vorhanden.</div>';
        } else {
            measures.forEach(m => {
                const pW = Math.max(1, (m.plannedCost||0)/maxCost*100);
                const aW = m.actualCost ? Math.max(1, m.actualCost/maxCost*100) : 0;
                const overBudget = m.actualCost && m.actualCost > (m.plannedCost||0);
                chartHtml += `<div style="margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
                        <span style="font-weight:600;">${esc(m.name)}</span>
                        <span style="color:var(--muted);">${m.plannedCost ? fmt(m.plannedCost)+' €' : '-'}${m.actualCost ? ' / <strong style="color:'+(overBudget?'var(--red)':'var(--green)')+'">'+fmt(m.actualCost)+' €</strong>' : ''}</span>
                    </div>
                    <div style="background:#f0f0f0;border-radius:4px;height:20px;position:relative;overflow:hidden;">
                        <div style="position:absolute;height:100%;background:${m.color};opacity:.3;border-radius:4px;width:${pW}%;"></div>
                        ${aW > 0 ? `<div style="position:absolute;height:100%;background:${overBudget?'var(--red)':m.color};border-radius:4px;width:${aW}%;"></div>` : ''}
                    </div>
                </div>`;
            });
            chartHtml += `<div style="display:flex;gap:16px;font-size:11px;color:var(--muted);margin-top:8px;">
                <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#ccc;vertical-align:middle;margin-right:4px;opacity:.5;"></span>Geplant</span>
                <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#666;vertical-align:middle;margin-right:4px;"></span>Ist-Kosten</span>
                <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--red);vertical-align:middle;margin-right:4px;"></span>Über Budget</span>
            </div>`;
        }
        document.getElementById('kostenChart').innerHTML = chartHtml;

        let tableHtml = `<div style="margin-top:16px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Detailübersicht</div>`;
        tableHtml += `<div class="scroll-table"><table><thead><tr>
            <th></th><th>Maßnahme</th><th>Ausführer</th><th class="r">Geplant</th><th class="r">Ist</th><th class="r">Differenz</th><th>Status</th>
        </tr></thead><tbody>`;
        measures.forEach(m => {
            const d = (m.actualCost !== null && m.actualCost !== undefined) ? m.actualCost - (m.plannedCost||0) : null;
            tableHtml += `<tr>
                <td><div style="width:12px;height:12px;border-radius:3px;background:${m.color}"></div></td>
                <td>${esc(m.name)}</td>
                <td>${esc(m.executor)}</td>
                <td class="r">${m.plannedCost ? fmt(m.plannedCost)+' €' : '-'}</td>
                <td class="r">${m.actualCost !== null && m.actualCost !== undefined ? fmt(m.actualCost)+' €' : '-'}</td>
                <td class="r" style="color:${d !== null ? (d > 0 ? 'var(--red)' : 'var(--green)') : 'var(--muted)'};">${d !== null ? (d >= 0 ? '+' : '')+fmt(d)+' €' : '-'}</td>
                <td><span class="um-badge ${m.confirmed ? 'um-badge-yes' : 'um-badge-no'}">${m.confirmed ? 'Bestätigt' : 'Offen'}</span></td>
            </tr>`;
        });
        const totalPlanned = measures.reduce((s,m)=>s+(m.plannedCost||0),0);
        const totalActual = measures.reduce((s,m)=>s+(m.actualCost||0),0);
        const totalDiff = totalActual - totalPlanned;
        tableHtml += `<tr style="font-weight:700;border-top:2px solid #333;">
            <td></td><td>Gesamt</td><td></td>
            <td class="r">${fmt(totalPlanned)} €</td>
            <td class="r">${totalActual > 0 ? fmt(totalActual)+' €' : '-'}</td>
            <td class="r" style="color:${totalActual > 0 ? (totalDiff > 0 ? 'var(--red)' : 'var(--green)') : 'var(--muted)'};">${totalActual > 0 ? (totalDiff >= 0 ? '+' : '')+fmt(totalDiff)+' €' : '-'}</td>
            <td></td>
        </tr>`;
        tableHtml += '</tbody></table></div>';
        document.getElementById('kostenTable').innerHTML = tableHtml;
    }

    const DAY_PX = 36;
    const ROW_H = 40;
    const LABEL_W = 180;

    function dateToDayOffset(dateStr, ganttStart) {
        if (!dateStr) return null;
        return daysBetween(ganttStart, dateStr);
    }

    window.renderGantt = function() {
        const container = document.getElementById('ganttContainer');
        const ganttStart = ganttDateInput.value;
        const startDate = new Date(ganttStart + 'T00:00:00');
        const totalWeeks = parseInt(document.getElementById('ganttWeeks').value);
        const totalDays = totalWeeks * 7;
        const catFilter = document.getElementById('ganttCategoryFilter');
        const currentCatFilter = catFilter.value;
        catFilter.innerHTML = '<option value="">Alle Kategorien</option><option value="__none__">Ohne Kategorie</option>';
        categories.forEach(c => { catFilter.innerHTML += `<option value="${c.id}"${c.id === currentCatFilter ? ' selected' : ''}>${esc(c.name)}</option>`; });
        catFilter.value = currentCatFilter;
        const matchesCatFilter = m => {
            if (!currentCatFilter) return true;
            if (currentCatFilter === '__none__') return !m.categoryId;
            if (m.categoryId === currentCatFilter) return true;
            if (m.parentId) { const parent = findById(m.parentId); return parent && parent.categoryId === currentCatFilter; }
            if (isParent(m.id)) return getChildren(m.id).some(c => c.categoryId === currentCatFilter);
            return false;
        };
        const displayOrder = getDisplayOrder();
        const visibleScheduled = [];
        displayOrder.forEach(m => {
            if (!m.startDate || !m.endDate) return;
            if (m.parentId && collapsedParents.has(m.parentId)) return;
            if (!matchesCatFilter(m)) return;
            visibleScheduled.push(m);
        });
        const scheduled = visibleScheduled;
        const unscheduled = displayOrder.filter(m => {
            if (m.startDate && m.endDate) return false;
            if (m.parentId && collapsedParents.has(m.parentId)) return false;
            if (!matchesCatFilter(m)) return false;
            return true;
        });

        if (measures.length === 0) {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:14px;">Lege zuerst Maßnahmen an, um sie hier einzuplanen.</div>';
            document.getElementById('ganttUnscheduled').innerHTML = '';
            return;
        }

        let monthsHtml = `<div style="display:flex;position:sticky;top:0;z-index:20;">`;
        monthsHtml += `<div style="width:${LABEL_W}px;min-width:${LABEL_W}px;background:#eee;border-right:2px solid var(--border);border-bottom:1px solid var(--border);padding:3px 10px;font-size:11px;font-weight:600;">Maßnahme</div>`;
        let curMonth = -1, monthSpans = [];
        for (let d = 0; d < totalDays; d++) {
            const date = new Date(startDate); date.setDate(date.getDate() + d);
            const m = date.getMonth();
            if (m !== curMonth) { monthSpans.push({ month: date.toLocaleDateString('de-DE',{month:'long',year:'numeric'}), days: 1 }); curMonth = m; }
            else monthSpans[monthSpans.length-1].days++;
        }
        for (const ms of monthSpans) monthsHtml += `<div class="gantt-month" style="width:${ms.days*DAY_PX}px;min-width:${ms.days*DAY_PX}px;">${ms.month}</div>`;
        monthsHtml += `</div>`;

        let headerHtml = `<div style="display:flex;position:sticky;top:26px;z-index:19;">`;
        headerHtml += `<div style="width:${LABEL_W}px;min-width:${LABEL_W}px;background:#f8f8f8;border-right:2px solid var(--border);border-bottom:2px solid var(--border);"></div>`;
        for (let d = 0; d < totalDays; d++) {
            const date = new Date(startDate); date.setDate(date.getDate() + d);
            const isSat = date.getDay()===6, isSun = date.getDay()===0, isMon = date.getDay()===1;
            const bg = (isSat||isSun) ? '#f0f0f0' : '#f8f8f8';
            headerHtml += `<div class="gantt-header" style="width:${DAY_PX}px;min-width:${DAY_PX}px;background:${bg};${isMon?'border-left:1px solid #ccc;':''}">${date.getDate()}</div>`;
        }
        headerHtml += `</div>`;

        let rowsHtml = `<div style="position:relative;" id="ganttRowsWrap">`;
        scheduled.forEach((m, si) => {
            const mIdx = measures.indexOf(m);
            const startOff = dateToDayOffset(m.startDate, ganttStart);
            const dur = daysBetween(m.startDate, m.endDate);
            const isSub = !!m.parentId;
            const hasChildren = isParent(m.id);
            const isCollapsed = collapsedParents.has(m.id);
            rowsHtml += `<div style="display:flex;height:${ROW_H}px;" data-row="${si}">`;
            const collapseBtn = hasChildren ? `<button class="gantt-collapse-btn" onclick="event.stopPropagation();toggleCollapse('${m.id}')" title="${isCollapsed ? 'Aufklappen' : 'Zuklappen'}">${isCollapsed ? '▶' : '▼'}</button>` : '';
            const depIndicator = (m.dependsOn && m.dependsOn.length) ? '<span style="font-size:9px;color:var(--muted);" title="Hat Abhängigkeiten">🔗</span>' : '';
            const addSubBtn = !isSub ? `<button class="gantt-add-sub" onclick="event.stopPropagation();openSubtaskForm(${mIdx})" title="Unteraufgabe hinzufügen">+</button>` : '';
            const labelClass = isSub ? 'gantt-label gantt-label-indent' : 'gantt-label';
            const subIcon = isSub ? '<span style="font-size:9px;color:var(--muted);margin-right:2px;">↳</span>' : '';
            rowsHtml += `<div class="${labelClass}" style="width:${LABEL_W}px;min-width:${LABEL_W}px;height:${ROW_H}px;cursor:pointer;" onclick="editMeasure(${mIdx})" title="Klicken zum Bearbeiten">${collapseBtn}<div style="width:${isSub?8:10}px;height:${isSub?8:10}px;border-radius:${isSub?2:3}px;background:${m.color};flex-shrink:0;"></div>${subIcon}${esc(m.name)} ${depIndicator}${addSubBtn}</div>`;
            rowsHtml += `<div class="gantt-row-bg" style="flex:1;height:${ROW_H}px;position:relative;" data-midx="${mIdx}">`;

            for (let d = 0; d < totalDays; d++) {
                const date = new Date(startDate); date.setDate(date.getDate() + d);
                if (date.getDay()===0||date.getDay()===6) rowsHtml += `<div style="position:absolute;left:${d*DAY_PX}px;top:0;width:${DAY_PX}px;height:100%;background:rgba(0,0,0,.03);pointer-events:none;"></div>`;
                if (date.getDay()===1) rowsHtml += `<div class="gantt-week-line" style="left:${d*DAY_PX}px;"></div>`;
            }

            const barLeft = startOff * DAY_PX;
            const barW = Math.max(1, dur) * DAY_PX;
            const barClass = isSub ? 'gantt-bar gantt-subtask-bar' : 'gantt-bar';
            rowsHtml += `<div class="${barClass}" style="left:${barLeft}px;width:${barW}px;background:${m.color};" data-midx="${mIdx}"
                onmousedown="ganttPointerDown(event,${mIdx})"
                onclick="ganttBarClick(event,${mIdx})"
                onmouseenter="showGanttTooltip(event,${mIdx})"
                onmouseleave="hideGanttTooltip()">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;pointer-events:none;">${esc(m.name)}</span>
                <div class="gantt-bar-resize" data-resize="1"></div>
            </div>`;
            rowsHtml += `</div></div>`;
        });

        let arrowsSvg = '';
        scheduled.forEach((m, si) => {
            if (!m.dependsOn || !m.dependsOn.length) return;
            const mIdx = measures.indexOf(m);
            const mStartOff = dateToDayOffset(m.startDate, ganttStart);
            m.dependsOn.forEach(depId => {
                const dep = findById(depId);
                if (!dep || !dep.startDate || !dep.endDate) return;
                const depSi = scheduled.indexOf(dep);
                if (depSi < 0) return;
                const depEndOff = dateToDayOffset(dep.endDate, ganttStart);
                const x1 = depEndOff * DAY_PX;
                const y1 = depSi * ROW_H + ROW_H/2;
                const x2 = mStartOff * DAY_PX;
                const y2 = si * ROW_H + ROW_H/2;
                arrowsSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrowhead)"/>`;
            });
        });
        if (arrowsSvg) {
            const svgH = scheduled.length * ROW_H;
            const svgW = totalDays * DAY_PX;
            rowsHtml += `<svg style="position:absolute;top:0;left:0;width:${svgW}px;height:${svgH}px;pointer-events:none;z-index:7;">
                <defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#999"/></marker></defs>
                ${arrowsSvg}</svg>`;
        }

        const today = new Date(); today.setHours(0,0,0,0);
        const todayOffset = Math.round((today - startDate)/(1000*60*60*24));
        if (todayOffset >= 0 && todayOffset < totalDays) rowsHtml += `<div class="gantt-today" style="left:${LABEL_W + todayOffset*DAY_PX}px;"></div>`;

        rowsHtml += `</div>`;
        container.innerHTML = monthsHtml + headerHtml + rowsHtml;

        const unschedWrap = document.getElementById('ganttUnscheduled');
        if (unscheduled.length > 0) {
            let h = `<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;">Nicht eingeplant — auf den Zeitplan ziehen:</div>`;
            unscheduled.forEach(m => {
                const mIdx = measures.indexOf(m);
                const prefix = m.parentId ? '↳ ' : '';
                h += `<div class="gantt-unscheduled-item" style="background:${m.color};${m.parentId ? 'opacity:.8;font-size:11px;' : ''}" draggable="true"
                    ondragstart="ganttUnschedDragStart(event,${mIdx})"
                    onclick="editMeasure(${mIdx})" title="Klicken zum Bearbeiten">${prefix}${esc(m.name)}</div>`;
            });
            unschedWrap.innerHTML = h;
        } else unschedWrap.innerHTML = '';

        container.addEventListener('dragover', e => e.preventDefault());
        container.addEventListener('drop', e => {
            e.preventDefault();
            const mIdx = parseInt(e.dataTransfer.getData('text/plain'));
            if (isNaN(mIdx)) return;
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left + container.scrollLeft - LABEL_W;
            const dayOff = Math.max(0, Math.round(x / DAY_PX));
            const dropDate = addDays(ganttStart, dayOff);
            measures[mIdx].startDate = dropDate;
            measures[mIdx].endDate = addDays(dropDate, 7);
            cascadeDependents(mIdx);
            save();
            renderGantt();
        });
    };

    window.ganttUnschedDragStart = function(e, mIdx) {
        e.dataTransfer.setData('text/plain', mIdx.toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    let suppressNextClick = false;

    window.ganttBarClick = function(e, mIdx) {
        if (suppressNextClick) { suppressNextClick = false; return; }
        editMeasure(mIdx);
    };

    function ganttDocMouseMove(e) {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        if (!dragState.dragging && Math.abs(dx) < 5) return;
        dragState.dragging = true;
        const deltaDays = Math.round(dx / DAY_PX);
        if (dragState.isResize) {
            const newDur = Math.max(1, dragState.origDur + deltaDays);
            measures[dragState.mIdx].endDate = addDays(dragState.origStartDate, newDur);
            dragState.bar.style.width = newDur * DAY_PX + 'px';
        } else {
            const newOff = Math.max(0, dragState.origStartOff + deltaDays);
            const newStart = addDays(dragState.ganttStart, newOff);
            measures[dragState.mIdx].startDate = newStart;
            measures[dragState.mIdx].endDate = addDays(newStart, dragState.origDur);
            dragState.bar.style.left = newOff * DAY_PX + 'px';
        }
    }

    function ganttDocMouseUp(e) {
        if (!dragState) return;
        const wasDrag = dragState.dragging;
        const mIdx = dragState.mIdx;
        document.removeEventListener('mousemove', ganttDocMouseMove);
        document.removeEventListener('mouseup', ganttDocMouseUp);
        if (!wasDrag) {
            measures[mIdx].startDate = dragState.origStartDate;
            measures[mIdx].endDate = dragState.origEndDate;
        }
        dragState = null;
        if (wasDrag) {
            suppressNextClick = true;
            cascadeDependents(mIdx);
            save();
            renderGantt();
        }
    }

    window.ganttPointerDown = function(e, mIdx) {
        if (e.button !== undefined && e.button !== 0) return;
        const bar = e.currentTarget;
        const isResize = e.target.dataset.resize === '1';
        const m = measures[mIdx];
        const ganttStart = ganttDateInput.value;
        dragState = {
            mIdx, startX: e.clientX,
            origStartDate: m.startDate,
            origEndDate: m.endDate,
            origStartOff: dateToDayOffset(m.startDate, ganttStart),
            origDur: daysBetween(m.startDate, m.endDate),
            isResize, bar, ganttStart,
            dragging: false
        };
        document.addEventListener('mousemove', ganttDocMouseMove);
        document.addEventListener('mouseup', ganttDocMouseUp);
    };

    window.ganttPointerMove = function() {};
    window.ganttPointerUp = function() {};

    window.showGanttTooltip = function(e, mIdx) {
        if (dragState) return;
        const m = measures[mIdx];
        if (!tooltipEl) { tooltipEl = document.createElement('div'); tooltipEl.className = 'gantt-tooltip'; document.body.appendChild(tooltipEl); }
        const dur = (m.startDate && m.endDate) ? daysBetween(m.startDate, m.endDate) : null;
        const depNames = (m.dependsOn||[]).map(id => { const d = findById(id); return d ? d.name : null; }).filter(Boolean);
        const parentName = m.parentId ? findById(m.parentId) : null;
        const catName = m.categoryId ? getCategoryName(m.categoryId) : '';
        tooltipEl.innerHTML = `<strong>${esc(m.name)}</strong>${catName ? ' <span style="opacity:.7;font-size:11px;">['+esc(catName)+']</span>' : ''}${parentName ? '<br><span style="opacity:.7;">↳ '+esc(parentName.name)+'</span>' : ''}<br>
            ${dateFmt(m.startDate)} — ${dateFmt(m.endDate)}${dur !== null ? ' ('+dur+' Tage)' : ''}<br>
            Geplant: ${m.plannedCost ? fmt(m.plannedCost)+' €' : '-'} | Ist: ${m.actualCost !== null && m.actualCost !== undefined ? fmt(m.actualCost)+' €' : '-'}<br>
            Ausführer: ${esc(m.executor)}<br>
            Zusage: ${m.confirmed ? 'Ja' : 'Nein'}
            ${depNames.length ? '<br>Abhängig von: '+depNames.join(', ') : ''}`;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = e.clientX + 12 + 'px';
        tooltipEl.style.top = e.clientY - 10 + 'px';
        e.currentTarget.addEventListener('mousemove', moveTooltip);
    };
    function moveTooltip(e) { if (tooltipEl) { tooltipEl.style.left = e.clientX+12+'px'; tooltipEl.style.top = e.clientY-10+'px'; } }
    window.hideGanttTooltip = function() { if (tooltipEl) tooltipEl.style.display = 'none'; };

    renderTable();
    renderKPIs();
}

window.umbauInit = umbauInit;
