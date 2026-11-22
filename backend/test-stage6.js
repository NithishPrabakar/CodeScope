import fs from 'fs';
import path from 'path';
import { buildStage4SampleZip } from './create-stage4-sample-repo.js';

async function runStage6Tests() {
  console.log('=== STARTING STAGE 6 CHANGE RISK & TEST RECOMMENDATION TEST SUITE ===\n');

  const testZipPath = path.resolve('test-artifacts', 'stage6-test.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });

  console.log('1. Building sample repository archive for Stage 6 testing...');
  buildStage4SampleZip(testZipPath);
  console.log('   ✓ Test archive built successfully');

  // Upload to API
  console.log('\n2. Uploading archive to POST /api/repos/upload on port 5000...');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(testZipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('repoZip', blob, 'stage6-test.zip');

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
  console.log(`   ✓ Upload succeeded! Repo ID: ${repoId}`);

  // Fetch impact analysis with Stage 6 Risk & Recommendations
  console.log('\n3. Fetching impact, risk, and test recommendations for "src/utils/math.ts"...');
  const impactRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/utils/math.ts`);
  if (!impactRes.ok) throw new Error(`Impact API failed: ${impactRes.status}`);
  const impactData = await impactRes.json();

  console.log(`   ✓ API returned impact response successfully!`);

  // Verify Stage 6 Risk Analysis
  console.log('\n4. Verifying Stage 6 Risk Analysis payload & mathematical integrity...');
  const risk = impactData.riskAnalysis;
  if (!risk) throw new Error('Missing riskAnalysis in impact API response');

  console.log(`   Score: ${risk.score}/100, Level: ${risk.level.toUpperCase()}`);
  console.log(`   Summary: "${risk.summary}"`);

  // Factor breakdown checks
  let factorSum = 0;
  for (const factor of risk.factors) {
    console.log(`   • ${factor.name}: ${factor.points} / ${factor.maxPoints} pts (${factor.description})`);
    factorSum += factor.points;
  }

  if (factorSum !== risk.score) {
    throw new Error(`Mathematical contradiction: factor sum (${factorSum}) !== risk score (${risk.score})`);
  }
  console.log(`   ✓ Mathematical Guarantee verified: Factor sum (${factorSum}) === Risk score (${risk.score})`);

  if (!risk.summary.includes(`(${risk.score}/100)`)) {
    throw new Error(`Summary does not match score: ${risk.summary}`);
  }
  console.log(`   ✓ Summary contains exact risk score: ${risk.score}/100`);

  // Verify Stage 6 Test Recommendations
  console.log('\n5. Verifying Stage 6 Prioritized Test Recommendations...');
  const testRecs = impactData.testRecommendations;
  if (!testRecs) throw new Error('Missing testRecommendations in impact API response');

  console.log(`   Total recommended files: ${testRecs.totalRecommended}`);
  console.log(`   Detected existing test suites: ${testRecs.existingTestsCount}`);
  console.log(`   Missing test suites: ${testRecs.missingTestsCount}`);

  if (testRecs.recommendations.length === 0) {
    throw new Error('Test recommendations list is empty');
  }

  // Priority check: Origin must be #1 with critical priority
  const originRec = testRecs.recommendations[0];
  if (originRec.targetFile !== 'src/utils/math.ts' || originRec.priority !== 'critical') {
    throw new Error(`Origin file recommendation mismatch: ${JSON.stringify(originRec)}`);
  }
  console.log(`   ✓ Priority #1 correctly assigned to modified file (src/utils/math.ts, CRITICAL)`);

  for (const rec of testRecs.recommendations) {
    const statusStr = rec.hasExistingTest ? `✓ Found (${rec.existingTestFile})` : `⚠ Missing`;
    console.log(`   [Priority: ${rec.priority.padEnd(8)}] ${rec.targetFile.padEnd(30)} -> ${statusStr}`);
    if (rec.hasExistingTest && !rec.existingTestFile) {
      throw new Error(`False claim: hasExistingTest is true but existingTestFile is undefined for ${rec.targetFile}`);
    }
  }
  console.log('   ✓ Test file detection confirmed: No false claims, all paths resolved');

  // Edge case test: Zero dependents
  console.log('\n6. Verifying Edge Case: Isolated file with zero dependents (src/index.ts)...');
  const leafRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/index.ts`);
  if (!leafRes.ok) throw new Error(`Leaf impact API failed: ${leafRes.status}`);
  const leafData = await leafRes.json();

  if (leafData.totalAffectedFiles !== 0) {
    throw new Error(`Expected src/index.ts to have 0 affected files, got ${leafData.totalAffectedFiles}`);
  }

  const leafRisk = leafData.riskAnalysis;
  const leafFactorSum = leafRisk.factors.reduce((s, f) => s + f.points, 0);
  if (leafRisk.score !== 0 || leafFactorSum !== 0 || leafRisk.level !== 'low') {
    throw new Error(`Leaf risk calculation failed: score=${leafRisk.score}, sum=${leafFactorSum}`);
  }
  console.log(`   ✓ Leaf file handled cleanly: Score 0/100 (LOW), Factor sum = 0`);

  // Cleanup
  try {
    fs.rmSync(path.dirname(testZipPath), { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('🎉 ALL STAGE 6 SPECIFICATION REQUIREMENTS VERIFIED & PASSED! 🎉');
  console.log('===============================================================');
}

runStage6Tests().catch((err) => {
  console.error('\n❌ Stage 6 Test Suite Failed:', err);
  process.exit(1);
});
