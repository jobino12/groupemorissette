import type { Context, MiddlewareFn } from "telegraf";
import { config } from "./config.js";
import { log } from "./logger.js";

const allowed = new Set(config.allowedUserIds);

export const authMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !allowed.has(userId)) {
    log.warn(
      { userId, username: ctx.from?.username, chatId: ctx.chat?.id },
      "auth.rejected",
    );
    return;
  }
  return next();
};
