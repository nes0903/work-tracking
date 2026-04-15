import { Module, OnModuleInit } from "@nestjs/common";
import { getDatabase } from "@libs/sqlite-db";

class SqliteBootstrapService implements OnModuleInit {
  onModuleInit() {
    getDatabase();
  }
}

@Module({
  providers: [SqliteBootstrapService],
  exports: [SqliteBootstrapService],
})
export class DatabasesModule {}
