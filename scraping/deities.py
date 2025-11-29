from bs4 import BeautifulSoup
import csv
import os
import re
import argparse
import sqlite3


def cv_pfs(_args, _pcols, cell):
    """Extract Standard/Limited/Restricted based on icon filename."""
    PFS_TYPES = ["Standard", "Limited", "Restricted"]

    img = cell.find("img")
    if not img:
        return ""

    src = img.get("src", "").lower()
    filename = os.path.basename(src)

    # match any of the keywords in filename
    for ty in PFS_TYPES:
        if ty.lower() in filename:
            return ty

    return filename

def mk_link(text: str, url: str) -> str:
    if not text:
        return ""
    if not url:
        return text
    #return f"({text})[2e.aonprd.com{url}]"
    return f'<a href="https://2e.aonprd.com{url}">{text}</a>'

def cv_text(args, _pcols, cell):
    """Convert links inside a cell to markdown format but keep plain text otherwise."""
    # Make a clone to avoid modifying original
    cell = cell.encode_contents().decode()

    soup = BeautifulSoup(cell, "html.parser")

    for a in soup.find_all("a"):
        text = a.get_text(strip=True)
        url = a.get("href", "")
        if text and url and not args.no_links:
            a.replace_with(mk_link(text, url))

    # get clean text
    return soup.get_text(separator=" ", strip=True)


def normalize(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\s{2,}", " ", s)
    s = s.replace(" , ", ", ")
    # s = s.capitalize()
    return s


def write_csv(inname: str, prows: list[list[str]], outname: str):
    with open(outname, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(prows)
    print(f"{inname} → {outname}")


def write_db(inname: str, prows: list[list[str]], dbname: str, dbtable: str):
    conn = sqlite3.connect(dbname)
    cursor = conn.cursor()

    cursor.execute(f"DROP TABLE IF EXISTS {dbtable}")
    
    cols = [col.lower().replace(" ", "_") for col in prows[0]]
    fields = ", ".join([f"{col} TEXT" for col in cols])
    cursor.execute(f"""CREATE TABLE IF NOT EXISTS {dbtable}({fields})""")

    values = ",".join(["?"] * len(cols))
    cursor.executemany(f"INSERT INTO {dbtable} VALUES ({values})", prows[1:])

    conn.commit()
    conn.close()

    print(f"{inname} → {dbname}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="parse HTML table")
    #parser.add_argument("filename", type=str, help="input filename")
    parser.add_argument("-l", "--no-links", action="store_true", help="don't retain link data")
    parser.add_argument("-c", "--csv", action="store_true", help="output to CSV")
    parser.add_argument("-d", "--db", action="store_true", help="output to DB (sqlite)")
    args = parser.parse_args()

    basename = os.path.splitext(os.path.basename(__file__))[0]
    dbname = "pf2.db"
    dbtable = basename
    filein = basename + ".html"
    fileout = basename + ".csv"
    
    dbtable = basename

    with open(filein, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    table = soup.find("table")

    # columns
    thead = table.find("thead")
    thead_rows = thead.find_all("tr")
    assert len(thead_rows) == 1
    cols = thead_rows[0].find_all("th")
    assert cols

    pfs_idx = -1
    source_idx = -1
    pcols = []
    for idx, cell in enumerate(cols):
        text = cell.get_text(strip=True).lower()
        
        if text == "source":
            source_idx = idx
            continue

        if text == "pfs":
            pfs_idx = idx
            text = text.upper()
        else:
            text = text.capitalize()
        pcols.append(normalize(text))

    # rows
    tbody = table.find("tbody")
    rows = tbody.find_all("tr")

    prows = [pcols]
    for row in rows:
        cells = row.find_all("td")
        if source_idx >= 0:
            cells = cells[:source_idx] + cells[source_idx+1:]
        csv_row = []

        for idx, cell in enumerate(cells):
            if idx == pfs_idx:
                text = cv_pfs(args, pcols, cell).capitalize()
            else:
                text = cv_text(args, pcols, cell).capitalize()
            csv_row.append(normalize(text))
        prows.append(csv_row)

    if args.csv:
        write_csv(filein, prows, fileout)
    else:
        write_db(filein, prows, dbname, dbtable)
