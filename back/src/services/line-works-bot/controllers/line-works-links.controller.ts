import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import { getLineWorksLinkById } from "@libs/line-works-bot-db";
import { getOrFetchLinkPreview } from "@libs/line-works-link-preview";
import { createSiteLink, findSiteLinkByUrl } from "@libs/site-links-db";

function parseId(idParam: string): number {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpException(
      { ok: false, error: "Invalid link id" },
      HttpStatus.BAD_REQUEST,
    );
  }
  return id;
}

function requireLink(id: number) {
  const link = getLineWorksLinkById(id);
  if (!link) {
    throw new HttpException(
      { ok: false, error: "Link not found" },
      HttpStatus.NOT_FOUND,
    );
  }
  return link;
}

function labelFromUrl(url: string): string {
  try {
    const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(candidate);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

@Controller("api/line-works-links")
@UseGuards(AuthGuard)
export class LineWorksLinksController {
  @Get(":id/preview")
  async preview(@Param("id") idParam: string) {
    const link = requireLink(parseId(idParam));
    const preview = await getOrFetchLinkPreview(link.url);
    return { ok: true, preview };
  }

  @Post(":id/save")
  async save(@Param("id") idParam: string) {
    const link = requireLink(parseId(idParam));
    const existing = findSiteLinkByUrl(link.url);
    if (existing) {
      return { ok: true, item: existing, alreadySaved: true };
    }

    const preview = await getOrFetchLinkPreview(link.url);
    const label =
      (preview.status === "success" && preview.title?.trim()) ||
      preview.siteName ||
      labelFromUrl(link.url);
    const item = createSiteLink({
      label,
      url: link.url,
      category: "Works",
    });
    return { ok: true, item, alreadySaved: false };
  }
}
