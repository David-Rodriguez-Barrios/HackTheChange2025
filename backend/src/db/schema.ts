import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const streams = pgTable('streams', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Stream = typeof streams.$inferSelect;
export type NewStream = typeof streams.$inferInsert;


