import fs from 'fs';
import path from 'path';
import { prisma } from './dist/db/prisma.js';

const REPO_ID = '0772767a-7fb3-42ba-8bdc-43aa9e5d2ae3';

async function verifyPostRestart() {
  console.log('=== STAGE 8 POST-RESTART PERSISTENCE VERIFICATION ===\n');

  // 1. Health check
  console.log('1. Checking backend health after fresh server boot...');
  const healthRes = await fetch('http://localhost:5000/api/health');
  if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
  const healthData = await healthRes.json();
  console.log(`   ✓ Server online, Database status: ${healthData.database}`);
  if (healthData.database !== 'connected') throw new Error('Database is not connected after restart!');

  // 2. Retrieve repository from cold cache (must load from PostgreSQL)
  console.log(`\n2. Requesting repository ${REPO_ID} from cold cache via GET /api/repos/:repoId...`);
  const repoRes = await fetch(`http://localhost:5000/api/repos/${REPO_ID}`);
  if (!repoRes.ok) throw new Error(`Failed to retrieve repo after restart: ${repoRes.status}`);
  const repoData = await repoRes.json();
  console.log(`   ✓ Successfully retrieved from PostgreSQL:`);
  console.log(`     • Name: ${repoData.repoName}`);
  console.log(`     • Total files: ${repoData.totalFiles}`);
  console.log(`     • FileTree root: ${repoData.fileTree.name}`);

  // 3. Retrieve analysis history from cold cache (must load from PostgreSQL)
  console.log(`\n3. Requesting analysis history from cold cache via GET /api/repos/:repoId/analyses...`);
  const historyRes = await fetch(`http://localhost:5000/api/repos/${REPO_ID}/analyses`);
  if (!historyRes.ok) throw new Error(`Failed to retrieve analysis history after restart: ${historyRes.status}`);
  const historyList = await historyRes.json();
  console.log(`   ✓ Retrieved ${historyList.length} analysis history record(s) from PostgreSQL:`);
  if (historyList.length === 0) throw new Error('Analysis history lost across restart!');
  const record = historyList[0];
  console.log(`     • Target file: ${record.targetFile}`);
  console.log(`     • Risk score: ${record.riskScore}/100 (${record.riskLevel})`);
  console.log(`     • Total affected files: ${record.totalAffectedFiles}`);
  console.log(`     • Timestamp: ${record.analyzedAt}`);

  // 4. Delete repository and verify CASCADE cleanup in DB and disk
  console.log(`\n4. Deleting repository via DELETE /api/repos/:repoId...`);
  const deleteRes = await fetch(`http://localhost:5000/api/repos/${REPO_ID}`, { method: 'DELETE' });
  if (!deleteRes.ok) throw new Error(`DELETE failed: ${deleteRes.status}`);
  console.log(`   ✓ DELETE API returned success`);

  // 5. Verify direct PostgreSQL state
  console.log(`\n5. Directly querying PostgreSQL to confirm complete cleanup...`);
  const dbRepo = await prisma.repository.findUnique({ where: { id: REPO_ID } });
  const dbAnalyses = await prisma.analysisHistory.findMany({ where: { repoId: REPO_ID } });

  if (dbRepo !== null) throw new Error('Repository row remains in PostgreSQL after deletion!');
  if (dbAnalyses.length > 0) throw new Error('Analysis rows remain in PostgreSQL after deletion!');
  console.log(`   ✓ PostgreSQL "repositories": 0 rows (cleaned up)`);
  console.log(`   ✓ PostgreSQL "analysis_history": 0 rows (CASCADE cleaned up)`);

  // 6. Verify disk directory
  const diskPath = path.resolve('uploads', 'extracted', REPO_ID);
  if (fs.existsSync(diskPath)) throw new Error(`Disk directory still exists at ${diskPath}`);
  console.log(`   ✓ Disk directory ${diskPath} was completely removed`);

  console.log('\n========================================================================');
  console.log('🎉 PERSISTENCE ACROSS RESTART AND CASCADE CLEANUP 100% VERIFIED! 🎉');
  console.log('========================================================================');

  await prisma.$disconnect();
}

verifyPostRestart().catch(async (e) => {
  console.error('\n❌ POST-RESTART VERIFICATION FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
