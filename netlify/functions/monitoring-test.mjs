function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export default async (req, context) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

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
        ...corsHeaders(),
      },
    }
  );
};
