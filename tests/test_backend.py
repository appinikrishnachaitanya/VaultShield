"""Backend contract tests with Firebase Admin mocked; no project data is touched."""
import importlib
import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

with patch('firebase_admin.initialize_app'), patch('firebase_admin.firestore.client') as client:
    service = importlib.import_module('backend.main')

class FamilyRoutes(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        service.db = self.db
        service.app.dependency_overrides[service.identity] = lambda: 'sender'
        self.client = TestClient(service.app)

    def tearDown(self):
        service.app.dependency_overrides.clear()

    def test_requires_verified_identity(self):
        service.app.dependency_overrides.clear()
        with patch.object(service.app_check, 'verify_token', side_effect=ValueError('bad')):
            response = self.client.post('/pair/invite', headers={'Authorization':'Bearer bad','X-Firebase-AppCheck':'bad'})
        self.assertEqual(response.status_code,401)

    def test_invite_stores_hash_not_bearer_secret(self):
        response = self.client.post('/pair/invite')
        self.assertEqual(response.status_code,200)
        code = response.json()['code']
        self.assertGreaterEqual(len(code),32)
        self.db.collection.return_value.document.assert_called_with(service.digest(code))
        stored = self.db.collection.return_value.document.return_value.set.call_args.args[0]
        self.assertEqual(set(stored),{'owner','expires'})

    def test_rejects_extra_private_payload_and_invalid_stage_count(self):
        self.assertEqual(self.client.post('/alerts',json={'stages':5}).status_code,422)
        self.assertEqual(self.client.post('/alerts',json={'stages':4,'transcript':'private'}).status_code,422)

    def test_unpaired_sender_cannot_alert(self):
        self.db.collection.return_value.document.return_value.collection.return_value.stream.return_value=[]
        self.assertEqual(self.client.post('/alerts',json={'stages':4}).status_code,409)

    def test_alert_stores_only_minimal_payload(self):
        member=MagicMock(id='relative')
        family=self.db.collection.return_value.document.return_value.collection.return_value
        family.stream.side_effect=[[member],[]]
        rate=self.db.collection.return_value.document.return_value
        rate.get.return_value.exists=False
        with patch.object(service.firestore,'transactional',lambda f:f):
            response=self.client.post('/alerts',json={'stages':4})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),{'inboxes':1,'pushNotifications':0})
        value=family.add.call_args.args[0]
        self.assertEqual(set(value),{'sender','stages','createdAt'})

    def test_rate_limit_blocks_repeated_alert(self):
        self.db.collection.return_value.document.return_value.collection.return_value.stream.return_value=[MagicMock(id='relative')]
        snap=self.db.collection.return_value.document.return_value.get.return_value
        snap.exists=True
        snap.to_dict.return_value={'last':service.now()-timedelta(seconds=2)}
        with patch.object(service.firestore,'transactional',lambda f:f):
            self.assertEqual(self.client.post('/alerts',json={'stages':4}).status_code,429)

    def test_expired_invite_is_rejected(self):
        snap=self.db.collection.return_value.document.return_value.get.return_value
        snap.exists=True
        snap.to_dict.return_value={'owner':'other','expires':service.now()-timedelta(seconds=1)}
        with patch.object(service.firestore,'transactional',lambda f:f):
            self.assertEqual(self.client.post('/pair/join',json={'code':'x'*43}).status_code,400)

if __name__=='__main__': unittest.main()
