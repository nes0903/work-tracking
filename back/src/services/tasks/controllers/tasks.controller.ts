import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "@common/auth.guard";
import {
  queryTasks,
  type SortKey,
  type TaskPriority,
  type TaskStatus,
} from "@libs/tasks-query-db";

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

@Controller("api/tasks")
@UseGuards(AuthGuard)
export class TasksController {
  @Get()
  async list(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("assignee") assignee: string | undefined,
    @Query("creator") creator: string | undefined,
    @Query("status") status: string | undefined,
    @Query("priority") priority: string | undefined,
    @Query("category") category: string | undefined,
    @Query("q") q: string | undefined,
    @Query("sort") sort: string | undefined,
    @Query("order") order: string | undefined,
    @Query("page") page: string | undefined,
    @Query("perPage") perPage: string | undefined,
    @Req() req: Request,
  ) {
    const result = await queryTasks({
      from: from || null,
      to: to || null,
      assignee: assignee || null,
      creator: creator || null,
      statuses: parseList(status) as TaskStatus[],
      priorities: parseList(priority) as TaskPriority[],
      category: category || null,
      q: q || null,
      sort: ["priority", "due", "created"].includes(sort ?? "")
        ? (sort as SortKey)
        : "priority",
      order: order === "asc" ? "asc" : "desc",
      page: toPositiveInt(page, 1),
      perPage: toPositiveInt(perPage, 20),
      sessionUserId: req.auth?.userId ?? null,
    });
    return { ok: true, ...result };
  }
}
