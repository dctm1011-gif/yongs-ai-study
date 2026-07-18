import { createLogger, createResponse, corsHeaders } from './_utils.mjs';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('get-progress');

export async function handler(event, context) {
  log.log('Fetching progress data');

  try {
    // Read progress.json from netlify/data directory
    const LAMBDA_ROOT = process.env.LAMBDA_TASK_ROOT;
    if (!LAMBDA_ROOT) {
      log.debug('LAMBDA_TASK_ROOT not set, using default path');
    }
    const progressFile = path.join(LAMBDA_ROOT || '.', 'netlify/data/progress.json');

    let progressData;

    // Try to read from file system (for local testing)
    try {
      const data = fs.readFileSync(progressFile, 'utf8');
      progressData = JSON.parse(data);
      log.log('Loaded progress from file', { phases: progressData.phases.length });
    } catch (fileError) {
      log.debug('File read failed, using default data', { error: fileError.message });
      // Fallback to default data
      progressData = {
        phases: [
          { id: 'A', name: 'Play + Progress + Sync', progress: 85, status: 'in-progress' },
          { id: 'B', name: 'Error Logging + Monitoring', progress: 0, status: 'pending' },
          { id: 'C', name: 'Performance < 500ms', progress: 0, status: 'pending' },
          { id: 'D', name: 'Investment Tab', progress: 0, status: 'pending' },
          { id: 'E', name: 'Data Sync Monitoring', progress: 0, status: 'pending' },
          { id: 'F', name: 'Security & Review', progress: 0, status: 'pending' },
        ],
        lastSync: new Date().toISOString(),
        buildTime: new Date().toISOString(),
      };
    }

    return createResponse(200, progressData, corsHeaders());
  } catch (error) {
    log.error('Failed to get progress', { message: error.message, stack: error.stack });
    return createResponse(500, `Failed to get progress: ${error.message}`, corsHeaders());
  }
}
