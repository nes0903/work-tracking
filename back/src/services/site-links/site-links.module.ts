import { Module } from "@nestjs/common";
import { SiteLinksController } from "./controllers/site-links.controller";

@Module({ controllers: [SiteLinksController] })
export class SiteLinksModule {}
