"""Real database/queue fixture only in explicit local/CI candidate projects."""
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--project', required=True)
parser.add_argument('--env-file', type=Path, default=ROOT/'deploy/private/product.env')
args = parser.parse_args()
if not args.project.startswith('orchestrai-r3') or args.project == 'orchestrai-production':
    raise ValueError('dedicated local/CI candidate only; never production')
command = ['docker','compose','--env-file',str(args.env_file),'-f','deploy/compose.yml',
           '-f','deploy/compose.product.yml','-f','deploy/compose.research.yml','-p',args.project]
subprocess.run(command+['exec','-T','postgres','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
    input=b"SELECT 'CREATE DATABASE research_fixture OWNER research_migrator' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='research_fixture') \\gexec\nREVOKE CONNECT ON DATABASE research_fixture FROM PUBLIC;\nGRANT CONNECT ON DATABASE research_fixture TO research;\n",check=True,cwd=ROOT)
subprocess.run(command+['run','--rm','--entrypoint','node','research-migrate','-e',
    "process.env.DATABASE_URL=process.env.DATABASE_URL.replace(/\\/research$/,'/research_fixture');import('./src/migrate.mjs')"],check=True,cwd=ROOT)
subprocess.run(command+['run','--rm','--no-deps','-v',str(ROOT/'services/research/tests')+':/app/tests:ro',
    '--entrypoint','node','research','tests/integration.mjs'],check=True,cwd=ROOT,timeout=240)
