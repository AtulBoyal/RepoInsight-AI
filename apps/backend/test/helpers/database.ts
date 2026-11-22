import { PGlite } from "@electric-sql/pglite";

import { migrate, type Database } from "../../src/db/database.js";

/**
 * A real Postgres (PGlite, in memory) behind the app's Database
 * interface, with the schema applied.
 */
export async function createTestDatabase(): Promise<Database & { pglite: PGlite }> {
  const pglite = new PGlite();

  const db = {
    pglite,
    async query<Row>(text: string, params?: unknown[]) {
      const result = await pglite.query<Row>(text, params);

      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    close: () => pglite.close(),
  };

  await migrate(db);

  return db;
}
