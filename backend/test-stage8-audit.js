import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { buildStage4SampleZip } from './create-stage4-sample-repo.js';
import { prisma } from './dist/db/prisma.js';

async function runAudit() {
  console.log('=== STAGE 8 FINAL DATABASE PERSISTENCE AUDIT ===\n');

  // Step 1: Upload a repository
  const testZipPath = path.resolve('test-artifacts', 'audit-repo.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });
  buildStage4SampleZip(testZipPath);

  console.log('1. Uploading repository to POST /api/repos/upload...');
  const formData = new FormData();
  formData.append('repoZip', new Blob([fs.readFileSync(testZipPath)], { type: 'application/zip' }), 'audit-repo.zip');

  const uploadRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  const repoId = uploadData.repoId;
  console.log(`   ✓ Uploaded successfully. Repo ID: ${repoId}`);

  // Step 2: Confirm record exists in real PostgreSQL database directly via Prisma
  console.log('\n2. Directly querying PostgreSQL table "repositories"...');
  await new Promise((r) => setTimeout(r, 400));
  const repoRow = await prisma.repository.findUnique({
    where: { id: repoId },
  });

  if (!repoRow) throw new Error(`Record for repo ${repoId} NOT found in PostgreSQL 'repositories' table!`);
  console.log(`   ✓ Confirmed in PostgreSQL 'repositories' table:`);
  console.log(`     • ID: ${repoRow.id}`);
  console.log(`     • Name: ${repoRow.name}`);
  console.log(`     • File count: ${repoRow.fileCount}`);
  console.log(`     • Total size: ${repoRow.totalSize} bytes`);
  console.log(`     • Created at: ${repoRow.createdAt.toISOString()}`);

  // Step 3: Run impact analysis
  console.log('\n3. Performing Change Impact Analysis on "src/utils/math.ts"...');
  const impactRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/utils/math.ts`);
  if (!impactRes.ok) throw new Error(`Impact analysis failed: ${impactRes.status}`);
  const impactData = await impactRes.json();
  console.log(`   ✓ Impact analysis computed. Risk Score: ${impactData.riskAnalysis.score}/100 (${impactData.riskAnalysis.level})`);

  // Step 4: Confirm analysis record exists in real PostgreSQL database directly
  console.log('\n4. Directly querying PostgreSQL table "analysis_history"...');
  await new Promise((r) => setTimeout(r, 400));
  const analysisRows = await prisma.analysisHistory.findMany({
    where: { repoId },
  });

  if (analysisRows.length === 0) throw new Error(`Analysis record NOT found in PostgreSQL 'analysis_history' table!`);
  const analysisRow = analysisRows[0];
  console.log(`   ✓ Confirmed in PostgreSQL 'analysis_history' table:`);
  console.log(`     • Analysis ID: ${analysisRow.id}`);
  console.log(`     • Target file: ${analysisRow.targetFile}`);
  console.log(`     • Risk score: ${analysisRow.riskScore}`);
  console.log(`     • Risk level: ${analysisRow.riskLevel}`);
  console.log(`     • Direct affected count: ${analysisRow.directImpactCount}`);
  console.log(`     • Total affected count: ${analysisRow.totalAffectedFiles}`);

  // Step 5 & 6: Reopen and verify persistence
  console.log('\n5. Testing retrieval of persisted data via REST API...');
  const getRepoRes = await fetch(`http://localhost:5000/api/repos/${repoId}`);
  if (!getRepoRes.ok) throw new Error(`Failed to retrieve repo via API: ${getRepoRes.status}`);
  const retrievedRepo = await getRepoRes.json();
  console.log(`   ✓ API retrieved persisted repository: "${retrievedRepo.repoName}" (${retrievedRepo.totalFiles} files)`);

  const getHistoryRes = await fetch(`http://localhost:5000/api/repos/${repoId}/analyses`);
  if (!getHistoryRes.ok) throw new Error(`Failed to retrieve analysis history via API: ${getHistoryRes.status}`);
  const retrievedHistory = await getHistoryRes.json();
  if (retrievedHistory.length === 0) throw new Error('Analysis history returned empty from API!');
  console.log(`   ✓ API retrieved ${retrievedHistory.length} historical analysis records from PostgreSQL`);

  // Step 7: Delete repository through CodeScope
  console.log('\n6. Deleting repository via DELETE /api/repos/:repoId...');
  const deleteRes = await fetch(`http://localhost:5000/api/repos/${repoId}`, { method: 'DELETE' });
  if (!deleteRes.ok) throw new Error(`DELETE failed: ${deleteRes.status}`);
  console.log('   ✓ DELETE endpoint confirmed success');

  // Step 8: Verify database records are cleaned up in PostgreSQL
  console.log('\n7. Verifying CASCADE deletion in PostgreSQL database...');
  const repoAfterDelete = await prisma.repository.findUnique({ where: { id: repoId } });
  const analysesAfterDelete = await prisma.analysisHistory.findMany({ where: { repoId } });

  if (repoRow !== null && repoAfterDelete !== null) {
    throw new Error('Repository row still exists in PostgreSQL after deletion!');
  }
  if (analysesAfterDelete.length > 0) {
    throw new Error('AnalysisHistory rows still exist in PostgreSQL after repository deletion!');
  }
  console.log('   ✓ PostgreSQL "repositories" row deleted');
  console.log('   ✓ PostgreSQL "analysis_history" rows CASCADE deleted (0 remaining)');

  // Step 9: Verify disk files cleaned up
  console.log('\n8. Verifying extracted directory cleaned up from disk...');
  const diskPath = path.resolve('uploads', 'extracted', repoId);
  const existsOnDisk = fs.existsSync(diskPath);
  if (existsOnDisk) {
    throw new Error(`Directory ${diskPath} still exists on disk!`);
  }
  console.log(`   ✓ Disk path ${diskPath} was completely removed`);

  console.log('\n===============================================================');
  console.log('🎉 GENUINE POSTGRESQL DATABASE PERSISTENCE FULLY VERIFIED! 🎉');
  console.log('===============================================================');

  await prisma.$disconnect();
}

runAudit().catch(async (err) => {
  console.error('\n❌ AUDIT FAILED:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
