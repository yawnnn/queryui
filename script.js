function escapeIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

async function loadDatabase() {
    if (typeof window.initSqlJs !== "function") {
        throw new Error("sql.js failed to load");
    }

    const SQL = await window.initSqlJs({
        locateFile: () => "resources/sql-wasm-1.13.0.wasm",
    });

    const response = await fetch("resources/pathfinder2e.db", { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load database: ${response.status} ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(data));
}

function getTables(db) {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
    return result[0]?.values.map(([name]) => name) ?? [];
}

function getTableColumns(db, tableName) {
    const result = db.exec(`PRAGMA table_info(${escapeIdentifier(tableName)});`);
    return result[0]?.values.map((row) => row[1]) ?? [];
}

function runSql(db, sql) {
    return db.exec(sql);
}

function getExtension(fileName) {
    const index = fileName.lastIndexOf(".");
    return index >= 0 ? fileName.slice(index) : "";
}

function isAbortError(error) {
    return error?.name === "AbortError";
}

function saveFileFallback(fileName, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(url);
}

async function saveFilePicker(fileName, contents, type) {
    const ext = getExtension(fileName);
    const accept = { [type]: [ext] };

    const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ accept }],
    });

    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
}

async function saveFile(fileName, contents, type) {
    try {
        if (window.showSaveFilePicker) {
            await saveFilePicker(fileName, contents, type);
            return;
        }

        saveFileFallback(fileName, contents, type);
    } catch (error) {
        if (!isAbortError(error)) {
            throw error;
        }
    }
}

function loadFileFallback(type) {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = type;

        input.onchange = async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            try {
                resolve(await file.text());
            } catch (error) {
                reject(error);
            }
        };

        input.click();
    });
}

async function loadFilePicker(fileName, type) {
    const ext = getExtension(fileName);
    const accept = { [type]: [ext] };

    const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ accept }],
    });

    const file = await handle.getFile();
    return file.text();
}

async function loadFile(fileName, type) {
    try {
        if (window.showOpenFilePicker) {
            return await loadFilePicker(fileName, type);
        }

        return await loadFileFallback(type);
    } catch (error) {
        if (isAbortError(error)) {
            return null;
        }

        throw error;
    }
}

function escapeIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function buildQuery(selections) {
    if (!selections.table) {
        return "";
    }

    const columns = selections.cols.length
        ? selections.cols.map(escapeIdentifier).join(", ")
        : "*";

    const parts = [
        `SELECT ${selections.distinct ? "DISTINCT " : ""}${columns}`,
        `FROM ${escapeIdentifier(selections.table)}`,
    ];

    if (selections.where.trim()) {
        parts.push(`WHERE ${selections.where.trim()}`);
    }

    if (selections.order.trim()) {
        parts.push(`ORDER BY ${selections.order.trim()}`);
    }

    if (selections.limit.trim()) {
        parts.push(`LIMIT ${selections.limit.trim()}`);
    }

    return parts.join("\n");
}

function parseOrderClause(value) {
    const text = value.trim();
    if (!text) {
        return null;
    }

    const quoted = text.match(/^"((?:[^"]|"")*)"\s+(ASC|DESC)$/i);
    if (quoted) {
        return {
            column: quoted[1].replace(/""/g, '"'),
            direction: quoted[2].toUpperCase(),
        };
    }

    const plain = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(ASC|DESC)$/i);
    if (plain) {
        return {
            column: plain[1],
            direction: plain[2].toUpperCase(),
        };
    }

    return null;
}

function nextSortDirection(currentSort, column) {
    if (!currentSort || currentSort.column !== column) {
        return "ASC";
    }

    return currentSort.direction === "ASC" ? "DESC" : "ASC";
}

function cloneSelections(selections = {}) {
    return {
        table: selections.table ?? "",
        cols: Array.isArray(selections.cols) ? [...selections.cols] : [],
        where: selections.where ?? "",
        order: selections.order ?? "",
        limit: selections.limit ?? "",
        distinct: Boolean(selections.distinct),
    };
}

function createHistory() {
    return {
        lst: [],
        idx: -1,
    };
}

function pushHistory(history, selections) {
    history.lst = history.lst.slice(0, history.idx + 1);
    history.lst.push(cloneSelections(selections));
    history.idx = history.lst.length - 1;
}

function canGoPrev(history) {
    return history.idx > 0;
}

function canGoNext(history) {
    return history.idx >= 0 && history.idx < history.lst.length - 1;
}

function goPrev(history) {
    if (!canGoPrev(history)) {
        return null;
    }

    history.idx -= 1;
    return cloneSelections(history.lst[history.idx]);
}

function goNext(history) {
    if (!canGoNext(history)) {
        return null;
    }

    history.idx += 1;
    return cloneSelections(history.lst[history.idx]);
}

function createUI() {
    return {
        sel: {
            tableSelect: document.getElementById("tableSelect"),
            colsSelect: document.getElementById("colsSelect"),
            selectAll: document.getElementById("selectAll"),
            whereClause: document.getElementById("whereClause"),
            orderByClause: document.getElementById("orderByClause"),
            limitClause: document.getElementById("limitClause"),
            distinctClause: document.getElementById("distinctClause"),
        },
        main: {
            prev: document.getElementById("prev"),
            next: document.getElementById("next"),
            showSql: document.getElementById("showSql"),
            runQuery: document.getElementById("runQuery"),
            rowCount: document.getElementById("rowCount"),
            importQuery: document.getElementById("importQuery"),
            exportQuery: document.getElementById("exportQuery"),
            results: document.getElementById("results"),
        },
    };
}

function readSelections(ui) {
    return {
        table: ui.sel.tableSelect.value,
        cols: [...ui.sel.colsSelect.querySelectorAll("input:checked")].map((input) => input.value),
        where: ui.sel.whereClause.value,
        order: ui.sel.orderByClause.value,
        limit: ui.sel.limitClause.value,
        distinct: ui.sel.distinctClause.checked,
    };
}

function writeSelectionFields(ui, selections) {
    ui.sel.tableSelect.value = selections.table;
    ui.sel.whereClause.value = selections.where;
    ui.sel.orderByClause.value = selections.order;
    ui.sel.limitClause.value = selections.limit;
    ui.sel.distinctClause.checked = selections.distinct;
}

function renderTableOptions(ui, tables) {
    ui.sel.tableSelect.textContent = "";

    for (const table of tables) {
        const option = document.createElement("option");
        option.value = table;
        option.textContent = table;
        ui.sel.tableSelect.appendChild(option);
    }
}

function renderColumnOptions(ui, columns, isChecked) {
    ui.sel.colsSelect.textContent = "";

    for (const column of columns) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.value = column;
        checkbox.checked = isChecked(column);

        label.appendChild(checkbox);
        label.append(` ${column}`);
        ui.sel.colsSelect.appendChild(label);
    }
}

function setSelectAllText(ui, text) {
    ui.sel.selectAll.textContent = text;
}

function setHistoryButtons(ui, { canPrev, canNext }) {
    ui.main.prev.disabled = !canPrev;
    ui.main.next.disabled = !canNext;
}

function renderSql(ui, sql) {
    ui.main.showSql.textContent = sql;
}

function resetResults(ui) {
    ui.main.results.textContent = "";
    ui.main.rowCount.textContent = "";
    ui.main.exportQuery.hidden = true;
}

function renderError(ui, message) {
    const p = document.createElement("p");
    p.style.color = "red";
    p.textContent = `Error: ${message}`;
    ui.main.results.appendChild(p);
}

function renderEmptyResults(ui) {
    const p = document.createElement("p");
    p.textContent = "No results.";
    ui.main.results.appendChild(p);
}

function renderResults(ui, result, currentSort, onSort) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const tbody = document.createElement("tbody");

    for (const column of result.columns) {
        const th = document.createElement("th");
        const isSorted = currentSort?.column === column;
        const arrow = isSorted ? (currentSort.direction === "ASC" ? " ↑" : " ↓") : "";

        th.textContent = `${column}${arrow}`;
        th.addEventListener("click", () => onSort(column));
        headRow.appendChild(th);
    }

    for (const row of result.values) {
        const tr = document.createElement("tr");

        for (const cell of row) {
            const td = document.createElement("td");
            td.innerHTML = cell == null ? "" : String(cell);    // this can be HTML and needs to be renderered
            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    }

    thead.appendChild(headRow);
    table.appendChild(thead);
    table.appendChild(tbody);

    ui.main.rowCount.textContent = `${result.values.length} rows`;
    ui.main.exportQuery.hidden = false;
    ui.main.results.appendChild(table);
}

const ui = createUI();
const history = createHistory();

let db = null;
let currentQuery = "";

function ignoreColByDefault(table, col) {
    if (table !== "spells")
        return false;

    return [
        "rarity",
        "cast",
        "concentrate",
        "traditions",
        "domain",
        "requiremenets",
        "bloodlines",
        "mysteries",
        "lesson",
        "patron_themes",
        "deities",
        "pfs_note",
        "cost",
    ].includes(col);
}

function syncHistoryButtons() {
    setHistoryButtons(ui, {
        canPrev: canGoPrev(history),
        canNext: canGoNext(history),
    });
}

function syncSelectAllButton() {
    const table = ui.sel.tableSelect.value;
    const checkboxes = [...ui.sel.colsSelect.querySelectorAll("input")];
    const selectable = checkboxes.filter((checkbox) => !ignoreColByDefault(table, checkbox.value));
    const allChecked = selectable.length > 0 && selectable.every((checkbox) => checkbox.checked);

    setSelectAllText(ui, allChecked ? "Deselect All" : "Select All");
}

function updateQueryPreview() {
    currentQuery = buildQuery(readSelections(ui));
    renderSql(ui, currentQuery);
    syncSelectAllButton();
    return currentQuery;
}

function loadColumns(selectedCols = null) {
    const table = ui.sel.tableSelect.value;
    const columns = getTableColumns(db, table).filter((column) => column !== "id");

    renderColumnOptions(ui, columns, (column) => {
        if (selectedCols !== null) {
            return selectedCols.includes(column);
        }

        return !ignoreColByDefault(table, column);
    });

    updateQueryPreview();
}

function applySelections(selections) {
    const nextSelections = cloneSelections(selections);
    writeSelectionFields(ui, nextSelections);
    loadColumns(nextSelections.cols);
}

function toggleSelectAll() {
    const table = ui.sel.tableSelect.value;
    const checkboxes = [...ui.sel.colsSelect.querySelectorAll("input")];
    const selectable = checkboxes.filter((checkbox) => !ignoreColByDefault(table, checkbox.value));
    const allChecked = selectable.length > 0 && selectable.every((checkbox) => checkbox.checked);

    for (const checkbox of selectable) {
        checkbox.checked = !allChecked;
    }

    updateQueryPreview();
}

function handleSort(column) {
    const currentSort = parseOrderClause(ui.sel.orderByClause.value);
    const nextDirection = nextSortDirection(currentSort, column);

    ui.sel.orderByClause.value = `${escapeIdentifier(column)} ${nextDirection}`;
    runQuery();
}

function runQuery() {
    if (!db) {
        return;
    }

    const selections = readSelections(ui);
    const sql = updateQueryPreview();

    if (!sql) {
        return;
    }

    pushHistory(history, selections);
    syncHistoryButtons();
    resetResults(ui);

    let result;
    try {
        result = runSql(db, sql);
    } catch (error) {
        renderError(ui, error.message);
        return;
    }

    if (!result.length) {
        renderEmptyResults(ui);
        return;
    }

    renderResults(ui, result[0], parseOrderClause(selections.order), handleSort);
}

async function importQuery() {
    const selections = readSelections(ui);
    const fileName = `${selections.table || "state"}.json`;
    const text = await loadFile(fileName, "application/json");

    if (!text) {
        return;
    }

    try {
        const imported = JSON.parse(text);

        if (!imported.table) {
            alert("Missing 'table'");
            return;
        }

        applySelections(imported);
    } catch {
        alert("Invalid JSON");
    }
}

async function exportQuery() {
    const selections = readSelections(ui);
    const fileName = `${selections.table || "state"}.json`;
    const contents = JSON.stringify(selections, null, 2);

    await saveFile(fileName, contents, "application/json");
}

function bindEvents() {
    ui.sel.selectAll.addEventListener("click", toggleSelectAll);
    ui.sel.tableSelect.addEventListener("change", () => loadColumns());
    ui.sel.colsSelect.addEventListener("change", updateQueryPreview);

    for (const element of [ui.sel.whereClause, ui.sel.orderByClause, ui.sel.limitClause]) {
        element.addEventListener("input", updateQueryPreview);
        element.addEventListener("change", updateQueryPreview);
    }

    ui.sel.distinctClause.addEventListener("change", updateQueryPreview);

    ui.main.runQuery.addEventListener("click", runQuery);
    ui.main.importQuery.addEventListener("click", importQuery);
    ui.main.exportQuery.addEventListener("click", exportQuery);

    ui.main.prev.addEventListener("click", () => {
        const selections = goPrev(history);
        if (selections) {
            applySelections(selections);
        }
        syncHistoryButtons();
    });

    ui.main.next.addEventListener("click", () => {
        const selections = goNext(history);
        if (selections) {
            applySelections(selections);
        }
        syncHistoryButtons();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            runQuery();
        }
    });
}

async function init() {
    bindEvents();
    syncHistoryButtons();

    try {
        db = await loadDatabase();

        const tables = getTables(db);
        renderTableOptions(ui, tables);

        if (tables.includes("spells")) {
            ui.sel.tableSelect.value = "spells";
        }

        loadColumns();
    } catch (error) {
        resetResults(ui);
        renderError(ui, error.message);
    }
}

window.addEventListener("load", init);