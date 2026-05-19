# DigiStore Project Context

## Project Overview
DigiStore is an automated digital key store platform with QRIS payment integration, key stock management, and an admin panel. It is a full-stack JavaScript application.

**Main Technologies:**
- **Backend:** Node.js, Express.js
- **Frontend Template Engine:** EJS
- **Database:** Turso (libSQL) using `@libsql/client`
- **Styling:** Tailwind CSS (via CDN)
- **Payment Gateway:** OrderKuota (QRIS generation and validation)
- **Session Management:** `express-session`

## Architecture & File Structure
The project follows a standard Model-View-Controller (MVC) style structure, although the database layer acts directly on schemas.
- `server.js`: The application entry point. Sets up Express, sessions, middleware, and initializes the database connection.
- `db/index.js`: Handles Turso connection and schema initialization.
- `services/payment.js`: Contains logic for creating QRIS transactions and verifying payments.
- `middleware/auth.js`: Admin session guard for protecting admin routes.
- `routes/`: Contains Express routers.
  - `index.js`: Public routes (home, product details, checkout, order status).
  - `admin.js`: Protected routes for admin CRUD operations.
  - `api.js`: Endpoints for polling order status from the frontend.
- `views/`: EJS templates for the frontend interface (both public and admin panels), utilizing layouts via the `partials/` directory.

## Building and Running

### Prerequisites
- Node.js installed.
- Turso CLI installed and authenticated.
- `.env` file configured based on `.env.example`.

### Commands
- **Install dependencies:**
  ```bash
  npm install
  ```
- **Run in Development Mode (with Nodemon):**
  ```bash
  npm run dev
  ```
- **Run in Production Mode:**
  ```bash
  npm start
  ```

## Development Conventions
- **Routing:** Public, Admin, and API routes are strictly separated in the `routes/` directory.
- **Environment Variables:** Used extensively for sensitive information like database credentials (`TURSO_URL`, `TURSO_AUTH_TOKEN`), session secrets, admin credentials, and payment gateway tokens.
- **Payment Flow:** Uses a unique nominal (base price + 3 random digits) mechanism to verify QRIS payments via polling (`/api/order/:id/status`). 
- **Stock Management:** "Keys" (licenses, accounts, etc.) are stored in the database. 1 row = 1 stock item.
