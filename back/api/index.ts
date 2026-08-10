import type { Request, Response } from "express";
import express from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { configureNestApp } from "../src/bootstrap";

const expressServer = express();

declare global {
  var __workTrackingVercelNestApp__: Promise<void> | undefined;
}

function initialize(): Promise<void> {
  if (!globalThis.__workTrackingVercelNestApp__) {
    globalThis.__workTrackingVercelNestApp__ = (async () => {
      const adapter = new ExpressAdapter(expressServer);
      const app = await NestFactory.create(AppModule, adapter, { rawBody: true });
      await configureNestApp(app);
    })();
  }
  return globalThis.__workTrackingVercelNestApp__;
}

export default async function handler(req: Request, res: Response) {
  await initialize();
  return expressServer(req, res);
}
