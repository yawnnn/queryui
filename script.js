
const elmt = {
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    tableSelect: document.getElementById('tableSelect'),
    whereClause: document.getElementById('whereClause'),
    orderByClause: document.getElementById('orderByClause'),
    limitClause: document.getElementById('limitClause'),
    distinctClause: document.getElementById('distinctClause'),
    colsContainer: document.getElementById('colsContainer'),
    selectAll: document.getElementById('selectAll'),
    exportCsv: document.getElementById('exportCsv'),
    results: document.getElementById('results'),
    runQuery: document.getElementById('runQuery'),
    showSql: document.getElementById('showSql'),
};

let db;
let history = {
    lst: [],
    idx: -1,
};
let selectAll = {
    opts: ["Deselect All", "Select All"],
    idx: 1,
};
let currQuery = "";

function getAppState() {
    return {
        table: elmt.tableSelect.value,
        columns: [...document.querySelectorAll('#colsContainer input:checked')].map(c => c.value),
        where: elmt.whereClause.value,
        order: elmt.orderByClause.value,
        limit: elmt.limitClause.value,
        distinct: elmt.distinctClause.checked,
    };
}

function setAppState(appState) {
    elmt.tableSelect.value = appState.table;
    loadTableCols().then(() => {
        // Check the right columns
        const allCheckboxes = document.querySelectorAll('#colsContainer input');
        allCheckboxes.forEach(chk => {
            chk.checked = appState.columns.includes(chk.value);
        });
        elmt.whereClause.value = appState.where;
        elmt.orderByClause.value = appState.order;
        elmt.limitClause.value = appState.limit;
        elmt.distinctClause.checked = appState.distinct;
    });
}

function updateHistoryBtns() {
    elmt.prev.disabled = history.idx <= 0;
    elmt.next.disabled = history.idx >= history.lst.length - 1;
}

// append only, never rewrite
function saveAppState() {
    let appState = getAppState();
    history.lst.push(appState);
    history.idx = history.lst.length - 1;

    updateHistoryBtns();
}

async function loadTableCols() {
    const table = elmt.tableSelect.value;
    const container = elmt.colsContainer;
    container.innerHTML = '';

    if (!db) return;

    const qr = db.exec(`PRAGMA table_info(${table});`);
    const cols = qr[0].values.map(r => r[1]);

    cols.forEach(col => {
        if (col == "id")
            return;
        const label = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.value = col;
        label.appendChild(chk);
        label.append(' ' + col);
        container.appendChild(label);
    });

    document.querySelectorAll('#colsContainer input').forEach(c => c.checked = true);
}

function toggleSelectAll() {
    let next = (selectAll.idx + 1) % selectAll.opts.length;
    elmt.selectAll.innerText = selectAll.opts[next];
    document.querySelectorAll('#colsContainer input').forEach(c => c.checked = selectAll.idx);
    selectAll.idx = next;
}

// Load DB on page load
window.onload = async function () {
    // const sqlPromise = initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}` });
    const sqlPromise = initSqlJs({ locateFile: file => `resources/sql-wasm-1.13.0.wasm` });
    // don't cache the db with { cache: "no-store" }
    const dataPromise = fetch("scraping/pf2.db", { cache: "no-store" }).then(r => r.arrayBuffer());

    const [SQL, data] = await Promise.all([sqlPromise, dataPromise]);
    db = new SQL.Database(new Uint8Array(data));

    // Load list of tables from sqlite_master
    const qr = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
    let tables = qr[0].values.map(v => v[0]);

    const tableSelect = elmt.tableSelect;
    tables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tableSelect.appendChild(opt);
    });

    await loadTableCols();

    toggleSelectAll();
    buildQuery();
};

function escape_sql_kw(s) {
    if (s.toLowerCase() === "cast")
        return "\"" + s + "\"";
    return s;
}

function buildQuery() {
    currQuery = "";
    elmt.showSql.innerHTML = "";

    let appState = getAppState();

    function pushSql(s) {
        s = s.trim();

        if (currQuery !== '' && s !== '') {
            currQuery += " ";
            elmt.showSql.innerHTML += "\n";
        }

        currQuery += s;
        elmt.showSql.innerHTML += s;
    }

    pushSql(`SELECT ${appState.distinct ? "DISTINCT " : ""}${appState.columns.length ? appState.columns.map((c) => escape_sql_kw(c)).join(', ') : '*'} FROM ${appState.table}`);
    if (appState.where.trim() !== '') pushSql(`WHERE ${appState.where}`);
    if (appState.order.trim() !== '') pushSql(`ORDER BY ${appState.order}`);
    if (appState.limit.trim() !== '') pushSql(`LIMIT ${appState.limit}`);
}

function runQuery() {
    saveAppState();
    buildQuery();

    elmt.results.innerHTML = '';
    elmt.exportCsv.hidden = true;

    let res;
    try {
        res = db.exec(currQuery);
    } catch (e) {
        elmt.results.innerHTML += `<p style="color:red">Error: ${e.message}</p>`;
        return;
    }

    if (!res.length) {
        elmt.results.innerHTML += '<p>No results.</p>';
        return;
    }

    elmt.exportCsv.hidden = false;

    const cols = res[0].columns;
    const rows = res[0].values;

    const table = document.createElement('table');

    // Header row with clickable ordering
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    cols.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        // th.onclick = () => {
        //     elmt.orderByClause.value = col;
        //     runQuery();
        // };
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(r => {
        const tr = document.createElement('tr');
        r.forEach((cell, idx) => {
            const td = document.createElement('td');
            // Interpret cell content as HTML
            td.innerHTML = cell === null ? '' : cell;
            // Interpret the contents as markdown
            // td.innerHTML = marked.parse(cell === null ? '' : String(cell));
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    elmt.results.appendChild(table);
}

/**
 * Events wiring
 */

elmt.selectAll.onclick = toggleSelectAll;

elmt.exportCsv.onclick = () => {
    const table = document.querySelector('#results table');
    if (!table) return;
    let csv = [];
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = [...row.children].map(rc => {
            if (!rc) return rc;
            const s = rc.innerText;
            if (s.includes(',') || s.includes('"') || s.includes('\n'))
                return '"' + s.replace(/"/g, '""') + '"';
            return s;
        });
        csv.push(cells.join(','));
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.csv';
    a.click();
    URL.revokeObjectURL(url);
};

elmt.runQuery.onclick = runQuery;

elmt.prev.onclick = () => {
    if (history.idx > 0) {
        history.idx--;
        setAppState(history.lst[history.idx]);
    }
    updateHistoryBtns();
};

elmt.next.onclick = () => {
    if (history.idx < history.lst.length - 1) {
        history.idx++;
        setAppState(history.lst[history.idx]);
    }
    updateHistoryBtns();
};

elmt.tableSelect.addEventListener('change', loadTableCols);

function addToBuildQueryEvent(e) {
    e.addEventListener("change", buildQuery);
    e.addEventListener("input", buildQuery);
    for (let i = 0; e.children && i < e.children.length; i++) {
        addToBuildQueryEvent(e.children[i]);
    }
}

addToBuildQueryEvent(document.getElementsByClassName("query-layout")[0]);