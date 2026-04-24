import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "@common/auth.guard";
import {
  createReference,
  deleteReference,
  listReferencesByTaskIds,
  listReferencesForTask,
  type ReferenceSource,
} from "@libs/task-references-db";

const ALLOWED_SOURCES: ReferenceSource[] = [
  "line_works_message",
  "line_works_attachment",
  "notion_page",
  "site_link",
  "figma_node",
  "url",
];

function assertSource(value: unknown): ReferenceSource {
  if (typeof value !== "string" || !ALLOWED_SOURCES.includes(value as ReferenceSource)) {
    throw new HttpException(
      { ok: false, error: `Invalid source: ${value}` },
      HttpStatus.BAD_REQUEST,
    );
  }
  return value as ReferenceSource;
}

interface CreatePayload {
  taskId?: string;
  source?: string;
  externalId?: string;
  title?: string | null;
  excerpt?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Controller("api/task-references")
@UseGuards(AuthGuard)
export class TaskReferencesController {
  @Post()
  create(@Body() payload: CreatePayload, @Req() req: Request) {
    const taskId = payload.taskId?.trim();
    const externalId = payload.externalId?.trim();
    if (!taskId) {
      throw new HttpException(
        { ok: false, error: "taskId is required" },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!externalId) {
      throw new HttpException(
        { ok: false, error: "externalId is required" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const source = assertSource(payload.source);

    const reference = createReference({
      taskId,
      source,
      externalId,
      title: payload.title ?? null,
      excerpt: payload.excerpt ?? null,
      externalUrl: payload.externalUrl ?? null,
      metadata: payload.metadata ?? null,
      createdBy: req.auth?.userId ?? null,
    });

    return { ok: true, reference };
  }

  @Delete(":id")
  remove(@Param("id") idParam: string) {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(
        { ok: false, error: "Invalid id" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const ok = deleteReference(id);
    if (!ok) {
      throw new HttpException(
        { ok: false, error: "Reference not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    return { ok: true };
  }

  @Get()
  list(@Query("taskIds") taskIdsParam?: string) {
    if (!taskIdsParam) {
      return { ok: true, references: {} };
    }
    const taskIds = taskIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const grouped = listReferencesByTaskIds(taskIds);
    const references: Record<string, unknown[]> = {};
    for (const [taskId, list] of grouped.entries()) {
      references[taskId] = list;
    }
    return { ok: true, references };
  }

  @Get("task/:taskId")
  listForTask(@Param("taskId") taskId: string) {
    return { ok: true, references: listReferencesForTask(taskId) };
  }
}
