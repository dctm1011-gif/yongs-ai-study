#!/usr/bin/env python3
import requests
import os
import re
from datetime import datetime, timedelta

API_KEY = os.environ.get('YOUTUBE_API_KEY')
if not API_KEY:
    print('Error: YOUTUBE_API_KEY not set')
    exit(1)

# 어제부터 오늘까지 한국 한국어 급상승 인기 영상
yesterday = (datetime.now() - timedelta(days=1)).isoformat() + 'Z'

# 검색 API
search_url = 'https://www.googleapis.com/youtube/v3/search'
search_params = {
    'part': 'snippet',
    'maxResults': '10',
    'order': 'viewCount',
    'publishedAfter': yesterday,
    'regionCode': 'KR',
    'relevanceLanguage': 'ko',
    'type': 'video',
    'key': API_KEY
}

try:
    response = requests.get(search_url, params=search_params)
    data = response.json()

    if 'items' not in data or len(data['items']) == 0:
        print('No videos found')
        exit(1)

    # 비디오 ID 추출 (최대 3개)
    video_ids = ','.join([item['id']['videoId'] for item in data['items'][:3]])

    # 상세 정보 API
    details_url = 'https://www.googleapis.com/youtube/v3/videos'
    details_params = {
        'part': 'snippet,statistics',
        'id': video_ids,
        'key': API_KEY
    }

    details_response = requests.get(details_url, params=details_params)
    details_data = details_response.json()

    # 영상 정보 추출
    videos = []
    for item in details_data['items']:
        videos.append({
            'id': item['id'],
            'title': item['snippet']['title'],
            'channel': item['snippet']['channelTitle'],
            'thumbnail': item['snippet']['thumbnails']['medium']['url'],
            'views': f"{int(item['statistics']['viewCount']):,}",
            'url': f"https://www.youtube.com/watch?v={item['id']}"
        })

    # play.tsx 읽기
    with open('src/app/play.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # TRENDING_VIDEOS 생성
    videos_code_lines = ["const TRENDING_VIDEOS = ["]
    for v in videos:
        title_escaped = v['title'].replace("'", "\\'")
        channel_escaped = v['channel'].replace("'", "\\'")
        videos_code_lines.append("  {")
        videos_code_lines.append(f"    id: '{v['id']}',")
        videos_code_lines.append(f"    title: '{title_escaped}',")
        videos_code_lines.append(f"    channel: '{channel_escaped}',")
        videos_code_lines.append(f"    thumbnail: '{v['thumbnail']}',")
        videos_code_lines.append(f"    views: '{v['views']}',")
        videos_code_lines.append(f"    url: '{v['url']}',")
        videos_code_lines.append("  },")
    videos_code_lines.append("];")

    videos_code = '\n'.join(videos_code_lines)

    # 정규표현식으로 TRENDING_VIDEOS 부분 교체
    content = re.sub(
        r'const TRENDING_VIDEOS = \[[\s\S]*?\];',
        videos_code,
        content
    )

    # play.tsx 저장
    with open('src/app/play.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

    print('✅ play.tsx updated with trending videos')
    for i, v in enumerate(videos, 1):
        print(f"  {i}. {v['title']} ({v['channel']})")

except Exception as e:
    print(f'Error: {e}')
    exit(1)
