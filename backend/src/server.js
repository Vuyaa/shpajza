require('dotenv').config();

const app = require('./app');
const { pingDatabase } = require('./db');

const port = Number(process.env.PORT || 4000);

(async () => {
  const databaseReady = await pingDatabase();
  app.locals.dbReady = databaseReady;

  app.listen(port, () => {
    console.log(`Shpajza backend is running on http://localhost:${port}`);
    console.log(databaseReady ? 'Database connected via PostgreSQL.' : 'Database unavailable; using in-memory fallback mode.');
  });
})();

