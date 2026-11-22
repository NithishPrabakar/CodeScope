import fs from 'fs';
import path from 'path';
import { buildStage4SampleZip } from './create-stage4-sample-repo.js';

async function runStage4Tests() {
  console.log('=== STARTING STAGE 4 DEPENDENCY & IMPACT ANALYSIS TEST SUITE ===\n');

  const testZipPath = path.resolve('test-artifacts', 'stage4-test.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });

  console.log('1. Building Stage 4 Sample Repository Archive...');
  buildStage4SampleZip(testZipPath);
  console.log('   ✓ Test archive built successfully');

  // Upload to API
  console.log('\n2. Uploading Stage 4 archive to POST /api/repos/upload...');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(testZipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('repoZip', blob, 'stage4-test.zip');

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

  // TEST 1: Direct & Multi-level (Indirect) Impact on src/utils/math.ts
  console.log('\n3. Testing Direct & Multi-Level Impact Analysis on "src/utils/math.ts"...');
  const mathImpactRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/utils/math.ts`);
  if (!mathImpactRes.ok) throw new Error(`Impact API failed: ${mathImpactRes.status}`);
  const mathImpact = await mathImpactRes.json();

  console.log(`   - Changed file: ${mathImpact.changedFile}`);
  console.log(`   - Total affected files: ${mathImpact.totalAffectedFiles}`);
  console.log(`   - Direct impact (Depth 1): ${mathImpact.directImpactCount}`);
  console.log(`   - Indirect impact (Depth 2+): ${mathImpact.indirectImpactCount}`);
  console.log(`   - Max depth: ${mathImpact.maxDepth}`);

  // Verify direct impact files (depth 1)
  const directPaths = mathImpact.directImpactFiles.map((f) => f.filePath);
  console.log('   Direct affected files:', directPaths.join(', '));
  if (!directPaths.includes('src/utils/index.ts') || !directPaths.includes('src/services/calcService.ts')) {
    throw new Error('Expected src/utils/index.ts and src/services/calcService.ts in direct impact');
  }
  console.log('   ✓ Direct impact correctly identifies immediate dependents at Depth 1');

  // Verify indirect impact files (depth 2, 3, 4)
  const indirectPaths = mathImpact.indirectImpactFiles.map((f) => f.filePath);
  console.log('   Indirect affected files:', indirectPaths.join(', '));
  if (!indirectPaths.includes('src/components/Calculator.tsx') || !indirectPaths.includes('src/pages/Dashboard.tsx') || !indirectPaths.includes('src/index.ts')) {
    throw new Error('Expected Calculator.tsx, Dashboard.tsx, and index.ts in indirect impact');
  }

  // Verify deduplication
  const allAffectedPaths = mathImpact.affectedFiles.map((f) => f.filePath);
  const uniquePaths = new Set(allAffectedPaths);
  if (allAffectedPaths.length !== uniquePaths.size) {
    throw new Error('Duplicate files found in affectedFiles list!');
  }
  console.log('   ✓ Affected files list is strictly deduplicated');

  // Verify impact chain for deep node (src/index.ts)
  const indexImpact = mathImpact.affectedFiles.find((f) => f.filePath === 'src/index.ts');
  console.log(`   ✓ Impact chain for src/index.ts (Depth ${indexImpact.depth}): ${indexImpact.impactPath.join(' ➔ ')}`);
  if (indexImpact.depth < 3) {
    throw new Error(`Expected src/index.ts to be at depth >= 3, got ${indexImpact.depth}`);
  }

  // TEST 2: Unrelated / Leaf File (0 Impact)
  console.log('\n4. Testing Unrelated / Leaf File Impact Analysis on "src/index.ts"...');
  const indexImpactRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/index.ts`);
  const indexData = await indexImpactRes.json();
  console.log(`   - Total affected files: ${indexData.totalAffectedFiles}`);
  if (indexData.totalAffectedFiles !== 0) {
    throw new Error(`Expected 0 affected files for leaf src/index.ts, got ${indexData.totalAffectedFiles}`);
  }
  console.log('   ✓ Leaf file correctly reported with 0 downstream dependents');

  // TEST 3: Circular Dependency Detection
  console.log('\n5. Testing Circular Dependency Handling on "src/circular/moduleA.ts"...');
  const circRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/circular/moduleA.ts`);
  const circData = await circRes.json();
  console.log(`   - Traversal completed without infinite loop! Total affected: ${circData.totalAffectedFiles}`);
  console.log(`   - Has cycle in path: ${circData.hasCycleInPath}`);
  console.log(`   - Detected cycles count: ${circData.circularDependencies.length}`);
  if (circData.circularDependencies.length > 0) {
    console.log(`     Cycle: ${circData.circularDependencies[0].cycle.join(' ➔ ')}`);
  }
  if (!circData.hasCycleInPath) {
    throw new Error('Expected hasCycleInPath to be true for circular module');
  }
  const circDirect = circData.directImpactFiles.map((f) => f.filePath);
  if (!circDirect.includes('src/circular/moduleB.ts')) {
    throw new Error('Expected moduleB.ts to be directly impacted by moduleA.ts');
  }
  console.log('   ✓ Circular dependencies handled safely without infinite traversal');

  // TEST 4: Non-Import Dependency Impact (Filesystem, Template, CSS, Asset)
  console.log('\n6. Testing Non-Import Local Dependencies Impact...');

  // Filesystem: config/settings.json -> src/server.ts
  const fsRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=config/settings.json`);
  const fsData = await fsRes.json();
  const fsDirect = fsData.directImpactFiles.map((f) => f.filePath);
  if (!fsDirect.includes('src/server.ts')) throw new Error('Expected config/settings.json to impact src/server.ts via filesystem');
  console.log('   ✓ Changing config/settings.json impacts src/server.ts (via filesystem)');

  // Template: views/welcome.ejs -> src/server.ts
  const tplRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=views/welcome.ejs`);
  const tplData = await tplRes.json();
  const tplDirect = tplData.directImpactFiles.map((f) => f.filePath);
  if (!tplDirect.includes('src/server.ts')) throw new Error('Expected views/welcome.ejs to impact src/server.ts via template');
  console.log('   ✓ Changing views/welcome.ejs impacts src/server.ts (via template render)');

  // CSS Import: src/styles/variables.css -> src/styles/app.css
  const cssRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/styles/variables.css`);
  const cssData = await cssRes.json();
  const cssDirect = cssData.directImpactFiles.map((f) => f.filePath);
  if (!cssDirect.includes('src/styles/app.css')) throw new Error('Expected variables.css to impact app.css via css-import');
  console.log('   ✓ Changing src/styles/variables.css impacts src/styles/app.css (via css-import)');

  // Asset: src/assets/icon.png -> src/styles/app.css -> src/index.ts
  const assetRes = await fetch(`http://localhost:5000/api/repos/${repoId}/impact?file=src/assets/icon.png`);
  const assetData = await assetRes.json();
  const assetDirect = assetData.directImpactFiles.map((f) => f.filePath);
  const assetIndirect = assetData.indirectImpactFiles.map((f) => f.filePath);
  if (!assetDirect.includes('src/styles/app.css') || !assetIndirect.includes('src/index.ts')) {
    throw new Error('Expected icon.png to directly impact app.css and indirectly impact index.ts');
  }
  console.log('   ✓ Changing src/assets/icon.png directly impacts app.css (depth 1) and indirectly impacts index.ts (depth 2)!');

  // Cleanup
  try {
    fs.rmSync(path.dirname(testZipPath), { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('🎉 ALL STAGE 4 SPECIFICATION REQUIREMENTS VERIFIED & PASSED! 🎉');
  console.log('===============================================================');
}

runStage4Tests().catch((err) => {
  console.error('\n❌ Stage 4 Test Suite Failed:', err);
  process.exit(1);
});
