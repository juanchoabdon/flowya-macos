import type { Todo, Space, WeeklyGoal, AIAnalysisResult, AIRenameResult, AIWeeklyPlanResult, AIDuplicatesResult, Priority } from '../types';

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
  scope: 'all' | string,
  weeklyGoals: WeeklyGoal[] = [],
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

  const goalLinkedTaskIds = new Set<string>();
  for (const goal of weeklyGoals) {
    if (goal.completed) continue;
    const ids = goal.linked_todo_ids?.length ? goal.linked_todo_ids : (goal.linked_todo_id ? [goal.linked_todo_id] : []);
    for (const id of ids) goalLinkedTaskIds.add(id);
  }

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
    linked_to_weekly_goal: goalLinkedTaskIds.has(t.id),
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
- CRITICAL: Tasks with "linked_to_weekly_goal": true are part of the user's active weekly goals. These tasks must NEVER be archived — they are key commitments for the week. Always set action to "keep" and prioritize them highly (P0 or P1).
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

Examples in English:
- "slack" → "Send Slack update to team on launch status"
- "doc" → "Draft product spec for new onboarding flow"
- "PR" → "Review and approve PR #45 for auth refactor"
- "deploy" → "Deploy v2.1 hotfix to production"
- "1:1" → "Prepare agenda for 1:1 with engineering lead"
- "hiring" → "Review 5 engineering candidate profiles"

Examples in Spanglish (tech professionals in Latin America):
- "slack" → "Mandar Slack al team con update del release"
- "llamada" → "Agendar call con el equipo de diseño"
- "doc" → "Escribir el PRD del nuevo feature"
- "roadmap" → "Finalizar el roadmap de Q3 y compartir con el team"
- "deploy" → "Hacer deploy del hotfix a prod"
- "bug login" → "Fixear el bug de login en mobile"
- "standup" → "Liderar el daily standup a las 10am"
- "diseño" → "Revisar los mockups del settings page"
- "sprint" → "Preparar el sprint planning de la semana"
- "Juan" → "Contactar a Juan sobre la propuesta de partnership"
- "colegio" → "Recoger a los niños del colegio a las 3pm"
- "dentista" → "Agendar cita con el dentista para la próxima semana"

IMPORTANT: Only suggest renames for tasks that are genuinely vague, incomplete, or unclear. If a task name is already clear and actionable (e.g., "Revisar el PR de auth refactor"), do NOT include it. Quality over quantity.

CRITICAL LANGUAGE RULES:
- If the task is in English, respond in English.
- If the task is in Spanish, use SPANGLISH — natural Latin American tech Spanish that mixes Spanish with common English tech terms (deploy, PR, sprint, feature, release, standup, bug, fix, roadmap, team, update, call, Slack, etc). This is how tech professionals actually talk.
- Never fully translate English tech terms to formal Spanish. "Deploy" stays "deploy", "PR" stays "PR", "feature" stays "feature", "sprint" stays "sprint".

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
Examples in Spanglish (tech): "llamada" → "Agendar call con el equipo de diseño", "roadmap" → "Finalizar el roadmap de Q3", "doc" → "Escribir el PRD del nuevo feature", "slack" → "Mandar Slack al team con update del release", "PR" → "Revisar el PR de auth refactor", "deploy" → "Hacer deploy del hotfix a prod", "standup" → "Liderar el daily standup", "sprint" → "Preparar el sprint planning", "bug" → "Fixear el bug de login en mobile", "colegio" → "Recoger a los niños del colegio a las 3pm"

CRITICAL LANGUAGE RULES:
- If the task is in English, respond in English.
- If the task is in Spanish, use SPANGLISH — natural Latin American tech Spanish that mixes Spanish with common English tech terms (deploy, PR, sprint, feature, release, standup, bug, fix, roadmap, team, update, call, Slack, etc). This is how tech professionals actually talk.
- Never fully translate English tech terms to formal Spanish. "Deploy" stays "deploy", "PR" stays "PR", "feature" stays "feature", "sprint" stays "sprint".

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

interface WeeklyObjective {
  spaceId: string;
  spaceName: string;
  goals: string[];
}

export async function planWeek(
  profile: AIProfile,
  objectives: WeeklyObjective[],
  tasks: Todo[],
  spaces: Space[],
): Promise<AIWeeklyPlanResult> {
  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s.name]));

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured.');
  }

  const allGoals = objectives.flatMap(o => o.goals.map((g, i) => ({
    spaceId: o.spaceId,
    spaceName: o.spaceName,
    goalText: g,
    position: i + 1,
  })));

  if (allGoals.length === 0) {
    throw new Error('No objectives entered. Write at least one goal to plan your week!');
  }

  const roleDescriptions = Object.entries(profile.roles)
    .map(([spaceId, role]) => `- In "${spaceMap[spaceId] || 'Unknown'}" space: ${role}`)
    .join('\n');

  const activeTasks = tasks.filter(t => t.status !== 'done' && !t.archived);
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const taskList = activeTasks.map(t => ({
    id: t.id,
    text: t.text,
    description: stripHtml(t.description || '').slice(0, 200),
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    space: spaceMap[t.space_id] || 'Unknown',
    space_id: t.space_id,
  }));

  const objectivesList = allGoals.map(g => ({
    spaceId: g.spaceId,
    spaceName: g.spaceName,
    goalText: g.goalText,
    position: g.position,
  }));

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are a world-class weekly planning coach for tech professionals. The user is starting their week and has set high-level objectives for what they want to accomplish.

The user has the following roles:
${roleDescriptions}

Additional context:
${profile.context || 'No additional context provided.'}

Today is ${today}. This is the start-of-week planning session.

YOUR JOB:
1. For each high-level objective, THOROUGHLY search the existing task list for ALL tasks that relate to it. ALWAYS prefer mapping to existing tasks over creating new ones.
2. Only create new tasks if the objective requires work that NO existing task covers AT ALL.
3. Boost tasks linked to weekly objectives to P0 or P1.
4. For other active tasks NOT linked to any objective, suggest reasonable reprioritizations (P2/P3 for less urgent ones).
5. Set realistic ETAs for objective-linked tasks within this week (Mon-Sun).
6. Each objective should have AT LEAST 1 mapping, but can have as many as needed (typically 1-3).

CRITICAL MATCHING RULES (MOST IMPORTANT — READ CAREFULLY):
- ALWAYS PREFER EXISTING TASKS. Creating duplicates is a SERIOUS ERROR. Only use "create_new" as a LAST RESORT when absolutely nothing in the task list relates to the objective.
- Match SEMANTICALLY, not just by exact text. A task about "revisar el PR de pagos" matches an objective about "Ship payments feature". A task "Preparar deck Q2" matches "Kick off planning Q2".
- Match ACROSS LANGUAGES. If the objective is in Spanish, also look for English tasks that cover the same topic, and vice versa. The user is bilingual and uses Spanglish — tasks may be in English, Spanish, or a mix.
  Examples of cross-language matches:
    - Objective: "Cerrar deal con Acme" → matches task "Send proposal to Acme" ✓
    - Objective: "Ship payments feature" → matches task "Terminar el feature de pagos" ✓
    - Objective: "Hacer kick off de Q2" → matches task "Schedule Q2 planning meeting" ✓
- Map ALL existing tasks that clearly relate to the objective — don't limit to just one.
- When matching, prefer tasks in the SAME space as the objective, but also consider tasks in other spaces if relevant.
- Multiple mappings for the same goal MUST share the same goalPosition and goalText.
- Before creating ANY new task, double-check the ENTIRE task list one more time. If there is ANYTHING remotely related, map to it instead.

CRITICAL LANGUAGE RULES (for NEW tasks only):
- If the objective is in English, create the task name in English.
- If the objective is in Spanish, use SPANGLISH — natural Latin American tech Spanish that mixes Spanish with common English tech terms (deploy, PR, sprint, feature, release, standup, bug, fix, roadmap, team, update, call, Slack, etc).
- Never fully translate English tech terms to formal Spanish.

WHEN CREATING NEW TASKS:
- Write them as clear, verb-first actions. Examples:
   - Objective: "Kick off planning Q2" → "Agendar reunión de kick-off de planning Q2"
   - Objective: "Close deal with Acme" → "Prepare and send final proposal to Acme"
   - Objective: "Ship payments feature" → "Deploy payments feature to staging"

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief 1-2 sentence overview of the weekly plan",
  "mappings": [
    {
      "goalPosition": 1,
      "goalText": "the original objective text",
      "spaceId": "the space id",
      "action": "map_existing",
      "todoId": "existing task id if mapping",
      "newTaskName": null,
      "newPriority": "P0",
      "newDueDate": "2026-02-09T23:59:00.000Z",
      "rationale": "Brief reason (under 15 words)"
    },
    {
      "goalPosition": 2,
      "goalText": "another objective",
      "spaceId": "the space id",
      "action": "create_new",
      "todoId": null,
      "newTaskName": "Concrete verb-first task name",
      "newPriority": "P0",
      "newDueDate": "2026-02-10T23:59:00.000Z",
      "rationale": "Brief reason"
    }
  ],
  "reprioritizations": [
    {
      "todoId": "task id",
      "rank": 1,
      "newPriority": "P2",
      "newDueDate": null,
      "rationale": "Not aligned with this week's objectives",
      "action": "keep"
    }
  ]
}

Rules:
- "mappings" must include AT LEAST one entry per objective, but CAN include multiple entries for the same objective (same goalPosition/goalText, different tasks)
- STRONGLY prefer "map_existing" over "create_new". Creating a task that duplicates an existing one is WRONG.
- "reprioritizations" should only include tasks that genuinely need priority changes (don't include tasks that are fine as-is)
- Use ISO 8601 dates with end-of-day time (23:59)
- Keep rationales concise
- Be decisive — the user wants a clear plan, not options`;

  const userPrompt = `Here are my weekly objectives:\n\n${JSON.stringify(objectivesList, null, 2)}\n\nHere are my current tasks:\n\n${JSON.stringify(taskList, null, 2)}`;

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
    console.error('[OpenAI] Weekly plan API error:', result.status, result.body);
    throw new Error(`OpenAI API error: ${result.status || 'network'} - ${result.body || 'Unknown error'}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from OpenAI');
  }

  const parsed = JSON.parse(content) as AIWeeklyPlanResult;

  const validPriorities: Priority[] = ['P0', 'P1', 'P2', 'P3'];
  parsed.mappings = parsed.mappings.map(m => ({
    ...m,
    newPriority: validPriorities.includes(m.newPriority) ? m.newPriority : 'P1',
  }));
  parsed.reprioritizations = (parsed.reprioritizations || []).map(r => ({
    ...r,
    newPriority: validPriorities.includes(r.newPriority) ? r.newPriority : 'P2',
    action: r.action === 'archive' ? 'archive' : 'keep',
  }));

  return parsed;
}

export async function findDuplicates(
  tasks: Todo[],
  spaces: Space[],
): Promise<AIDuplicatesResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured.');
  }

  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s.name]));
  const activeTasks = tasks.filter(t => !t.archived);
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  if (activeTasks.length < 2) {
    return { groups: [], summary: 'Not enough tasks to check for duplicates.' };
  }

  const taskList = activeTasks.map(t => ({
    id: t.id,
    text: t.text,
    description: stripHtml(t.description || '').slice(0, 150),
    status: t.status,
    priority: t.priority,
    space: spaceMap[t.space_id] || 'Unknown',
  }));

  const systemPrompt = `You are a duplicate task detector. The user has a task list that may contain duplicates or near-duplicates.

YOUR JOB:
Find groups of tasks that are duplicates or near-duplicates. Two tasks are duplicates if they refer to the SAME work, even if worded differently or in different languages.

MATCHING CRITERIA:
- Same action described differently: "Fix login bug" and "Arreglar bug de login" are duplicates
- Same topic with slight variation: "Send Q2 report" and "Prepare and send Q2 report" are duplicates
- Cross-language matches: Spanish and English tasks about the same thing are duplicates
- Different priority/status but same work: still duplicates
- Tasks in DIFFERENT spaces can be duplicates too

NOT DUPLICATES:
- Related but distinct tasks: "Design landing page" and "Code landing page" are NOT duplicates
- Similar category but different scope: "Fix payment bug" and "Fix auth bug" are NOT duplicates

For each group, pick the BEST task to keep (prefer: the one with more detail/description, higher priority, or in_progress status). Mark the rest for removal.

Respond ONLY with valid JSON:
{
  "summary": "Found N duplicate groups across your tasks",
  "groups": [
    {
      "keepTodoId": "id of the best task to keep",
      "removeTodoIds": ["id1", "id2"],
      "reason": "Brief explanation of why these are duplicates (under 15 words)"
    }
  ]
}

Rules:
- If NO duplicates found, return empty groups array with summary "No duplicates found — your task list is clean!"
- A task can only appear in ONE group
- Be conservative — only flag TRUE duplicates, not merely related tasks
- Keep rationales short and clear`;

  const userPrompt = `Here are my tasks:\n\n${JSON.stringify(taskList, null, 2)}`;

  const result = await window.windowApi.aiChat({
    apiKey: OPENAI_API_KEY,
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  if (result.error) {
    console.error('[OpenAI] Duplicates API error:', result.status, result.body);
    throw new Error(`OpenAI API error: ${result.status || 'network'} - ${result.body || 'Unknown error'}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from OpenAI');
  }

  return JSON.parse(content) as AIDuplicatesResult;
}
