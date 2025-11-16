# Group Expense Tracker

Simple app to track group expenses, compute per-head share and minimal payments to settle.

Run (macOS / zsh):

1. Create a virtualenv and install requirements
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Run the app
```bash
python app.py
```

3. Open in browser
```
http://127.0.0.1:5000/
```

How to use:
- Enter participants (one per line), click `Save Participants`.
- Add expenses by selecting payer, amount, description and date.
- Click `Compute Settlement` to view per-head cost, per-person summary and payment list.

Notes:
- Data is stored in `data.json` in the project folder. This file is intentionally ignored by Git (see `.gitignore`) because it contains local state — do not commit it. Back it up if you need persistence across machines.
- This is a minimal demo; feel free to ask for features (CSV import, per-item split, multi-event history).
