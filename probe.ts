// TicketALarm: read-only investigation. Node.js 24+, no dependencies.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

async function get(url: string): Promise<string> {
  const u = new URL(url);
  if (!['dumaszinhaz.hu', 'api.dumaszinhaz.hu', 'dumaszinhaz.jegy.hu'].includes(u.hostname)
      || u.protocol !== 'https:') throw new Error('Unexpected source URL');
  // Optional Windows TLS fallback. GET only; no cookies, basket calls or POSTs.
  if (process.argv.includes('--curl')) return execFileSync('curl.exe',
    ['--fail', '--silent', '--show-error', '--location', '--max-time', '25', url],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.text();
}

const url = new URL('https://api.dumaszinhaz.hu/api/events');
url.searchParams.set('filters[actor_ids][0]', '6');
url.searchParams.set('perPage', '100');
url.searchParams.set('page', '1');
const events: any[] = [];
const controlOnly = process.argv.includes('--control');
if (controlOnly) {
  const control = JSON.parse(await get('https://api.dumaszinhaz.hu/api/events/mit-nem-mondok-kiss-adam-onallo-estje-musorvezeto-toth-edu-2026-11-07-1530'));
  events.push(control.data);
}
for (let page = 1; !controlOnly && page <= 20; page++) {
  url.searchParams.set('page', String(page));
  const body = JSON.parse(await get(url.href));
  if (!Array.isArray(body.data)) throw new Error('Unknown event response');
  events.push(...body.data);
  if (!body.links?.next) break;
  if (page === 20) throw new Error('Pagination limit reached');
}
const results: any[] = [];
for (const event of events) {
  if ((!controlOnly && !event.actors?.some((a: any) => a.id === 6)) || event.city?.name !== 'Budapest') continue;
  const result: any = {
    slug: event.slug, dateFromRaw: event.date_from,
    // Source dates carry Z, but the published page treats the hour as local.
    // Preserve raw values; do not silently convert them to Budapest time.
    venue: event.audit?.name, sourceAvailableTickets: event.available_tickets,
    ticketUrl: event.ticket_url, checkedAt: new Date().toISOString(),
    availability: 'unknown', freeSeats: null, sameTablePairs: [],
    adjacentSeats: 'unknown',
  };
  try {
    const ticketUrl = new URL(event.ticket_url);
    const ids = ticketUrl.pathname.match(/-(\d+)\/(\d+)\/?$/);
    if (ids) result.urlIds = { programId: ids[1], eventId: ids[2] };
    const html = await get(ticketUrl.href);
    const readId = (name: string) => html.match(new RegExp(`\\b${name}\\s*=\\s*['"]?(\\d+)`))?.[1];
    const auditId = readId('netaudit_id');
    const eventId = readId('netevent_id');
    const programId = readId('netprogram_id');
    result.pageTitle = html.match(/<title>(.*?)<\/title>/s)?.[1];
    if (!auditId || !eventId || !programId) {
      result.reason = 'No auditorium identifiers in returned page; no inferred free-seat count';
      result.pageTextSample = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').slice(0, 2800);
    } else {
      if (!ids || eventId !== ids[2] || programId !== ids[1]) throw new Error('Ticket URL/page ID mismatch');
      result.ids = { auditId, eventId, programId };
      const chart = JSON.parse(await get(`${ticketUrl.origin}/auditview/audit/${auditId}`));
      const noSectors = readId('noSectors');
      if (!noSectors) throw new Error('Unknown sector mode');
      const query = new URLSearchParams({ audit_id: auditId, event_id: eventId,
        program_id: programId, no_sectors: noSectors, initial_data: '1' });
      const stock = JSON.parse(await get(`${ticketUrl.origin}/auditview/update?${query}`));
      result.stockKeys = Object.keys(stock);
      if (!chart.snapshot?.s || !stock.ticketInitialInfos || stock.error) throw new Error('Unknown seating/stock response');
      const seats = stock.ticketInitialInfos;
      result.statusCounts = {};
      for (const seat of Object.values(seats) as any[]) {
        result.statusCounts[seat.status] = (result.statusCounts[seat.status] ?? 0) + 1;
      }
      const chartIds = new Set<string>();
      const tables: any[] = [];
      for (const sector of chart.snapshot.s) {
        const members: any[] = [];
        for (const row of sector.r ?? []) for (const seat of row.s ?? []) {
          chartIds.add(String(seat.i));
          const state = seats[String(seat.i)];
          if (state?.status === 0 && Number(state.ticket_id) > 0 && Number(state.price) > 0)
            members.push({ id: seat.i, label: seat.l?.t, rowId: row.i });
        }
        if (/asztal/i.test(sector.l?.t ?? '') && members.length >= 2)
          tables.push({ table: sector.l.t, seats: members });
      }
      result.unmappedSeatCount = Object.keys(seats).filter(id => !chartIds.has(id)).length;
      result.freeSeats = Object.entries(seats).filter(([id, s]: [string, any]) =>
        chartIds.has(id) && s.status === 0 && Number(s.ticket_id) > 0 && Number(s.price) > 0).length;
      result.freeSeatIds = Object.entries(seats).filter(([id, s]: [string, any]) =>
        chartIds.has(id) && s.status === 0 && Number(s.ticket_id) > 0 && Number(s.price) > 0)
        .map(([id]) => Number(id));
      result.sameTablePairs = tables;
      result.availability = 'observed';
      result.note = 'Snapshot only; seat restrictions and pair purchaseability are not validated by reservation.';
    }
  } catch (error) { result.reason = String(error); }
  results.push(result);
  console.log(JSON.stringify(result));
}
const output = controlOnly ? 'probe-control-results.json' : 'probe-results.json';
writeFileSync(output, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n');
console.log(`Checked ${results.length} Budapest events; saved ${output}`);
