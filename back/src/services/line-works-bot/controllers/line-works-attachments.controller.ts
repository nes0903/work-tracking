import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import { getAttachmentById } from "@libs/line-works-bot-db";
import { presignGetUrl } from "@libs/s3";

@Controller("api/line-works-attachments")
@UseGuards(AuthGuard)
export class LineWorksAttachmentsController {
  @Get(":id")
  async resolve(@Param("id") idParam: string) {
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

    const url = await presignGetUrl(row.s3Bucket, row.s3Key);
    return {
      ok: true,
      attachment: {
        id: row.id,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        messageId: row.messageId,
      },
      url,
    };
  }
}
