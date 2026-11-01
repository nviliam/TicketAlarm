export type TicketEmailData = {
  title: string;
  date: string;
  time: string;
  venue: string;
  ticketUrl: string;
  confirmation: string;
  details: string;
  checkedAt?: string;
  test?: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

export function renderTicketEmail(data: TicketEmailData): { html: string; text: string } {
  const url = new URL(data.ticketUrl);
  if (url.origin !== 'https://dumaszinhaz.jegy.hu' || url.username || url.password
    || !/^\/program\/.+-\d+\/\d+\/?$/.test(url.pathname))
    throw new Error('Invalid Jegy.hu ticket link');
  const title = escapeHtml(data.title);
  const link = escapeHtml(url.href);
  const testLabel = data.test ? 'TESZT ÉRTESÍTÉS · MINTAADATOK' : 'JEGYÉRTESÍTŐ';
  const warning = 'A jegyek időközben elfogyhatnak. Az elérhetőség a lekérés pillanatára vonatkozik.';
  const testWarning = 'Ez kizárólag megjelenítési és SMTP-teszt. Az alábbi előadásadatok minták, nem igazolnak aktuális jegyelérhetőséget.';
  const text = [
    'TicketAlarm', data.test ? testLabel + '\n' + testWarning : '',
    'Bödőcs Tibor', `Előadás: ${data.title}`,
    `Időpont: ${data.date} ${data.time} (budapesti helyi idő)`,
    `Helyszín: ${data.venue}`, data.confirmation, data.details,
    `Jegyvásárlás: ${url.href}`, warning,
    data.checkedAt ? `Ellenőrzés: ${data.checkedAt}` : '',
    'A TicketAlarm kizárólag értesít. Nem foglalt és nem vásárolt jegyet.',
  ].filter(Boolean).join('\n');
  const field = (label: string, value: string) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5eaf0;">
    <p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#64748b;">${label}</p>
    <p style="margin:0;font-size:17px;line-height:25px;font-weight:bold;color:#14243d;overflow-wrap:anywhere;">${escapeHtml(value)}</p>
  </td></tr>`;
  const html = `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TicketAlarm értesítés</title></head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#14243d;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#eef2f6;">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;">
<tr><td bgcolor="#12243e" style="padding:26px 24px;background-color:#12243e;border-radius:16px 16px 0 0;">
  <p style="margin:0;font-size:26px;line-height:34px;font-weight:bold;color:#ffffff;">TicketAlarm</p>
  <p style="margin:6px 0 0;font-size:11px;line-height:18px;letter-spacing:2px;color:#cbd5e1;">${testLabel}</p>
</td></tr>
<tr><td style="padding:28px 24px;">
  ${data.test ? `<p style="margin:0 0 24px;padding:12px;background-color:#fff7dd;color:#714c08;font-size:14px;line-height:22px;">${testWarning}</p>` : ''}
  <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#64748b;">Bödőcs Tibor</p>
  <h1 style="margin:0 0 20px;font-size:24px;line-height:33px;color:#14243d;font-weight:bold;overflow-wrap:anywhere;">${title}</h1>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
    ${field('DÁTUM', data.date)}${field('KEZDÉS · BUDAPESTI IDŐ', data.time)}${field('HELYSZÍN', data.venue)}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;">
  <tr><td bgcolor="#eaf7ee" style="padding:18px;background-color:#eaf7ee;border:1px solid #bee5c9;border-radius:10px;">
    <p style="margin:0;font-size:16px;line-height:25px;font-weight:bold;color:#145b32;">${escapeHtml(data.confirmation)}</p>
    <p style="margin:8px 0 0;font-size:14px;line-height:22px;color:#285b3e;overflow-wrap:anywhere;">${escapeHtml(data.details)}</p>
  </td></tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
  <tr><td align="center" bgcolor="#168044" style="background-color:#168044;border:1px solid #168044;border-radius:8px;mso-padding-alt:16px 24px;">
    <a href="${link}" target="_blank" style="display:inline-block;padding:16px 24px;font-size:15px;line-height:20px;font-weight:bold;letter-spacing:1px;color:#ffffff;text-decoration:none;border-radius:8px;">JEGYVÁSÁRLÁS</a>
  </td></tr></table>
  <p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#64748b;">${warning}</p>
  <p style="margin:12px 0 0;font-size:12px;line-height:20px;color:#64748b;">Ha a gomb nem működik:<br><a href="${link}" style="color:#16603a;word-break:break-all;overflow-wrap:anywhere;">${link}</a></p>
</td></tr>
<tr><td style="padding:18px 24px;border-top:1px solid #e5eaf0;font-size:12px;line-height:20px;color:#64748b;">
  TicketAlarm · Automatikus jegyértesítő<br>A program kizárólag értesít, nem foglal és nem vásárol jegyet.
  ${data.checkedAt ? `<br>Ellenőrzés: ${escapeHtml(data.checkedAt)}` : ''}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { html, text };
}

// Deliberately separate from live data: used only by the manually launched SMTP test.
export function renderTestEmail(): { html: string; text: string } {
  return renderTicketEmail({
    test: true,
    title: 'MINTA – Innen már csak gurulunk – Bödőcs Tibor önálló estje, előzenekar: Tóth Edu',
    date: '2026-12-21', time: '19:30', venue: 'Corvin Dumaszínház (minta)',
    ticketUrl: 'https://dumaszinhaz.jegy.hu/program/innen-mar-csak-gurulunk-bodocs-tibor-onallo-estje-elozenekar-toth-edu-183958/1501273',
    confirmation: 'TESZT: legalább 2 megfelelő szabad jegy megjelenítése',
    details: 'Mintaadat – a teszt nem ellenőriz aktuális készletet vagy ülőhelyet.',
  });
}
