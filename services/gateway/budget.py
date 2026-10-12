"""LiteLLM callback: atomic, persisted CNY reservations for a single gateway.

Unsettled/crashed/provider-failed calls retain their reservation, never refund on
an uncertain failure. SQLite is owned by this service and backed up with it.
"""
import base64
import json
import math
import os
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import HTTPException
from litellm.integrations.custom_logger import CustomLogger

SCHEMA = 1
PATH = Path(os.getenv('BUDGET_DATABASE', '/data/budget.sqlite'))
DDL = '''
CREATE TABLE schema_version(version INTEGER NOT NULL);
INSERT INTO schema_version VALUES (1);
CREATE TABLE periods(period TEXT PRIMARY KEY, amount_fen INTEGER NOT NULL CHECK(amount_fen>=0));
CREATE TABLE calls(id TEXT PRIMARY KEY, day TEXT NOT NULL, month TEXT NOT NULL,
 reserve_fen INTEGER NOT NULL CHECK(reserve_fen>0), charged_fen INTEGER,
 model TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
'''


def migrate():
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(PATH) as db:
        db.execute('PRAGMA journal_mode=WAL')
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='schema_version'").fetchone():
            db.executescript(DDL)
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='provider_schema'").fetchone():
            # Separate additive provider schema: the unchanged model schema stays
            # readable by the R3 gateway during an application-only rollback.
            db.executescript('''BEGIN IMMEDIATE;
CREATE TABLE provider_schema(version INTEGER NOT NULL);
INSERT INTO provider_schema VALUES (1);
CREATE TABLE credit_periods(period TEXT PRIMARY KEY, credits INTEGER NOT NULL CHECK(credits>=0));
CREATE TABLE provider_calls(id TEXT PRIMARY KEY REFERENCES calls(id), request_hash TEXT NOT NULL,
 reserve_credits INTEGER NOT NULL, charged_credits INTEGER, response TEXT);
COMMIT;''')
        if db.execute('SELECT version FROM provider_schema').fetchone() != (1,):
            raise RuntimeError('provider_budget_schema_mismatch')
        if db.execute('SELECT version FROM schema_version').fetchone() != (SCHEMA,):
            raise RuntimeError('budget_schema_mismatch')


def connect():
    db = sqlite3.connect(f'file:{PATH}?mode=rw', uri=True, timeout=5)
    if db.execute('SELECT version FROM schema_version').fetchone() != (SCHEMA,):
        db.close()
        raise RuntimeError('budget_schema_mismatch')
    return db


def reserve(model, amount, request_id=None, credits=0, request_hash=None):
    now = datetime.now(timezone(timedelta(hours=8)))
    day, month = now.strftime('day:%Y-%m-%d'), now.strftime('month:%Y-%m')
    limits = [int(float(os.getenv('MODEL_DAILY_LIMIT_CNY', '5')) * 100),
              int(float(os.getenv('MODEL_MONTHLY_LIMIT_CNY', '100')) * 100)]
    request_id = request_id or str(uuid.uuid4())
    db = connect()
    try:
        db.execute('BEGIN IMMEDIATE')
        # Transport receipts are a short-lived replay cache. Durable research
        # evidence lives in the research DB; accounting/uncertain-call fences
        # remain after receipts expire, so expiry never authorizes a paid retry.
        if credits:
            cutoff = (now - timedelta(days=35)).isoformat()
            db.execute('UPDATE provider_calls SET response=NULL WHERE response IS NOT NULL '
                       'AND id IN (SELECT id FROM calls WHERE created_at<?)', (cutoff,))
        if db.execute('SELECT 1 FROM calls WHERE id=?', (request_id,)).fetchone():
            raise HTTPException(409, 'duplicate_model_operation')
        for period, limit in zip([day, month], limits):
            db.execute('INSERT INTO periods VALUES (?,0) ON CONFLICT DO NOTHING', (period,))
            used = db.execute('SELECT amount_fen FROM periods WHERE period=?', (period,)).fetchone()[0]
            if used + amount > limit:
                raise HTTPException(429, 'provider_budget_exceeded')
        for period in [day, month]:
            db.execute('UPDATE periods SET amount_fen=amount_fen+? WHERE period=?', (amount, period))
        if credits:
            credit_limits = [int(os.getenv('SEARCH_DAILY_CREDITS', '30')),
                             int(os.getenv('SEARCH_MONTHLY_CREDITS', '1000'))]
            for period, limit in zip([day, month], credit_limits):
                db.execute('INSERT INTO credit_periods VALUES (?,0) ON CONFLICT DO NOTHING', (period,))
                used = db.execute('SELECT credits FROM credit_periods WHERE period=?', (period,)).fetchone()[0]
                if used + credits > limit:
                    raise HTTPException(429, 'search_credit_budget_exceeded')
                db.execute('UPDATE credit_periods SET credits=credits+? WHERE period=?', (credits, period))
        db.execute('INSERT INTO calls VALUES (?,?,?,?,NULL,?,?,?)',
                   (request_id, day, month, amount, model, 'reserved', now.isoformat()))
        if credits:
            db.execute('INSERT INTO provider_calls VALUES (?,?,?,NULL,NULL)', (request_id, request_hash, credits))
        db.commit()
        return request_id
    finally:
        db.close()


def settle(request_id, amount, credits=None, response=None):
    db = connect()
    try:
        db.execute('BEGIN IMMEDIATE')
        call = db.execute('SELECT day,month,reserve_fen,state FROM calls WHERE id=?', (request_id,)).fetchone()
        if not call or call[3] != 'reserved':
            return
        # A larger-than-reserved bill fences subsequent calls and is recorded;
        # it is never hidden by clipping usage to the reservation.
        delta = amount - call[2]
        for period in call[:2]:
            db.execute('UPDATE periods SET amount_fen=amount_fen+? WHERE period=?', (delta, period))
        db.execute("UPDATE calls SET state='settled',charged_fen=? WHERE id=?", (amount, request_id))
        if credits is not None:
            old = db.execute('SELECT reserve_credits FROM provider_calls WHERE id=?', (request_id,)).fetchone()
            if not old:
                raise RuntimeError('provider_reservation_missing')
            for period in call[:2]:
                db.execute('UPDATE credit_periods SET credits=credits+? WHERE period=?', (credits-old[0], period))
            db.execute('UPDATE provider_calls SET charged_credits=?,response=? WHERE id=?',
                       (credits, json.dumps(response, ensure_ascii=False), request_id))
        db.commit()
    finally:
        db.close()


def bound(data, call_type):
    if data.get('model') not in {'deepseek-flash', 'text-embedding-v4'}:
        raise HTTPException(400, 'model_not_allowed')
    if any(data.get(k) for k in ['api_key', 'api_base', 'base_url', 'azure_endpoint', 'mock_response', 'fallbacks']):
        raise HTTPException(400, 'provider_override_not_allowed')
    if data['model'] == 'text-embedding-v4':
        if call_type != 'aembedding':
            raise HTTPException(400, 'unsupported_call')
        inputs = data.get('input', [])
        inputs = [inputs] if isinstance(inputs, str) else inputs
        if not isinstance(inputs, list) or not 1 <= len(inputs) <= 10 or any(
            not isinstance(s, str) or len(s.encode()) > 8192 for s in inputs
        ):
            raise HTTPException(413, 'embedding_batch_limit')
        if data.get('dimensions', 1024) != 1024:
            raise HTTPException(400, 'embedding_dimensions_locked')
        data['dimensions'] = 1024
        data['encoding_format'] = 'float'
        return 5
    if call_type not in {'completion', 'acompletion'}:
        raise HTTPException(400, 'unsupported_call')
    if data.get('n', 1) != 1:
        raise HTTPException(400, 'multiple_completions_not_allowed')
    data['max_tokens'] = min(int(data.get('max_tokens') or 2048), 2048)
    if data['max_tokens'] < 1:
        raise HTTPException(400, 'invalid_output_limit')
    data.pop('max_completion_tokens', None)
    data['thinking'] = {'type': 'disabled'}
    images, texts = 0, []
    for message in data.get('messages', []):
        content = message.get('content', '')
        if isinstance(content, str):
            texts.append(content)
        elif content is None and message.get('role') == 'assistant' and message.get('tool_calls'):
            pass
        elif isinstance(content, list):
            for part in content:
                if part.get('type') == 'image_url':
                    images += 1
                    url = part.get('image_url', {}).get('url', '')
                    if not url.startswith(('data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,')):
                        raise HTTPException(400, 'only_embedded_images_allowed')
                    if len(url) > 14 * 1024 * 1024:
                        raise HTTPException(413, 'image_size_limit')
                    try:
                        base64.b64decode(url.split(',', 1)[1], validate=True)
                    except ValueError:
                        raise HTTPException(400, 'invalid_image_encoding')
                elif part.get('type') == 'text':
                    texts.append(part.get('text', ''))
                else:
                    raise HTTPException(400, 'unsupported_content')
        else:
            raise HTTPException(400, 'invalid_content')
        texts.append(json.dumps({k: v for k, v in message.items() if k != 'content'}, ensure_ascii=False))
    texts.append(json.dumps(data.get('tools', []), ensure_ascii=False))
    if images > 5 or sum(len(t.encode()) for t in texts) > 60000:
        raise HTTPException(413, 'context_limit')
    # Flash peak price: $0.3/$1.2 per million input/output; FX ceiling 8 CNY/USD.
    # For images reserve for the entire 1M-token model context, not a guessed
    # image token count. Text-only input is bounded by UTF-8 bytes plus margin.
    return 250 if images else 20


class Budget(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        amount = bound(data, call_type)
        try:
            reservation = reserve(data['model'], amount)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, 'budget_store_unavailable')
        data.setdefault('metadata', {})['orchestrai_reservation'] = reservation
        return data

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        reservation = kwargs.get('litellm_params', {}).get('metadata', {}).get('orchestrai_reservation')
        usage = getattr(response_obj, 'usage', None)
        if not reservation or not usage:
            return  # Unknown/stream interrupted usage retains the full reservation.
        model = kwargs.get('model', '')
        if 'text-embedding-v4' in model:
            amount = math.ceil(usage.prompt_tokens * 0.0000006 * 100)
        else:
            amount = math.ceil((usage.prompt_tokens * 0.0000024 + usage.completion_tokens * 0.0000096) * 100)
        settle(reservation, max(1, amount))


proxy_handler_instance = Budget()

if __name__ == '__main__':
    import sys
    if sys.argv[1:] != ['--migrate']:
        raise SystemExit('use --migrate')
    migrate()
    print('budget schema ready')
