import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "com.flowya.ios";
const APNS_KEY_BASE64 = Deno.env.get("APNS_KEY_BASE64")!;

interface PushPayload {
  type: "due_reminder" | "cross_device_sync" | "weekly_planning" | "live_activity_update";
  user_id?: string;
  todo_id?: string;
  title?: string;
  body?: string;
}

interface WebhookPayload {
  type: "UPDATE" | "INSERT" | "DELETE";
  table: string;
  record: any;
  old_record: any;
}

serve(async (req) => {
  try {
    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Database Webhook format: has "type" as "UPDATE"/"INSERT"/"DELETE" and "table"
    if (body.table === "todos" && body.type === "UPDATE" && body.record) {
      console.log("[Webhook] Todo updated, checking for LA update");
      const record = body.record;
      const oldRecord = body.old_record;

      // Only trigger on meaningful changes
      const changed =
        record.status !== oldRecord?.status ||
        record.priority !== oldRecord?.priority ||
        record.position !== oldRecord?.position ||
        record.text !== oldRecord?.text;

      if (!changed) {
        return new Response(JSON.stringify({ skipped: true, reason: "no_relevant_change" }));
      }

      // Get user_id from the space
      const { data: space } = await supabase
        .from("spaces")
        .select("user_id")
        .eq("id", record.space_id)
        .single();

      if (space?.user_id) {
        const laPayload: PushPayload = {
          type: "live_activity_update",
          user_id: space.user_id,
        };
        return await handleLiveActivityUpdate(supabase, laPayload);
      }

      return new Response(JSON.stringify({ skipped: true, reason: "no_user_for_space" }));
    }

    // Standard manual call format
    const payload = body as PushPayload;

    switch (payload.type) {
      case "due_reminder":
        return await handleDueReminder(supabase, payload);
      case "cross_device_sync":
        return await handleCrossDeviceSync(supabase, payload);
      case "weekly_planning":
        return await handleWeeklyPlanning(supabase, payload);
      case "live_activity_update":
        return await handleLiveActivityUpdate(supabase, payload);
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

async function handleLiveActivityUpdate(supabase: any, payload: PushPayload) {
  if (!payload.user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
    });
  }

  // Get the Live Activity push token
  const { data: laToken } = await supabase
    .from("live_activity_tokens")
    .select("token")
    .eq("user_id", payload.user_id)
    .single();

  if (!laToken?.token) {
    return new Response(JSON.stringify({ sent: 0, reason: "no_la_token" }));
  }

  // Get user's spaces first (todos don't have user_id directly)
  const { data: spaces } = await supabase
    .from("spaces")
    .select("id, name, color")
    .eq("user_id", payload.user_id);

  const spaceIds = (spaces || []).map((s: any) => s.id);

  // Get todos for those spaces
  let todos: any[] = [];
  if (spaceIds.length > 0) {
    const { data } = await supabase
      .from("todos")
      .select("id, text, priority, status, space_id, due_date, position, archived")
      .in("space_id", spaceIds)
      .neq("status", "done")
      .eq("archived", false)
      .order("position", { ascending: true });
    todos = data || [];
  }

  const { data: streak } = await supabase
    .from("user_streaks")
    .select("streak_count")
    .eq("user_id", payload.user_id)
    .maybeSingle();

  const { data: goals } = await supabase
    .from("weekly_goals")
    .select("id, completed")
    .eq("user_id", payload.user_id);

  const spaceMap: Record<string, any> = {};
  for (const s of spaces || []) {
    spaceMap[s.id] = s;
  }

  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  const sortByImportance = (a: any, b: any) => {
    const pa = priorityOrder[a.priority] ?? 99;
    const pb = priorityOrder[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.position || 0) - (b.position || 0);
  };

  const inProgress = (todos || [])
    .filter((t: any) => t.status === "in_progress")
    .sort(sortByImportance);
  const backlog = (todos || [])
    .filter((t: any) => t.status === "backlog")
    .sort(sortByImportance);

  const topTask = inProgress[0] || backlog[0];
  const statusLabel = inProgress[0] ? "In Progress" : "What's Next";

  const completedGoals = (goals || []).filter((g: any) => g.completed).length;
  const totalGoals = (goals || []).length;

  let contentState: any;

  if (topTask) {
    const space = spaceMap[topTask.space_id];
    contentState = {
      taskId: topTask.id,
      taskName: topTask.text,
      taskPriority: topTask.priority || "P2",
      taskStatus: statusLabel,
      spaceName: space?.name || "",
      spaceColor: space?.color || "#64B5F6",
      dueDate: topTask.due_date ? new Date(topTask.due_date).getTime() / 1000 : null,
      streakCount: streak?.streak_count || 0,
      weeklyProgress: `${completedGoals}/${totalGoals}`,
      isEmpty: false,
    };
  } else {
    contentState = {
      taskName: "All clear!",
      taskPriority: "P2",
      taskStatus: "",
      spaceName: "",
      spaceColor: "#4CAF50",
      streakCount: streak?.streak_count || 0,
      weeklyProgress: `${completedGoals}/${totalGoals}`,
      isEmpty: true,
    };
  }

  const result = await sendLiveActivityUpdate(laToken.token, contentState);

  return new Response(JSON.stringify({
    sent: result.success ? 1 : 0,
    ...(result.error && { apns_error: result.error }),
  }));
}

async function sendLiveActivityUpdate(
  pushToken: string,
  contentState: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const jwt = await createAPNsJWT();

  const payload = {
    aps: {
      timestamp: Math.floor(Date.now() / 1000),
      event: "update",
      "content-state": contentState,
    },
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    Authorization: `bearer ${jwt}`,
    "apns-topic": `${APNS_BUNDLE_ID}.push-type.liveactivity`,
    "apns-push-type": "liveactivity",
    "apns-priority": "10",
  };

  console.log("[LA] Sending with topic:", `${APNS_BUNDLE_ID}.push-type.liveactivity`);
  console.log("[LA] Token (first 20):", pushToken.substring(0, 20));
  console.log("[LA] Payload:", JSON.stringify(payload));

  let lastError = "";

  // Try production first, then sandbox (debug builds use sandbox)
  for (const host of ["api.push.apple.com", "api.sandbox.push.apple.com"]) {
    try {
      const response = await fetch(
        `https://${host}/3/device/${pushToken}`,
        { method: "POST", headers, body }
      );

      if (response.ok) {
        console.log(`[LA] Push sent via ${host}`);
        return { success: true };
      }

      const errorBody = await response.text();
      lastError = `${host} ${response.status}: ${errorBody}`;
      console.error(`[LA] APNs error:`, lastError);

      if (response.status === 400 && errorBody.includes("BadDeviceToken")) {
        continue;
      }
      return { success: false, error: lastError };
    } catch (err) {
      lastError = `${host}: ${err.message}`;
      console.error(`[LA] Send error:`, lastError);
    }
  }

  return { success: false, error: lastError };
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

  // Strip PEM headers/footers, quotes, and all whitespace
  const cleanKey = APNS_KEY_BASE64
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/['"]/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");

  console.log("[APNs] Key length after clean:", cleanKey.length);

  let keyData: Uint8Array;
  try {
    const raw = atob(cleanKey);
    keyData = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch (e) {
    console.error("[APNs] base64 decode failed. First 20 chars:", cleanKey.substring(0, 20));
    throw new Error("Failed to decode APNs key base64");
  }

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
