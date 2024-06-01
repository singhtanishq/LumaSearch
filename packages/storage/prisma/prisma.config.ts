// Prisma 7+ configuration
import { defineConfig } from 'prisma/config';

export default defineConfig({
  datasources: {
    db: {
      url: env('DATABASE_URL'),
    },
  },
});