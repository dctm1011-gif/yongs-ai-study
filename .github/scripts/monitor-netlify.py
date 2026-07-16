#!/usr/bin/env python3
"""
Netlify Functions Daily Monitoring
매일 실행: Functions 상태 체크 + 리포트 생성
"""

import requests
import json
import sys
from datetime import datetime
from pathlib import Path

NETLIFY_BASE = 'https://illustrious-cuchufli-7c4e58.netlify.app'
REPORT_FILE = 'netlify-monitoring-report.json'

ENDPOINTS = [
    {'name': 'Health Check', 'url': '/.netlify/functions/test', 'method': 'GET'},
    {'name': 'Trending Videos', 'url': '/.netlify/functions/trending-videos', 'method': 'GET'},
    {'name': 'TOEFL Prefs', 'url': '/api/toefl_prefs', 'method': 'GET'},
    {'name': 'English Prefs', 'url': '/api/english_prefs', 'method': 'GET'},
]

def test_endpoint(endpoint):
    """엔드포인트 테스트"""
    try:
        url = NETLIFY_BASE + endpoint['url']
        response = requests.request(
            endpoint['method'],
            url,
            timeout=10,
            headers={'User-Agent': 'Netlify-Monitor'}
        )

        return {
            'name': endpoint['name'],
            'url': endpoint['url'],
            'status': response.status_code,
            'success': 200 <= response.status_code < 300,
            'responseTime': response.elapsed.total_seconds(),
            'timestamp': datetime.utcnow().isoformat(),
        }
    except requests.Timeout:
        return {
            'name': endpoint['name'],
            'url': endpoint['url'],
            'status': 'TIMEOUT',
            'success': False,
            'error': 'Request timeout after 10s',
            'timestamp': datetime.utcnow().isoformat(),
        }
    except Exception as error:
        return {
            'name': endpoint['name'],
            'url': endpoint['url'],
            'status': 'ERROR',
            'success': False,
            'error': str(error),
            'timestamp': datetime.utcnow().isoformat(),
        }

def load_history():
    """이전 리포트 로드"""
    report_path = Path(REPORT_FILE)
    if report_path.exists():
        try:
            with open(report_path, 'r') as f:
                return json.load(f)
        except:
            return {'tests': []}
    return {'tests': []}

def save_report(results):
    """리포트 저장"""
    history = load_history()
    history['tests'].append({
        'timestamp': datetime.utcnow().isoformat(),
        'results': results,
    })

    # 최근 30일만 유지
    if len(history['tests']) > 30 * 24:
        history['tests'] = history['tests'][-30*24:]

    with open(REPORT_FILE, 'w') as f:
        json.dump(history, f, indent=2)

def print_report(results):
    """리포트 출력"""
    print('\n' + '='*60)
    print('📊 Netlify Functions Daily Monitoring Report')
    print('='*60)
    print(f'Time: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print()

    for result in results:
        status_icon = '✅' if result['success'] else '❌'
        status_code = result.get('status', 'ERROR')
        response_time = result.get('responseTime', 'N/A')

        print(f'{status_icon} {result["name"]}')
        print(f'   URL: {result["url"]}')
        print(f'   Status: {status_code}')
        if isinstance(response_time, (int, float)):
            print(f'   Response Time: {response_time:.2f}s')
        if 'error' in result:
            print(f'   Error: {result["error"]}')
        print()

    passed = sum(1 for r in results if r['success'])
    total = len(results)
    print(f'Summary: {passed}/{total} endpoints working')
    print('='*60 + '\n')

    return passed == total

def main():
    """메인 실행"""
    print('🔍 Testing Netlify Functions...')
    results = [test_endpoint(ep) for ep in ENDPOINTS]

    # 리포트 저장
    save_report(results)

    # 리포트 출력
    all_passed = print_report(results)

    # 실패 시 종료 코드 1
    if not all_passed:
        print('❌ Some endpoints failed!')
        sys.exit(1)

    print('✅ All endpoints healthy!')
    sys.exit(0)

if __name__ == '__main__':
    main()
