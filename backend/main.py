# PRIVACY RULE: Never store, log, or send original unredacted user content to cloud/Firestore.
"""Run with Application Default Credentials; no AI or message contents enter this service."""
import hashlib
import os
import re
import secrets
from urllib.parse import urlsplit
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
PUBLIC_APP_URL = os.environ.get('PUBLIC_APP_URL','').strip()
def validate_public_app_url(value: str, production: bool):
    parsed_url=urlsplit(value)
    if production and (parsed_url.scheme != 'https' or not parsed_url.netloc or parsed_url.query or parsed_url.fragment or parsed_url.path not in ('','/') or parsed_url.username or parsed_url.password):
        raise RuntimeError('PUBLIC_APP_URL must be configured as the production HTTPS app URL')
validate_public_app_url(PUBLIC_APP_URL,bool(os.environ.get('K_SERVICE') or os.environ.get('ENVIRONMENT') == 'production'))
app = FastAPI(title='VaultShield family service', docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get('ALLOWED_ORIGINS','http://127.0.0.1:5173').split(','), allow_methods=['GET','POST','DELETE'], allow_headers=['Authorization','X-Firebase-AppCheck','Content-Type'])
@app.exception_handler(RequestValidationError)
async def invalid_payload(_request, _error):
    # FastAPI's default validation detail can echo rejected private inputs.
    return JSONResponse(status_code=422, content={'detail': 'Invalid request payload'})

def identity(authorization: str | None = Header(default=None), x_firebase_appcheck: str | None = Header(default=None)):
    try:
        if not authorization or not authorization.startswith('Bearer ') or not x_firebase_appcheck: raise ValueError('Credentials required')
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
class Named(Payload):
    name: str = Field(min_length=2,max_length=40)
    @field_validator('name')
    @classmethod
    def safe_name(cls,value):
        value=value.strip()
        if len(value)<2 or re.search(r'[\r\n<>@]|\d{6,}',value):
            raise ValueError('Use a short name, not contact details')
        return value
class Invite(Named): pass
class Pair(Named):
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
def health(): return {'status':'ok','familyApi':3}
@app.post('/pair/invite')
def invite(body:Invite,uid=Depends(identity)):
    reserve_action(uid, 'invite', 30)
    code=secrets.token_urlsafe(32)
    db.collection('invites').document(digest(code)).set({'owner':uid,'ownerName':body.name.strip(),'expires':now()+timedelta(minutes=10),'uses':0,'maxUses':9})
    return {'code':code,'expiresInSeconds':600,'maxMembers':10}
@app.post('/pair/join')
def join(body:Pair, uid=Depends(identity)):
    reserve_action(uid, 'join', 5)
    ref=db.collection('invites').document(digest(body.code))
    @firestore.transactional
    def accept(tx):
        snap=ref.get(transaction=tx)
        if not snap.exists: raise HTTPException(404,'Invite code is incorrect or expired. Ask for the current family code.')
        value=snap.to_dict()
        if value['expires'] < now() or value['owner']==uid: raise HTTPException(400,'Invite expired or belongs to you')
        owner=value['owner']
        # Read inside the transaction so simultaneous joins retry against the
        # latest member list before creating links for the whole circle.
        family_query=db.collection('users').document(owner).collection('family').limit(10)
        existing=[member for member in tx.get(family_query) if (member.to_dict() or {}).get('circleOwner',owner)==owner]
        already_joined=any(member.id==uid for member in existing)
        if not already_joined and (len(existing)>=9 or value.get('uses',0)>=value.get('maxUses',9)):
            raise HTTPException(409,'This family circle is full')
        stamp=now()
        owner_name=value.get('ownerName','Family member')
        newcomer_name=body.name.strip()
        tx.set(db.collection('users').document(uid).collection('family').document(owner),{'pairedAt':stamp,'name':owner_name,'circleOwner':owner})
        tx.set(db.collection('users').document(owner).collection('family').document(uid),{'pairedAt':stamp,'name':newcomer_name,'circleOwner':owner})
        for member in existing:
            if member.id==uid: continue
            member_name=(member.to_dict() or {}).get('name','Family member')
            tx.set(db.collection('users').document(uid).collection('family').document(member.id),{'pairedAt':stamp,'name':member_name,'circleOwner':owner})
            tx.set(db.collection('users').document(member.id).collection('family').document(uid),{'pairedAt':stamp,'name':newcomer_name,'circleOwner':owner})
        if not already_joined: tx.update(ref,{'uses':value.get('uses',0)+1})
    accept(db.transaction())
    return {'paired':True}
class Label(Named): pass
@app.post('/pair/{member}/label')
def label_member(member:str,body:Label,uid=Depends(identity)):
    if '/' in member or member==uid: raise HTTPException(400,'Invalid member')
    ref=db.collection('users').document(uid).collection('family').document(member)
    if not ref.get().exists: raise HTTPException(404,'Family member not found')
    ref.update({'name':body.name.strip()})
    return {'updated':True}
@app.delete('/pair/{member}')
def unpair(member:str,uid=Depends(identity)):
    if '/' in member: raise HTTPException(400,'Invalid member')
    own_ref=db.collection('users').document(uid).collection('family').document(member)
    own_snap=own_ref.get()
    if not own_snap.exists: raise HTTPException(404,'Family member not found')
    circle_owner=(own_snap.to_dict() or {}).get('circleOwner')
    batch=db.batch()
    if circle_owner and (uid==circle_owner or member==circle_owner):
        removed=member if uid==circle_owner else uid
        others=[person for person in db.collection('users').document(circle_owner).collection('family').limit(10).stream() if (person.to_dict() or {}).get('circleOwner',circle_owner)==circle_owner]
        participants=[circle_owner]+[person.id for person in others if person.id!=removed]
        for person in participants:
            batch.delete(db.collection('users').document(person).collection('family').document(removed))
            batch.delete(db.collection('users').document(removed).collection('family').document(person))
    else:
        batch.delete(own_ref)
        batch.delete(db.collection('users').document(member).collection('family').document(uid))
    batch.commit()
    return {'removed':True}
@app.post('/notifications/token')
def register(body:Token,uid=Depends(identity)):
    reserve_action(uid, 'token', 10)
    token_id=digest(body.token)
    owner_ref=db.collection('tokenOwners').document(token_id)
    previous=owner_ref.get()
    batch=db.batch()
    if previous.exists:
        old_uid=(previous.to_dict() or {}).get('uid')
        if old_uid and old_uid!=uid:
            batch.delete(db.collection('users').document(old_uid).collection('tokens').document(token_id))
    batch.set(db.collection('users').document(uid).collection('tokens').document(token_id),{'token':body.token,'updatedAt':now()})
    batch.set(owner_ref,{'uid':uid})
    batch.commit()
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
    inboxes=0
    push_jobs=[]
    for member in members:
        sender_ref=db.collection('users').document(member.id).collection('family').document(uid)
        sender_snap=sender_ref.get()
        if not sender_snap.exists: continue
        sender_name=(sender_snap.to_dict() or {}).get('name','Family member')
        db.collection('users').document(member.id).collection('alerts').add({'tacticCount':body.stages,'tacticTypes':body.tacticTypes,'timestamp':stamp,'familyCircleId':digest('|'.join(sorted([uid,member.id]))),'senderName':sender_name,'status':'requested'})
        inboxes+=1
        for token in db.collection('users').document(member.id).collection('tokens').limit(5).stream():
            push_jobs.append((token.reference,messaging.Message(token=token.to_dict()['token'],notification=messaging.Notification(title='VaultShield · Help requested',body=f'{sender_name} asked for help. Call them using your saved number. {body.stages}/4 pressure tactics.'),webpush=messaging.WebpushConfig(fcm_options=messaging.WebpushFCMOptions(link=PUBLIC_APP_URL) if PUBLIC_APP_URL else None))))
    delivered=0
    if push_jobs:
        try:
            batch=messaging.send_each([message for _,message in push_jobs])
            delivered=batch.success_count
            for (token_ref,_),response in zip(push_jobs,batch.responses):
                if isinstance(response.exception,messaging.UnregisteredError): token_ref.delete()
        except Exception:
            pass  # Firestore inbox remains the durable delivery path.
    return {'inboxes':inboxes,'pushNotifications':delivered}


# Pattern submissions contain closed categories only. No message text, token mapping or user IDs enter aggregate documents.
from typing import Literal
import json
from google.cloud.firestore_v1.base_query import FieldFilter
class Pattern(Payload):
    tacticTypes: list[Literal['Authority','Fear','Urgency','Secrecy']] = Field(max_length=4)
    urlFeature: Literal['none','shortener','bank-like','agency-like','other']
    amountBucket: Literal['none','lt1k','1k-10k','10k-50k','50k-plus']
    language: Literal['en','hi']

    @field_validator('tacticTypes')
    @classmethod
    def unique_tactics(cls, value):
        if len(value) != len(set(value)): raise ValueError('Duplicate tactics')
        return sorted(value)

@app.post('/patterns')
def contribute_pattern(body:Pattern,uid=Depends(identity)):
    reserve_action(uid,'pattern',3600)
    categories=body.model_dump()
    ref=db.collection('patternAggregates').document(digest(json.dumps(categories,sort_keys=True)))
    @firestore.transactional
    def increment(tx):
        tx.set(ref,{**categories,'count':firestore.Increment(1)},merge=True)
    increment(db.transaction())
    return {'accepted':True}

@app.get('/patterns/trending')
def trending_patterns(uid=Depends(identity)):
    threshold=max(5,int(os.environ.get('PATTERN_K','5')))
    docs=db.collection('patternAggregates').where(filter=FieldFilter('count','>=',threshold)).limit(10).stream()
    buckets=[]
    for doc in docs:
        data=doc.to_dict()
        if type(data.get('count')) is not int or data['count']<threshold: continue
        try:
            categories=Pattern.model_validate({key:data[key] for key in Pattern.model_fields}).model_dump()
        except (ValueError,KeyError): continue
        buckets.append({**categories,'count':data['count']})
    return {'threshold':threshold,'buckets':buckets}
