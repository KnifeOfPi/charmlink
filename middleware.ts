import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isBot } from "./lib/bot-detect";

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");
  const response = NextResponse.next();

  if (isBot(userAgent)) {
    response.headers.set("x-is-bot", "true");
  } else {
    response.headers.set("x-is-bot", "false");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
