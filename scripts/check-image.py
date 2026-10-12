"""Gate raw Trivy reports with narrow, expiring reachability assessments.

Never discard findings or allow every unfixed vulnerability. Reports remain CI
artifacts. Unknown IDs, packages, versions, fixes and expired reviews fail closed.
"""
import argparse
from datetime import date
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def assess(report, service, policy, today=None):
    today = today or date.today()
    failures, reviewed = [], []
    for result in report.get('Results', []):
        for finding in result.get('Vulnerabilities', []):
            if finding['Severity'] not in ('HIGH', 'CRITICAL'):
                continue
            key = (finding['VulnerabilityID'], finding['PkgName'], finding['InstalledVersion'])
            exception = next((item for item in policy['assessments']
                if service in item['services'] and key[0] == item['id']
                and key[1] in item['packages'] and key[2] in item['versions']
                and date.fromisoformat(item['expires']) >= today
                and (not item.get('targets') or result['Target'] in item['targets'])
                and (not finding.get('FixedVersion') or item.get('unreachable_in_runtime') is True)), None)
            (reviewed if exception else failures).append(key)
    return failures, reviewed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('report', type=Path)
    parser.add_argument('--service', required=True)
    args = parser.parse_args()
    policy = json.loads((ROOT / 'deploy/vulnerability-policy.json').read_text())
    failures, reviewed = assess(json.loads(args.report.read_text(encoding='utf-8')),args.service,policy)
    print(f'{args.service}: {len(failures)} blocking, {len(reviewed)} reviewed non-reachable/backported findings; raw report retained.')
    for identifier, package, version in failures:
        print(identifier,package,version)
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
