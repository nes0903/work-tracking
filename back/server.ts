import { NestFactory } from "@nestjs/core";
import { AppModule } from "./src/app.module";
import { configureNestApp } from "./src/bootstrap";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  await configureNestApp(app);
  await app.listen(Number(process.env.PORT || 3000));
}

void bootstrap();
