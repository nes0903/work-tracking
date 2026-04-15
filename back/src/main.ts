import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import compression from "compression";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
  });
  app.use(compression());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: false,
    }),
  );

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
}

void bootstrap();
