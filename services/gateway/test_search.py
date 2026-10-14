"""Restricted provider transport contracts, with no external provider calls."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException
import httpx
import budget
import search


class SearchContracts(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = patch.object(budget, 'PATH', Path(self.directory.name)/'budget.sqlite')
        self.path.start()
        self.env = patch.dict(os.environ, RESEARCH_GATEWAY_KEY='a'*64, TAVILY_API_KEY='fixture-only',
                              MODEL_DAILY_LIMIT_CNY='5', MODEL_MONTHLY_LIMIT_CNY='100',
                              SEARCH_DAILY_CREDITS='30', SEARCH_MONTHLY_CREDITS='1000')
        self.env.start()
        budget.migrate()
        app = FastAPI()
        app.add_api_route('/providers/tavily/{action}', search.proxy, methods=['POST'])
        app.add_api_route('/providers/jina/read', search.reader, methods=['POST'])
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://fixture')
        self.operation = str(uuid4())+'-search'
        self.url = '/providers/tavily/search?operation_id='+self.operation
        self.headers = {'Authorization': 'Bearer '+'a'*64}

    async def asyncTearDown(self):
        await self.client.aclose()
        self.env.stop()
        self.path.stop()
        self.directory.cleanup()

    async def test_auth_and_bounded_parameters_reject_before_spend(self):
        self.assertEqual((await self.client.post(self.url, json={'query':'test'})).status_code, 401)
        self.assertEqual((await self.client.post(self.url, headers=self.headers,
            json={'query':'test', 'search_depth':'advanced'})).status_code, 400)
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM calls').fetchone()[0], 0)

    async def test_cached_replay_does_not_repeat_provider_or_budget(self):
        original = httpx.AsyncClient
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json={'results':[], 'usage':{'credits':1}}))
        with patch.object(search.httpx, 'AsyncClient', side_effect=lambda **kw: original(transport=transport, **kw)) as provider:
            first = await self.client.post(self.url, headers=self.headers, json={'query':'test'})
            second = await self.client.post(self.url, headers=self.headers, json={'query':'test'})
            changed = await self.client.post(self.url, headers=self.headers, json={'query':'changed'})
        self.assertEqual((first.status_code, second.status_code, changed.status_code), (200, 200, 409))
        self.assertEqual(provider.call_count, 1)
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT amount_fen FROM periods').fetchall(), [(7,), (7,)])

    async def test_uncertain_failure_keeps_reservation_and_forbids_retry(self):
        with patch.object(search.httpx, 'AsyncClient', side_effect=httpx.ReadTimeout('fixture')) as provider:
            self.assertEqual((await self.client.post(self.url, headers=self.headers, json={'query':'test'})).status_code, 503)
            self.assertEqual((await self.client.post(self.url, headers=self.headers, json={'query':'test'})).status_code, 409)
            self.assertEqual(provider.call_count, 1)
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT state,reserve_fen FROM calls').fetchone(), ('reserved', 7))

    async def test_direct_url_is_seed_only_and_private_resolution_rejected(self):
        with patch.object(search, 'public_url', new=AsyncMock(return_value='https://example.com')):
            result = await self.client.post(self.url, headers=self.headers, json={'query':'https://example.com'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['source'], 'user_supplied_url')
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM calls').fetchone()[0], 0)
        import asyncio
        with patch.object(asyncio.get_running_loop(), 'getaddrinfo', new=AsyncMock(return_value=[(2,1,6,'',('127.0.0.1',443))])):
            with self.assertRaises(HTTPException):
                await search.public_url('https://example.com')

    async def test_anonymous_reader_is_bounded_verified_cached_and_does_not_forward_keys(self):
        original=httpx.AsyncClient
        seen=[]
        def upstream(req):
            seen.append(req)
            return httpx.Response(200,text='Title: Article\n\nURL Source: https://example.com/article\n\nMarkdown Content:\nActual page evidence.')
        transport=httpx.MockTransport(upstream)
        url='/providers/jina/read?operation_id='+str(uuid4())+'-reader'
        with patch.object(search,'public_url',new=AsyncMock(return_value='https://example.com/article')):
            with patch.object(search.httpx,'AsyncClient',side_effect=lambda **kw:original(transport=transport,**kw)):
                first=await self.client.post(url,headers=self.headers,json={'url':'https://example.com/article'})
                second=await self.client.post(url,headers=self.headers,json={'url':'https://example.com/article'})
        self.assertEqual((first.status_code,second.status_code),(200,200));self.assertEqual(len(seen),1)
        self.assertNotIn('authorization',seen[0].headers);self.assertEqual(seen[0].url.host,'r.jina.ai')
        self.assertEqual(first.json()['results'][0]['raw_content'],'Actual page evidence.')
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT amount_fen FROM periods').fetchall(),[(0,),(0,)])
        self.assertEqual((await self.client.post(url,json={'url':'https://example.com'})).status_code,401)
        with patch.object(search,'public_url',new=AsyncMock(side_effect=HTTPException(400,'public_http_url_required'))):
            self.assertEqual((await self.client.post(url,headers=self.headers,json={'url':'https://127.0.0.1'})).status_code,400)

    async def test_reader_wrong_source_or_unknown_failure_never_retries(self):
        original=httpx.AsyncClient
        transport=httpx.MockTransport(lambda req:httpx.Response(200,text='Title: Wrong\nURL Source: https://other.example/doc\n\nMarkdown Content:\nWrong body'))
        url='/providers/jina/read?operation_id='+str(uuid4())+'-reader'
        with patch.object(search,'public_url',new=AsyncMock(return_value='https://example.com/article')):
            with patch.object(search.httpx,'AsyncClient',side_effect=lambda **kw:original(transport=transport,**kw)) as provider:
                first=await self.client.post(url,headers=self.headers,json={'url':'https://example.com/article'})
                second=await self.client.post(url,headers=self.headers,json={'url':'https://example.com/article'})
        self.assertEqual((first.status_code,second.status_code),(502,409));self.assertEqual(provider.call_count,1)


if __name__ == '__main__':
    unittest.main()
