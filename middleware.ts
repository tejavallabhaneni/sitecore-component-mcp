import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.MCP_SHARED_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
