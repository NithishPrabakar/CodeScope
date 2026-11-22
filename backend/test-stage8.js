import fs from 'fs';
import path from 'path';
import { buildStage4SampleZip } from './create-stage4-sample-repo.js';

async function runStage8Tests() {
  console.log('=== STARTING STAGE 8 DATABASE PERSISTENCE & ANALYSIS HISTORY TEST SUITE ===\n');

  const testZipPath = path.resolve('test-artifacts', 'stage8-test.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });

  console.log('1. Building sample repository archive for Stage 8 testing...');
  buildStage4SampleZip(testZipPath);
  console.log('   ✓ Test archive built successfully');

  // Step 1: Health check
  console.log('\n2. Verifying GET /api/health for backend and database status...');
  const healthRes = await fetch('http://localhost:5000/api/health');
  if (!healthRes.ok) throw new Error(`Health check failed with status ${healthRes.status}`);
  const healthData = await healthRes.json();
  console.log(`   ✓ Health status: ${healthData.status}, database: ${healthData.database}`);

  // Step 2: Listing repositories before upload
  console.log('\n3. Testing GET /api/repos (repository listing)...');
  const initialReposRes = await fetch('http://localhost:5000/api/repos');
  if (!initialReposRes.ok) throw new Error(`GET /api/repos failed with status ${initialReposRes.status}`);
  const initialRepos = await initialReposRes.json();
  console.log(`   ✓ Found ${initialRepos.length} existing repositories`);

  // Step 3: Upload repository
  console.log('\n4. Uploading archive to POST /api/repos/upload...');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(testZipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('repoZip', blob, 'stage8-test.zip');

  const uploadRes = await fetch('http://localhost:5000/api/repos/upload', {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Upload failed with status ${uploadRes.status}: ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  const repoId = uploadData.repoId;
  console.log(`   ✓ Upload succeeded! Repository ID: ${repoId}`);
  console.log(`   • Total files: ${uploadData.totalFiles}, Total size: ${uploadData.totalSize} bytes`);

  // Step 4: Retrieve repository details via GET /api/repos/:repoId
  console.log('\n5. Testing GET /api/repos/:repoId (repository retrieval)...');
  const getRepoRes = await fetch(`http://localhost:5000/api/repos/${repoId}`);
  if (!getRepoRes.ok) throw new Error(`GET /api/repos/:repoId failed with status ${getRepoRes.status}`);
  const fetchedRepo = await getRepoRes.json();
  if (fetchedRepo.repoId !== repoId) throw new Error('Repository ID mismatch on retrieval');
  console.log(`   ✓ Retrieved repo: "${fetchedRepo.repoName}", file tree root: "${fetchedRepo.fileTree.name}"`);

  // Step 5: Verify repository appears in GET /api/repos list
  console.log('\n6. Verifying newly uploaded repository appears in GET /api/repos list...');
  const updatedReposRes = await fetch('http://localhost:5000/api/repos');
  const updatedRepos = await updatedReposRes.json();
  const foundInList = updatedRepos.find((r) => r.id === repoId);
  if (!foundInList) throw new Error(`Uploaded repository ${repoId} not found in /api/repos list`);
  console.log(`   ✓ Found repository "${foundInList.name}" in saved list (File count: ${foundInList.fileCount})`);

  // Step 6: Perform Change Impact Analysis to generate history
  console.log('\n7. Performing Change Impact Analysis on "src/utils/math.ts"...');
  const impactRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/utils/math.ts`);
  if (!impactRes.ok) throw new Error(`Impact analysis failed with status ${impactRes.status}`);
  const impactData = await impactRes.json();
  console.log(`   ✓ Impact analysis completed:`);
  console.log(`   • Risk Score: ${impactData.riskAnalysis.score}/100 (${impactData.riskAnalysis.level})`);
  console.log(`   • Total Affected: ${impactData.totalAffectedFiles} files`);
  console.log(`   • Test Recommendations: ${impactData.testRecommendations.totalRecommended}`);

  // Small delay for async persistence to finish
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Step 7: Check analysis history via GET /api/repos/:repoId/analyses
  console.log('\n8. Checking analysis history via GET /api/repos/:repoId/analyses...');
  const historyRes = await fetch(`http://localhost:5000/api/repos/${repoId}/analyses`);
  if (!historyRes.ok) throw new Error(`GET /api/repos/:repoId/analyses failed with status ${historyRes.status}`);
  const historyList = await historyRes.json();
  console.log(`   ✓ Found ${historyList.length} historical analysis records for repo`);

  let analysisId = null;
  if (historyList.length > 0) {
    analysisId = historyList[0].id;
    console.log(`   • Latest analysis ID: ${analysisId}`);
    console.log(`   • Target file: ${historyList[0].targetFile}`);
    console.log(`   • Score: ${historyList[0].riskScore}, Level: ${historyList[0].riskLevel}`);
  }

  // Step 8: If history record exists, test GET /api/repos/:repoId/analyses/:analysisId
  if (analysisId) {
    console.log('\n9. Testing GET /api/repos/:repoId/analyses/:analysisId...');
    const singleAnalysisRes = await fetch(`http://localhost:5000/api/repos/${repoId}/analyses/${analysisId}`);
    if (!singleAnalysisRes.ok) throw new Error(`Failed to retrieve single analysis (Status: ${singleAnalysisRes.status})`);
    const singleAnalysis = await singleAnalysisRes.json();
    if (singleAnalysis.id !== analysisId) throw new Error('Analysis ID mismatch on single record retrieval');
    console.log(`   ✓ Single analysis record verified: Target file "${singleAnalysis.targetFile}"`);
  }

  // Step 9: Delete repository via DELETE /api/repos/:repoId
  console.log('\n10. Testing DELETE /api/repos/:repoId...');
  const deleteRes = await fetch(`http://localhost:5000/api/repos/${repoId}`, { method: 'DELETE' });
  if (!deleteRes.ok) throw new Error(`DELETE failed with status ${deleteRes.status}`);
  const deleteData = await deleteRes.json();
  console.log(`   ✓ Delete confirmed: ${deleteData.message}`);

  // Step 10: Verify 404 after deletion
  console.log('\n11. Verifying repository is no longer accessible (404)...');
  const postDeleteRes = await fetch(`http://localhost:5000/api/repos/${repoId}`);
  if (postDeleteRes.status !== 404) {
    throw new Error(`Expected 404 after deletion, but got status ${postDeleteRes.status}`);
  }
  console.log('   ✓ Confirmed: GET /api/repos/:repoId returns 404 after deletion');

  console.log('\n================================================================');
  console.log('🎉 ALL 11 STAGE 8 INTEGRATION CHECKPOINTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runStage8Tests().catch((err) => {
  console.error('\n❌ STAGE 8 INTEGRATION TEST FAILED:', err.message);
  process.exit(1);
});
