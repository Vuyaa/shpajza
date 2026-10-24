# Shpajza app roadmap

This repository now contains the first backend milestone for the mobile food-inventory application.

## Current milestone

- inventory endpoint
- recipe data model
- recipe-to-inventory matching logic
- backend API foundation ready for authentication and database integration

## Next steps

1. Add user registration/login with JWT or session auth.
2. Replace mock inventory data with a real database layer.
3. Add expiry tracking and reminder notifications.
4. Expand recipe matching to support partial ingredient suggestions.
5. Build the mobile client on top of the API.

## Backend entry point

- [backend/README.md](backend/README.md)
- [backend/src/app.js](backend/src/app.js)
- [backend/src/services/recipeMatcher.js](backend/src/services/recipeMatcher.js)

## Local run

From the backend folder:

```bash
npm install
npm run dev
```

Then test:

- GET /api/health
- GET /api/inventory
- GET /api/recipes/match

