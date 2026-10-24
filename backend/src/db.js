const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function pingDatabase() {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    console.warn('Database not available yet. Falling back to in-memory mode.', error.message);
    return false;
  }
}

module.exports = {
  prisma,
  pingDatabase,
};
