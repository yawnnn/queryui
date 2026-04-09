export function escapeIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildQuery(selections) {
    if (!selections.table)
        return "";

    const columns = selections.cols.length
        ? selections.cols.map(escapeIdentifier).join(", ")
        : "*";

    const parts = [
        `SELECT ${selections.distinct ? "DISTINCT " : ""}${columns}`,
        `FROM ${escapeIdentifier(selections.table)}`,
    ];

    if (selections.where.trim())
        parts.push(`WHERE ${selections.where.trim()}`);

    if (selections.order.trim())
        parts.push(`ORDER BY ${selections.order.trim()}`);

    if (selections.limit.trim())
        parts.push(`LIMIT ${selections.limit.trim()}`);

    return parts.join("\n");
}

export function parseOrderClause(value) {
    const text = value.trim();
    if (!text)
        return null;

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

export function nextSortDirection(currentSort, column) {
    if (!currentSort || currentSort.column !== column)
        return "ASC";

    return currentSort.direction === "ASC" ? "DESC" : "ASC";
}