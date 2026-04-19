import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { CalendarModule } from "./calendar/calendar.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FeedsModule } from "./feeds/feeds.module";
import { GithubModule } from "./github/github.module";
import { LastSeenModule } from "./last-seen/last-seen.module";
import { LineWorksBotModule } from "./line-works-bot/line-works-bot.module";
import { NotionModule } from "./notion/notion.module";
import { StorageModule } from "./storage/storage.module";
import { TaskReferencesModule } from "./task-references/task-references.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";

export default [
  AuthModule,
  DashboardModule,
  FeedsModule,
  NotionModule,
  GithubModule,
  LineWorksBotModule,
  TaskReferencesModule,
  StorageModule,
  LastSeenModule,
  UsersModule,
  AdminModule,
  TasksModule,
  CalendarModule,
];
