import fs from 'fs';
import path from 'path';
import { buildStage4SampleZip } from './create-stage4-sample-repo.js';
import { prisma } from './dist/db/prisma.js';

async function runRestartAudit() {
  console.log('=== STAGE 8 SERVER RESTART PERSISTENCE AUDIT ===\n');

  const testZipPath = path.resolve('test-artifacts', 'restart-audit.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });
  buildStage4SampleZip(testZipPath);

  // 1. Upload
  console.log('1. Uploading repository before restart...');
  const formData = new FormData();
  formData.append('repoZip', new Blob([fs.readFileSync(testZipPath)], { type: 'application/zip' }), 'restart-audit.zip');

  const uploadRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: formData,
  });
  if (!uploadRes.ok) throw new Error('Upload failed');
  const uploadData = await uploadRes.json();
  const repoId = uploadData.repoId;
  console.log(`   ✓ Uploaded. Repo ID: ${repoId}`);

  // 2. Perform impact analysis
  console.log('\n2. Running impact analysis on "src/utils/math.ts"...');
  const impactRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/utils/math.ts`);
  if (!impactRes.ok) throw new Error('Impact analysis failed');
  const impactData = await impactRes.json();
  console.log(`   ✓ Analysis done. Score: ${impactData.riskAnalysis.score}/100`);

  await new Promise((r) => setTimeout(r, 400));

  // 3. Confirm in PostgreSQL before restart
  const dbRepoBefore = await prisma.repository.findUnique({ where: { id: repoId } });
  const dbAnalysesBefore = await prisma.analysisHistory.findMany({ where: { repoId } });
  console.log(`\n3. Pre-restart PostgreSQL state: 1 repository, ${dbAnalysesBefore.length} analysis history record(s)`);
  if (!dbRepoBefore || dbAnalysesBefore.length === 0) throw new Error('Pre-restart DB state incomplete');

  console.log('\n4. Backend restart will now be performed by the orchestrator...');
  console.log(`   TARGET REPO ID FOR POST-RESTART VERIFICATION: ${repoId}`);

  await prisma.$disconnect();
  return repoId;
}

runRestartAudit().catch(async (e) => {
  console.error('Error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
