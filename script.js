
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
    importQuery: document.getElementById('importQuery'),
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
    loadTableCols();
    const allCheckboxes = selUI.colsSelect.querySelectorAll('input');
    allCheckboxes.forEach(chk => {
        chk.checked = selections.cols.includes(chk.value);
    });
    selUI.whereClause.value = selections.where;
    selUI.orderByClause.value = selections.order;
    selUI.limitClause.value = selections.limit;
    selUI.distinctClause.checked = selections.distinct;
}

// append only, never rewrite
function saveSelections() {
    let selections = getSelections();
    history.lst.push(selections);
    history.idx = history.lst.length - 1;

    updateHistoryBtns();
}

function loadTableCols() {
    const table = selUI.tableSelect.value;
    selUI.colsSelect.innerHTML = '';

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
        selUI.colsSelect.appendChild(label);
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
    buildQuery();
}

// Load DB on page load
window.onload = async function () {
    // const sqlPromise = initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}` });
    const sqlPromise = initSqlJs({ locateFile: file => `resources/sql-wasm-1.13.0.wasm` });
    // don't cache the db with { cache: "no-store" }
    const dataPromise = fetch("resources/pathfinder2e.db", { cache: "no-store" }).then(r => r.arrayBuffer());

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

    loadTableCols();

    toggleSelectAll();
    buildQuery();
};

function escape_ident(s) {
    return '"' + s.replace('"', '""') + '"'
}

function buildQuery() {
    currQuery = "";
    mainUI.showSql.textContent = "";

    let selections = getSelections();

    function pushSql(s) {
        s = s.trim();

        if (currQuery !== '' && s !== '') {
            currQuery += " ";
            mainUI.showSql.textContent += "\n";
        }

        currQuery += s;
        mainUI.showSql.textContent += s;
    }

    pushSql(`SELECT ${selections.distinct ? "DISTINCT " : ""}${selections.cols.length ? selections.cols.map((c) => escape_ident(c)).join(', ') : '*'} FROM ${selections.table}`);
    if (selections.where.trim() !== '') pushSql(`WHERE ${selections.where}`);
    if (selections.order.trim() !== '') pushSql(`ORDER BY ${selections.order}`);
    if (selections.limit.trim() !== '') pushSql(`LIMIT ${selections.limit}`);
}

function runQuery() {
    saveSelections();
    buildQuery();

    mainUI.results.innerHTML = '';
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

        // detect current orderby
        const curr = selUI.orderByClause.value.trim();
        const match = curr.match(/^(\w+)\s+(ASC|DESC)$/i);
        let dir = -1;   // default is this *-1, so ASC

        if (match && match[1] === col) {
            dir = match[2].toUpperCase() === "ASC" ? 1 : -1;
            th.textContent += dir > 0 ? " ↑" : " ↓";
        }

        th.onclick = () => {
            trh.querySelectorAll('th').forEach(th => th.textContent = th.textContent.replace(/ ↑| ↓/, ""));
            dir *= -1;
            selUI.orderByClause.value = `${col} ${dir > 0 ? "ASC" : "DESC"}`;
            th.textContent = col + dir > 0 ? " ↑" : " ↓";

            runQuery();
        };
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(r => {
        const tr = document.createElement('tr');
        r.forEach((cell, _) => {
            const td = document.createElement('td');
            td.innerHTML = cell === null ? '' : cell;
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
    const ext = "." + suggestedName.split('.').pop();

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

async function loadFilePicker(suggestedName, type) {
    const ext = "." + suggestedName.split('.').pop();

    const accept = {};
    accept[type] = [ext];

    const [handle] = await window.showOpenFilePicker({
        suggestedName: suggestedName,   // doesnt work
        multiple: false,
        types: [{ accept: accept }]
    });

    const file = await handle.getFile();

    return await file.text();
}

function loadFileFallback(suggestedName, type) {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = type;

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }

            try {
                resolve(await file.text());
            } catch (err) {
                reject(err);
            }
        };

        input.click();
    });
}

async function loadFile(suggestedName, type) {
    if (window.showOpenFilePicker)
        return await loadFilePicker(suggestedName, type);
    else
        return await loadFileFallback();
}

/**
 * Events wiring
 */

selUI.selectAll.onclick = toggleSelectAll;

mainUI.importQuery.onclick = async () => {
    const selections = getSelections();
    const suggested = `${selections.table || "state"}.json`;

    const text = await loadFile(suggested, "application/json");
    if (!text) return; // user cancelled

    try {
        const imported = JSON.parse(text);

        if (!imported.table) {
            alert("Missing 'table'");
            return;
        }

        setSelections(imported);
        buildQuery();
    } catch (err) {
        alert("Invalid JSON");
    }
};

async function exportQuery() {
    const selections = getSelections();
    const contents = JSON.stringify(selections, null, 2);
    const fileName = `${selections.table || "state"}.json`;

    saveFile(fileName, contents, "application/json");
}

mainUI.exportQuery.onclick = exportQuery;

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
    loadTableCols();
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
    if (e.key === 'Enter')
        runQuery();
});