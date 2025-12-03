
// selections
const selUI = {
    tableSelect: document.getElementById('tableSelect'),
    colsSelect: document.getElementById('colsSelect'),
    selectAll: document.getElementById('selectAll'),
    whereClause: document.getElementById('whereClause'),
    orderByClause: document.getElementById('orderByClause'),
    limitClause: document.getElementById('limitClause'),
    distinctClause: document.getElementById('distinctClause'),
}

// remaining UI
const mainUI = {
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    showSql: document.getElementById('showSql'),
    runQuery: document.getElementById('runQuery'),
    rowCount: document.getElementById("rowCount"),
    exportCsv: document.getElementById('exportCsv'),
    exportQuery: document.getElementById('exportQuery'),
    results: document.getElementById('results'),
}

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

function updateHistoryBtns() {
    mainUI.prev.disabled = history.idx <= 0;
    mainUI.next.disabled = history.idx >= history.lst.length - 1;
}

function getSelections() {
    return {
        table: selUI.tableSelect.value,
        cols: [...selUI.colsSelect.querySelectorAll('input:checked')].map(c => c.value),
        where: selUI.whereClause.value,
        order: selUI.orderByClause.value,
        limit: selUI.limitClause.value,
        distinct: selUI.distinctClause.checked,
    };
}

function setSelections(selections) {
    selUI.tableSelect.value = selections.table;
    loadTableCols().then(() => {
        const allCheckboxes = selUI.colsSelect.querySelectorAll('input');
        allCheckboxes.forEach(chk => {
            chk.checked = selections.cols.includes(chk.value);
        });
        selUI.whereClause.value = selections.where;
        selUI.orderByClause.value = selections.order;
        selUI.limitClause.value = selections.limit;
        selUI.distinctClause.checked = selections.distinct;
    });
}

// append only, never rewrite
function saveSelections() {
    let selections = getSelections();
    history.lst.push(selections);
    history.idx = history.lst.length - 1;

    updateHistoryBtns();
}

async function loadTableCols() {
    const table = selUI.tableSelect.value;
    const container = selUI.colsSelect;
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

    document.querySelectorAll('#colsSelect input').forEach(c => c.checked = true);
}

function ignoreColByDefault(col) {
    if (selUI.tableSelect.value === "spells")
        return ["rarity", "cast", "concentrate", "traditions", "domain", "requiremenets", "bloodlines", "mysteries", "lesson", "patron_themes", "deities", "pfs_note", "cost"].includes(col);
    return false;
}

function setCheckedCols(checked) {
    document.querySelectorAll('#colsSelect input').forEach(c => c.checked = ignoreColByDefault(c.value) ? false : checked);
}

function toggleSelectAll() {
    let next = (selectAll.idx + 1) % selectAll.opts.length;
    selUI.selectAll.innerText = selectAll.opts[next];
    setCheckedCols(selectAll.idx != 0);
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

    const tableSelect = selUI.tableSelect;
    tables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tableSelect.appendChild(opt);
    });

    // by default start with spells
    if (tables.find(t => t === "spells"))
        tableSelect.value = "spells";

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
    mainUI.showSql.innerHTML = "";

    let selections = getSelections();

    function pushSql(s) {
        s = s.trim();

        if (currQuery !== '' && s !== '') {
            currQuery += " ";
            mainUI.showSql.innerHTML += "\n";
        }

        currQuery += s;
        mainUI.showSql.innerHTML += s;
    }

    pushSql(`SELECT ${selections.distinct ? "DISTINCT " : ""}${selections.cols.length ? selections.cols.map((c) => escape_sql_kw(c)).join(', ') : '*'} FROM ${selections.table}`);
    if (selections.where.trim() !== '') pushSql(`WHERE ${selections.where}`);
    if (selections.order.trim() !== '') pushSql(`ORDER BY ${selections.order}`);
    if (selections.limit.trim() !== '') pushSql(`LIMIT ${selections.limit}`);
}

function runQuery() {
    saveSelections();
    buildQuery();

    mainUI.results.innerHTML = '';
    mainUI.exportCsv.hidden = true;
    mainUI.exportQuery.hidden = true;
    mainUI.rowCount.textContent = '';

    let res;
    try {
        res = db.exec(currQuery);
    } catch (e) {
        mainUI.results.innerHTML += `<p style="color:red">Error: ${e.message}</p>`;
        return;
    }

    if (!res.length) {
        mainUI.results.innerHTML += '<p>No results.</p>';
        return;
    }

    mainUI.exportCsv.hidden = false;
    mainUI.exportQuery.hidden = false;

    const cols = res[0].columns;
    const rows = res[0].values;

    mainUI.rowCount.textContent = `${rows.length} rows`
    const table = document.createElement('table');

    // Header row with clickable ordering
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    cols.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        // th.onclick = () => {
        //     selUI.orderByClause.value = col;
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

    mainUI.results.appendChild(table);
}

function saveFileFallback(suggestedName, contents, type) {
    const blob = new Blob([contents], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
}

async function saveFilePicker(suggestedName, contents, type) {
    let ext = suggestedName.split('.').pop();
    if (ext)
        ext = "." + ext;

    let accept = {}
    accept[type] = [ext];   // accept: { type: [ext] } doesnt work, cause it assumes `type` is the name of the key, not the variable

    const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
            {
                accept: accept,
            }
        ]
    });

    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
}

function saveFile(suggestedName, contents, type) {
    if (window.showSaveFilePicker != undefined)
        saveFilePicker(suggestedName, contents, type);
    else
        saveFileFallback(suggestedName, contents, type);
}

/**
 * Events wiring
 */

selUI.selectAll.onclick = toggleSelectAll;

async function exportQuery() {
    const selections = getSelections();
    const contents = JSON.stringify(selections, null, 2);
    const fileName = `query-${selections.table || "state"}.json`;

    saveFile(fileName, contents, "application/json");
}

mainUI.exportQuery.onclick = exportQuery;

mainUI.exportCsv.onclick = () => {
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

    saveFile('query.csv', csv.join('\n'), 'text/csv');
};

mainUI.runQuery.onclick = runQuery;

mainUI.prev.onclick = () => {
    if (history.idx > 0) {
        history.idx--;
        setSelections(history.lst[history.idx]);
    }
    updateHistoryBtns();
};

mainUI.next.onclick = () => {
    if (history.idx < history.lst.length - 1) {
        history.idx++;
        setSelections(history.lst[history.idx]);
    }
    updateHistoryBtns();
};

selUI.tableSelect.addEventListener('change', async () => {
    await loadTableCols();
    setCheckedCols(true);
});

function addToBuildQueryEvent(e) {
    e.addEventListener("change", buildQuery);
    e.addEventListener("input", buildQuery);
    for (let i = 0; e.children && i < e.children.length; i++) {
        addToBuildQueryEvent(e.children[i]);
    }
}

addToBuildQueryEvent(document.getElementsByClassName("sel-panel")[0]);

document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        runQuery();
    }
});