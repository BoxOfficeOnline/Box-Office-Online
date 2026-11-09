# Box Office Online

Box Office Online is a movie-ticketing web application. Its React client provides ticket purchasing and validation, account creation and login, account management, and a view of tickets associated with an account. The Express API connects to MySQL and handles ticket and account operations.

## Project structure

- `Client/` — React 19, TypeScript, and Vite single-page application.
- `Server/` — Express 5 API written in TypeScript.
- `data.sql` — SQL definitions for the `theaters`, `movies`, `users`, `formats`, `showing`, `purchases`, and `tickets` tables and their foreign keys.

## Requirements

- Node.js and npm
- A MySQL database created with `data.sql`

## Run locally

Install dependencies in each application directory:

```sh
cd Server
npm ci

cd ../Client
npm ci
```

Configure the API's MySQL connection in `Server/.env`:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=boxofficedb
```

The API defaults to port `5000`. `DB_PORT` defaults to `3306`; `DB_HOST`, `DB_USER`, and `DB_NAME` also have defaults in the server code. Set `DB_PASSWORD` to the password for your database user. Do not commit credentials.

For the administrator CSV import, also configure an Anthropic API key and a Claude model available to your account on the API server:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=your_claude_model
```

Only CSV column headers are sent to Anthropic for column mapping; the CSV rows are parsed and checked on the server. An Anthropic account and API access are required. Never put the key in client code or commit it.

Start the API and client in separate terminals:

```sh
# Terminal 1
cd Server
npm run dev
```

```sh
# Terminal 2
cd Client
npm run dev
```

Vite serves the client at `http://localhost:5173`. Account and purchase API calls use `http://localhost:5000` in development. Ticket validation still calls the deployed API directly, even when the client is running locally.

## Available scripts

Run these from the relevant directory:

| Directory | Command | Description |
| --- | --- | --- |
| `Client/` | `npm run dev` | Start the Vite development server. |
| `Client/` | `npm run build` | Type-check and create a production client build. |
| `Client/` | `npm run preview` | Preview the production build locally. |
| `Client/` | `npm run lint` | Run ESLint. |
| `Server/` | `npm run dev` | Start the API with automatic restarts. |
| `Server/` | `npm start` | Start the API with `ts-node`. |
| `Server/` | `npm run build` | Compile the API TypeScript. |
| `Server/` | `npm test` | Run showtime import tests. |
| `Server/` | `npm run dev-all` | Start the API and client development servers together. |

## Client routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/movies` | Ticket purchase form |
| `/purchase/:ticketId` | Purchase confirmation and barcode |
| `/scan` | Ticket validation |
| `/login` | Login |
| `/createAccount` | Account registration |
| `/account` | Account details |
| `/change` | Update account details |
| `/tickets` | Account tickets |
| `/logout` | Logout |
| `/delete` | Delete account |
| `/addshowtime` | Administrator movie and showtime management |

## Import showtimes

Sign in as an administrator and open the Admin Dashboard. Upload a UTF-8 CSV of up to 1 MB and 500 data records with these columns:

```csv
movie,datetime,theater,format
Example Movie,2026-12-01 19:30,Main Theater,2D
```

Movie and theater values are existing names, not IDs; the format must already exist for that theater. Use `YYYY-MM-DD HH:MM` or `YYYY-MM-DD HH:MM:SS` for the theater's local time; timezone offsets and ambiguous date formats are not accepted. Standard quoted CSV fields are supported. Each name must match exactly one database record under the database's collation.

The preview reports missing or ambiguous matches, invalid dates, and duplicate showtimes. The administrator must review and approve the valid rows; rejected rows are not imported. The server checks valid rows again at approval, reports any that became invalid, and inserts the remaining rows in one transaction. Validation cannot independently establish whether a schedule is correct, so review the source data. Previews expire after 15 minutes or a server restart.

## API overview

The API listens on `PORT` if provided, otherwise port `5000`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | API health response. |
| `GET` | `/api/barcode` | Generate a PNG barcode; accepts `text`, `type`, `scale`, `height`, `includetext`, and `textalign` query parameters. |
| `GET` | `/api/theaters` | List theaters for account assignment. |
| `GET` | `/api/formats` | List ticket formats, optionally filtered by `theaterId`. |
| `GET` | `/api/movies` | List movies. |
| `GET` | `/api/showings` | List showtimes with movie, theater, and format details. |
| `POST` | `/api/showings/import/preview` | Admin-only CSV parsing and validation; returns a short-lived preview. |
| `POST` | `/api/showings/import` | Admin-only approval and transactional import of a preview's valid rows. |
| `POST` | `/api/purchase` | Create a purchase and its associated ticket in one transaction. |
| `POST` | `/api/validate` | Check whether a ticket ID exists. |
| `POST` | `/api/account` | Create an account. |
| `POST` | `/api/login` | Log in and return an account and session token. |
| `GET` | `/api/account/:id` | Read an account. |
| `PUT` | `/api/account/:id` | Update account details. |
| `GET` | `/api/account/:id/tickets` | List an account's tickets. |
| `POST` | `/api/logout` | End the current session. |
| `DELETE` | `/api/account/:id` | Delete an account and its tickets. |

Account-specific endpoints require a valid session for that account or an administrator session. API sessions are held in server memory and are cleared when the server restarts.

The database script describes the current schema for a new database. It is not a migration script; back up and migrate existing databases before applying schema changes. The showtime admin form requires formats to exist for each theater before showings can be added.

## Deployment notes

The client includes Azure Static Web Apps configuration in `Client/staticwebapp.config.json`, including SPA fallback routing and a rewrite of `/api/*` requests to the deployed API. The client account API and some page actions also contain the deployed API URL directly; update those API targets when configuring a different deployment.
