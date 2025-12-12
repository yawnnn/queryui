from common import scrape_generic_table

if __name__ == "__main__":
    for basename in ["deities", "feats", "armor"]:
        scrape_generic_table(basename)