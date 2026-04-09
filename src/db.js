import { escapeIdentifier } from "./query.js";

export async function loadDatabase() {
    const SQL = await window.initSqlJs({
        locateFile: () => "resources/sql-wasm-1.13.0.wasm",
    });

    const response = await fetch("resources/pathfinder2e.db", { cache: "no-store" });
    if (!response.ok)
        throw new Error(`Failed to load database: ${response.status} ${response.statusText}`);

    const data = await response.arrayBuffer();
    
    return new SQL.Database(new Uint8Array(data));
}

export function getTables(db) {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");

    return result[0]?.values.map(([name]) => name) ?? [];
}

export function getTableColumns(db, tableName) {
    const result = db.exec(`PRAGMA table_info(${escapeIdentifier(tableName)});`);

    return result[0]?.values.map((row) => row[1]) ?? [];
}

export function runSql(db, sql) {
    return db.exec(sql);
}