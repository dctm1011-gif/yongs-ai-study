export default async (req, context) => {
  const timestamp = new Date().toISOString();
  const value = Math.floor(Math.random() * 10000); // 0-9999 랜덤
  const randomData = {
    temperature: (Math.random() * 50).toFixed(2), // 0-50도
    cpu: (Math.random() * 100).toFixed(2), // 0-100%
    memory: (Math.random() * 100).toFixed(2), // 0-100%
  };

  return new Response(
    JSON.stringify({
      timestamp,
      value,
      randomData,
      apiVersion: 'v1',
      message: 'Monitoring data updated',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
};
