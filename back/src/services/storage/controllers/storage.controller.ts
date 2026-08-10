import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../../../common/auth.guard";
import {
  deleteAttachmentRow,
  getAttachmentById,
  listAllAttachments,
  listChannelMeta,
} from "../../../libs/line-works-bot-db";
import {
  deleteStorageObject,
  sanitizeChannelSegment,
} from "../../../libs/supabase-storage";

interface ChannelLabel {
  channelId: string;
  title: string | null;
  channelType: string | null;
}

@Controller("api/storage")
@UseGuards(AuthGuard)
export class StorageController {
  @Get("files")
  async list() {
    const rows = await listAllAttachments();

    const channelLabels: Record<string, ChannelLabel> = {};
    for (const meta of await listChannelMeta()) {
      const key = sanitizeChannelSegment(meta.channelId);
      channelLabels[key] = {
        channelId: meta.channelId,
        title: meta.title,
        channelType: meta.channelType,
      };
    }

    return {
      ok: true,
      items: rows.map((row) => ({
        id: row.id,
        messageId: row.messageId,
        fileId: row.fileId,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        storageBucket: row.storageBucket,
        storagePath: row.storagePath,
        uploadedAt: row.uploadedAt,
      })),
      channelLabels,
    };
  }

  @Delete("files/:id")
  async remove(@Param("id") idParam: string) {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(
        { ok: false, error: "Invalid attachment id" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const row = await getAttachmentById(id);
    if (!row) {
      throw new HttpException(
        { ok: false, error: "Attachment not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      await deleteStorageObject(row.storageBucket, row.storagePath);
    } catch (err) {
      console.error("[storage] Supabase Storage delete failed", err);
      throw new HttpException(
        { ok: false, error: "Storage delete failed" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    await deleteAttachmentRow(id);
    return { ok: true };
  }
}
