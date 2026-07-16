import { createLogger, createResponse } from './_utils.mjs';

const log = createLogger('trending-videos');

export async function handler(event, context) {
  log.log('Fetching trending videos', { region: 'KR' });

  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) {
    log.error('YouTube API key not configured');
    return createResponse(500, 'YouTube API key not configured');
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=5&key=${API_KEY}`;

  try {
    log.debug('Calling YouTube API', { url: url.replace(API_KEY, '***') });
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    log.debug('API response received', { itemCount: data.items?.length || 0 });

    if (!data.items || data.items.length === 0) {
      log.error('No videos found in API response');
      return createResponse(500, 'No videos found');
    }

    const videos = data.items.map(item => ({
      id: item.id,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || '',
      views: parseInt(item.statistics.viewCount).toLocaleString('ko-KR'),
      url: `https://www.youtube.com/watch?v=${item.id}`,
    }));

    log.log('Successfully fetched trending videos', { count: videos.length });

    return createResponse(200, videos, {
      'Cache-Control': 'max-age=3600',
    });
  } catch (error) {
    log.error('Failed to fetch videos', { message: error.message, stack: error.stack });
    return createResponse(500, `Failed to fetch videos: ${error.message}`);
  }
}
