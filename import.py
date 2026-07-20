import csv
import os
import subprocess
import requests

# Config
OWNER = "rjmlaird"
REPO = "rjmlaird-api"
CSV_FILE = "rjmlaird-api-tasks.csv"

def get_gh_token():
    result = subprocess.run(
        ["gh", "auth", "token"],
        capture_output=True,
        text=True,
        check=True
    )
    return result.stdout.strip()

def detect_delimiter(path):
    with open(path, newline="", encoding="utf-8") as f:
        sample = f.read(4096)
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","

def normalise_header(h):
    h = h.strip().lower()
    # Map common variants
    if h in {"title", "task", "name"}:
        return "title"
    if h in {"body", "description", "details"}:
        return "body"
    if h in {"label", "labels", "tags"}:
        return "labels"
    if h in {"milestone", "milestone name"}:
        return "milestone"
    return h

def create_issue(session, title, body, labels, milestone_name=None):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/issues"
    headers = {
        "Authorization": f"token {session['token']}",
        "Accept": "application/vnd.github.v3+json",
    }
    payload = {
        "title": title,
        "body": body,
        "labels": [l.strip() for l in labels.split(",") if l.strip()],
    }
    if milestone_name:
        milestones_url = f"https://api.github.com/repos/{OWNER}/{REPO}/milestones"
        resp = requests.get(milestones_url, headers=headers, timeout=10)
        resp.raise_for_status()
        milestones = resp.json()
        milestone = next((m for m in milestones if m["title"] == milestone_name), None)
        if milestone:
            payload["milestone"] = milestone["number"]

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    print(f"Created #{data['number']}: {data['title']}")

def main():
    token = get_gh_token()
    session = {"token": token}

    delimiter = detect_delimiter(CSV_FILE)
    print(f"Detected delimiter: {repr(delimiter)}")

    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=delimiter)

        # Normalise headers
        if reader.fieldnames is None:
            raise ValueError("CSV appears to have no header row.")

        mapping = {h: normalise_header(h) for h in reader.fieldnames}
        print("Header mapping:", mapping)

        rows = list(reader)
        print(f"Total data rows: {len(rows)}")
        if rows:
            print("First parsed row:", rows[0])

        for i, raw_row in enumerate(rows, start=2):
            row = {mapping[k]: v for k, v in raw_row.items()}

            title = (row.get("title") or "").strip()
            body = (row.get("body") or "").strip()
            labels = row.get("labels", "") or ""
            milestone = (row.get("milestone") or "").strip() or None

            if not title:
                print(f"Skipping row {i}: missing title (raw row: {raw_row})")
                continue

            try:
                create_issue(session, title, body, labels, milestone)
            except Exception as e:
                print(f"Error on row {i} ({title}): {e}")

if __name__ == "__main__":
    main()
