import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const branch = 'ticketalarm-state';
const filename = 'notifications.json';
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function validate(path: string): void {
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (state.version !== 1 || !state.sent || typeof state.sent !== 'object' || Array.isArray(state.sent)
    || Object.entries(state.sent).some(([id, hash]) => !/^\d+\/\d+$/.test(id)
      || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))
    throw new Error('Invalid remote notification state; sending is disabled');
}

export function saveRemoteState(worktree: string): void {
  validate(join(worktree, filename));
  git(worktree, 'add', '--', filename);
  if (git(worktree, 'diff', '--cached', '--name-only')) {
    git(worktree, '-c', 'user.name=TicketAlarm', '-c', 'user.email=ticketalarm@users.noreply.github.com',
      'commit', '-m', 'Update notification state');
  }
  // Also retry a previous commit whose push failed. Never force-push.
  git(worktree, 'push', 'origin', `HEAD:refs/heads/${branch}`);
}

export function restoreRemoteState(repo: string, worktree: string): void {
  if (existsSync(worktree)) throw new Error('State worktree already exists');
  const remote = git(repo, 'ls-remote', '--heads', 'origin', `refs/heads/${branch}`);
  mkdirSync(dirname(worktree), { recursive: true });
  if (remote) {
    git(repo, 'fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`);
    git(repo, 'worktree', 'add', '--detach', worktree, `refs/remotes/origin/${branch}`);
    validate(join(worktree, filename));
    // Check write access before any message can be sent.
    git(worktree, 'push', 'origin', `HEAD:refs/heads/${branch}`);
  } else {
    git(repo, 'worktree', 'add', '--detach', worktree, 'HEAD');
    git(worktree, 'switch', '--orphan', branch);
    // Preserve prior local history when migrating an existing installation.
    const local = join(repo, '.ticketalarm', filename);
    if (existsSync(local)) copyFileSync(local, join(worktree, filename));
    else writeFileSync(join(worktree, filename), '{"version":1,"sent":{}}\n');
    saveRemoteState(worktree);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const worktree = process.env.TICKETALARM_STATE_WORKTREE;
    if (!worktree) throw new Error('TICKETALARM_STATE_WORKTREE is required');
    if (process.argv[2] === 'restore') restoreRemoteState(process.cwd(), worktree);
    else if (process.argv[2] === 'save') saveRemoteState(worktree);
    else throw new Error('Use restore or save');
    console.log('Notification state synchronized.');
  } catch {
    // Git may include credential-bearing remote URLs in its error output.
    console.error('State synchronization failed. Check contents:write permission and the ticketalarm-state branch.');
    process.exitCode = 1;
  }
}
