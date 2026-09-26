import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const COOKIE_NAME = "smartcrm_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

export async function createSession(userId: string) {
  const token = jwt.sign({ sub: userId }, sessionSecret(), { expiresIn: SESSION_SECONDS });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getUserId() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, sessionSecret());
    const userId = typeof payload === "string" ? null : payload.sub;
    return userId && mongoose.isValidObjectId(userId) ? userId : null;
  } catch {
    return null;
  }
}