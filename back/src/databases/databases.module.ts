import { Module, OnModuleInit } from "@nestjs/common";
import { getDatabase } from "@libs/postgres-db";

class PostgresBootstrapService implements OnModuleInit {
  async onModuleInit() {
    await getDatabase().exec("SELECT 1");
  }
}

@Module({
  providers: [PostgresBootstrapService],
  exports: [PostgresBootstrapService],
})
export class DatabasesModule {}
