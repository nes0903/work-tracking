import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import { listUsers } from "@libs/users-db";

@Controller("api/users")
@UseGuards(AuthGuard)
export class UsersController {
  @Get()
  list() {
    return {
      ok: true,
      items: listUsers().map((u) => ({
        userId: u.userId,
        userName: u.userName,
        email: u.email,
        lastLoginAt: u.lastLoginAt,
      })),
    };
  }
}
