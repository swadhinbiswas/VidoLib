"""
Fetches stargazer history for the current repo and renders a static
star-history chart to assets/star-history.svg.

Run inside GitHub Actions where GH_TOKEN and REPO are set automatically
(see .github/workflows/star-history.yml). Can also be run locally:

    GH_TOKEN=<personal-access-token> REPO=owner/name python generate-star-history.py
"""

import os
import requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime

TOKEN = os.environ["GH_TOKEN"]
REPO = os.environ["REPO"]  # e.g. "swadhinbiswas/VidoLib"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    # This custom media type makes GitHub include a "starred_at" timestamp
    # on each stargazer record, which is not present in the default response.
    "Accept": "application/vnd.github.star+json",
}


def fetch_stargazers():
    stars = []
    page = 1
    while True:
        resp = requests.get(
            f"https://api.github.com/repos/{REPO}/stargazers",
            headers=HEADERS,
            params={"per_page": 100, "page": page},
            timeout=(10, 30),
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        stars.extend(data)
        page += 1
    return stars


def main():
    stars = fetch_stargazers()
    dates = sorted(
        datetime.strptime(s["starred_at"], "%Y-%m-%dT%H:%M:%SZ") for s in stars
    )

    if not dates:
        print("No stargazers yet, skipping chart.")
        return

    counts = list(range(1, len(dates) + 1))

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(dates, counts, color="#2f81f7", linewidth=2)
    ax.fill_between(dates, counts, color="#2f81f7", alpha=0.1)
    ax.set_title(f"Star History — {REPO}")
    ax.set_xlabel("Date")
    ax.set_ylabel("Stars")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    fig.autofmt_xdate()
    ax.grid(alpha=0.3)

    os.makedirs("assets", exist_ok=True)
    fig.savefig("assets/star-history.svg", format="svg", bbox_inches="tight")
    print(f"Saved chart with {len(dates)} stars.")


if __name__ == "__main__":
    main()
