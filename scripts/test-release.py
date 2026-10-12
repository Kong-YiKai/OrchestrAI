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
    def test_vulnerability_review_is_narrow_and_expires(self):
        from datetime import date
        spec=importlib.util.spec_from_file_location('image_check',pathlib.Path(__file__).with_name('check-image.py'))
        module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        policy={'assessments':[dict(id='CVE-1',packages=['pkg'],versions=['1'],services=['gateway'],expires='2026-11-12')]}
        finding=dict(VulnerabilityID='CVE-1',PkgName='pkg',InstalledVersion='1',Severity='HIGH')
        report={'Results':[{'Vulnerabilities':[finding]}]}
        self.assertFalse(module.assess(report,'gateway',policy,date(2026,10,12))[0])
        self.assertTrue(module.assess(report,'chat',policy,date(2026,10,12))[0])
        self.assertTrue(module.assess(report,'gateway',policy,date(2026,11,13))[0])
        finding['FixedVersion']='2'
        self.assertTrue(module.assess(report,'gateway',policy,date(2026,10,12))[0])

    def test_valid(self):
        release.validate(MANIFEST,POLICY,None,'c'*64)
        product=dict(MANIFEST,schema=2,**{service+'_image':'ghcr.io/kong-yikai/orchestrai/'+service+'@sha256:'+'d'*64 for service in ('chat','ingestion','gateway','web','mongo')})
        release.validate(product,POLICY,None,'c'*64)

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

    def test_daily_retention_preserves_release_and_unrelated_objects(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory); (root/'state').mkdir(); (root/'backups').mkdir()
            old='daily-20000101T000000Z.dump.age'
            (root/'backups'/old).write_bytes(b'encrypted')
            deployment=release.Deployment(root)
            policy=dict(POLICY,backup_remote='backup:bucket/orchestrai/workflow')
            names='\n'.join([old,'2-revision.dump.age','other-project.dump.age','daily-20990101T000000Z.dump.age'])
            with patch.object(deployment,'compose'), patch.object(deployment,'backup',return_value={'object':'verified'}), patch.object(release.subprocess,'check_output',return_value=names), patch.object(release.subprocess,'run') as run:
                deployment.daily_backup(MANIFEST,policy)
            self.assertEqual(len(run.call_args_list),1)
            self.assertEqual(run.call_args.args[0][-2:],['deletefile',policy['backup_remote']+'/'+old])
            self.assertFalse((root/'backups'/old).exists())

    def test_product_daily_failure_resumes_writers(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory); (root/'state').mkdir()
            deployment=release.Deployment(root)
            product=dict(MANIFEST,schema=2)
            with patch.object(deployment,'compose') as compose, patch.object(deployment,'backup',side_effect=RuntimeError('offline')):
                with self.assertRaises(RuntimeError):
                    deployment.daily_backup(product,POLICY)
            self.assertIn('stop',compose.call_args_list[0].args)
            self.assertIn('up',compose.call_args_list[1].args)
            self.assertIn('chat',compose.call_args_list[1].args)

if __name__=='__main__':
    unittest.main()
