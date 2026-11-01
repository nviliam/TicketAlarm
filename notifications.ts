import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderTicketEmail } from './email-template.ts';

export type Notice = { eventId: string; fingerprint: string; subject: string; text: string; html?: string };
type Result = {
  slug?: string; title?: string; dateFromRaw?: string; venue?: string; ticketUrl?: string;
  checkedAt?: string; availability?: string; freeSeats?: number;
  freeSeatIds?: number[];
  sameTablePairs?: { table: string; seats: { id: number; label?: string }[] }[];
};

// Prefer a confirmed same-table group; otherwise require individual observed seat IDs.
// General source counts alone are not sufficient evidence.
export function makeNotice(result: Result, now = Date.now()): Notice | null {
  if (result.availability !== 'observed' || !result.slug?.includes('bodocs-tibor')
    || !Number.isInteger(result.freeSeats) || result.freeSeats! < 2) return null;
  const checked = Date.parse(result.checkedAt ?? '');
  if (!Number.isFinite(checked) || checked > now || now - checked > 10 * 60_000) return null;
  if (!result.venue?.trim() || !result.dateFromRaw || !result.ticketUrl) return null;
  const date = result.dateFromRaw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):/);
  if (!date) return null;
  // Current source incorrectly labels published local hours with Z. Preserve those hours.
  const url = new URL(result.ticketUrl);
  const ids = url.pathname.match(/-(\d+)\/(\d+)\/?$/);
  if (url.origin !== 'https://dumaszinhaz.jegy.hu' || !ids || url.username || url.password) return null;
  const tables = (result.sameTablePairs ?? []).map(t => ({
    table: t.table,
    seats: [...new Set(t.seats.map(s => s.id).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b),
  })).filter(t => /asztal/i.test(t.table) && t.seats.length >= 2)
    .sort((a, b) => a.table.localeCompare(b.table) || JSON.stringify(a.seats).localeCompare(JSON.stringify(b.seats)));
  const freeSeatIds = [...new Set((result.freeSeatIds ?? [])
    .filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  if (!tables.length && (freeSeatIds.length < 2 || freeSeatIds.length !== result.freeSeats)) return null;
  const eventId = `${ids[1]}/${ids[2]}`;
  const fingerprint = createHash('sha256').update(JSON.stringify({ eventId,
    date: date[0], venue: result.venue, tables, freeSeatIds })).digest('hex');
  const content = renderTicketEmail({
    title: result.title?.trim() || 'Bödőcs Tibor előadása – a pontos cím nem érhető el',
    date: date[1], time: date[2], venue: result.venue, ticketUrl: url.href,
    confirmation: tables.length
      ? 'A friss ülőhelyadatok legalább 2 szabad helyet jeleznek ugyanannál az asztalnál.'
      : 'A friss ülőhelyadatok legalább 2 szabad jegyet jeleznek. A közvetlen szomszédosság nem igazolt.',
    details: tables.length
      ? `Asztalok: ${tables.map(t => t.table).join(', ')}. Az azonos asztal nem feltétlenül jelent közvetlenül egymás melletti széket.`
      : `Szabad helyek száma: ${freeSeatIds.length}`,
    checkedAt: result.checkedAt,
  });
  return {
    eventId, fingerprint,
    subject: `TicketALarm: legalább 2 szabad jegy – ${date[1]} ${date[2]}`,
    ...content,
  };
}

export async function sendNotices(
  notices: Notice[], stateDir: string,
  send: (notice: Notice) => Promise<void>,
  persist?: () => Promise<void>,
): Promise<number> {
  await mkdir(stateDir, { recursive: true });
  const lockPath = join(stateDir, 'notifications.lock');
  // Never run overlapping senders against the same state file.
  const lock = await open(lockPath, 'wx');
  const statePath = join(stateDir, 'notifications.json');
  try {
    let sent: Record<string, string> = {};
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (state.version !== 1 || !state.sent || typeof state.sent !== 'object'
        || Array.isArray(state.sent) || Object.values(state.sent).some(v => typeof v !== 'string'))
        throw new Error('Invalid notification state; refusing to resend');
      sent = state.sent;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    let count = 0;
    for (const notice of notices) {
      if (sent[notice.eventId] === notice.fingerprint) continue;
      await send(notice);
      sent[notice.eventId] = notice.fingerprint;
      const temporary = `${statePath}.tmp`;
      await writeFile(temporary,
        JSON.stringify({ version: 1, sent }, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, statePath);
      // In Actions, persist each accepted message before processing the next one.
      await persist?.();
      count++;
    }
    return count;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
