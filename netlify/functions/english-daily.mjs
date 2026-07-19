import { readFileSync } from 'fs';
import { resolve } from 'path';

export const config = {
  schedule: '0 21 * * *',
};

export default async (req, context) => {
  try {
    // Read the daily.json file
    const dailyPath = resolve(process.cwd(), 'english', 'daily.json');
    const dailyData = JSON.parse(readFileSync(dailyPath, 'utf-8'));

    return new Response(JSON.stringify(dailyData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error('Error reading daily English data:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to load daily English content',
        date: new Date().toISOString().split('T')[0],
        words: [],
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
