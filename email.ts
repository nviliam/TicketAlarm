import type { SendMailOptions } from 'nodemailer';
import type { Notice } from './notifications.ts';

export const mailbox = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

export function parseRecipients(value: string | undefined): string[] {
  const recipients = value?.split(',').map(address => address.trim()) ?? [];
  if (!recipients.length || recipients.some(address => !mailbox.test(address)))
    throw new Error('A NOTIFY_EMAIL értéke egy vagy több, vesszővel elválasztott e-mail-cím legyen.');
  return [...new Set(recipients)];
}

export async function sendEmail(
  sendMail: (message: SendMailOptions) => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>,
  from: string, recipients: string[], notice: Notice,
): Promise<void> {
  const info = await sendMail({ from, to: recipients, subject: notice.subject, text: notice.text, html: notice.html });
  if (info.accepted?.length !== recipients.length || info.rejected?.length)
    throw new Error('Az SMTP-kiszolgáló nem fogadta el az összes címzettet.');
}
