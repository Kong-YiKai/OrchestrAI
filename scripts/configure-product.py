"""Prepare a private product env without replacing existing infrastructure secrets."""
import argparse
import json
import pathlib
import re
import secrets
import os

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_env(path):
    values = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('"\'')
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'deploy/private/product.env')
    parser.add_argument('--base-env', type=pathlib.Path)
    parser.add_argument('--providers', type=pathlib.Path, default=ROOT / 'deploy/private/providers.json')
    parser.add_argument('--model-env', type=pathlib.Path, default=ROOT / 'deploy/private/model.env')
    args = parser.parse_args()
    output = args.output.resolve()
    if not output.is_relative_to((ROOT / 'deploy/private').resolve()):
        raise ValueError('output must remain in deploy/private')
    values = read_env(args.base_env) if args.base_env else {}
    values.update(read_env(output))
    provider = json.loads(args.providers.read_text(encoding='utf-8-sig'))
    if provider.get('embedding_model') != 'text-embedding-v4' or provider.get('embedding_dimensions') != 1024:
        raise ValueError('embedding model/dimensions mismatch')
    url = provider.get('embedding_base_url', '').rstrip('/')
    if not url.startswith('https://') or not url.endswith('/v1') or '\n' in url or "'" in url:
        raise ValueError('embedding URL must be HTTPS compatible /v1')
    model = read_env(args.model_env)
    inputs = {'EMBEDDING_API_KEY': provider.get('embedding_api_key', ''),
              'EMBEDDING_BASE_URL': url, 'DEEPSEEK_API_KEY': model.get('DEEPSEEK_API_KEY') or values.get('DEEPSEEK_API_KEY', '')}
    for key, value in inputs.items():
        if not value or '\n' in value or "'" in value:
            raise ValueError(f'{key}: missing or invalid private input')
        values[key] = value
    for key in ['POSTGRES_PASSWORD', 'WORKFLOW_DB_PASSWORD', 'REDIS_PASSWORD', 'DELEGATION_SECRET',
                'MONGO_ADMIN_PASSWORD', 'MONGO_CHAT_PASSWORD', 'INGESTION_DB_PASSWORD',
                'INGESTION_MIGRATION_PASSWORD', 'CHAT_JWT_SECRET', 'CHAT_REFRESH_SECRET',
                'RAG_JWT_SECRET', 'GATEWAY_KEY', 'CHAT_CREDS_KEY', 'RESEARCH_DELEGATION_SECRET',
                'RESEARCH_GATEWAY_KEY', 'RESEARCH_DB_PASSWORD', 'RESEARCH_MIGRATION_PASSWORD']:
        values.setdefault(key, secrets.token_hex(32))
    values.setdefault('CHAT_CREDS_IV', secrets.token_hex(16))
    values.setdefault('MODEL_DAILY_LIMIT_CNY', '5')
    values.setdefault('MODEL_MONTHLY_LIMIT_CNY', '100')
    values.setdefault('SEARCH_DAILY_CREDITS', '30')
    values.setdefault('SEARCH_MONTHLY_CREDITS', '1000')
    if model.get('TAVILY_API_KEY'):
        values['TAVILY_API_KEY'] = model['TAVILY_API_KEY']
    values.setdefault('ALLOW_REGISTRATION', 'false')
    values.setdefault('PRODUCT_URL', 'http://localhost:3088')
    for key in values:
        if not re.fullmatch('[A-Z][A-Z0-9_]*', key):
            raise ValueError('invalid environment field')
        if any(character in values[key] for character in ("'", '\n', '\r')):
            raise ValueError(f'{key}: invalid private value')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Single-quoted dotenv values prevent Compose interpolation of credential '$'.
    output.write_text('\n'.join(f"{k}='{v}'" for k, v in sorted(values.items())) + '\n', encoding='utf-8')
    if os.name != 'nt':
        os.chmod(output, 0o600)
    print('Private product env prepared; credentials omitted. Registration defaults closed.')


if __name__ == '__main__':
    main()
