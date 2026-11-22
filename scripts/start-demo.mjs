import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('Run this launcher with `npm run start:demo` so npm can provide its CLI path.');
}

const runNpm = (args, env = process.env) =>
  spawn(process.execPath, [npmCli, ...args], { stdio: 'inherit', env });

const children = [
  runNpm(['run', 'mock']),
  runNpm(['start'], { ...process.env, CLAIMS_API_TARGET: 'http://localhost:4301' }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
