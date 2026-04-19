import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import {
  deleteAttachmentRow,
  getAttachmentById,
  listAllAttachments,
  listChannelMeta,
} from "@libs/line-works-bot-db";
import { deleteObject, sanitizeChannelSegment } from "@libs/s3";

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
    const rows = listAllAttachments();

    const channelLabels: Record<string, ChannelLabel> = {};
    for (const meta of listChannelMeta()) {
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
        s3Bucket: row.s3Bucket,
        s3Key: row.s3Key,
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
    const row = getAttachmentById(id);
    if (!row) {
      throw new HttpException(
        { ok: false, error: "Attachment not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      await deleteObject(row.s3Bucket, row.s3Key);
    } catch (err) {
      console.error("[storage] S3 delete failed", err);
      throw new HttpException(
        { ok: false, error: "S3 delete failed" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    deleteAttachmentRow(id);
    return { ok: true };
  }
}
