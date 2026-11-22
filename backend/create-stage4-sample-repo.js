import AdmZip from 'adm-zip';
import path from 'path';

export function buildStage4SampleZip(outputPath) {
  const zip = new AdmZip();

  zip.addFile('stage4-demo/package.json', Buffer.from(JSON.stringify({
    name: 'stage4-impact-demo',
    version: '1.0.0',
    dependencies: {
      express: '^4.21.2',
      react: '^18.3.1'
    }
  }, null, 2)));

  zip.addFile('stage4-demo/README.md', Buffer.from('# Stage 4 Impact Analysis Demo\nTests direct, indirect, multi-path, and circular dependencies.'));

  // 1. Math utilities (Deep origin node for multi-level impact)
  zip.addFile('stage4-demo/src/utils/math.ts', Buffer.from(`export const add = (a: number, b: number): number => a + b;
export const multiply = (a: number, b: number): number => a * b;
`));

  // 2. Intermediate Re-exporter
  zip.addFile('stage4-demo/src/utils/index.ts', Buffer.from(`export * from './math';
export const helperUtil = () => 'helper';
`));

  // 3. Service layer using math
  zip.addFile('stage4-demo/src/services/calcService.ts', Buffer.from(`import { add } from '../utils/math';
export const calculateTotal = (items: number[]) => items.reduce((acc, n) => add(acc, n), 0);
`));

  // 4. Feature component using both calcService and utils/index (Multiple Dependency Paths to Dashboard!)
  zip.addFile('stage4-demo/src/components/Calculator.tsx', Buffer.from(`import { calculateTotal } from '../services/calcService';
import { helperUtil } from '../utils/index';

export const Calculator = () => <div>Total: {calculateTotal([1, 2])} - {helperUtil()}</div>;
`));

  // 5. Page component using Calculator
  zip.addFile('stage4-demo/src/pages/Dashboard.tsx', Buffer.from(`import { Calculator } from '../components/Calculator';
export const Dashboard = () => <div><Calculator /></div>;
export default Dashboard;
`));

  // 6. Top-level App / Index (Leaf node: nothing imports index.ts)
  zip.addFile('stage4-demo/src/index.ts', Buffer.from(`import { Dashboard } from './pages/Dashboard';
import './styles/app.css';

console.log('App running', Dashboard);
`));

  // 7. Circular dependency pair: circularA <-> circularB
  zip.addFile('stage4-demo/src/circular/moduleA.ts', Buffer.from(`import { funcB } from './moduleB';
export const funcA = () => funcB() + ' from A';
`));

  zip.addFile('stage4-demo/src/circular/moduleB.ts', Buffer.from(`import { funcA } from './moduleA';
export const funcB = () => 'B';
`));

  // 8. Filesystem dependency: config.json read by server.ts
  zip.addFile('stage4-demo/config/settings.json', Buffer.from(JSON.stringify({ port: 8080, debug: true }, null, 2)));
  zip.addFile('stage4-demo/src/server.ts', Buffer.from(`import express from 'express';
import fs from 'fs';

const app = express();
const settings = JSON.parse(fs.readFileSync('./config/settings.json', 'utf8'));

app.get('/view', (req, res) => {
  res.render('welcome');
});
`));

  // 9. Template dependency: welcome.ejs rendered by server.ts
  zip.addFile('stage4-demo/views/welcome.ejs', Buffer.from(`<h1>Welcome to CodeScope</h1>`));

  // 10. CSS import and Asset dependency
  zip.addFile('stage4-demo/src/styles/variables.css', Buffer.from(`:root { --main-bg: #0b1120; }`));
  zip.addFile('stage4-demo/src/assets/icon.png', Buffer.from('FAKE_ICON_BYTES'));
  zip.addFile('stage4-demo/src/empty.ts', Buffer.alloc(0));
  zip.addFile('stage4-demo/src/styles/app.css', Buffer.from(`@import url('./variables.css');
.header-icon {
  background-image: url('../assets/icon.png');
}
`));

  zip.writeZip(outputPath);
  return outputPath;
}

if (process.argv[1]?.endsWith('create-stage4-sample-repo.js')) {
  const out = path.resolve('..', 'sample-stage4-repo.zip');
  buildStage4SampleZip(out);
  console.log('Stage 4 Sample ZIP generated at:', out);
}
