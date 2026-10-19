"""Deterministic tests: no provider traffic or paid calls."""
import json
import math
import asyncio
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from fastapi import HTTPException
import budget


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.settings = patch.dict(os.environ, {'MODEL_DAILY_LIMIT_CNY': '0.50',
                                               'MODEL_MONTHLY_LIMIT_CNY': '1',
                                               'DEEPSEEK_API_KEY': 'test-only', 'GATEWAY_KEY': 'test-only-gateway-key'})
        self.settings.start()
        self.path = patch.object(budget, 'PATH', Path(self.directory.name) / 'budget.sqlite')
        self.path.start()
        budget.migrate()

    def tearDown(self):
        self.path.stop()
        self.settings.stop()
        self.directory.cleanup()

    def test_parallel_reservations_do_not_overspend(self):
        def attempt(_):
            try:
                return budget.reserve('deepseek-flash', 20)
            except HTTPException as error:
                self.assertEqual(error.status_code, 429)
                return None
        with ThreadPoolExecutor(max_workers=8) as executor:
            accepted = [r for r in executor.map(attempt, range(20)) if r]
        self.assertEqual(len(accepted), 2)
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT amount_fen FROM periods').fetchall(), [(40,), (40,)])

    def test_unknown_failure_survives_restart_and_settlement_is_idempotent(self):
        call = budget.reserve('deepseek-flash', 40, 'known-operation')
        budget.migrate()
        with self.assertRaises(HTTPException):
            budget.reserve('deepseek-flash', 20)
        with self.assertRaises(HTTPException):
            budget.reserve('deepseek-flash', 1, 'known-operation')
        budget.settle(call, 2)
        budget.settle(call, 2)
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT amount_fen FROM periods').fetchall(), [(2,), (2,)])

    def test_sdk_callback_reserves_and_settles_embedding(self):
        callback = budget.Budget()
        data = {'model': 'text-embedding-v4', 'input': ['中文文档'], 'dimensions': 1024}
        result = asyncio.run(callback.async_pre_call_hook(None, None, data, 'aembedding'))
        asyncio.run(callback.async_log_success_event(
            {'model': 'openai/text-embedding-v4', 'litellm_params': {'metadata': result['metadata']}},
            SimpleNamespace(usage=SimpleNamespace(prompt_tokens=12)), None, None))
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT state,charged_fen FROM calls').fetchone(), ('settled', 1))
        with self.assertRaises(HTTPException):
            budget.bound({'model': 'deepseek-flash', 'api_base': 'https://other.invalid'}, 'acompletion')
        with self.assertRaises(HTTPException):
            budget.bound({'model': 'text-embedding-v4', 'input': ['x'] * 11}, 'aembedding')

    def test_text_reservation_matches_the_request_worst_case(self):
        small = budget.bound({'model': 'deepseek-flash', 'messages': [{'role': 'user', 'content': 'hi'}]}, 'acompletion')
        large = budget.bound({'model': 'deepseek-flash', 'max_tokens': 8192,
                              'messages': [{'role': 'user', 'content': 'x' * 150000}]}, 'acompletion')
        self.assertLessEqual(small, 4)
        self.assertGreaterEqual(large, math.ceil(150000 * 0.00024 + 8192 * 0.00096))
        self.assertLess(large, 60)

    def test_only_keyed_catalog_models_route_and_each_is_billed_at_its_price(self):
        os.environ.pop('OPENAI_API_KEY', None)
        with self.assertRaises(HTTPException) as refused:
            budget.bound({'model': 'gpt', 'messages': [{'role': 'user', 'content': 'hi'}]}, 'acompletion')
        self.assertEqual(refused.exception.detail, 'model_not_allowed')
        with patch.dict(os.environ, {'MODEL_DAILY_LIMIT_CNY': '100', 'MODEL_MONTHLY_LIMIT_CNY': '100'}):
            flash = budget.bound({'model': 'deepseek-flash', 'max_tokens': 1000, 'messages': [{'role': 'user', 'content': 'x' * 10000}]}, 'acompletion')
            pro = budget.bound({'model': 'deepseek-pro', 'max_tokens': 1000, 'messages': [{'role': 'user', 'content': 'x' * 10000}]}, 'acompletion')
            self.assertGreater(pro, flash)
            data = {'model': 'deepseek-pro', 'thinking': {'type': 'enabled'}, 'messages': [{'role': 'user', 'content': 'hi'}]}
            budget.bound(data, 'acompletion')
            self.assertEqual(data['thinking'], {'type': 'disabled'}, 'callers cannot switch on reasoning')
            callback = budget.Budget()
            result = asyncio.run(callback.async_pre_call_hook(None, None, data, 'acompletion'))
            asyncio.run(callback.async_log_success_event(
                {'model': 'deepseek/deepseek-v4-pro', 'litellm_params': {'metadata': result['metadata']}},
                SimpleNamespace(usage=SimpleNamespace(prompt_tokens=1_000_000, completion_tokens=0)), None, None))
            with budget.connect() as db:
                self.assertEqual(db.execute("SELECT charged_fen FROM calls WHERE state='settled'").fetchone(), (1060,))
        with self.assertRaises(HTTPException):
            budget.bound({'model': 'deepseek-pro', 'messages': [{'role': 'user', 'content': [
                {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,AAAA'}}]}]}, 'acompletion')

    def test_catalog_lists_every_model_with_availability_and_requires_the_gateway_key(self):
        def ask(header):
            return asyncio.run(budget.catalog(SimpleNamespace(headers={'authorization': header})))
        with self.assertRaises(HTTPException):
            ask('Bearer wrong')
        models = {m['id']: m for m in json.loads(ask('Bearer test-only-gateway-key').body)['models']}
        self.assertTrue(models['deepseek-flash']['available'])
        self.assertFalse(models['gpt']['available'] and not os.getenv('OPENAI_API_KEY'))
        self.assertEqual(models['seedream']['category'], 'image')
        self.assertFalse(models['seedream']['available'], 'generation models are not routed yet')

    def test_rendered_config_routes_only_models_with_keys(self):
        import render
        names = [m['model_name'] for m in render.render({'DEEPSEEK_API_KEY': 'k'})['model_list']]
        self.assertEqual(names, ['text-embedding-v4', 'deepseek-flash', 'deepseek-pro'])
        names = [m['model_name'] for m in render.render({'DEEPSEEK_API_KEY': 'k', 'MOONSHOT_API_KEY': 'k'})['model_list']]
        self.assertIn('kimi', names)

    def test_search_and_models_share_atomic_cny_budget_and_separate_credits(self):
        with patch.dict(os.environ, {'SEARCH_DAILY_CREDITS': '2', 'SEARCH_MONTHLY_CREDITS': '2'}):
            first = budget.reserve('tavily-search', 7, 'search-first', credits=1, request_hash='hash')
            budget.reserve('tavily-extract', 7, 'search-second', credits=1, request_hash='hash')
            with self.assertRaises(HTTPException) as rejected:
                budget.reserve('tavily-search', 7, 'search-third', credits=1, request_hash='hash')
            self.assertEqual(rejected.exception.status_code, 429)
            budget.reserve('deepseek-flash', 20)
            with self.assertRaises(HTTPException):
                budget.reserve('deepseek-flash', 20)
            budget.settle(first, 7, credits=1, response={'results': []})
            budget.settle(first, 7, credits=1, response={'results': []})
            with budget.connect() as db:
                self.assertEqual(db.execute('SELECT amount_fen FROM periods').fetchall(), [(34,), (34,)])
                self.assertEqual(db.execute('SELECT credits FROM credit_periods').fetchall(), [(2,), (2,)])
                self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone(), (1,))
                self.assertIsNotNone(db.execute('SELECT response FROM provider_calls WHERE id=?', (first,)).fetchone()[0])

    def test_anonymous_reader_has_a_durable_zero_credit_receipt(self):
        call=budget.reserve('jina-read',1,'reader-fixture',credits=0,request_hash='reader-hash')
        budget.settle(call,0,credits=0,response={'results':[]})
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT amount_fen FROM periods').fetchall(),[(0,),(0,)])
            self.assertEqual(db.execute('SELECT reserve_credits,charged_credits FROM provider_calls').fetchone(),(0,0))
            self.assertIsNotNone(db.execute('SELECT response FROM provider_calls').fetchone()[0])

    def test_additive_search_migration_preserves_old_model_ledger(self):
        call = budget.reserve('deepseek-flash', 20, 'r3-old-reservation')
        budget.migrate()
        budget.settle(call, 1)
        with budget.connect() as db:
            self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone(), (1,))
            self.assertEqual(db.execute('SELECT state,charged_fen FROM calls WHERE id=?', (call,)).fetchone(), ('settled', 1))


if __name__ == '__main__':
    unittest.main()
