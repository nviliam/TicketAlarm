import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreRemoteState, saveRemoteState } from './remote-state.ts';
import { sendNotices, type Notice } from './notifications.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('state survives independent checkouts; secrets excluded; duplicate notification suppressed', async () => {
  // Only temporary local repositories; no network or real mail.
  const root = mkdtempSync(join(tmpdir(), 'ticketalarm-git-'));
  const origin = join(root, 'origin.git');
  mkdirSync(origin);
  git(origin, 'init', '--bare');
  const first = join(root, 'first');
  mkdirSync(first);
  git(first, 'init', '-b', 'main');
  copyFileSync('.gitignore', join(first, '.gitignore'));
  writeFileSync(join(first, 'README.md'), 'Test repository');
  writeFileSync(join(first, '.env'), 'FAKE_SECRET=not-a-real-secret');
  writeFileSync(join(first, '.env.example'), 'GMAIL_USER=example@gmail.com');
  git(first, 'add', '.');
  const staged = git(first, 'diff', '--cached', '--name-only').split('\n');
  assert.ok(!staged.includes('.env'));
  assert.ok(staged.includes('.env.example'));
  for (const path of ['.env', '.env.production', '.ticketalarm/notifications.json',
    'credentials-local.json', 'private.key', 'probe-results.json'])
    assert.ok(git(first, 'check-ignore', '--no-index', path));
  git(first, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial');
  git(first, 'remote', 'add', 'origin', origin);
  git(first, 'push', 'origin', 'main');
  const state1 = join(root, 'state1');
  restoreRemoteState(first, state1);
  assert.deepEqual(JSON.parse(readFileSync(join(state1, 'notifications.json'), 'utf8')), { version: 1, sent: {} });
  const notice: Notice = { eventId: '123/456', fingerprint: 'a'.repeat(64), subject: 'Test', text: 'Test' };
  let sends = 0;
  const send = async () => { sends++; };
  await sendNotices([notice], state1, send, async () => saveRemoteState(state1));
  assert.equal(sends, 1);
  const commit = git(state1, 'rev-parse', 'HEAD');
  saveRemoteState(state1);
  assert.equal(git(state1, 'rev-parse', 'HEAD'), commit); // no empty commits
  assert.equal(git(state1, 'ls-tree', '--name-only', 'HEAD'), 'notifications.json');

  const second = join(root, 'second');
  git(root, 'clone', '--branch', 'main', origin, second);
  const state2 = join(root, 'state2');
  restoreRemoteState(second, state2);
  assert.equal(await sendNotices([notice], state2, send, async () => saveRemoteState(state2)), 0);
  assert.equal(sends, 1);
  writeFileSync(join(state2, 'notifications.json'), 'corrupt');
  assert.throws(() => saveRemoteState(state2));
  git(state2, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-am', 'Corrupt state fixture');
  git(state2, 'push', 'origin', 'HEAD:refs/heads/ticketalarm-state');
  assert.throws(() => restoreRemoteState(second, join(root, 'state3')));
  assert.ok(existsSync(join(first, '.env'))); // no modification of local env
  // Temporary worktrees are left to the OS temp cleanup; no recursive shell deletion.
});
