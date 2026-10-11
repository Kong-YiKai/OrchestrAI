"""Deployment policy and rollback contract tests. Real SQL restore is tested separately."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release',pathlib.Path(__file__).resolve().parents[1] / 'deploy/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
POLICY = {'image_repository':'ghcr.io/kong-yikai/orchestrai/workflow'}
MANIFEST = {'revision':'a'*40,'image':POLICY['image_repository']+'@sha256:'+'b'*64,'sequence':2,'schema':1,'config_digest':'c'*64}
MANIFEST.update({service+'_image':'ghcr.io/kong-yikai/orchestrai/'+service+'@sha256:'+'d'*64 for service in ('postgres','redis')})

class PolicyTests(unittest.TestCase):
    def test_valid(self):
        release.validate(MANIFEST,POLICY,None,'c'*64)

    def test_rejects_untrusted_or_incompatible_release(self):
        for field,value in [('revision','main'),('image','evil/image@sha256:'+'b'*64),('sequence',True),('schema',2),('config_digest','d'*64)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.validate(dict(MANIFEST,**{field:value}),POLICY,None,'c'*64)
        with self.assertRaises(ValueError):
            release.validate(MANIFEST,POLICY,MANIFEST,'c'*64)

    def test_failed_smoke_rolls_back_application_without_database_downgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory); (root/'state').mkdir()
            deployment=release.Deployment(root)
            calls=[]
            previous=dict(MANIFEST,sequence=1)
            def activate(manifest):
                calls.append(manifest['sequence'])
                if manifest['sequence']==2:
                    raise RuntimeError('smoke failed')
            with patch.object(deployment,'compose') as compose, patch.object(deployment,'backup',return_value={'object':'verified'}), patch.object(deployment,'activate',side_effect=activate), patch.object(release.subprocess,'check_output',return_value='a'*40):
                with self.assertRaises(RuntimeError):
                    deployment.release(MANIFEST,POLICY,previous)
            self.assertEqual(calls,[2,1])
            self.assertFalse((root/'state/current.json').exists())
            self.assertEqual(sum('migrate' in call.args for call in compose.call_args_list),1)
            self.assertIn('rolled_back',(root/'state/release-2.json').read_text())

    def test_backup_failure_never_migrates(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory); (root/'state').mkdir()
            deployment=release.Deployment(root)
            with patch.object(deployment,'compose') as compose, patch.object(deployment,'backup',side_effect=RuntimeError('offline')), patch.object(release.subprocess,'check_output',return_value='a'*40):
                with self.assertRaises(RuntimeError):
                    deployment.release(MANIFEST,POLICY,None)
            self.assertFalse(any('migrate' in call.args for call in compose.call_args_list))

if __name__=='__main__':
    unittest.main()
