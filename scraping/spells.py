from bs4 import BeautifulSoup
import re
import sqlite3
import os

CN_ID = "id"
CN_NAME = "name"
CN_ACTION = "action"
CN_CATEGORY = "category"
CN_LVL = "lvl"
CN_RARITY = "rarity"
CN_CONCENTRATE = "concentrate"
CN_TRAITS = "traits"
CN_DESCRIPTION = "description"
CN_HEIGHTENED = "heightened"

BASE_COLS = [
    (CN_ID, "INTEGER PRIMARY KEY"),
    (CN_NAME, "TEXT"),
    (CN_ACTION, "TEXT"),
    (CN_CATEGORY, "TEXT"),
    (CN_LVL, "INTEGER"),
    (CN_RARITY, "TEXT"),
    (CN_CONCENTRATE, "INTEGER"),
    (CN_TRAITS, "TEXT"),
    (CN_DESCRIPTION, "TEXT"),
    (CN_HEIGHTENED, "TEXT"),
]

def mk_colname(s: str) -> str:
    return s.strip().lower().replace(" ", "_")


def parse_extra_cols(lis):
    plurals = {
        "bloodline": "bloodlines",
        "patron_theme": "patron_themes",
        "tradition": "traditions",
        "mystery": "mysteries",
        "deity": "deities",
    }
    cols = {}
    vals = {}

    def add(idx_li, name, val):
        colname = mk_colname(name)
        if colname != "source":
            colname = plurals.get(colname, colname)
            cols[colname] = cols.get(colname, 0) + 1
            if colname not in vals:
                vals[colname] = [None] * len(lis)
            if isinstance(val, str):
                val = val.replace(" , ", ", ")
            vals[colname][idx_li] = val


    for idx_li, li in enumerate(lis):
        section = li.select_one("div.column.gap-tiny")
        assert section

        # p tags directly inside
        for p in section.find_all("p", recursive=False):
            s = p.find("strong")
            if s:
                name = s.text.strip().rstrip(":")
                val = p.get_text(" ", strip=True)[len(s.text) :].strip()
                add(idx_li, name, val)

        # row blocks
        for row in section.find_all("div", class_="row", recursive=False):
            for p in row.find_all("p", recursive=False):
                s = p.find("strong")
                if s:
                    name = s.text.strip().rstrip(":")
                    val = p.get_text(" ", strip=True)[len(s.text) :].strip()
                    add(idx_li, name, val)

    # sort by popularity
    sorted_names = sorted(cols, key=lambda x: cols[x], reverse=True)
    cols = [(name, "TEXT") for name in sorted_names]

    return (cols, vals)


def create_table(conn, dbtable, extra_cols):
    cur = conn.cursor()

    cur.execute(f"DROP TABLE IF EXISTS {dbtable}")

    cols = BASE_COLS + extra_cols
    dbcols = ",\n".join(f'"{col[0]}" {col[1]}' for col in cols)

    cmd = f"""
    CREATE TABLE IF NOT EXISTS {dbtable} (
        {dbcols}
    )
    """

    cur.execute(cmd)
    conn.commit()

def parse_action(s: str) -> str:
    if s:
        if s[0] == '[' and s[-1] == ']':
            s = s[1:-1]
            s = s.replace('-', ' ').capitalize()
        s = re.sub(" [Aa]ctions?", "", s)
        slow = s.lower()
        if slow.startswith("one"):
            s = "1"
        elif slow.startswith("two"):
            s = "2"
        elif slow.startswith("three"):
            s = "3"
        elif slow.startswith("free"):
            s = "F"
        elif slow.startswith("reaction"):
            s = "R"
    return s

def mk_link(text: str, url: str) -> str:
    if not text:
        return ""
    if not url:
        return text
    #return f"({text})[2e.aonprd.com{url}]"
    return f'<a href="https://2e.aonprd.com{url}">{text}</a>'

def parse_and_insert(conn, dbtable, lis, extra_cols, extra_vals):
    cur = conn.cursor()

    for idx_li, li in enumerate(lis):
        vals = {}

        # NAME + LINK
        art = li.find("article")
        title_p = art.find("p")
        a = title_p.find("a")
        vals[CN_NAME] = mk_link(a.text.strip(), a.get("href"))

        # ACTION
        action_tag = title_p.find("span", class_="icon-font")
        vals[CN_ACTION] = parse_action(action_tag.text.strip()) if action_tag else None

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
            t = d.get_text(strip=True)
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
                    parts.append(sib.get_text(" ", strip=True))
            vals[CN_DESCRIPTION] = "\n".join(parts)

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

        # insert query
        cols = BASE_COLS + extra_cols
        placeholders = ",".join(["?"] * len(cols))
        colnames = ','.join([name for name, _ in cols])

        sql = f"INSERT INTO {dbtable} ({colnames}) VALUES ({placeholders})"

        vals = [vals.get(name) for name, _ in BASE_COLS] + [extra_vals[name][idx_li] for name, _ in extra_cols]

        cur.execute(sql, vals)

    conn.commit()


if __name__ == "__main__":
    basename = os.path.splitext(os.path.basename(__file__))[0]
    dbname = "pf2.db"
    dbtable = basename
    filein = basename + ".html"
    
    conn = sqlite3.connect(dbname)

    html = open(filein, encoding="utf-8").read()
    soup = BeautifulSoup(html, "html.parser")
    ol = soup.find("ol")
    lis = ol.find_all("li", recursive=False)

    extra_cols, extra_vals = parse_extra_cols(lis)
    create_table(conn, dbtable, extra_cols)
    parse_and_insert(conn, dbtable, lis, extra_cols, extra_vals)

    conn.close()
