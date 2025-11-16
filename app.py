from decimal import Decimal, ROUND_HALF_UP, getcontext
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
from uuid import uuid4

getcontext().prec = 28

DATA_FILE = os.environ.get("GROUP_EXPENSE_DATA_FILE", "data.json")

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)


def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            d = json.load(f)
            # ensure shape
            if 'participants' not in d:
                d['participants'] = []
            if 'expenses' not in d:
                d['expenses'] = []
            if 'event' not in d:
                d['event'] = ''
            if 'currency' not in d:
                d['currency'] = 'CAD'
            return d
    return {"participants": [], "expenses": [], "event": '', "currency": 'CAD'}


def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


def to_decimal(v):
    return Decimal(str(v))


def quant(v):
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@app.route("/", methods=["GET"])
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/participants", methods=["POST"])
def set_participants():
    data = load_data()
    payload = request.get_json() or {}
    names = payload.get("names") or []
    # normalize and remove duplicates while preserving order
    names = [n.strip() for n in names if n and n.strip()]
    # preserve order, remove exact duplicates
    seen = set()
    unique = []
    for n in names:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    names = unique
    data["participants"] = names
    # remove expenses by missing participants
    data["expenses"] = [e for e in data.get("expenses", []) if e.get("payer") in names]
    save_data(data)
    return jsonify({"ok": True, "participants": names})


@app.route("/api/expense", methods=["POST"])
def add_expense():
    data = load_data()
    payload = request.get_json() or {}
    payer = payload.get("payer")
    amount = payload.get("amount")
    description = payload.get("description", "")
    date = payload.get("date", "")
    if payer not in data.get("participants", []):
        return jsonify({"ok": False, "error": "payer not in participants"}), 400
    try:
        amt = quant(to_decimal(amount))
    except Exception:
        return jsonify({"ok": False, "error": "invalid amount"}), 400
    expense = {"id": str(uuid4()), "payer": payer, "amount": float(amt), "description": description, "date": date}
    data.setdefault("expenses", []).append(expense)
    save_data(data)
    return jsonify({"ok": True, "expense": expense})


@app.route("/api/expense/<eid>", methods=["PUT"])
def edit_expense(eid):
    data = load_data()
    payload = request.get_json() or {}
    expenses = data.get("expenses", [])
    for e in expenses:
        if e.get("id") == eid:
            payer = payload.get("payer", e.get("payer"))
            amount = payload.get("amount", e.get("amount"))
            description = payload.get("description", e.get("description"))
            date = payload.get("date", e.get("date"))
            if payer not in data.get("participants", []):
                return jsonify({"ok": False, "error": "payer not in participants"}), 400
            try:
                amt = quant(to_decimal(amount))
            except Exception:
                return jsonify({"ok": False, "error": "invalid amount"}), 400
            e["payer"] = payer
            e["amount"] = float(amt)
            e["description"] = description
            e["date"] = date
            save_data(data)
            return jsonify({"ok": True, "expense": e})
    return jsonify({"ok": False, "error": "not found"}), 404


@app.route("/api/expense/<eid>", methods=["DELETE"])
def delete_expense(eid):
    data = load_data()
    expenses = data.get("expenses", [])
    new = [e for e in expenses if e.get("id") != eid]
    if len(new) == len(expenses):
        return jsonify({"ok": False, "error": "not found"}), 404
    data["expenses"] = new
    save_data(data)
    return jsonify({"ok": True})


@app.route("/api/participants/rename", methods=["POST"])
def rename_participant():
    data = load_data()
    payload = request.get_json() or {}
    old = payload.get("old")
    new = payload.get("new")
    if not old or not new:
        return jsonify({"ok": False, "error": "old and new required"}), 400
    parts = data.get("participants", [])
    if old not in parts:
        return jsonify({"ok": False, "error": "old not found"}), 404
    # replace only the first exact match to avoid renaming duplicates unintentionally
    for idx, p in enumerate(parts):
        if p == old:
            parts[idx] = new
            break
    data["participants"] = parts
    # update expenses
    for e in data.get("expenses", []):
        if e.get("payer") == old:
            e["payer"] = new
    save_data(data)
    return jsonify({"ok": True, "participants": parts})


@app.route("/api/participant/<name>", methods=["DELETE"])
def delete_participant(name):
    data = load_data()
    parts = data.get("participants", [])
    if name not in parts:
        return jsonify({"ok": False, "error": "not found"}), 404
    parts = [p for p in parts if p != name]
    data["participants"] = parts
    # remove expenses by that participant
    data["expenses"] = [e for e in data.get("expenses", []) if e.get("payer") != name]
    save_data(data)
    return jsonify({"ok": True, "participants": parts})


@app.route("/api/restore", methods=["POST"])
def restore_item():
    data = load_data()
    payload = request.get_json() or {}
    typ = payload.get("type")
    item = payload.get("item")
    if typ == "expense":
        # avoid duplicate ids
        if not item or not item.get("id"):
            return jsonify({"ok": False, "error": "invalid item"}), 400
        if any(e.get("id") == item.get("id") for e in data.get("expenses", [])):
            return jsonify({"ok": False, "error": "already exists"}), 400
        data.setdefault("expenses", []).append(item)
        save_data(data)
        return jsonify({"ok": True, "expense": item})
    elif typ == "participant":
        if not item or not item.get("name"):
            return jsonify({"ok": False, "error": "invalid item"}), 400
        name = item["name"]
        parts = data.get("participants", [])
        if name not in parts:
            parts.append(name)
        # optionally restore expenses attached
        for e in item.get("expenses", []):
            if not any(x.get("id") == e.get("id") for x in data.get("expenses", [])):
                data.setdefault("expenses", []).append(e)
        data["participants"] = parts
        save_data(data)
        return jsonify({"ok": True, "participants": parts})
    else:
        return jsonify({"ok": False, "error": "unknown type"}), 400


@app.route("/api/data", methods=["GET"])
def get_data():
    return jsonify(load_data())


@app.route("/api/settings", methods=["GET", "POST"])
def settings():
    data = load_data()
    if request.method == 'GET':
        return jsonify({
            'event': data.get('event', ''),
            'currency': data.get('currency', 'CAD')
        })
    # POST -> update settings
    payload = request.get_json() or {}
    event = payload.get('event')
    currency = payload.get('currency')
    if event is not None:
        data['event'] = str(event)
    if currency is not None:
        data['currency'] = str(currency)
    save_data(data)
    return jsonify({'ok': True, 'settings': {'event': data.get('event', ''), 'currency': data.get('currency', 'CAD')}})


@app.route("/api/report", methods=["GET"])
def report():
    data = load_data()
    participants = data.get("participants", [])
    expenses = data.get("expenses", [])
    n = len(participants)
    if n == 0:
        return jsonify({"ok": False, "error": "no participants"}), 400
    totals = {p: Decimal('0.00') for p in participants}
    total_all = Decimal('0.00')
    for e in expenses:
        amt = to_decimal(e.get("amount", 0))
        totals[e["payer"]] += amt
        total_all += amt
    per_head = quant(total_all / Decimal(n))
    balances = {p: quant(totals[p] - per_head) for p in participants}

    # Prepare creditors and debtors
    creditors = []
    debtors = []
    for p, bal in balances.items():
        if bal > 0:
            creditors.append({"person": p, "amount": bal})
        elif bal < 0:
            debtors.append({"person": p, "amount": -bal})

    # sort creditors descending, debtors descending (largest debt first)
    creditors.sort(key=lambda x: x["amount"], reverse=False)
    debtors.sort(key=lambda x: x["amount"], reverse=False)

    payments = []

    # Greedy match: smallest positive with smallest negative
    i = 0
    j = 0
    while i < len(debtors) and j < len(creditors):
        d = debtors[i]
        c = creditors[j]
        take = min(d["amount"], c["amount"])
        take = quant(take)
        payments.append({"from": d["person"], "to": c["person"], "amount": float(take)})
        d["amount"] = quant(d["amount"] - take)
        c["amount"] = quant(c["amount"] - take)
        if d["amount"] == Decimal('0.00'):
            i += 1
        if c["amount"] == Decimal('0.00'):
            j += 1

    # Build summary
    summary = {p: {"paid": float(quant(totals[p])), "share": float(per_head), "balance": float(balances[p])} for p in participants}

    return jsonify({"ok": True, "total": float(quant(total_all)), "per_head": float(per_head), "summary": summary, "payments": payments})


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
