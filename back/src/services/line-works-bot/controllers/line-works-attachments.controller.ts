import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../../../common/auth.guard";
import { getAttachmentById } from "../../../libs/line-works-bot-db";
import { createSignedDownloadUrl } from "../../../libs/supabase-storage";

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

    const row = await getAttachmentById(id);
    if (!row) {
      throw new HttpException(
        { ok: false, error: "Attachment not found" },
        HttpStatus.NOT_FOUND,
      );
    }

    const url = await createSignedDownloadUrl(
      row.storageBucket,
      row.storagePath,
    );
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
