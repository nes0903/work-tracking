import { Module } from "@nestjs/common";
import { StorageController } from "./controllers/storage.controller";

@Module({
  controllers: [StorageController],
})
export class StorageModule {}
