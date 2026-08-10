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
import { AuthGuard } from "../../../common/auth.guard";
import {
  createSiteLinkCategory,
  createSiteLink,
  deleteSiteLink,
  listSiteLinkCategories,
  listSiteLinks,
  renameSiteLinkCategory,
  reorderSiteLinks,
  updateSiteLink,
} from "../../../libs/site-links-db";

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

interface ReorderPayload {
  items?: Array<{
    id?: number;
    category?: string | null;
    sortOrder?: number;
  }>;
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
  async list() {
    return { ok: true, items: await listSiteLinks() };
  }

  @Get("categories")
  async listCategories() {
    return { ok: true, items: await listSiteLinkCategories() };
  }

  @Post()
  async create(@Body() payload: CreatePayload) {
    const label = assertString(payload.label, "label");
    const url = assertString(payload.url, "url");
    const category =
      typeof payload.category === "string" && payload.category.trim()
        ? payload.category.trim()
        : null;
    const link = await createSiteLink({ label, url, category });
    return { ok: true, item: link };
  }

  @Post("categories")
  async createCategory(@Body() payload: CategoryPayload) {
    const name = assertString(payload.name, "name");
    return { ok: true, items: await createSiteLinkCategory(name) };
  }

  @Patch("categories/:name")
  async renameCategory(
    @Param("name") nameParam: string,
    @Body() payload: CategoryPayload,
  ) {
    const oldName = assertString(nameParam, "name");
    const newName = assertString(payload.name, "name");
    return {
      ok: true,
      items: await renameSiteLinkCategory(oldName, newName),
    };
  }

  @Patch("reorder")
  async reorder(@Body() payload: ReorderPayload) {
    const items = Array.isArray(payload.items)
      ? payload.items
          .filter((item) => Number.isInteger(item.id) && item.id! > 0)
          .map((item, index) => ({
            id: item.id!,
            category:
              typeof item.category === "string" && item.category.trim()
                ? item.category.trim()
                : null,
            sortOrder:
              typeof item.sortOrder === "number" &&
              Number.isFinite(item.sortOrder)
                ? Math.floor(item.sortOrder)
                : index,
          }))
      : [];
    return { ok: true, items: await reorderSiteLinks(items) };
  }

  @Patch(":id")
  async update(@Param("id") idParam: string, @Body() payload: UpdatePayload) {
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
    if (
      typeof payload.sortOrder === "number" &&
      Number.isFinite(payload.sortOrder)
    ) {
      patch.sortOrder = Math.floor(payload.sortOrder);
    }
    const link = await updateSiteLink(id, patch);
    if (!link) {
      throw new HttpException(
        { ok: false, error: "Site link not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    return { ok: true, item: link };
  }

  @Delete(":id")
  async remove(@Param("id") idParam: string) {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(
        { ok: false, error: "Invalid id" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const ok = await deleteSiteLink(id);
    if (!ok) {
      throw new HttpException(
        { ok: false, error: "Site link not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    return { ok: true };
  }
}
