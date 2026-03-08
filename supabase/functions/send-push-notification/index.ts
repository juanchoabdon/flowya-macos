import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "com.javaventures.flowya";
const APNS_KEY_BASE64 = Deno.env.get("APNS_KEY_BASE64")!;

interface PushPayload {
  type: "due_reminder" | "cross_device_sync" | "weekly_planning";
  user_id?: string;
  todo_id?: string;
  title?: string;
  body?: string;
}

serve(async (req) => {
  try {
    const payload: PushPayload = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (payload.type) {
      case "due_reminder":
        return await handleDueReminder(supabase, payload);
      case "cross_device_sync":
        return await handleCrossDeviceSync(supabase, payload);
      case "weekly_planning":
        return await handleWeeklyPlanning(supabase, payload);
      default:
        return new Response(JSON.stringify({ error: "Unknown type" }), {
          status: 400,
        });
    }
  } catch (err) {
    console.error("Push notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});

async function handleDueReminder(supabase: any, payload: PushPayload) {
  if (!payload.user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
    });
  }

  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", payload.user_id)
    .eq("platform", "ios");

  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }));
  }

  let sent = 0;
  for (const { token } of tokens) {
    const success = await sendAPNs(token, {
      aps: {
        alert: {
          title: payload.title || "Task due soon",
          body: payload.body || "You have a task due soon",
        },
        sound: "default",
        category: "DUE_SOON",
      },
      todoId: payload.todo_id,
    });
    if (success) sent++;
  }

  return new Response(JSON.stringify({ sent }));
}

async function handleCrossDeviceSync(supabase: any, payload: PushPayload) {
  if (!payload.user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
    });
  }

  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", payload.user_id)
    .eq("platform", "ios");

  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }));
  }

  let sent = 0;
  for (const { token } of tokens) {
    const success = await sendAPNs(token, {
      aps: {
        "content-available": 1,
      },
    });
    if (success) sent++;
  }

  return new Response(JSON.stringify({ sent }));
}

async function handleWeeklyPlanning(supabase: any, payload: PushPayload) {
  if (!payload.user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
    });
  }

  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", payload.user_id)
    .eq("platform", "ios");

  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }));
  }

  let sent = 0;
  for (const { token } of tokens) {
    const success = await sendAPNs(token, {
      aps: {
        alert: {
          title: "Plan your week",
          body: "Set your weekly goals and let AI map them to tasks",
        },
        sound: "default",
        category: "MORNING_NUDGE",
      },
    });
    if (success) sent++;
  }

  return new Response(JSON.stringify({ sent }));
}

async function sendAPNs(
  deviceToken: string,
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const jwt = await createAPNsJWT();
    const isProduction = true;
    const host = isProduction
      ? "api.push.apple.com"
      : "api.sandbox.push.apple.com";

    const response = await fetch(
      `https://${host}/3/device/${deviceToken}`,
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${jwt}`,
          "apns-topic": APNS_BUNDLE_ID,
          "apns-push-type": payload.aps?.["content-available"]
            ? "background"
            : "alert",
          "apns-priority": payload.aps?.["content-available"] ? "5" : "10",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`APNs error ${response.status}: ${errorBody}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("APNs send error:", err);
    return false;
  }
}

async function createAPNsJWT(): Promise<string> {
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })
  );
  const now = Math.floor(Date.now() / 1000);
  const claims = base64url(
    JSON.stringify({ iss: APNS_TEAM_ID, iat: now })
  );
  const unsignedToken = `${header}.${claims}`;

  const keyData = Uint8Array.from(atob(APNS_KEY_BASE64), (c) =>
    c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64url(signature)}`;
}

function base64url(input: string | ArrayBuffer): string {
  let b64: string;
  if (typeof input === "string") {
    b64 = btoa(input);
  } else {
    b64 = btoa(String.fromCharCode(...new Uint8Array(input)));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
