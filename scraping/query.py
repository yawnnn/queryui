import sqlite3
import csv


def write_csv(inname: str, prows: list[list[str]], outname: str):
    with open(outname, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(prows)
    print(f"{inname} → {outname}")


if __name__ == "__main__":
    dbname = "scrape.db"
    dbtable = "deities"

    conn = sqlite3.connect(dbname)
    cursor = conn.cursor()

    """
    CREATE TABLE deities(
        name TEXT, 
        pfs TEXT, 
        edict TEXT, 
        anathema TEXT, 
        domain TEXT, 
        divine_font TEXT, 
        sanctification TEXT, 
        ability TEXT, 
        skill TEXT, 
        favored_weapon TEXT, 
        deity_category TEXT, 
        pantheon TEXT, 
        source TEXT);
    """

    cols = ["name", "edict", "anathema", "domain", "favored_weapon"]
    qcols = ", ".join([f"TRIM({c})" for c in cols])

    q = f"""
        SELECT {qcols}
        FROM deities
        WHERE LOWER(pfs) != 'restricted' AND LOWER(divine_font) LIKE '%heal%' AND LOWER(domain) LIKE '%air%'
    """.strip()
    print(q)
    rows = cursor.execute(q).fetchall()

    widths = [0] * len(cols)
    for r in rows:
        for idx, c in enumerate(r):
            widths[idx] = max(widths[idx], len(c))

    rows2 = [cols]
    for r in rows:
        r2 = [col.ljust(widths[idx]) for idx, col in enumerate(r)]
        rows2.append(r2)

    write_csv("query", rows2, "query.csv")

    conn.close()
