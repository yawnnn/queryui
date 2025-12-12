from scraping.common import parse_text, parse_pfs_icon, normalize_str, normalize_cols, create_table_and_values
from bs4 import BeautifulSoup
import os

if __name__ == "__main__":
    basename = os.path.splitext(os.path.basename(__file__))[0]
    dbname = "pf2.db"
    dbtable = basename
    filein = basename + ".html"
    fileout = basename + ".csv"

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

        pcols.append((text, "TEXT"))
    pcols = normalize_cols(pcols)

    # rows
    tbody = table.find("tbody")
    rows = tbody.find_all("tr")

    prows = []
    for row in rows:
        cells = row.find_all("td")
        if source_idx >= 0:
            cells = cells[:source_idx] + cells[source_idx + 1 :]
        csv_row = []

        for idx, cell in enumerate(cells):
            if idx == pfs_idx:
                text = parse_pfs_icon(cell)
            else:
                text = parse_text(cell)
            text = text.capitalize()
            csv_row.append(normalize_str(text))
        prows.append(csv_row)

    create_table_and_values(dbtable, pcols, prows)
