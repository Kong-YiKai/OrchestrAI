"""Checksum-locked forward-only migrations, separate from the runtime role."""
import hashlib
import os
from pathlib import Path
import psycopg2


def main():
    with psycopg2.connect(host='postgres', dbname='ingestion', user='ingestion_migrator',
                         password=os.environ['INGESTION_MIGRATION_PASSWORD']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(730301)')
            cursor.execute('CREATE TABLE IF NOT EXISTS schema_migrations '
                           '(version TEXT PRIMARY KEY, checksum TEXT NOT NULL)')
            for file in sorted((Path(__file__).parent / 'migrations').glob('*.sql')):
                body = file.read_bytes()
                digest = hashlib.sha256(body).hexdigest()
                cursor.execute('SELECT checksum FROM schema_migrations WHERE version=%s', (file.name,))
                existing = cursor.fetchone()
                if existing:
                    if existing[0] != digest:
                        raise ValueError('migration_checksum_mismatch')
                    continue
                cursor.execute(body.decode('utf-8'))
                cursor.execute('INSERT INTO schema_migrations VALUES (%s,%s)', (file.name, digest))
            cursor.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON langchain_pg_collection, '
                           'langchain_pg_embedding TO ingestion')
    print('Ingestion migrations ready; no database downgrade performed.')


if __name__ == '__main__':
    main()
