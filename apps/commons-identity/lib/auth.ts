import { betterAuth } from "better-auth";
import { pool } from "@/lib/db";
import { commonsAuthOptions } from "@/lib/auth-config";

export const auth = betterAuth(commonsAuthOptions(pool));
