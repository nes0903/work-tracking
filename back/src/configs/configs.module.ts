import path from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.join(__dirname, "..", "..", ".env.local"),
        path.join(__dirname, "..", "..", ".env"),
      ],
    }),
  ],
})
export class ConfigsModule {}
