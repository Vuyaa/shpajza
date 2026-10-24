# Shpajza backend

This is the first increment of the Shpajza mobile app backend.

## Current scope

- inventory CRUD endpoints
- recipe data model
- recipe-to-inventory matching logic
- auth with registration, login and JWT validation
- app foundation ready for real database integration next

## Local setup

1. Copy `.env.example` to `.env`
2. Install dependencies:
   npm install
3. Start the API:
   npm run dev

## API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (requires Bearer token)
- `GET /api/inventory`
- `POST /api/inventory`
- `GET /api/recipes`
- `GET /api/recipes/match`

## Next step

Move the in-memory user and inventory data to a real database and connect each user to their own inventory and recipe records.

