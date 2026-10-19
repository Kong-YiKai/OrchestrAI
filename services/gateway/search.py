"""Restricted search/reader transports; credentials, accounting and replay.

Installed via LiteLLM's worker-startup hook in the existing gateway process.
No arbitrary target URL, provider override, crawl or automatic paid retry.
"""
import asyncio
import hashlib
import hmac
import ipaddress
import json
import math
import os
import re
import socket
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import budget


async def public_url(value):
    try:
        parsed = urlsplit(value)
        if (len(value) > 2000 or parsed.scheme not in ('http', 'https') or not parsed.hostname
                or parsed.username or parsed.password or parsed.port not in (None, 80, 443)):
            raise ValueError()
        host = parsed.hostname.rstrip('.')
        if '.' not in host or host.endswith(('.localhost', '.local', '.internal', '.test', '.invalid')):
            raise ValueError()
        records = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(
            host, parsed.port or 443, type=socket.SOCK_STREAM), timeout=3)
        if not records or any(not ipaddress.ip_address(row[4][0]).is_global for row in records):
            raise ValueError()
        return value
    except Exception:
        raise HTTPException(400, 'public_http_url_required')


async def cached_provider(identity, signature, model, reserve_fen, credits, invoke):
    """One receipt/fence for paid Tavily and the fixed anonymous reader."""
    try:
        with budget.connect() as db:
            old = db.execute('SELECT request_hash,response FROM provider_calls WHERE id=?', (identity,)).fetchone()
        if old:
            if old[0] != signature:
                raise HTTPException(409, 'operation_content_changed')
            if old[1] is None:
                raise HTTPException(409, 'uncertain_provider_operation_no_retry')
            return JSONResponse(json.loads(old[1]))
        budget.reserve(model, reserve_fen, identity, credits=credits, request_hash=signature)
        value, charged, amount = await invoke()
        budget.settle(identity, amount, credits=charged, response=value)
        return JSONResponse(value)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, 'search_transport_or_budget_unavailable_reservation_retained')


async def proxy(request: Request):
    key = os.getenv('RESEARCH_GATEWAY_KEY', '')
    if len(key) < 32 or not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer '+key):
        raise HTTPException(401, 'research_service_authentication_required')
    operation = request.query_params.get('operation_id', '')
    if not re.fullmatch(r'[0-9a-f-]{36}-(search|extract)', operation) or set(request.query_params) != {'operation_id'}:
        raise HTTPException(400, 'invalid_operation')
    raw = await request.body()
    if len(raw) > 16384:
        raise HTTPException(413, 'request_too_large')
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'invalid_json')
    action = request.path_params['action']
    if action == 'search':
        allowed = {'query', 'search_depth', 'topic', 'max_results', 'safe_search', 'time_range',
                   'country', 'include_images', 'include_answer', 'include_raw_content'}
        query = data.get('query')
        if (set(data)-allowed or not isinstance(query, str) or not 1 <= len(query.strip()) <= 1000
                or data.get('search_depth', 'basic') != 'basic' or data.get('topic', 'general') != 'general'
                or type(data.get('max_results', 5)) is not int or not 1 <= data.get('max_results', 5) <= 5
                or any(data.get(k) for k in ('include_images','include_answer','include_raw_content'))):
            raise HTTPException(400, 'bounded_basic_search_required')
        if query.startswith(('https://', 'http://')) and not re.search(r'\s', query):
            # A supplied public URL seeds the upstream extractor, not a fake
            # provider search. It has no search cost; extraction is billed below.
            await public_url(query)
            return JSONResponse({'results': [{'url': query, 'title': urlsplit(query).hostname, 'content': ''}],
                                 'source': 'user_supplied_url'})
        data.update(search_depth='basic', max_results=min(data.get('max_results', 5), 5), include_usage=True)
    elif action == 'extract':
        urls = data.get('urls')
        if (set(data)-{'urls','extract_depth','include_images','include_favicon','format','timeout'}
                or not isinstance(urls, list) or not 1 <= len(urls) <= 5
                or any(not isinstance(u, str) for u in urls)
                or data.get('extract_depth', 'basic') != 'basic' or data.get('include_images')
                or data.get('include_favicon') or data.get('format', 'text') not in ('text','markdown')):
            raise HTTPException(400, 'bounded_basic_extract_required')
        await asyncio.gather(*(public_url(url) for url in urls))
        data.update(extract_depth='basic', include_usage=True, timeout=10)
    else:
        raise HTTPException(404, 'not_found')
    provider_key = os.getenv('TAVILY_API_KEY', '')
    if not provider_key:
        raise HTTPException(503, 'search_provider_not_configured')
    signature = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    async def invoke():
        async with httpx.AsyncClient(timeout=12, follow_redirects=False, trust_env=False) as client:
            upstream = await client.post('https://api.tavily.com/'+action, json=data,
                                         headers={'Authorization':'Bearer '+provider_key})
        if upstream.status_code != 200 or len(upstream.content) > 2 * 1024 * 1024:
            raise HTTPException(502, 'search_provider_failed_reservation_retained')
        value = upstream.json()
        if not isinstance(value, dict) or not isinstance(value.get('results'), list):
            raise HTTPException(502, 'search_provider_invalid_response')
        charged = 1 if action == 'search' else math.ceil(len(value['results']) / 5)
        usage = value.get('usage', {})
        if isinstance(usage, dict) and isinstance(usage.get('credits'), (int, float)):
            charged = max(charged, math.ceil(usage['credits']))
        return value, charged, charged * 7
    # $0.008/credit at FX ceiling 8, rounded upward to 7 fen, including free credits.
    return await cached_provider('tavily:'+operation, signature, 'tavily-'+action, 7, 1, invoke)


async def reader(request: Request):
    key = os.getenv('RESEARCH_GATEWAY_KEY', '')
    if len(key) < 32 or not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer '+key):
        raise HTTPException(401, 'research_service_authentication_required')
    operation = request.query_params.get('operation_id', '')
    if not re.fullmatch(r'[0-9a-f-]{36}-reader', operation) or set(request.query_params) != {'operation_id'}:
        raise HTTPException(400, 'invalid_operation')
    raw = await request.body()
    if len(raw) > 8192:
        raise HTTPException(413, 'request_too_large')
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or set(data) != {'url'} or not isinstance(data['url'], str):
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'single_reader_url_required')
    url = await public_url(data['url'])
    signature = hashlib.sha256(url.encode()).hexdigest()

    async def invoke():
        # Fixed anonymous API. Never forward delegation/provider keys, cookies or caller headers.
        async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False) as client:
            async with client.stream('GET', 'https://r.jina.ai/'+url,
                                     headers={'Accept':'text/plain'}) as response:
                if response.status_code != 200:
                    raise HTTPException(502, 'reader_provider_failed_reservation_retained')
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 256 * 1024:
                        raise HTTPException(502, 'reader_response_too_large')
        text = content.decode('utf-8', errors='strict')
        title = re.search(r'^Title: (.+)$', text, re.M)
        source = re.search(r'^URL Source: (.+)$', text, re.M)
        marker = '\nMarkdown Content:\n'
        if not title or not source or source[1].strip() != url or marker not in text:
            raise HTTPException(502, 'reader_response_not_verified')
        value = {'results':[{'url':url,'title':title[1][:240],'raw_content':text.split(marker,1)[1]}],
                 'reader':'jina-anonymous'}
        return value, 0, 0
    # Anonymous reads have no account charge. Reserve one fen conservatively until a verified reply.
    return await cached_provider('jina:'+operation, signature, 'jina-read', 1, 0, invoke)


async def receipt(request: Request):
    key = os.getenv('RESEARCH_GATEWAY_KEY', '')
    if len(key) < 32 or not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer '+key):
        raise HTTPException(401, 'research_service_authentication_required')
    operation = request.path_params['operation']
    provider = request.path_params.get('provider', 'tavily')
    pattern = r'[0-9a-f-]{36}-reader' if provider == 'jina' else r'[0-9a-f-]{36}-(search|extract)'
    if provider not in ('tavily', 'jina') or not re.fullmatch(pattern, operation):
        raise HTTPException(400, 'invalid_operation')
    with budget.connect() as db:
        row = db.execute('SELECT response,charged_credits FROM provider_calls WHERE id=?', (provider+':'+operation,)).fetchone()
    if not row or row[0] is None:
        raise HTTPException(409, 'provider_receipt_unavailable')
    return JSONResponse({'response': json.loads(row[0]), 'credits': row[1]})


def install():
    from litellm.proxy.proxy_server import app
    app.add_api_route('/providers/tavily/{action}', proxy, methods=['POST'], include_in_schema=False)
    app.add_api_route('/providers/jina/read', reader, methods=['POST'], include_in_schema=False)
    app.add_api_route('/providers/{provider}/operations/{operation}', receipt, methods=['GET'], include_in_schema=False)
    app.add_api_route('/orchestrai/models', budget.catalog, methods=['GET'], include_in_schema=False)
