import { getTableColumns, getTables, loadDatabase, runSql } from "./db.js";
import { loadFile, saveFile } from "./fileio.js";
import { escapeIdentifier, buildQuery, nextSortDirection, parseOrderClause } from "./query.js";
import { canGoNext, canGoPrev, cloneSelections, createHistory, goNext, goPrev, pushHistory } from "./state.js";
import {
    createUI,
    readSelections,
    renderColumnOptions,
    renderEmptyResults,
    renderError,
    renderResults,
    renderSql,
    renderTableOptions,
    resetResults,
    setHistoryButtons,
    setSelectAllText,
    writeSelectionFields,
} from "./ui.js";

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
    const columns = getTableColumns(db, table);

    renderColumnOptions(ui, columns, (column) => {
        if (selectedCols !== null)
            return selectedCols.includes(column);

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
    if (!db)
        return;

    const selections = readSelections(ui);
    const sql = updateQueryPreview();

    if (!sql)
        return;

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

    if (!text)
        return;

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
        if (selections)
            applySelections(selections);
        syncHistoryButtons();
    });

    ui.main.next.addEventListener("click", () => {
        const selections = goNext(history);
        if (selections)
            applySelections(selections);
        syncHistoryButtons();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Enter")
            runQuery();
    });
}

async function init() {
    bindEvents();
    syncHistoryButtons();

    try {
        db = await loadDatabase();

        const tables = getTables(db);
        renderTableOptions(ui, tables);

        ui.sel.tableSelect.value = tables[0] || "";

        loadColumns();
    } catch (error) {
        resetResults(ui);
        renderError(ui, error.message);
    }
}

window.addEventListener("load", init);