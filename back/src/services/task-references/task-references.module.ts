import { Module } from "@nestjs/common";
import { TaskReferencesController } from "./controllers/task-references.controller";

@Module({
  controllers: [TaskReferencesController],
})
export class TaskReferencesModule {}
