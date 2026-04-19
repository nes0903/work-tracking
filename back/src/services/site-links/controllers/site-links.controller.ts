import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import {
  createSiteLink,
  deleteSiteLink,
  listSiteLinks,
  updateSiteLink,
} from "@libs/site-links-db";

interface CreatePayload {
  label?: string;
  url?: string;
}

interface UpdatePayload {
  label?: string;
  url?: string;
  sortOrder?: number;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpException(
      { ok: false, error: `${field} is required` },
      HttpStatus.BAD_REQUEST,
    );
  }
  return value.trim();
}

@Controller("api/site-links")
@UseGuards(AuthGuard)
export class SiteLinksController {
  @Get()
  list() {
    return { ok: true, items: listSiteLinks() };
  }

  @Post()
  create(@Body() payload: CreatePayload) {
    const label = assertString(payload.label, "label");
    const url = assertString(payload.url, "url");
    const link = createSiteLink({ label, url });
    return { ok: true, item: link };
  }

  @Patch(":id")
  update(@Param("id") idParam: string, @Body() payload: UpdatePayload) {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(
        { ok: false, error: "Invalid id" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const patch: {
      label?: string;
      url?: string;
      sortOrder?: number;
    } = {};
    if (typeof payload.label === "string" && payload.label.trim()) {
      patch.label = payload.label.trim();
    }
    if (typeof payload.url === "string" && payload.url.trim()) {
      patch.url = payload.url.trim();
    }
    if (typeof payload.sortOrder === "number" && Number.isFinite(payload.sortOrder)) {
      patch.sortOrder = Math.floor(payload.sortOrder);
    }
    const link = updateSiteLink(id, patch);
    if (!link) {
      throw new HttpException(
        { ok: false, error: "Site link not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    return { ok: true, item: link };
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
    const ok = deleteSiteLink(id);
    if (!ok) {
      throw new HttpException(
        { ok: false, error: "Site link not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    return { ok: true };
  }
}
