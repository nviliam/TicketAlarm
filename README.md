# TicketAlarm

A small Node.js and TypeScript project that watches ticket availability for Tibor Bödőcs performances in Budapest and sends a Gmail notification when at least two suitable seats become available.

I built it to find tickets for a sold-out show without repeatedly checking ticket pages. It became an exercise in HTTP data collection, cautious availability detection, email delivery, and automated execution.

**Project status:** completed for my personal use — I managed to get tickets. Live monitoring is stopped, and the GitHub Actions workflow is manually disabled. The code remains here as a portfolio project.

## How it works

- **HTTP checks:** `probe.ts` reads the Dumaszínház event API, then retrieves the linked Jegy.hu page, seating plan, and stock data using HTTPS GET requests. It uses Node.js's built-in `fetch`; no browser automation is needed.
- **Seat detection:** only seats present in the seating plan with an available status, a positive ticket ID, and a positive price count as free. Two seats at the same table are preferred. Two individually confirmed seats can also trigger a notice, with an explicit warning that adjacency is unconfirmed. An event-level ticket total alone is insufficient.
- **Gmail notifications:** Nodemailer sends an HTML email with a plain-text alternative, performance details, seat information, and a direct ticket link. Unknown availability and snapshots older than ten minutes do not trigger notifications.
- **Persistent state:** notification fingerprints suppress repeated messages for unchanged seats. Local runs use `.ticketalarm/`; Actions runs store state on the separate `ticketalarm-state` branch. Failed sends can be retried, although SMTP delivery and state saving cannot guarantee exactly-once delivery.
- **GitHub Actions:** the workflow installs dependencies, checks types, runs tests, restores state, checks tickets, sends qualifying notices, and saves state. Its retained cron configuration targets roughly five-minute intervals; the workflow is currently disabled on GitHub. Re-enabling it would allow scheduled live checks again.

The project checks availability only. It does not reserve seats, add tickets to a basket, or purchase tickets. Availability is a snapshot, and two observed seats do not guarantee that a pair can be bought together.

## Local setup

Requires **Node.js 24+**, npm, and Git. TypeScript runs directly in Node.js; no build step is needed.

```sh
git clone https://github.com/nviliam/TicketAlarm.git
cd TicketAlarm
npm ci --ignore-scripts
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on macOS/Linux), then fill in:

| Variable | Purpose |
| --- | --- |
| `GMAIL_USER` | Sender's Gmail address |
| `GMAIL_APP_PASSWORD` | Google app password, not the normal account password |
| `NOTIFY_EMAIL` | One recipient or a comma-separated list of recipients |

Google app passwords require an eligible account with two-step verification; see the [Google setup guide](https://support.google.com/accounts/answer/185833). Recipients share the same message and can see each other's addresses in the To field.

Keep credentials in the local `.env` file, which is ignored by Git. Generated probe reports, email previews, and local notification state are ignored too. Never commit real credentials or replace the example values with personal details.

### Offline validation

```sh
npm test
npm run typecheck
```

These checks use fixtures, mocked email delivery, and temporary local Git repositories. They do not query ticket services or send real email. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

### Optional live commands

The following commands are documented for reference; they are not required to explore or validate this completed project.

```sh
npm run probe           # Live HTTP requests; writes probe-results.json
npm run notify:preview  # Reads that report; no email is sent
npm run notify          # Reads .env and sends qualifying real notifications
```

Run a fresh probe before sending: stale, future-dated, or unknown seat data is rejected. `npm run smtp:test` sends a real test email to every configured recipient without querying ticket services. Preserve `.ticketalarm/` between local notification runs to retain duplicate suppression.

The event selection is currently fixed in `probe.ts` to actor ID `6` and Budapest; it is not a general-purpose configurable ticket watcher. The upstream response formats may change.

## Project files

| File | Responsibility |
| --- | --- |
| `probe.ts` | Event discovery and HTTP-based seat checks |
| `notify.ts`, `notifications.ts` | Report validation, notice selection, locking, and duplicate suppression |
| `email.ts`, `email-template.ts`, `smtp-test.ts` | Gmail delivery, HTML/text templates, and an explicit SMTP test |
| `remote-state.ts` | Durable notification state for Actions |
| `.github/workflows/ticket-monitor.yml` | Retained automation configuration; live workflow disabled |
| `*.test.ts` | Notification, email, and state-persistence tests |

For the original investigation and historical observations about the ticket endpoints, see [RESEARCH.md](RESEARCH.md) (Hungarian).

## About this project

TicketAlarm is a personal, free, unofficial ticket watcher. It is not affiliated with, endorsed by, or connected to Dumaszínház or Jegy.hu. It uses no paid monitoring service and offers no availability or delivery guarantee.
