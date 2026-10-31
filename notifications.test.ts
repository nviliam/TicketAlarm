import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeNotice, sendNotices } from './notifications.ts';
import { parseRecipients, sendEmail } from './email.ts';

const now = Date.now();
const result = {
  slug: 'innen-mar-csak-gurulunk-bodocs-tibor-2026-12-21-1930',
  dateFromRaw: '2026-12-21T19:30:00.000000Z', venue: 'Corvin Dumaszínház',
  ticketUrl: 'https://dumaszinhaz.jegy.hu/program/bodocs-tibor-183958/1501273',
  checkedAt: new Date(now).toISOString(), availability: 'observed', freeSeats: 2,
  sameTablePairs: [{ table: '49. asztal', seats: [{ id: 47329 }, { id: 47328 }] }],
};

test('recipient parsing preserves single addresses and trims comma-separated lists', () => {
  assert.deepEqual(parseRecipients('elso@gmail.com'), ['elso@gmail.com']);
  assert.deepEqual(parseRecipients(' elso@gmail.com, masodik@gmail.com ,elso@gmail.com '),
    ['elso@gmail.com', 'masodik@gmail.com']);
  for (const input of [undefined, '', ' ', 'a@gmail.com,', ',a@gmail.com',
    'a@gmail.com,,b@gmail.com', 'a@gmail.com,hibas', 'a@gmail.com;b@gmail.com'])
    assert.throws(() => parseRecipients(input));
});

test('all recipients receive the same message through the mocked mail transport', async () => {
  const notice = makeNotice(result, now)!;
  for (const input of ['elso@gmail.com', 'elso@gmail.com, masodik@gmail.com']) {
    const recipients = parseRecipients(input);
    let calls = 0;
    await sendEmail(async message => {
      calls++;
      assert.equal(message.from, 'felado@gmail.com');
      assert.deepEqual(message.to, recipients);
      assert.equal(message.subject, notice.subject);
      assert.equal(message.text, notice.text);
      return { accepted: recipients, rejected: [] };
    }, 'felado@gmail.com', recipients, notice);
    assert.equal(calls, 1);
  }
});

test('partial recipient rejection does not mark notification as sent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticketalarm-'));
  const recipients = parseRecipients('elso@gmail.com,masodik@gmail.com');
  const notice = makeNotice(result, now)!;
  try {
    await assert.rejects(sendNotices([notice], dir, n => sendEmail(async () => ({
      accepted: [recipients[0]], rejected: [recipients[1]],
    }), 'felado@gmail.com', recipients, n)));
    assert.equal(await sendNotices([notice], dir, n => sendEmail(async () => ({
      accepted: recipients, rejected: [],
    }), 'felado@gmail.com', recipients, n)), 1);
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

test('message includes published local time, venue, confirmed pair and direct link', () => {
  const notice = makeNotice(result, now)!;
  assert.ok(notice);
  for (const text of ['2026-12-21 19:30', result.venue, 'legalább 2 szabad', result.ticketUrl])
    assert.ok(notice.text.includes(text));
});

test('unknown, stale, control, unpaired and duplicate-seat data never alert', () => {
  for (const patch of [
    { availability: 'unknown' }, { availability: 'UNKNOWN' }, { checkedAt: new Date(now - 600001).toISOString() },
    { checkedAt: new Date(now + 1000).toISOString() }, { freeSeats: 1 },
    { slug: 'kiss-adam' }, { sameTablePairs: [] },
    { sameTablePairs: [{ table: '49. asztal', seats: [{ id: 1 }, { id: 1 }] }] },
  ]) assert.equal(makeNotice({ ...result, ...patch }, now), null);
});

test('seat order and check timestamp do not change fingerprint, changed pair does', () => {
  const original = makeNotice(result, now)!;
  const reordered = makeNotice({ ...result, checkedAt: new Date(now - 1000).toISOString(),
    sameTablePairs: [{ ...result.sameTablePairs[0], seats: [...result.sameTablePairs[0].seats].reverse() }] }, now)!;
  assert.equal(original.fingerprint, reordered.fingerprint);
  assert.notEqual(original.fingerprint, makeNotice({ ...result,
    sameTablePairs: [{ table: '49. asztal', seats: [{ id: 1 }, { id: 2 }] }] }, now)!.fingerprint);
});

test('two individually observed seats suffice without claiming adjacency', () => {
  const notice = makeNotice({ ...result, sameTablePairs: [], freeSeatIds: [101, 102] }, now)!;
  assert.ok(notice.text.includes('legalább 2 szabad jegyet'));
  assert.ok(notice.text.includes('szomszédosság nem igazolt'));
  assert.equal(makeNotice({ ...result, sameTablePairs: [], freeSeatIds: [101, 101] }, now), null);
});

test('persistent deduplication, retry after failure, and changed availability', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticketalarm-'));
  const notice = makeNotice(result, now)!;
  let calls = 0;
  try {
    await assert.rejects(sendNotices([notice], dir, async () => { throw new Error('SMTP failure'); }));
    const sender = async () => { calls++; };
    assert.equal(await sendNotices([notice], dir, sender), 1);
    assert.equal(await sendNotices([notice], dir, sender), 0);
    assert.equal(await sendNotices([], dir, sender), 0); // unknown observations preserve state
    assert.equal(await sendNotices([notice], dir, sender), 0);
    assert.equal(await sendNotices([{ ...notice, fingerprint: 'changed' }], dir, sender), 1);
    assert.equal(calls, 2);
    assert.ok((await readFile(join(dir, 'notifications.json'), 'utf8')).includes('changed'));
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

test('corrupt state and concurrent sender fail closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticketalarm-'));
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'notifications.json'), 'invalid json');
    await assert.rejects(sendNotices([makeNotice(result, now)!], dir, async () => assert.fail('must not send')));
    await writeFile(join(dir, 'notifications.lock'), '');
    await assert.rejects(sendNotices([makeNotice(result, now)!], dir, async () => assert.fail('must not send')));
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
