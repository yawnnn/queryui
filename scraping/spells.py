from common import parse_text, create_table_and_values, normalize_str, normalize_colname, infer_cols_types
from bs4 import BeautifulSoup
import re
import os

CN_ID = "id"
CN_NAME = "name"
CN_ACTIONS = "actions"
CN_CATEGORY = "category"
CN_LVL = "lvl"
CN_RARITY = "rarity"
CN_CONCENTRATE = "concentrate"
CN_TRAITS = "traits"
CN_DESCRIPTION = "description"
CN_HEIGHTENED = "heightened"

BASE_COLS = [
    (CN_NAME, "TEXT"),
    (CN_ACTIONS, "TEXT"),
    (CN_CATEGORY, "TEXT"),
    (CN_LVL, "INTEGER"),
    (CN_RARITY, "TEXT"),
    (CN_CONCENTRATE, "INTEGER"),
    (CN_TRAITS, "TEXT"),
    (CN_DESCRIPTION, "TEXT"),
    (CN_HEIGHTENED, "TEXT"),
]

RE_ACTIONS = re.compile(r" [Aa]ctions?")


def parse_actions(s: str) -> str:
    s = s.strip()

    if not s:
        return s

    if s[0] == "[" and s[-1] == "]":
        s = s[1:-1]
        s = s.replace("-", " ").capitalize()

    s = re.sub(RE_ACTIONS, "", s).strip()
    slower = s.lower()

    if slower.startswith("one"):
        s = "1"
    elif slower.startswith("two"):
        s = "2"
    elif slower.startswith("three"):
        s = "3"
    elif slower.startswith("free"):
        s = "0"
    elif slower.startswith("reaction"):
        s = "R"

    return s


PLURALS = {
    "bloodline": "bloodlines",
    "patron_theme": "patron_themes",
    "tradition": "traditions",
    "mystery": "mysteries",
    "deity": "deities",
}


def parse_dyn_col(dyn_cols_freqs, name):
    colname = normalize_colname(name)

    # always skip source
    if colname == "source":
        return None

    # sometimes they're present with their singular name
    colname = PLURALS.get(colname, colname)
    dyn_cols_freqs[colname] = dyn_cols_freqs.get(colname, 0) + 1

    return colname


def parse_dyn_vals(dyn_cols_freqs, dyn_vals, soup):
    for p in soup.find_all("p", recursive=False):
        s = p.find("strong")
        if not s:
            continue

        col = s.text.strip().rstrip(":")
        val = p.get_text(" ", strip=True)[len(s.text) :].strip()
        col = parse_dyn_col(dyn_cols_freqs, col)
        if col:
            dyn_vals[col] = normalize_str(val)


def parse(html):
    dyn_cols_freqs = {}
    rows: list[dict] = []
    dyn_rows: list[dict] = []

    soup = BeautifulSoup(html, "html.parser")
    ol = soup.find("ol")
    lis = ol.find_all("li", recursive=False)

    for li in lis:
        vals = {}
        dyn_vals = {}

        section = li.select_one("div.column.gap-tiny")
        assert section

        # dynamic columns
        parse_dyn_vals(dyn_cols_freqs, dyn_vals, section)
        for row in section.find_all("div", class_="row", recursive=False):
            parse_dyn_vals(dyn_cols_freqs, dyn_vals, row)

        # NAME
        art = li.find("article")
        title_p = art.find("p")
        a = title_p.find("a")
        vals[CN_NAME] = parse_text(a)

        # ACTIONS
        action_tag = title_p.find("span", class_="icon-font")
        vals[CN_ACTIONS] = parse_actions(action_tag.text.strip()) if action_tag else None

        # CATEGORY + LEVEL
        cat_div = art.find("div", class_="align-right")
        cat_text = cat_div.get_text(strip=True)
        cat, lvl = cat_text.split()
        vals[CN_LVL] = int(lvl)
        vals[CN_CATEGORY] = cat

        # TRAITS
        traits_div = art.find("div", class_="row traits wrap")
        vals[CN_RARITY] = "Common"
        vals[CN_CONCENTRATE] = 0
        traits_list = []

        for d in traits_div.find_all("div", class_="trait"):
            t = normalize_str(parse_text(d))
            cls = d.get("class", [])

            # rarity
            if "trait-uncommon" in cls:
                vals[CN_RARITY] = "Uncommon"
                continue
            elif "trait-rare" in cls:
                vals[CN_RARITY] = "Rare"
                continue

            if t == vals[CN_CATEGORY]:
                continue

            if t == "Concentrate":
                vals[CN_CONCENTRATE] = 1
                continue

            traits_list.append(t)

        vals[CN_TRAITS] = ", ".join(traits_list)

        # DESCRIPTION (first <hr> to next <hr>)
        hrs = art.find_all("hr")
        vals[CN_DESCRIPTION] = ""
        if hrs:
            first = hrs[0]
            parts = []
            for sib in first.next_siblings:
                if getattr(sib, "name", None) == "hr":
                    break
                if getattr(sib, "name", None) in ("p", "ul", "ol"):
                    parts.append(parse_text(sib))
            vals[CN_DESCRIPTION] = normalize_str("\n".join(parts))

        # HEIGHTENED
        heightened_vals = []
        for p in art.find_all("p"):
            s = p.find("strong")
            if not s:
                continue
            if s.text.startswith("Heightened"):
                m = re.search(r"\((.*?)\)", s.text)
                if m:
                    heightened_vals.append(m.group(1))

        vals[CN_HEIGHTENED] = ", ".join(heightened_vals)

        rows.append(vals)
        dyn_rows.append(dyn_vals)

    # sort by popularity
    dyn_colnames = sorted(dyn_cols_freqs, key=lambda x: dyn_cols_freqs[x], reverse=True)
    #  build the actual rows in the right order, filling missing cols with None
    dyn_rows = [[dyn_row.get(name) for name in dyn_colnames] for dyn_row in dyn_rows]
    # infer types
    dyn_cols = infer_cols_types(dyn_colnames, dyn_rows)

    # now that i have everything i create the full cols list and build the rows following the same order
    allcols = BASE_COLS + dyn_cols

    allrows = []
    for row, dyn_row in zip(rows, dyn_rows):
        allrow = [row.get(name) for name, _ in BASE_COLS] + dyn_row
        allrows.append(allrow)

    return (allcols, allrows)


if __name__ == "__main__":
    basename = os.path.splitext(os.path.basename("spells.py"))[0]
    dbname = "pf2.db"
    dbtable = basename
    filein = basename + ".html"

    html = open(filein, encoding="utf-8").read()
    cols, rows = parse(html)
    create_table_and_values(dbtable, cols, rows)
