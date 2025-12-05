#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = ['node', '--test', ...args];

const startedAt = Date.now();
const result = spawnSync('node', ['--test', ...args], { encoding: 'utf8' });
const durationMs = Date.now() - startedAt;

// Echo test output to console for normal visibility
if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

const statusOk = result.status === 0;
const timestamp = new Date().toISOString();
const fullOutput = (result.stdout || '').trim();
const tail = fullOutput
  ? fullOutput.split('\n').slice(-80).join('\n')
  : 'No output captured';

const reportLines = [
  '# Test Report',
  '',
  `- Timestamp (UTC): ${timestamp}`,
  `- Command: \`${command.join(' ')}\``,
  `- Outcome: ${statusOk ? '✅ Pass' : '❌ Fail'} (exit code ${result.status ?? 'null'})`,
  `- Duration: ${durationMs} ms`,
  '',
  '## Output (last lines)',
  '```',
  tail,
  '```',
];

const reportDir = path.join(__dirname, '..', 'docs', 'test');
const reportPath = path.join(reportDir, 'latest.md');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');

process.exit(result.status ?? 1);
