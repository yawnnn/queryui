export function createUI() {
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

export function readSelections(ui) {
    return {
        table: ui.sel.tableSelect.value,
        cols: [...ui.sel.colsSelect.querySelectorAll("input:checked")].map((input) => input.value),
        where: ui.sel.whereClause.value,
        order: ui.sel.orderByClause.value,
        limit: ui.sel.limitClause.value,
        distinct: ui.sel.distinctClause.checked,
    };
}

export function writeSelectionFields(ui, selections) {
    ui.sel.tableSelect.value = selections.table;
    ui.sel.whereClause.value = selections.where;
    ui.sel.orderByClause.value = selections.order;
    ui.sel.limitClause.value = selections.limit;
    ui.sel.distinctClause.checked = selections.distinct;
}

export function renderTableOptions(ui, tables) {
    ui.sel.tableSelect.textContent = "";

    for (const table of tables) {
        const option = document.createElement("option");
        option.value = table;
        option.textContent = table;
        ui.sel.tableSelect.appendChild(option);
    }
}

export function renderColumnOptions(ui, columns, isChecked) {
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

export function setSelectAllText(ui, text) {
    ui.sel.selectAll.textContent = text;
}

export function setHistoryButtons(ui, { canPrev, canNext }) {
    ui.main.prev.disabled = !canPrev;
    ui.main.next.disabled = !canNext;
}

export function renderSql(ui, sql) {
    ui.main.showSql.textContent = sql;
}

export function resetResults(ui) {
    ui.main.results.textContent = "";
    ui.main.rowCount.textContent = "";
    ui.main.exportQuery.hidden = true;
}

export function renderError(ui, message) {
    const p = document.createElement("p");
    p.style.color = "red";
    p.textContent = `Error: ${message}`;
    ui.main.results.appendChild(p);
}

export function renderEmptyResults(ui) {
    const p = document.createElement("p");
    p.textContent = "No results.";
    ui.main.results.appendChild(p);
}

export function renderResults(ui, result, currentSort, onSort) {
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
            td.innerHTML = cell == null ? "" : String(cell);    // this can be HTML and needs to be rendered as such
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