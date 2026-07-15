export async function handler(event, context) {
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'YouTube API key not configured' }),
    };
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=5&key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch videos' }),
      };
    }

    const videos = data.items.map(item => ({
      id: item.id,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium.url,
      views: parseInt(item.statistics.viewCount).toLocaleString('ko-KR'),
      url: `https://www.youtube.com/watch?v=${item.id}`,
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600',
      },
      body: JSON.stringify(videos),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
