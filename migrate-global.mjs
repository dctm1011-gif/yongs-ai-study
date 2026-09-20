import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const DB_URL = env.EXPO_PUBLIC_FIREBASE_DATABASE_URL;
const DB_SECRET = env.FIREBASE_DATABASE_SECRET;

async function fetchJSON(path) {
  const url = `${DB_URL}${path}.json?auth=${DB_SECRET}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function putJSON(path, data) {
  const url = `${DB_URL}${path}.json?auth=${DB_SECRET}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function deleteJSON(path) {
  const url = `${DB_URL}${path}.json?auth=${DB_SECRET}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.ok;
}

async function migrateToGlobal() {
  console.log('🔄 모든 사용자 데이터를 글로벌 경로로 마이그레이션 시작...\n');

  try {
    // 모든 uid 가져오기
    const users = await fetchJSON('/users');
    if (!users) {
      console.log('⚠️ users 데이터 없음');
      process.exit(0);
    }

    const userIds = Object.keys(users);
    console.log(`👥 ${userIds.length}명의 데이터를 글로벌로 통합 중...\n`);

    // 모든 uid의 데이터를 첫 번째 uid의 데이터로 통합 (나중 uid가 덮어씀)
    let totalMoved = 0;

    for (const uid of userIds) {
      const userData = users[uid];
      if (!userData) continue;

      console.log(`⏳ ${uid}의 데이터 이동...`);

      // uid 아래의 모든 경로를 글로벌로 옮기기
      for (const [key, value] of Object.entries(userData)) {
        if (value === null || value === undefined) continue;

        // 이미 글로벌인 경로들은 건너뛰기
        const skipPaths = ['wrongPool']; // wrongPool은 특수한 경로

        if (skipPaths.includes(key)) {
          console.log(`  ⏭️ ${key} (스킵)`);
          continue;
        }

        // 글로벌로 이동
        await putJSON(`/${key}`, value);
        console.log(`  ✅ ${key}`);
        totalMoved++;
      }
    }

    console.log(`\n✨ 총 ${totalMoved}개 경로가 글로벌로 통합되었습니다!`);
    console.log('\n📝 다음 단계: users 폴더는 필요시 나중에 삭제해주세요.');

    process.exit(0);
  } catch (error) {
    console.error('❌ 마이그레이션 중 오류:', error.message);
    process.exit(1);
  }
}

migrateToGlobal();
