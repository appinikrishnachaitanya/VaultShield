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
            response = self.client.post('/pair/invite',json={'name':'Mum'}, headers={'Authorization':'Bearer bad','X-Firebase-AppCheck':'bad'})
        self.assertEqual(response.status_code,401)

    def test_missing_auth_headers_return_401(self):
        service.app.dependency_overrides.clear()
        self.assertEqual(self.client.post('/pair/invite',json={'name':'Mum'}).status_code,401)

    def test_invite_stores_hash_not_bearer_secret(self):
        with patch.object(service.firestore,'transactional',lambda f:f):
            response = self.client.post('/pair/invite',json={'name':'Mum'})
        self.assertEqual(response.status_code,200)
        code = response.json()['code']
        self.assertGreaterEqual(len(code),32)
        self.db.collection.return_value.document.assert_called_with(service.digest(code))
        stored = self.db.collection.return_value.document.return_value.set.call_args.args[0]
        self.assertEqual(set(stored),{'owner','ownerName','expires','uses','maxUses'})
        self.assertEqual(stored['ownerName'],'Mum')
        self.assertEqual(stored['maxUses'],9)

    def test_rejects_extra_private_payload_and_invalid_stage_count(self):
        self.assertEqual(self.client.post('/alerts',json={'stages':5}).status_code,422)
        self.assertEqual(self.client.post('/alerts',json={'stages':4,'transcript':'private'}).status_code,422)

    def test_validation_never_echoes_rejected_private_content(self):
        response=self.client.post('/alerts',json={'stages':4,'transcript':'private-bank-message'})
        self.assertEqual(response.status_code,422)
        self.assertNotIn('private-bank-message',response.text)
        self.assertEqual(response.json(),{'detail':'Invalid request payload'})

    def test_rejects_arbitrary_tactic_content(self):
        response=self.client.post('/alerts',json={'stages':1,'tacticTypes':['private-bank-message']})
        self.assertEqual(response.status_code,422)
        self.assertNotIn('private-bank-message',response.text)

    def test_invite_rate_limit_is_enforced(self):
        snap=self.db.collection.return_value.document.return_value.get.return_value
        snap.exists=True
        snap.to_dict.return_value={'last':service.now()-timedelta(seconds=1)}
        with patch.object(service.firestore,'transactional',lambda f:f):
            response=self.client.post('/pair/invite',json={'name':'Mum'})
        self.assertEqual(response.status_code,429)

    def test_unpaired_sender_cannot_alert(self):
        self.db.collection.return_value.document.return_value.collection.return_value.limit.return_value.stream.return_value=[]
        self.assertEqual(self.client.post('/alerts',json={'stages':4}).status_code,409)

    def test_alert_stores_only_minimal_payload(self):
        member=MagicMock(id='relative')
        family=self.db.collection.return_value.document.return_value.collection.return_value
        family.limit.return_value.stream.side_effect=[[member],[]]
        family.document.return_value.get.return_value.exists=True
        family.document.return_value.get.return_value.to_dict.return_value={'name':'Mum'}
        rate=self.db.collection.return_value.document.return_value
        rate.get.return_value.exists=False
        with patch.object(service.firestore,'transactional',lambda f:f):
            response=self.client.post('/alerts',json={'stages':4})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),{'inboxes':1,'pushNotifications':0})
        value=family.add.call_args.args[0]
        self.assertEqual(set(value),{'tacticCount','tacticTypes','timestamp','familyCircleId','senderName','status'})
        self.assertEqual(value['senderName'],'Mum')

    def test_alert_batches_push_after_writing_inbox(self):
        member=MagicMock(id='relative')
        token=MagicMock()
        token.to_dict.return_value={'token':'synthetic-token'}
        family=self.db.collection.return_value.document.return_value.collection.return_value
        family.limit.return_value.stream.side_effect=[[member],[token]]
        family.document.return_value.get.return_value.exists=True
        family.document.return_value.get.return_value.to_dict.return_value={'name':'Mum'}
        self.db.collection.return_value.document.return_value.get.return_value.exists=False
        batch_response=MagicMock(success_count=1)
        batch_response.responses=[MagicMock(exception=None)]
        with patch.object(service.firestore,'transactional',lambda f:f), patch.object(service.messaging,'send_each',return_value=batch_response) as send_each:
            response=self.client.post('/alerts',json={'stages':4})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),{'inboxes':1,'pushNotifications':1})
        self.assertEqual(len(send_each.call_args.args[0]),1)

    def test_rate_limit_blocks_repeated_alert(self):
        self.db.collection.return_value.document.return_value.collection.return_value.limit.return_value.stream.return_value=[MagicMock(id='relative')]
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
            self.assertEqual(self.client.post('/pair/join',json={'code':'x'*43,'name':'Dad'}).status_code,400)

    def test_family_code_can_be_used_by_more_than_one_person(self):
        ref=self.db.collection.return_value.document.return_value
        ref.get.return_value.exists=True
        ref.get.return_value.to_dict.return_value={'owner':'owner','ownerName':'Mum','expires':service.now()+timedelta(minutes=5),'uses':1,'maxUses':9}
        self.db.transaction.return_value.get.return_value=[]
        with patch.object(service.firestore,'transactional',lambda f:f):
            response=self.client.post('/pair/join',json={'code':'x'*43,'name':'Dad'})
        self.assertEqual(response.status_code,200)
        self.db.transaction.return_value.update.assert_called_once()
        ref.delete.assert_not_called()

    def test_member_name_cannot_be_a_phone_or_email(self):
        self.assertEqual(self.client.post('/pair/invite',json={'name':'9876543210'}).status_code,422)
        self.assertEqual(self.client.post('/pair/invite',json={'name':'mum@example.com'}).status_code,422)

class PatternRoutes(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        service.db = self.db
        service.app.dependency_overrides[service.identity] = lambda: 'contributor'
        self.client = TestClient(service.app)
        self.payload = {'tacticTypes':['Fear'],'urlFeature':'shortener','amountBucket':'10k-50k','language':'hi'}
    def tearDown(self): service.app.dependency_overrides.clear()
    def test_rejects_free_text_and_identifiers(self):
        for field in ['text','uid','name','message']:
            self.assertEqual(self.client.post('/patterns',json={**self.payload,field:'private-value'}).status_code,422)
        self.assertEqual(self.client.post('/patterns',json={**self.payload,'urlFeature':'private.example'}).status_code,422)
    def test_requires_identity_for_both_endpoints(self):
        service.app.dependency_overrides.clear()
        self.assertEqual(self.client.post('/patterns',json=self.payload).status_code,401)
        self.assertEqual(self.client.get('/patterns/trending').status_code,401)
    def test_stores_only_aggregate_categories_and_count(self):
        with patch.object(service,'reserve_action') as rate,patch.object(service.firestore,'transactional',lambda f:f):
            response=self.client.post('/patterns',json=self.payload)
        self.assertEqual(response.status_code,200)
        rate.assert_called_once_with('contributor','pattern',3600)
        stored=self.db.transaction.return_value.set.call_args.args[1]
        self.assertEqual(set(stored),set(self.payload)|{'count'})
        self.assertNotIn('contributor',str(stored))
    def test_rate_limit_is_enforced(self):
        with patch.object(service,'reserve_action',side_effect=service.HTTPException(429,'Wait')):
            self.assertEqual(self.client.post('/patterns',json=self.payload).status_code,429)
    def test_only_publishes_buckets_at_threshold(self):
        low=MagicMock();low.to_dict.return_value={**self.payload,'count':4}
        high=MagicMock();high.to_dict.return_value={**self.payload,'count':5}
        self.db.collection.return_value.where.return_value.limit.return_value.stream.return_value=[low,high]
        response=self.client.get('/patterns/trending')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),{'threshold':5,'buckets':[{**self.payload,'count':5}]})

class DeploymentConfig(unittest.TestCase):
    def test_production_requires_https_public_origin(self):
        for value in ['', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=secret']:
            with self.assertRaises(RuntimeError): service.validate_public_app_url(value,True)
        service.validate_public_app_url('https://vaultshield-2ace9.web.app',True)
        service.validate_public_app_url('',False)

if __name__=='__main__': unittest.main()
