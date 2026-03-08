import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import type { AgentConfig, AgentEvent, AgentStatus } from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import {
  takeScreenshot,
  mouseMove,
  leftClick,
  rightClick,
  middleClick,
  doubleClick,
  tripleClick,
  leftClickDrag,
  typeText,
  keyPress,
  scroll,
  getCursorPosition,
  wait,
} from './computer-control';

export class AgentLoop extends EventEmitter {
  private config: AgentConfig;
  private client: Anthropic;
  private cancelled = false;
  private status: AgentStatus = 'idle';
  private currentIteration = 0;

  constructor(apiKey: string, overrides?: Partial<Omit<AgentConfig, 'apiKey'>>) {
    super();
    this.config = {
      ...DEFAULT_AGENT_CONFIG,
      ...overrides,
      apiKey,
    };
    this.client = new Anthropic({ apiKey });
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  cancel(): void {
    this.cancelled = true;
    this.setStatus('cancelled');
    this.emitEvent({
      type: 'done',
      status: 'cancelled',
      message: 'Agent cancelled by user.',
    });
  }

  private setStatus(status: AgentStatus): void {
    this.status = status;
  }

  private emitEvent(event: AgentEvent): void {
    this.emit('agent-event', event);
  }

  /**
   * Run the agent loop for a given task.
   * Takes an initial screenshot, sends the task to Claude, then loops:
   * Claude requests tool actions -> we execute them -> send results back.
   */
  async run(taskText: string, taskDescription?: string): Promise<void> {
    this.cancelled = false;
    this.currentIteration = 0;
    this.setStatus('starting');

    this.emitEvent({
      type: 'status',
      status: 'starting',
      message: `Starting agent for: ${taskText}`,
    });

    try {
      // Take initial screenshot
      const initialScreenshot = takeScreenshot(
        this.config.displayWidth,
        this.config.displayHeight
      );

      this.emitEvent({
        type: 'screenshot',
        status: 'running',
        screenshot: initialScreenshot,
        message: 'Captured initial screenshot.',
      });

      const taskPrompt = taskDescription
        ? `Task: ${taskText}\n\nDetails: ${taskDescription}`
        : `Task: ${taskText}`;

      const systemPrompt = `You are an AI agent controlling a macOS desktop to complete tasks. You can see the screen through screenshots and control the mouse and keyboard.

Rules:
- After each action, carefully examine the new screenshot to verify the action worked as expected.
- If something didn't work, try a different approach.
- When the task is fully complete, respond with a text message confirming what you did.
- Be careful with sensitive data — don't type passwords unless explicitly provided in the task.
- If you encounter a dialog asking for permissions or confirmation, describe it and stop.
- Keep actions minimal and precise — don't do unnecessary steps.`;

      type Message = {
        role: 'user' | 'assistant';
        content: string | ContentBlock[];
      };

      type ContentBlock =
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string | ToolResultContent[] }
        | { type: 'thinking'; thinking: string };

      type ToolResultContent =
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } };

      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: initialScreenshot,
              },
            },
            {
              type: 'text',
              text: taskPrompt,
            },
          ],
        },
      ];

      this.setStatus('running');

      // Agent loop
      while (
        !this.cancelled &&
        this.currentIteration < this.config.maxIterations
      ) {
        this.currentIteration++;

        this.emitEvent({
          type: 'status',
          status: 'running',
          message: `Iteration ${this.currentIteration}/${this.config.maxIterations} — sending to Claude...`,
          iteration: this.currentIteration,
          maxIterations: this.config.maxIterations,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await this.client.beta.messages.create({
          model: this.config.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: [
            {
              type: 'computer_20251124' as const,
              name: 'computer',
              display_width_px: this.config.displayWidth,
              display_height_px: this.config.displayHeight,
            },
            {
              type: 'bash_20250124' as const,
              name: 'bash',
            },
          ],
          messages: messages as Anthropic.Beta.Messages.BetaMessageParam[],
          betas: ['computer-use-2025-11-24'],
        });

        if (this.cancelled) break;

        // Append assistant response
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Process response content blocks
        const toolResults: ContentBlock[] = [];
        let hasToolUse = false;

        for (const block of response.content) {
          if (block.type === 'thinking') {
            this.emitEvent({
              type: 'thinking',
              status: 'running',
              message: block.thinking,
              iteration: this.currentIteration,
              maxIterations: this.config.maxIterations,
            });
          } else if (block.type === 'text') {
            this.emitEvent({
              type: 'status',
              status: 'running',
              message: block.text,
              iteration: this.currentIteration,
              maxIterations: this.config.maxIterations,
            });
          } else if (block.type === 'tool_use') {
            hasToolUse = true;
            const result = await this.executeToolCall(block.name, block.input);

            if (this.cancelled) break;

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        if (this.cancelled) break;

        // If no tool use, Claude is done
        if (!hasToolUse) {
          this.setStatus('completed');
          const textBlocks = response.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('\n');

          this.emitEvent({
            type: 'done',
            status: 'completed',
            message: textBlocks || 'Task completed.',
          });
          return;
        }

        // If stop_reason is end_turn with tool results, something is off
        if (response.stop_reason === 'end_turn' && toolResults.length > 0) {
          // Still send tool results and let Claude decide
        }

        // Append tool results as user message
        messages.push({
          role: 'user',
          content: toolResults,
        });
      }

      // If we exited due to max iterations
      if (!this.cancelled && this.currentIteration >= this.config.maxIterations) {
        this.setStatus('error');
        this.emitEvent({
          type: 'error',
          status: 'error',
          message: `Agent reached maximum iterations (${this.config.maxIterations}). The task may not be fully complete.`,
        });
      }
    } catch (err: unknown) {
      if (this.cancelled) return;
      this.setStatus('error');
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emitEvent({
        type: 'error',
        status: 'error',
        message: `Agent error: ${message}`,
      });
    }
  }

  /**
   * Execute a tool call from Claude and return the result content.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeToolCall(toolName: string, input: any): Promise<any> {
    if (toolName === 'computer') {
      return this.executeComputerAction(input);
    } else if (toolName === 'bash') {
      return this.executeBashCommand(input);
    }

    return [{ type: 'text', text: `Unknown tool: ${toolName}` }];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeComputerAction(input: any): Promise<any> {
    const action = input.action as string;

    this.emitEvent({
      type: 'action',
      status: 'running',
      message: `Executing: ${action}`,
      action: {
        name: action,
        coordinate: input.coordinate,
        text: input.text,
      },
      iteration: this.currentIteration,
      maxIterations: this.config.maxIterations,
    });

    try {
      switch (action) {
        case 'screenshot': {
          const screenshot = takeScreenshot(
            this.config.displayWidth,
            this.config.displayHeight
          );
          this.emitEvent({
            type: 'screenshot',
            status: 'running',
            screenshot,
            message: 'Screenshot captured.',
            iteration: this.currentIteration,
            maxIterations: this.config.maxIterations,
          });
          return [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot,
              },
            },
          ];
        }

        case 'mouse_move': {
          const [x, y] = input.coordinate;
          mouseMove(x, y);
          return await this.screenshotResult();
        }

        case 'left_click': {
          const [x, y] = input.coordinate;
          leftClick(x, y);
          // Small delay to let UI update
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'right_click': {
          const [x, y] = input.coordinate;
          rightClick(x, y);
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'middle_click': {
          const [x, y] = input.coordinate;
          middleClick(x, y);
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'double_click': {
          const [x, y] = input.coordinate;
          doubleClick(x, y);
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'triple_click': {
          const [x, y] = input.coordinate;
          tripleClick(x, y);
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'left_click_drag': {
          const [startX, startY] = input.coordinate;
          const [endX, endY] = input.end_coordinate;
          leftClickDrag(startX, startY, endX, endY);
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'type': {
          typeText(input.text);
          wait(0.2);
          return await this.screenshotResult();
        }

        case 'key': {
          keyPress(input.text);
          wait(0.2);
          return await this.screenshotResult();
        }

        case 'scroll': {
          const [sx, sy] = input.coordinate;
          scroll(sx, sy, input.scroll_direction, input.scroll_amount || 3);
          wait(0.3);
          return await this.screenshotResult();
        }

        case 'wait': {
          const seconds = input.duration || 1;
          wait(seconds);
          return await this.screenshotResult();
        }

        case 'cursor_position': {
          const pos = getCursorPosition();
          return [{ type: 'text', text: `Cursor position: (${pos.x}, ${pos.y})` }];
        }

        default:
          return [{ type: 'text', text: `Unknown action: ${action}` }];
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return [{ type: 'text', text: `Action failed: ${message}` }];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeBashCommand(input: any): Promise<any> {
    const { execSync } = require('child_process');
    const command = input.command as string;

    this.emitEvent({
      type: 'action',
      status: 'running',
      message: `Running bash: ${command}`,
      action: { name: 'bash', text: command },
      iteration: this.currentIteration,
      maxIterations: this.config.maxIterations,
    });

    try {
      const output = execSync(command, {
        timeout: 30000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      return [{ type: 'text', text: output || '(no output)' }];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Command failed';
      return [{ type: 'text', text: `Bash error: ${message}` }];
    }
  }

  /** Take a screenshot and format as tool result content. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async screenshotResult(): Promise<any[]> {
    const screenshot = takeScreenshot(
      this.config.displayWidth,
      this.config.displayHeight
    );
    this.emitEvent({
      type: 'screenshot',
      status: 'running',
      screenshot,
      iteration: this.currentIteration,
      maxIterations: this.config.maxIterations,
    });
    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshot,
        },
      },
    ];
  }
}
