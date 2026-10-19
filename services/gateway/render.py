"""Writes the LiteLLM config used at startup: the static settings in config.yaml plus one
route per catalog text model whose provider key is set. Models without a key are not
routed, so a missing key fails as model_not_allowed instead of at the provider."""
import json
import os
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent


def render(environ=os.environ):
    config = yaml.safe_load((HERE / 'config.yaml').read_text(encoding='utf-8'))
    for model in json.loads((HERE / 'models.json').read_text(encoding='utf-8'))['models']:
        if model['category'] != 'text' or not environ.get(model['key']):
            continue
        params = {'model': model['model'], 'api_key': f"os.environ/{model['key']}", 'timeout': 180,
                  'max_retries': 0, 'max_parallel_requests': 4, **model.get('params', {})}
        if model.get('api_base'):
            params['api_base'] = model['api_base']
        config['model_list'].append({'model_name': model['id'], 'litellm_params': params})
    return config


if __name__ == '__main__':
    Path(sys.argv[1]).write_text(yaml.safe_dump(render(), allow_unicode=True, sort_keys=False), encoding='utf-8')
