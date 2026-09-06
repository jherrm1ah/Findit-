#!/usr/bin/env node
// Creates the first (or an additional) admin account directly in Supabase.
//
// There is no self-service "I'm an admin" signup screen — on purpose, admin
// access shouldn't be something anyone can grant themselves through the UI.
// This replaces the old behavior where the app auto-created a fixed
// 08000000000 / admin1234 admin account on every startup, which is exactly
// the kind of hardcoded fake credential a real app shouldn't ship with.
//
// Usage:
//   node --env-file=.env.local scripts/create-admin.mjs --phone 0801234567 --password "a real password" --name "Your Name"
//
// (Node 20.6+ supports --env-file directly. On an older Node, export
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY yourself before running this.)

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      args[key] = value;
      i++;
    }
  }
  return args;
}

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, "");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.phone || !args.password || !args.name) {
    console.error(
      'Usage: node --env-file=.env.local scripts/create-admin.mjs --phone <phone> --password <password> --name "<name>"'
    );
    process.exit(1);
  }
  if (args.password.length < 8) {
    console.error("Use a real password (at least 8 characters) — this account has full admin access.");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local, " +
        "or export those two variables yourself first."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const phone = normalizePhone(args.phone);

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id, role")
    .eq("phone", phone)
    .maybeSingle();
  if (lookupError) {
    console.error("Couldn't check for an existing account:", lookupError.message);
    process.exit(1);
  }
  if (existing) {
    console.error(`An account with phone ${phone} already exists (role: ${existing.role}).`);
    process.exit(1);
  }

  const id = "u_" + crypto.randomBytes(12).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(args.password, salt);

  const { error: insertError } = await supabase.from("users").insert({
    id,
    phone,
    password_hash: passwordHash,
    password_salt: salt,
    name: args.name,
    role: "admin",
    business_name: null,
  });
  if (insertError) {
    console.error("Couldn't create the admin account:", insertError.message);
    process.exit(1);
  }

  console.log(`Admin account created for ${args.name} (${phone}). Log in with that phone number and password.`);
}

main();
