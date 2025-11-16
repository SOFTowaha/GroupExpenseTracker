import os
import sys
import pathlib
import tempfile
import json
import unittest

# Ensure project root is on sys.path so `import app` succeeds when pytest runs from tests/
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# set env var for data file before importing app
tmp = tempfile.NamedTemporaryFile(delete=False)
DATA_PATH = tmp.name
tmp.close()
os.environ['GROUP_EXPENSE_DATA_FILE'] = DATA_PATH

import app as app_module


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.app = app_module.app.test_client()
        # ensure empty data file
        with open(DATA_PATH, 'w') as f:
            json.dump({'participants': [], 'expenses': []}, f)

    def tearDown(self):
        try:
            os.remove(DATA_PATH)
        except Exception:
            pass

    def test_create_delete_restore_expense(self):
        # set participants
        rv = self.app.post('/api/participants', json={'names': ['A', 'B']})
        self.assertEqual(rv.status_code, 200)
        # add expense
        rv = self.app.post('/api/expense', json={'payer': 'A', 'amount': 10, 'description': 'X', 'date': '2025-01-01'})
        self.assertEqual(rv.status_code, 200)
        body = rv.get_json()
        eid = body['expense']['id']
        # delete expense
        rv = self.app.delete(f'/api/expense/{eid}')
        self.assertEqual(rv.status_code, 200)
        # restore expense
        # recreate expense object
        expense_obj = body['expense']
        rv = self.app.post('/api/restore', json={'type': 'expense', 'item': expense_obj})
        self.assertEqual(rv.status_code, 200)
        j = rv.get_json()
        self.assertTrue(j.get('ok'))

    def test_delete_restore_participant(self):
        rv = self.app.post('/api/participants', json={'names': ['P1', 'P2']})
        self.assertEqual(rv.status_code, 200)
        # add expense by P1
        rv = self.app.post('/api/expense', json={'payer': 'P1', 'amount': 5, 'description': 'd', 'date': '2025-01-02'})
        self.assertEqual(rv.status_code, 200)
        # capture expenses for P1
        data = self.app.get('/api/data').get_json()
        p_expenses = [e for e in data['expenses'] if e['payer'] == 'P1']
        # delete participant
        rv = self.app.delete('/api/participant/P1')
        self.assertEqual(rv.status_code, 200)
        # restore participant with their expenses
        rv = self.app.post('/api/restore', json={'type': 'participant', 'item': {'name': 'P1', 'expenses': p_expenses}})
        self.assertEqual(rv.status_code, 200)
        j = rv.get_json()
        self.assertTrue('P1' in j.get('participants', []))


if __name__ == '__main__':
    unittest.main()
