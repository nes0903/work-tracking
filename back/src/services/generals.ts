import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FeedsModule } from "./feeds/feeds.module";
import { GithubModule } from "./github/github.module";
import { NotionModule } from "./notion/notion.module";

export default [AuthModule, DashboardModule, FeedsModule, NotionModule, GithubModule];
