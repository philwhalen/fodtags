// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { expenses, type ExpenseCategory } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (expense effects on reserves
 * are computed in the engine, Spec 09 §9.2).
 */

export interface InsertExpenseInput {
  seasonYear: number;
  spentDate: string;
  amountCents: number;
  category: ExpenseCategory;
  description: string;
}

export function listExpenses(seasonYear: number) {
  return db.select().from(expenses).where(eq(expenses.seasonYear, seasonYear)).all();
}

export function getExpense(id: number) {
  return db.select().from(expenses).where(eq(expenses.id, id)).get();
}

export function insertExpense(input: InsertExpenseInput): number {
  const result = db.insert(expenses).values(input).run();
  return Number(result.lastInsertRowid);
}

export function deleteExpense(id: number): void {
  db.delete(expenses).where(eq(expenses.id, id)).run();
}
