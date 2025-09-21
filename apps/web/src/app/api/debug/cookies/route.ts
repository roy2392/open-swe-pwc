import { NextRequest, NextResponse } from "next/server";
import { GITHUB_INSTALLATION_ID_COOKIE } from "@openswe/shared/constants";

export async function GET(request: NextRequest) {
  const cookies = {
    installation_id: request.cookies.get(GITHUB_INSTALLATION_ID_COOKIE)?.value,
    all_cookies: request.cookies.getAll().map(cookie => ({
      name: cookie.name,
      value: cookie.value
    }))
  };

  return NextResponse.json({
    message: "Cookie debug info",
    cookies,
    headers: Object.fromEntries(request.headers.entries())
  });
}