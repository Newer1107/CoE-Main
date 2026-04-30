import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { useSecureCookies } from "@/lib/api-helpers";
import { DEFAULT_CALLBACK_URL, isValidCallbackUrl } from "@/lib/callback-url";
import { getSharedCookieOptions, SHARED_COOKIE_NAME } from "@/lib/shared-auth";

const clearAuthCookies = (
  response: NextResponse,
  secureCookies: boolean,
  sharedCookieOptions: ReturnType<typeof getSharedCookieOptions>,
) => {
  response.cookies.set("accessToken", "", {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set("refreshToken", "", {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set(SHARED_COOKIE_NAME, "", {
    ...sharedCookieOptions,
    maxAge: 0,
  });
};

export async function POST() {
  const secureCookies = useSecureCookies();
  const sharedCookieOptions = getSharedCookieOptions();
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
    data: null,
  });
  clearAuthCookies(response, secureCookies, sharedCookieOptions);
  return response;
}

export async function GET(request: NextRequest) {
  const secureCookies = useSecureCookies();
  const sharedCookieOptions = getSharedCookieOptions();

  const callbackUrl = request.nextUrl.searchParams.get("callbackUrl") || "";
  const resolvedCallbackUrl = isValidCallbackUrl(callbackUrl)
    ? callbackUrl
    : DEFAULT_CALLBACK_URL;

  const response = NextResponse.redirect(resolvedCallbackUrl);
  clearAuthCookies(response, secureCookies, sharedCookieOptions);

  return response;
}
