import os
import re
import sqlite3
from typing import Any
from bs4 import BeautifulSoup

# class Col:
#     def __init__(self, name, dbtype, ignore_by_default=False, short_name=None):
#         self.name = name
#         self.dbtype = dbtype
#         self.ignore_by_default = ignore_by_default
#         self.short_name = short_name if short_name else name

DBNAME = "pf2.db"
RE_MULTIPLE_SPACES = re.compile(r"\s{2,}")


def normalize_str(s: str) -> str:
    if not s:
        return s

    s = s.strip()
    s = re.sub(RE_MULTIPLE_SPACES, " ", s)
    s = s.replace(" , ", ", ")

    return s


def normalize_colname(name: str) -> str:
    return normalize_str(name).lower().replace(" ", "_")


def normalize_cols(cols: list[(str, str)]) -> list[(str, str)]:
    return [(normalize_colname(name), ty.upper()) for name, ty in cols]


def normalize_rows(rows: list[list[Any]]) -> list[list[Any]]:
    def norm(x):
        return normalize_str(x) if x is str else x

    return list(map(lambda row: map(norm, row), rows))


def parse_text(soup):
    """
    like bs4.get_text(), but
    - preserves `strong`, `b`, `a` tags
    - prefixes all href attributes with `baseurl`
    """
    from bs4 import NavigableString, Tag

    def inner(soup) -> str:
        baseurl = "https://2e.aonprd.com"

        # plain text → return as-is
        if isinstance(soup, NavigableString):
            return soup

        # tag
        if isinstance(soup, Tag):
            # <a>
            if soup.name == "a":
                inner = " ".join(parse_text(c) for c in soup.children)
                url = soup.get("href")
                if not url or not url.startswith("/"):
                    return inner

                abs_url = baseurl + url
                return f'<a href="{abs_url}">{inner}</a>'

            # <strong> or <b>
            if soup.name in ("strong", "b"):
                inner = "".join(parse_text(c) for c in soup.children)
                return f"<strong>{inner}</strong>"

            # everything else → unwrap but keep inner text
            return " ".join(parse_text(c) for c in soup.children)

        return ""

    return inner(soup).strip()


def parse_pfs_icon(soup):
    PFS_TYPES = ["Standard", "Limited", "Restricted"]

    img = soup.find("img")
    if not img:
        return ""

    src: str = img.get("src")
    if not src:
        return ""

    basename = os.path.basename(src).lower()

    # find by case-insensitive, return first letter
    for ty in PFS_TYPES:
        if ty.lower() in basename:
            return ty[0]

    return basename


def create_table_and_values(table: str, cols: list[(str, str)], rows: list[list[str]]):
    conn = sqlite3.connect(DBNAME)
    cursor = conn.cursor()

    cursor.execute(f"DROP TABLE IF EXISTS {table}")

    scols = ", ".join([f"{name} {ty}" for name, ty in cols])
    cursor.execute(f"CREATE TABLE IF NOT EXISTS {table}({scols})")

    assert all(map(lambda x: len(x) == len(cols), rows))

    values = ",".join(["?"] * len(cols))
    cursor.executemany(f"INSERT INTO {table} VALUES ({values})", rows)

    conn.commit()
    conn.close()


def scrape_generic_table(basename: str):
    dbtable = basename
    filein = basename + ".html"

    with open(filein, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    table = soup.find("table")

    # cols
    thead = table.find("thead")
    thead_rows = thead.find_all("tr")
    assert len(thead_rows) == 1
    thead_cols = thead_rows[0].find_all("th")
    assert thead_cols

    pfs_idx = -1
    source_idx = -1
    colnames = []
    for idx, cell in enumerate(thead_cols):
        name = cell.get_text(strip=True).lower()

        if name == "source":
            source_idx = idx
            continue

        if name == "pfs":
            pfs_idx = idx

        colnames.append(name)

    colnames = list(map(normalize_colname, colnames))

    # rows
    tbody = table.find("tbody")
    tbody_rows = tbody.find_all("tr")

    rows = []
    for tr in tbody_rows:
        tds = tr.find_all("td")
        row = []
        for idx, cell in enumerate(tds):
            if idx == source_idx:
                continue
            elif idx == pfs_idx:
                text = parse_pfs_icon(cell)
            else:
                text = parse_text(cell)

            row.append(normalize_str(text.capitalize()))

        rows.append(row)

    cols = [(name, "TEXT") for name in colnames]

    create_table_and_values(dbtable, cols, rows)
