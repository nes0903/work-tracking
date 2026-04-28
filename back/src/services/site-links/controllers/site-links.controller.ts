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
  createSiteLinkCategory,
  createSiteLink,
  deleteSiteLink,
  listSiteLinkCategories,
  listSiteLinks,
  renameSiteLinkCategory,
  updateSiteLink,
} from "@libs/site-links-db";

interface CreatePayload {
  label?: string;
  url?: string;
  category?: string | null;
}

interface UpdatePayload {
  label?: string;
  url?: string;
  category?: string | null;
  sortOrder?: number;
}

interface CategoryPayload {
  name?: string;
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

  @Get("categories")
  listCategories() {
    return { ok: true, items: listSiteLinkCategories() };
  }

  @Post()
  create(@Body() payload: CreatePayload) {
    const label = assertString(payload.label, "label");
    const url = assertString(payload.url, "url");
    const category =
      typeof payload.category === "string" && payload.category.trim()
        ? payload.category.trim()
        : null;
    const link = createSiteLink({ label, url, category });
    return { ok: true, item: link };
  }

  @Post("categories")
  createCategory(@Body() payload: CategoryPayload) {
    const name = assertString(payload.name, "name");
    return { ok: true, items: createSiteLinkCategory(name) };
  }

  @Patch("categories/:name")
  renameCategory(
    @Param("name") nameParam: string,
    @Body() payload: CategoryPayload,
  ) {
    const oldName = assertString(nameParam, "name");
    const newName = assertString(payload.name, "name");
    return { ok: true, items: renameSiteLinkCategory(oldName, newName) };
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
      category?: string | null;
      sortOrder?: number;
    } = {};
    if (typeof payload.label === "string" && payload.label.trim()) {
      patch.label = payload.label.trim();
    }
    if (typeof payload.url === "string" && payload.url.trim()) {
      patch.url = payload.url.trim();
    }
    if (payload.category === null) {
      patch.category = null;
    } else if (typeof payload.category === "string") {
      const trimmed = payload.category.trim();
      patch.category = trimmed ? trimmed : null;
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
