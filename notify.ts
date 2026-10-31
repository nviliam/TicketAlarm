import { readFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { makeNotice, sendNotices } from './notifications.ts';
import { mailbox, parseRecipients, sendEmail } from './email.ts';
import { saveRemoteState } from './remote-state.ts';

// Always consume a fresh probe. No mail is sent without the explicit --send flag.
const report = JSON.parse(await readFile('probe-results.json', 'utf8'));
if (!Array.isArray(report.results)) throw new Error('Invalid probe report');
const notices = report.results.flatMap((result: Parameters<typeof makeNotice>[0]) => {
  const notice = makeNotice(result);
  return notice ? [notice] : [];
});
if (!process.argv.includes('--send')) {
  console.log(`Előnézet: ${notices.length} megfelelő előadás. Nem küldünk e-mailt.`);
  for (const notice of notices) console.log(`\n${notice.subject}\n${notice.text}`);
} else if (!notices.length) {
  console.log('Nincs friss, igazolt helypár; nem küldünk e-mailt.');
} else {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  const recipients = parseRecipients(process.env.NOTIFY_EMAIL);
  if (!user || !pass || !mailbox.test(user))
    throw new Error('Állítsd be a GMAIL_USER, GMAIL_APP_PASSWORD és NOTIFY_EMAIL változókat.');
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  const stateDir = process.env.TICKETALARM_STATE_WORKTREE ?? '.ticketalarm';
  const count = await sendNotices(notices, stateDir, async notice => {
    await sendEmail(message => transport.sendMail(message), user, recipients, notice);
  }, process.env.TICKETALARM_STATE_WORKTREE ? async () => saveRemoteState(stateDir) : undefined);
  console.log(`${count} értesítés elküldve.`);
}
