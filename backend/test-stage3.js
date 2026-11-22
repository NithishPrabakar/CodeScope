import fs from 'fs';
import path from 'path';
import { buildStage3SampleZip } from './create-stage3-sample-repo.js';

async function runStage3Tests() {
  console.log('=== STARTING STAGE 3 COMPREHENSIVE DEPENDENCY EXTRACTION TEST SUITE ===\n');

  const testZipPath = path.resolve('test-artifacts', 'stage3-test.zip');
  fs.mkdirSync(path.dirname(testZipPath), { recursive: true });

  console.log('1. Building Stage 3 Sample Repository Archive...');
  buildStage3SampleZip(testZipPath);
  console.log('   ✓ Test archive built successfully');

  // Upload to API
  console.log('\n2. Uploading Stage 3 archive to POST /api/repos/upload...');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(testZipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('repoZip', blob, 'stage3-test.zip');

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

  // Fetch dependencies
  console.log('\n3. Fetching extracted dependencies via GET /api/repos/:repoId/dependencies...');
  const depRes = await fetch(`http://localhost:5000/api/repos/${repoId}/dependencies`);
  if (!depRes.ok) {
    throw new Error(`Failed to fetch dependencies: ${depRes.status}`);
  }

  const depData = await depRes.json();
  console.log('   ✓ Dependencies API returned 200 OK');
  console.log(`   - Total Extracted Dependencies: ${depData.totalDependencies}`);
  console.log(`   - Local Dependencies: ${depData.localDependencies}`);
  console.log(`   - External Dependencies: ${depData.externalDependencies}`);
  console.log(`   - Unresolved / Dynamic Dependencies: ${depData.unresolvedDependencies}`);

  const allDeps = depData.dependencies;

  // TEST 1: External Packages
  console.log('\n4. Verifying External Package detection...');
  const externalPackages = allDeps.filter((d) => d.targetKind === 'external').map((d) => d.rawSpecifier);
  console.log('   Detected external packages:', [...new Set(externalPackages)].join(', '));
  if (!externalPackages.includes('react') || !externalPackages.includes('lodash') || !externalPackages.includes('express')) {
    throw new Error('Failed to detect required external packages: react, lodash, express');
  }
  console.log('   ✓ React, lodash, and express correctly classified as external');

  // TEST 2: Local Imports & Index File Resolution
  console.log('\n5. Verifying Local Imports and Directory Index Resolution...');
  const indexDeps = depData.fileDependencies['src/index.ts'] || [];
  
  const headerDep = indexDeps.find((d) => d.targetFile === 'src/components/Header.tsx');
  if (!headerDep) throw new Error('Failed to resolve ./components/Header to src/components/Header.tsx');
  console.log('   ✓ Resolved ./components/Header ->', headerDep.targetFile);

  const helperDep = indexDeps.find((d) => d.targetFile === 'src/helpers/index.ts');
  if (!helperDep) throw new Error('Failed to resolve directory import ./helpers to src/helpers/index.ts');
  console.log('   ✓ Resolved directory index ./helpers ->', helperDep.targetFile);

  // TEST 3: Re-exports
  console.log('\n6. Verifying Re-export detection...');
  const reExports = allDeps.filter((d) => d.type === 're-export');
  console.log(`   Found ${reExports.length} re-exports:`);
  for (const re of reExports) {
    console.log(`     - [${re.sourceFile}] exports "${re.rawSpecifier}" -> resolved: ${re.targetFile}`);
  }
  if (reExports.length < 2) throw new Error('Expected at least 2 re-export declarations');
  console.log('   ✓ Re-exports correctly classified');

  // TEST 4: Unresolved Imports
  console.log('\n7. Verifying Unresolved Imports detection...');
  const unresolvedImport = indexDeps.find((d) => d.rawSpecifier === './services/doesNotExist');
  if (!unresolvedImport || unresolvedImport.targetKind !== 'unresolved') {
    throw new Error('Expected ./services/doesNotExist to be marked as unresolved');
  }
  console.log('   ✓ Non-existent import correctly marked as unresolved:', unresolvedImport.rawSpecifier);

  // TEST 5: Dynamic Imports (Static vs Dynamic Expressions)
  console.log('\n8. Verifying Dynamic Imports...');
  const staticDynamic = indexDeps.find((d) => d.rawSpecifier === './pages/Dashboard');
  if (!staticDynamic || staticDynamic.targetFile !== 'src/pages/Dashboard.tsx') {
    throw new Error('Failed to resolve static dynamic import ./pages/Dashboard');
  }
  console.log('   ✓ Static dynamic import resolved ->', staticDynamic.targetFile);

  const nonStaticDynamic = indexDeps.find((d) => d.status === 'dynamic');
  if (!nonStaticDynamic) {
    throw new Error('Failed to detect non-static dynamic import expression');
  }
  console.log('   ✓ Non-static dynamic expression correctly flagged as dynamic:', nonStaticDynamic.details);

  // TEST 6: Filesystem References
  console.log('\n9. Verifying Node.js Filesystem References...');
  const fsDeps = allDeps.filter((d) => d.type === 'filesystem');
  console.log(`   Found ${fsDeps.length} filesystem references:`);
  for (const f of fsDeps) {
    console.log(`     - [${f.sourceFile}] ${f.details} -> target: ${f.targetFile || 'unresolved'}`);
  }
  const configDep = fsDeps.find((d) => d.targetFile === 'config/app.json');
  const csvDep = fsDeps.find((d) => d.targetFile === 'data/users.csv');
  if (!configDep || !csvDep) {
    throw new Error('Failed to resolve config/app.json or data/users.csv from fs calls');
  }
  console.log('   ✓ Filesystem operations correctly parsed and resolved');

  // TEST 7: Express Template Rendering
  console.log('\n10. Verifying Express Template Rendering Detection...');
  const templateDeps = allDeps.filter((d) => d.type === 'template');
  console.log(`   Found ${templateDeps.length} template render references:`);
  for (const t of templateDeps) {
    console.log(`     - [${t.sourceFile}] res.render("${t.rawSpecifier}") -> target: ${t.targetFile || 'unresolved'}`);
  }
  const ejsDep = templateDeps.find((t) => t.targetFile === 'views/dashboard.ejs');
  const pugDep = templateDeps.find((t) => t.targetFile === 'views/profile.pug');
  const missingViewDep = templateDeps.find((t) => t.rawSpecifier === 'unregistered-view' && t.targetKind === 'unresolved');
  if (!ejsDep || !pugDep || !missingViewDep) {
    throw new Error('Failed to resolve templates or mark unregistered view as unresolved');
  }
  console.log('   ✓ Express EJS and Pug templates correctly resolved and missing template flagged');

  // TEST 8: CSS Imports & Assets
  console.log('\n11. Verifying CSS @import and Asset url() Detection...');
  const cssDeps = allDeps.filter((d) => d.type === 'css-import' || d.type === 'asset');
  console.log(`   Found ${cssDeps.length} CSS import/asset references:`);
  for (const c of cssDeps) {
    console.log(`     - [${c.sourceFile}] ${c.type}: "${c.rawSpecifier}" -> target: ${c.targetFile || 'unresolved'}`);
  }
  const cssImportTheme = cssDeps.find((c) => c.targetFile === 'src/styles/theme.css');
  const cssAssetLogo = cssDeps.find((c) => c.targetFile === 'src/assets/logo.png');
  const cssAssetFont = cssDeps.find((c) => c.targetFile === 'src/assets/inter.woff2');
  const cssMissingAsset = cssDeps.find((c) => c.rawSpecifier === '../assets/non-existent-image.jpg' && c.targetKind === 'unresolved');

  if (!cssImportTheme || !cssAssetLogo || !cssAssetFont || !cssMissingAsset) {
    throw new Error('Failed to verify CSS imports or asset resolutions');
  }
  console.log('   ✓ CSS @import, images, fonts, and missing asset references verified');

  // TEST 9: File without dependencies
  console.log('\n12. Verifying File Without Dependencies...');
  const constDeps = depData.fileDependencies['src/constants.ts'];
  if (!constDeps || constDeps.length !== 0) {
    throw new Error(`Expected 0 dependencies for src/constants.ts, got ${constDeps?.length}`);
  }
  console.log('   ✓ src/constants.ts correctly has 0 dependencies');

  // TEST 10: Fault Tolerance on Invalid Syntax
  console.log('\n13. Verifying Fault Tolerance for Invalid Source Files...');
  const brokenDeps = depData.fileDependencies['src/broken-syntax.js'];
  if (!brokenDeps || brokenDeps.length !== 0) {
    throw new Error('Expected broken syntax file to be handled gracefully with 0 dependencies');
  }
  console.log('   ✓ src/broken-syntax.js parsed without crashing analysis');

  // Cleanup
  try {
    fs.rmSync(path.dirname(testZipPath), { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('🎉 ALL STAGE 3 SPECIFICATION REQUIREMENTS VERIFIED & PASSED! 🎉');
  console.log('===============================================================');
}

runStage3Tests().catch((err) => {
  console.error('\n❌ Stage 3 Test Suite Failed:', err);
  process.exit(1);
});
