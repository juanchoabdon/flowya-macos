import type { Todo, Space, AIAnalysisResult, AIRenameResult, Priority } from '../types';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
const MODEL = 'gpt-4o';

interface AIProfile {
  roles: Record<string, string>;
  context: string;
}

export async function prioritizeTasks(
  profile: AIProfile,
  tasks: Todo[],
  spaces: Space[],
  scope: 'all' | string
): Promise<AIAnalysisResult> {
  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s.name]));

  const roleDescriptions = Object.entries(profile.roles)
    .map(([spaceId, role]) => `- In "${spaceMap[spaceId] || 'Unknown'}" space: ${role}`)
    .join('\n');

  const filteredTasks = scope === 'all'
    ? tasks
    : tasks.filter(t => t.space_id === scope);

  if (filteredTasks.length === 0) {
    throw new Error('No tasks to analyze. Add some tasks first!');
  }

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured.');
  }

  const scopeLabel = scope === 'all'
    ? 'all spaces'
    : `"${spaceMap[scope] || 'Unknown'}" space`;

  const taskList = filteredTasks.map(t => ({
    id: t.id,
    text: t.text,
    description: t.description || '',
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    space: spaceMap[t.space_id] || 'Unknown',
    created_at: t.created_at,
    completed_at: t.completed_at,
  }));

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are a world-class personal productivity coach. You deeply understand how to prioritize tasks based on a person's roles, responsibilities, and life context.

The user has the following roles:
${roleDescriptions}

Additional context from the user:
${profile.context || 'No additional context provided.'}

Today is ${today}.

Your job is to analyze their tasks in ${scopeLabel} and provide a prioritized action plan. Consider:
- Urgency based on due dates and how long tasks have been sitting
- Impact based on the user's roles (what would a great ${Object.values(profile.roles)[0] || 'professional'} prioritize?)
- IMPORTANT: ALL tasks with status "done" MUST be archived (action: "archive"). Done means completed — they should be cleaned up, no exceptions.
- Tasks that have been in backlog for too long with no clear value should also be archived
- Balance between work and personal life
- Quick wins vs deep work

ETA/DUE DATE MANAGEMENT:
- If a task has an overdue due_date (before today) and is NOT done, it needs a new realistic due date. Don't just leave overdue dates — that's demoralizing and useless.
- For overdue tasks: suggest a new due date based on the task's priority and realistic workload. High-priority overdue tasks should get a near-future date (next 1-3 days). Lower priority overdue tasks can be pushed further out (next week or two).
- If a task has no due_date but is high priority (P0/P1), suggest a reasonable due date to create accountability.
- If a task has a future due_date that still makes sense, keep it (set newDueDate to null).
- Use ISO 8601 format for dates: "YYYY-MM-DDTHH:mm:ss.000Z". Use end of day (23:59) for the time component.

CRITICAL PRIORITIZATION PRINCIPLE: "If everything is P0, nothing is P0."
Most users over-prioritize everything as urgent. Your job is to be ruthlessly honest about what truly matters RIGHT NOW vs what can wait. A healthy distribution looks roughly like:
- P0 (Critical): ~10-15% of tasks — only true blockers, hard deadlines today/tomorrow, or things with severe consequences if delayed
- P1 (High): ~25-30% — important but not on fire
- P2 (Medium): ~30-40% — normal work, gets done in due course
- P3 (Low): ~15-25% — nice to have, can wait, low impact
If the user currently has most tasks as P0, redistribute them honestly. Help them see what actually deserves their immediate attention vs what they've been stressing about unnecessarily.

Respond ONLY with valid JSON in this exact format:
{
  "summary": "A brief 1-2 sentence overview of your recommendation strategy",
  "recommendations": [
    {
      "todoId": "the task id",
      "rank": 1,
      "newPriority": "P0",
      "newDueDate": "2026-02-20T23:59:00.000Z",
      "rationale": "Brief reason why this should be prioritized here",
      "action": "keep"
    }
  ]
}

Rules for the recommendations array:
- Include ALL tasks provided, ranked from most important (rank 1) to least
- "action" is either "keep" (task stays active) or "archive" (suggest removing/archiving)
- CRITICAL: Every task with status "done" MUST have action "archive". No done task should ever be "keep".
- "newPriority" must be one of: "P0", "P1", "P2", "P3"
- P0 = Critical/Urgent, P1 = High, P2 = Medium, P3 = Low
- "newDueDate": ISO 8601 string for a new/updated due date, or null to keep the existing one unchanged. MUST be set for overdue tasks. Can suggest dates for high-priority tasks with no ETA.
- ENFORCE the priority distribution — do NOT make everything P0 or P1. Be a real coach.
- For archived tasks, set rank to 999 and newDueDate to null
- Keep rationales concise (under 20 words)
- Be opinionated and decisive - the user wants clear guidance, not validation of bad habits`;

  const userPrompt = `Here are my current tasks to prioritize:\n\n${JSON.stringify(taskList, null, 2)}`;

  // Call OpenAI via Electron main process IPC to bypass renderer restrictions
  const result = await window.windowApi.aiChat({
    apiKey: OPENAI_API_KEY,
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });

  if (result.error) {
    console.error('[OpenAI] API error:', result.status, result.body);
    throw new Error(`OpenAI API error: ${result.status || 'network'} - ${result.body || 'Unknown error'}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from OpenAI');
  }

  const parsed = JSON.parse(content) as AIAnalysisResult;

  // Validate and sanitize priorities
  const validPriorities: Priority[] = ['P0', 'P1', 'P2', 'P3'];
  parsed.recommendations = parsed.recommendations.map(rec => ({
    ...rec,
    newPriority: validPriorities.includes(rec.newPriority) ? rec.newPriority : 'P1',
    action: rec.action === 'archive' ? 'archive' : 'keep',
  }));

  // Sort by rank
  parsed.recommendations.sort((a, b) => a.rank - b.rank);

  return parsed;
}

export async function renameTasks(
  profile: AIProfile | null,
  tasks: Todo[],
  spaces: Space[],
  scope: 'all' | string
): Promise<AIRenameResult> {
  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s.name]));

  const filteredTasks = scope === 'all'
    ? tasks.filter(t => t.status !== 'done')
    : tasks.filter(t => t.space_id === scope && t.status !== 'done');

  if (filteredTasks.length === 0) {
    throw new Error('No active tasks to rename. Add some tasks first!');
  }

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured.');
  }

  const taskList = filteredTasks.map(t => ({
    id: t.id,
    text: t.text,
    space: spaceMap[t.space_id] || 'Unknown',
  }));

  let profileContext = '';
  if (profile) {
    const roleDescriptions = Object.entries(profile.roles)
      .map(([spaceId, role]) => `- In "${spaceMap[spaceId] || 'Unknown'}" space: ${role}`)
      .join('\n');
    profileContext = `\n\nAbout the user:\nRoles:\n${roleDescriptions}${profile.context ? `\n\nAdditional context: ${profile.context}` : ''}

Use this context to write task names that make sense for this person's roles. For example, if they're a VP of Product, a task about "roadmap" should be named like "Finalize Q3 product roadmap" not just "Do roadmap". If they're a Dad, "school thing" could become "Pick up kids from school".`;
  }

  const systemPrompt = `You are a productivity writing coach for tech professionals. Your job is to rewrite vague, passive, or unclear task names into clear, concrete, actionable task names.${profileContext}

Good task names ALWAYS start with a strong action verb. Think about what the person will physically DO:
- Communication: Send, Reply, Message, Slack, Email, Call, Ping, Follow up, Notify
- Meetings: Schedule, Set up, Attend, Prepare, Lead, Facilitate
- Documents: Write, Draft, Create, Update, Review, Finalize, Share
- Development: Build, Ship, Deploy, Fix, Debug, Refactor, Implement, Test, Review PR
- People: Contact, Reach out to, Meet with, Align with, Interview, Onboard
- Planning: Plan, Define, Scope, Prioritize, Estimate, Research, Investigate
- Movement: Go to, Pick up, Drop off, Drive to, Visit

Examples:
- "slack" → "Send Slack update to team on launch status"
- "llamada" → "Schedule call with design team for review"
- "doc" → "Draft product spec for new onboarding flow"
- "Juan" → "Reach out to Juan about partnership proposal"
- "PR" → "Review and approve PR #45 for auth refactor"
- "deploy" → "Deploy v2.1 hotfix to production"
- "colegio" → "Pick up kids from school at 3pm"
- "dentista" → "Schedule dentist appointment for next week"
- "1:1" → "Prepare agenda for 1:1 with engineering lead"
- "roadmap" → "Finalize Q3 product roadmap and share with team"
- "bug login" → "Fix login timeout error on mobile app"
- "diseño" → "Review design mockups for settings page"
- "board" → "Update Jira board with sprint priorities"
- "infra" → "Investigate AWS costs and propose optimization"
- "standup" → "Lead daily standup at 10am"
- "hiring" → "Review 5 engineering candidate profiles"

IMPORTANT: Only suggest renames for tasks that are genuinely vague, incomplete, or unclear. If a task name is already clear and actionable (e.g., "Review PR #42 for auth changes"), do NOT include it. Quality over quantity.

CRITICAL: You MUST respond in the SAME language the task is written in. If the task is in Spanish, your suggestion MUST be in Spanish. If the task is in English, respond in English. Never translate — just make it more actionable in the original language.

Respond ONLY with valid JSON:
{
  "summary": "Brief 1-sentence overview of what you improved",
  "suggestions": [
    {
      "todoId": "the task id",
      "currentName": "the current vague name",
      "newName": "the improved actionable name",
      "rationale": "Why this rename helps (under 10 words)"
    }
  ]
}

Rules:
- Only include tasks that genuinely need renaming
- Keep the same language as the original
- Don't change the meaning, just make it clearer and more actionable
- ALWAYS start with a verb
- Keep names concise — no more than 60 characters`;

  const userPrompt = `Here are my tasks:\n\n${JSON.stringify(taskList, null, 2)}`;

  const result = await window.windowApi.aiChat({
    apiKey: OPENAI_API_KEY,
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
  });

  if (result.error) {
    console.error('[OpenAI] Rename API error:', result.status, result.body);
    throw new Error(`OpenAI API error: ${result.status || 'network'} - ${result.body || 'Unknown error'}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from OpenAI');
  }

  const parsed = JSON.parse(content) as AIRenameResult;
  return parsed;
}

export async function suggestTaskName(taskName: string, profile?: AIProfile | null, spaceName?: string, spaceRole?: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  if (!taskName || taskName.trim().length < 2) return null;

  let profileHint = '';
  if (profile) {
    const roleParts: string[] = [];
    if (spaceRole) {
      roleParts.push(`The user is a "${spaceRole}" in the "${spaceName}" space.`);
    } else if (spaceName) {
      roleParts.push(`This task is in the "${spaceName}" space.`);
    }
    if (profile.context) {
      roleParts.push(`Context: ${profile.context}`);
    }
    profileHint = `\n\n${roleParts.join(' ')}
Use this to make the suggestion contextually relevant — write the task name as this person would naturally phrase it in their role.`;
  }

  const systemPrompt = `You are a task naming assistant for tech professionals. Given a task name, suggest a more actionable, concrete version.${profileHint}

ALWAYS start with a strong action verb. Think about what the person will physically DO:
- Communication: Send, Reply, Slack, Email, Call, Message, Follow up, Ping
- Meetings: Schedule, Set up, Prepare, Lead, Attend
- Documents: Write, Draft, Create, Update, Review, Finalize, Share
- Development: Build, Ship, Deploy, Fix, Debug, Implement, Review PR, Test
- People: Contact, Reach out to, Meet with, Interview, Align with
- Planning: Plan, Define, Scope, Research, Investigate, Estimate
- Movement: Go to, Pick up, Drop off, Visit

Examples in English: "slack" → "Send Slack update to team", "doc" → "Draft product spec for new feature", "PR" → "Review PR for auth refactor"
Examples in Spanish: "llamada" → "Programar llamada con equipo de diseño", "colegio" → "Recoger a los niños del colegio a las 3pm", "doc" → "Escribir documento de requerimientos", "slack" → "Enviar mensaje de Slack al equipo"

CRITICAL: You MUST respond in the SAME language the task is written in. If the task is in Spanish, your suggestion MUST be in Spanish. If the task is in English, respond in English. Never translate.

If the task name is ALREADY clear and actionable, respond with: {"suggestion": null}

Respond ONLY with valid JSON: {"suggestion": "improved name" } or {"suggestion": null}`;

  const result = await window.windowApi.aiChat({
    apiKey: OPENAI_API_KEY,
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Task: "${taskName}"` },
    ],
    temperature: 0.3,
  });

  if (result.error) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return parsed.suggestion || null;
  } catch {
    return null;
  }
}
