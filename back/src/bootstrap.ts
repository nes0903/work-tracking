import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import compression from "compression";
import { AppModule } from "./app.module";

function corsOrigins(): string[] {
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return Array.from(new Set([...defaults, ...configured]));
}

export async function configureNestApp(
  app: INestApplication,
): Promise<INestApplication> {
  app.enableCors({
    origin: corsOrigins(),
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
  await app.init();
  return app;
}

export async function createStandaloneNestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  return configureNestApp(app);
}
