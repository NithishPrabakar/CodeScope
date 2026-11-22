import AdmZip from 'adm-zip';
import path from 'path';

export function buildStage3SampleZip(outputPath) {
  const zip = new AdmZip();

  // Root files
  zip.addFile('stage3-demo/package.json', Buffer.from(JSON.stringify({
    name: 'stage3-comprehensive-demo',
    version: '1.0.0',
    dependencies: {
      react: '^18.3.1',
      express: '^4.21.2',
      lodash: '^4.17.21'
    }
  }, null, 2)));

  zip.addFile('stage3-demo/README.md', Buffer.from('# Stage 3 Comprehensive Dependency Demo\nTests all import and non-import dependencies.'));

  // 12. File without dependencies
  zip.addFile('stage3-demo/src/constants.ts', Buffer.from(`export const APP_NAME = 'CodeScope Demo';
export const VERSION = '1.0.0';
export const MAX_RETRIES = 5;
`));

  // 1. Math utilities & re-exports
  zip.addFile('stage3-demo/src/utils/math.ts', Buffer.from(`export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
`));

  // 4. Re-export module
  zip.addFile('stage3-demo/src/utils/index.ts', Buffer.from(`export * from './math';
export { APP_NAME } from '../constants';
`));

  // 3. Index-file resolution test helper folder
  zip.addFile('stage3-demo/src/helpers/index.ts', Buffer.from(`export const formatUser = (name: string): string => name.trim().toUpperCase();
`));

  // Component
  zip.addFile('stage3-demo/src/components/Header.tsx', Buffer.from(`import React from 'react';
import '../styles/main.css';

export const Header = () => <header><h1>CodeScope Header</h1></header>;
export default Header;
`));

  // 10. Dynamic import target page
  zip.addFile('stage3-demo/src/pages/Dashboard.tsx', Buffer.from(`import React from 'react';
export const Dashboard = () => <div>Dashboard Page</div>;
export default Dashboard;
`));

  // 13. Invalid source file (syntax error)
  zip.addFile('stage3-demo/src/broken-syntax.js', Buffer.from(`// This file intentionally contains invalid syntax to test parser fault-tolerance
const broken = = { invalid ::: syntax }}};;;
`));

  // 7. Express templates in views/ directory
  zip.addFile('stage3-demo/views/dashboard.ejs', Buffer.from(`<h1>Dashboard View (EJS)</h1>`));
  zip.addFile('stage3-demo/views/profile.pug', Buffer.from(`h1 User Profile (Pug)`));

  // Controller with Express template rendering and Filesystem references
  zip.addFile('stage3-demo/src/server.ts', Buffer.from(`import express, { Request, Response } from 'express';
import fs from 'fs';
import { readFileSync } from 'fs';

const app = express();

// 7. Express template rendering
app.get('/dashboard', (req: Request, res: Response) => {
  res.render('dashboard'); // Resolves to views/dashboard.ejs
});

app.get('/profile', (req: Request, res: Response) => {
  res.render('profile', { user: 'Alice' }); // Resolves to views/profile.pug
});

app.get('/missing', (req: Request, res: Response) => {
  res.render('unregistered-view'); // Unresolved template
});

// 6. Filesystem references
const config = fs.readFileSync('./config/app.json', 'utf-8');
const stream = fs.createReadStream('./data/users.csv');
const pkg = readFileSync('./package.json', 'utf-8');

export default app;
`));

  // Configuration and data files referenced by fs
  zip.addFile('stage3-demo/config/app.json', Buffer.from(JSON.stringify({ port: 3000, env: 'production' }, null, 2)));
  zip.addFile('stage3-demo/data/users.csv', Buffer.from(`id,name,role\n1,Alice,Admin\n2,Bob,User\n`));

  // 8 & 9. CSS with @import and asset url() references
  zip.addFile('stage3-demo/src/styles/theme.css', Buffer.from(`:root {
  --primary-color: #4f46e5;
}
`));

  zip.addFile('stage3-demo/src/styles/main.css', Buffer.from(`/* 8. CSS @import */
@import url('./theme.css');
@import './typography.css';

/* 9. CSS asset references */
.banner {
  background-image: url('../assets/logo.png');
}

@font-face {
  font-family: 'Inter';
  src: url('../assets/inter.woff2') format('woff2');
}

.missing-bg {
  background: url('../assets/non-existent-image.jpg');
}
`));

  zip.addFile('stage3-demo/src/styles/typography.css', Buffer.from(`body { font-family: 'Inter', sans-serif; }`));
  zip.addFile('stage3-demo/src/assets/logo.png', Buffer.from('PNG_FAKE_BYTES'));
  zip.addFile('stage3-demo/src/assets/inter.woff2', Buffer.from('WOFF2_FAKE_BYTES'));

  // Main entry point combining all tests
  zip.addFile('stage3-demo/src/index.ts', Buffer.from(`// 1. External imports
import React, { useState } from 'react';
import _ from 'lodash';

// 1. Local default & named imports
import Header from './components/Header';
import * as MathOps from './utils/math';

// 3. Directory index resolution (resolves to ./helpers/index.ts)
import { formatUser } from './helpers';

// 4. Re-export
export { Header };

// 5. Unresolved import
import { missingService } from './services/doesNotExist';

// 10. Static dynamic import
async function loadDashboard() {
  const mod = await import('./pages/Dashboard');
  return mod;
}

// 11. Unresolvable dynamic import
async function loadDynamicPage(pageName: string) {
  const dynamicMod = await import('./pages/' + pageName);
  return dynamicMod;
}

console.log('App ready');
`));

  zip.writeZip(outputPath);
  return outputPath;
}

// If executed directly
if (process.argv[1]?.endsWith('create-stage3-sample-repo.js')) {
  const out = path.resolve('..', 'sample-stage3-repo.zip');
  buildStage3SampleZip(out);
  console.log('Stage 3 Sample ZIP generated at:', out);
}
