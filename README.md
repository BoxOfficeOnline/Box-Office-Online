# Box Office Online

Box Office Online is a movie-ticketing web application. Its React client provides ticket purchasing and validation, account creation and login, account management, and a view of tickets associated with an account. The Express API connects to MySQL and handles ticket and account operations.

## Project structure

- `Client/` — React 19, TypeScript, and Vite single-page application.
- `Server/` — Express 5 API written in TypeScript.
- `data.sql` — SQL definitions for the `theaters`, `movies`, `users`, `showing`, and `tickets` tables and their foreign keys.

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

## API overview

The API listens on `PORT` if provided, otherwise port `5000`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | API health response. |
| `GET` | `/api/barcode` | Generate a PNG barcode; accepts `text`, `type`, `scale`, `height`, `includetext`, and `textalign` query parameters. |
| `GET` | `/api/theaters` | List theaters for account assignment. |
| `GET` | `/api/movies` | List movies. |
| `GET` | `/api/showings` | List showtimes with movie and theater details. |
| `POST` | `/api/purchase` | Create a ticket purchase. |
| `POST` | `/api/validate` | Check whether a ticket ID exists. |
| `POST` | `/api/account` | Create an account. |
| `POST` | `/api/login` | Log in and return an account and session token. |
| `GET` | `/api/account/:id` | Read an account. |
| `PUT` | `/api/account/:id` | Update account details. |
| `GET` | `/api/account/:id/tickets` | List an account's tickets. |
| `POST` | `/api/logout` | End the current session. |
| `DELETE` | `/api/account/:id` | Delete an account and its tickets. |

Account-specific endpoints require a valid session for that account or an administrator session. API sessions are held in server memory and are cleared when the server restarts.

## Deployment notes

The client includes Azure Static Web Apps configuration in `Client/staticwebapp.config.json`, including SPA fallback routing and a rewrite of `/api/*` requests to the deployed API. The client account API and some page actions also contain the deployed API URL directly; update those API targets when configuring a different deployment.
