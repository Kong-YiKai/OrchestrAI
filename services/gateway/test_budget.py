"""Deterministic tests: no provider traffic or paid calls."""
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
                                               'MODEL_MONTHLY_LIMIT_CNY': '1'})
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


if __name__ == '__main__':
    unittest.main()
