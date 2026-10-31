import nodemailer from 'nodemailer';
import { mailbox, parseRecipients, sendEmail } from './email.ts';

// Standalone manual SMTP test. Does not load ticket data or notification state.
async function testSmtp(): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!user || !mailbox.test(user) || !pass)
    throw new Error('CONFIG');
  const recipients = parseRecipients(process.env.NOTIFY_EMAIL);
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass }, logger: false, debug: false,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  try {
    await sendEmail(message => transport.sendMail(message), user, recipients, {
      eventId: 'smtp-test', fingerprint: 'smtp-test',
      subject: 'TicketAlarm – Teszt értesítés',
      text: 'Ez a TicketAlarm Gmail SMTP-tesztüzenete.\n'
        + 'A küldés független a jegyelérhetőségtől. Nem történt jegyfoglalás vagy vásárlás.',
    });
    console.log(`SMTP-küldés sikeres: a kiszolgáló mind a(z) ${recipients.length} címzettet elfogadta.`);
    console.log('A kézbesítést a címzettek postaládájában és a Spam mappában ellenőrizheted.');
  } finally {
    transport.close();
  }
}

try {
  await testSmtp();
} catch (error) {
  // Never log raw SMTP errors, credentials, server responses or auth payloads.
  const code = (error as { code?: string })?.code;
  const descriptions: Record<string, string> = {
    EAUTH: 'Gmail-hitelesítési hiba. Ellenőrizd a feladó címét és a Google alkalmazásjelszót.',
    ECONNECTION: 'Nem sikerült kapcsolódni a Gmail SMTP-kiszolgálóhoz.',
    ECONNREFUSED: 'A kapcsolatot elutasították.',
    ETIMEDOUT: 'Az SMTP-kapcsolat időtúllépés miatt megszakadt.',
    EDNS: 'A Gmail SMTP-kiszolgáló neve nem oldható fel.',
    ESOCKET: 'Hálózati vagy TLS-kapcsolati hiba történt.',
    EENVELOPE: 'A kiszolgáló elutasította a feladót vagy valamelyik címzettet.',
    EMESSAGE: 'Az üzenet összeállítása sikertelen.',
  };
  const description = code && Object.hasOwn(descriptions, code) ? descriptions[code]
    : 'Ellenőrizd a GMAIL_USER, GMAIL_APP_PASSWORD és NOTIFY_EMAIL beállításokat, '
      + 'valamint a hálózatot. Nem minden címzett elfogadása esetén is sikertelennek jelöljük a tesztet.';
  console.error(`SMTP-teszt sikertelen: ${description}`);
  process.exitCode = 1;
}
