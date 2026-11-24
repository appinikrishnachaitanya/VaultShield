# PRIVACY RULE: Never store, log, or send original unredacted user content to cloud/Firestore.
"""Run with Application Default Credentials; no AI or message contents enter this service."""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator
import firebase_admin
from firebase_admin import auth, app_check, firestore, messaging
firebase_admin.initialize_app()
db = firestore.client()
app = FastAPI(title='VaultShield family service', docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get('ALLOWED_ORIGINS','http://127.0.0.1:5173').split(','), allow_methods=['GET','POST','DELETE'], allow_headers=['Authorization','X-Firebase-AppCheck','Content-Type'])
@app.exception_handler(RequestValidationError)
async def invalid_payload(_request, _error):
    # FastAPI's default validation detail can echo rejected private inputs.
    return JSONResponse(status_code=422, content={'detail': 'Invalid request payload'})

def identity(authorization: str = Header(), x_firebase_appcheck: str = Header()):
    try:
        if not authorization.startswith('Bearer '): raise ValueError('Bearer token required')
        app_check.verify_token(x_firebase_appcheck)
        return auth.verify_id_token(authorization.removeprefix('Bearer '), check_revoked=True)['uid']
    except Exception:
        raise HTTPException(401, 'Valid Firebase identity and App Check required')
def now(): return datetime.now(timezone.utc)
def digest(code): return hashlib.sha256(code.encode()).hexdigest()
def reserve_action(uid: str, action: str, interval: int):
    # Transactional per-user limits also apply across Cloud Run instances.
    ref = db.collection('actionLimits').document(digest(f'{uid}:{action}'))
    stamp = now()
    @firestore.transactional
    def reserve(tx):
        snap = ref.get(transaction=tx)
        previous = snap.to_dict().get('last') if snap.exists else None
        if isinstance(previous, datetime) and (stamp-previous).total_seconds() < interval:
            raise HTTPException(429, 'Please wait before trying this action again')
        tx.set(ref, {'last': stamp})
    reserve(db.transaction())

class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')
class Pair(Payload):
    code: str = Field(min_length=32, max_length=128)
class Token(Payload):
    token: str = Field(min_length=20, max_length=4096)
class Alert(Payload):
    stages: int = Field(ge=0, le=4, strict=True)
    tacticTypes: list[str] = Field(default_factory=list, max_length=4)

    @field_validator('tacticTypes')
    @classmethod
    def valid_tactics(cls, value):
        if len(value) != len(set(value)) or any(item not in {'Authority','Fear','Urgency','Secrecy'} for item in value):
            raise ValueError('Invalid tactic types')
        return value
@app.get('/health')
def health(): return {'status':'ok'}
@app.post('/pair/invite')
def invite(uid=Depends(identity)):
    reserve_action(uid, 'invite', 30)
    code=secrets.token_urlsafe(32)
    db.collection('invites').document(digest(code)).set({'owner':uid,'expires':now()+timedelta(minutes=10)})
    return {'code':code,'expiresInSeconds':600}
@app.post('/pair/join')
def join(body:Pair, uid=Depends(identity)):
    reserve_action(uid, 'join', 5)
    ref=db.collection('invites').document(digest(body.code))
    @firestore.transactional
    def accept(tx):
        snap=ref.get(transaction=tx)
        if not snap.exists: raise HTTPException(404,'Invite unavailable or already used')
        value=snap.to_dict()
        if value['expires'] < now() or value['owner']==uid: raise HTTPException(400,'Invite expired or belongs to you')
        owner=value['owner']
        tx.set(db.collection('users').document(uid).collection('family').document(owner),{'pairedAt':now()})
        tx.set(db.collection('users').document(owner).collection('family').document(uid),{'pairedAt':now()})
        tx.delete(ref)
    accept(db.transaction())
    return {'paired':True}
@app.delete('/pair/{member}')
def unpair(member:str,uid=Depends(identity)):
    if '/' in member: raise HTTPException(400,'Invalid member')
    batch=db.batch()
    batch.delete(db.collection('users').document(uid).collection('family').document(member))
    batch.delete(db.collection('users').document(member).collection('family').document(uid))
    batch.commit()
    return {'removed':True}
@app.post('/notifications/token')
def register(body:Token,uid=Depends(identity)):
    reserve_action(uid, 'token', 10)
    db.collection('users').document(uid).collection('tokens').document(digest(body.token)).set({'token':body.token,'updatedAt':now()})
    return {'registered':True}
@app.post('/alerts')
def alert(body:Alert,uid=Depends(identity)):
    members=list(db.collection('users').document(uid).collection('family').limit(11).stream())
    if not members: raise HTTPException(409,'Pair a family member first')
    if len(members)>10: raise HTTPException(409,'Family circle exceeds the supported limit')
    stamp=now()
    rate=db.collection('alertLimits').document(uid)
    @firestore.transactional
    def reserve(tx):
        previous=rate.get(transaction=tx)
        if previous.exists and (stamp-previous.to_dict()['last']).total_seconds()<60: raise HTTPException(429,'Please wait a minute before sending another alert')
        tx.set(rate,{'last':stamp})
    reserve(db.transaction())
    delivered=0
    for member in members:
        db.collection('users').document(member.id).collection('alerts').add({'tacticCount':body.stages,'tacticTypes':body.tacticTypes,'timestamp':stamp,'familyCircleId':digest('|'.join(sorted([uid,member.id]))),'status':'requested'})
        for token in db.collection('users').document(member.id).collection('tokens').limit(5).stream():
            try:
                messaging.send(messaging.Message(token=token.to_dict()['token'],notification=messaging.Notification(title='VaultShield · Help requested',body=f'A family member asked for help. {body.stages}/4 manipulation stages. Open VaultShield.'),webpush=messaging.WebpushConfig(fcm_options=messaging.WebpushFCMOptions(link=os.environ.get('PUBLIC_APP_URL','http://127.0.0.1:5173')))))
                delivered+=1
            except messaging.UnregisteredError: token.reference.delete()
            except Exception: pass  # Firestore inbox remains the durable delivery path.
    return {'inboxes':len(members),'pushNotifications':delivered}

