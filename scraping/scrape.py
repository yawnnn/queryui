from scraping.lib import scrape_generic_table
from scraping.spells import scrape_spells
import argparse
import os

FLNAME_DB = "pathfinder2e.db"
DIRNAME_DATA = "data"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generic html tables")
    parser.add_argument("which", nargs="?", type=str, help="Which table")
    args = parser.parse_args()

    exceptions = {"spells": scrape_spells}

    root = os.path.dirname(os.path.abspath(__file__))
    path_db = os.path.join(root, "..", "resources", FLNAME_DB)
    dir_data = os.path.join(root, DIRNAME_DATA)

    for entry in os.listdir(dir_data):
        name, ext = os.path.splitext(entry)
        flname = os.path.join(dir_data, f"{name}.html")

        if ext != ".html":
            raise ValueError(f"Unexpected file {entry}")

        if args.which and name != args.which:
            continue

        print(f"Scraping {name}...")

        if name in exceptions:
            exceptions[name](path_db, flname, name)
        else:
            scrape_generic_table(path_db, flname, name)
