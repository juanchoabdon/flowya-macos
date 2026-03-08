import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SCREENSHOT_PATH = path.join(os.tmpdir(), 'flowya-agent-screenshot.png');

/**
 * Capture the full screen and return a base64-encoded PNG.
 * Uses macOS `screencapture` CLI. The -x flag suppresses the shutter sound.
 * The image is scaled down to targetWidth x targetHeight to reduce token costs
 * (Retina displays capture at 2x native resolution).
 */
export function takeScreenshot(targetWidth: number, targetHeight: number): string {
  execSync(`screencapture -x -t png "${SCREENSHOT_PATH}"`, { timeout: 10000 });

  // Use sips to resize to target dimensions (handles Retina downscaling)
  execSync(
    `sips --resampleWidth ${targetWidth} --resampleHeight ${targetHeight} "${SCREENSHOT_PATH}" --out "${SCREENSHOT_PATH}"`,
    { timeout: 10000, stdio: 'ignore' }
  );

  const buffer = fs.readFileSync(SCREENSHOT_PATH);
  return buffer.toString('base64');
}

/** Move the mouse cursor to (x, y) without clicking. */
export function mouseMove(x: number, y: number): void {
  const script = `
    tell application "System Events"
      set mouseLocation to {${Math.round(x)}, ${Math.round(y)}}
    end tell
  `;
  // AppleScript can't natively move the mouse without clicking,
  // so we use a CoreGraphics JS bridge via osascript -l JavaScript
  const jsScript = `
    ObjC.import('CoreGraphics');
    $.CGWarpMouseCursorPosition($.CGPointMake(${Math.round(x)}, ${Math.round(y)}));
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Left-click at (x, y). */
export function leftClick(x: number, y: number): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const jsScript = `
    ObjC.import('CoreGraphics');
    var point = $.CGPointMake(${rx}, ${ry});
    var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
    var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
    $.CGEventPost($.kCGHIDEventTap, mouseDown);
    delay(0.05);
    $.CGEventPost($.kCGHIDEventTap, mouseUp);
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Right-click at (x, y). */
export function rightClick(x: number, y: number): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const jsScript = `
    ObjC.import('CoreGraphics');
    var point = $.CGPointMake(${rx}, ${ry});
    var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventRightMouseDown, point, $.kCGMouseButtonRight);
    var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventRightMouseUp, point, $.kCGMouseButtonRight);
    $.CGEventPost($.kCGHIDEventTap, mouseDown);
    delay(0.05);
    $.CGEventPost($.kCGHIDEventTap, mouseUp);
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Middle-click at (x, y). */
export function middleClick(x: number, y: number): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const jsScript = `
    ObjC.import('CoreGraphics');
    var point = $.CGPointMake(${rx}, ${ry});
    var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventOtherMouseDown, point, $.kCGMouseButtonCenter);
    var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventOtherMouseUp, point, $.kCGMouseButtonCenter);
    $.CGEventPost($.kCGHIDEventTap, mouseDown);
    delay(0.05);
    $.CGEventPost($.kCGHIDEventTap, mouseUp);
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Double-click at (x, y). */
export function doubleClick(x: number, y: number): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const jsScript = `
    ObjC.import('CoreGraphics');
    var point = $.CGPointMake(${rx}, ${ry});
    var click1Down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
    var click1Up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
    var click2Down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
    var click2Up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
    $.CGEventSetIntegerValueField(click2Down, $.kCGMouseEventClickState, 2);
    $.CGEventSetIntegerValueField(click2Up, $.kCGMouseEventClickState, 2);
    $.CGEventPost($.kCGHIDEventTap, click1Down);
    $.CGEventPost($.kCGHIDEventTap, click1Up);
    delay(0.05);
    $.CGEventPost($.kCGHIDEventTap, click2Down);
    $.CGEventPost($.kCGHIDEventTap, click2Up);
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Triple-click at (x, y). */
export function tripleClick(x: number, y: number): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const jsScript = `
    ObjC.import('CoreGraphics');
    var point = $.CGPointMake(${rx}, ${ry});
    for (var i = 1; i <= 3; i++) {
      var down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
      var up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
      $.CGEventSetIntegerValueField(down, $.kCGMouseEventClickState, i);
      $.CGEventSetIntegerValueField(up, $.kCGMouseEventClickState, i);
      $.CGEventPost($.kCGHIDEventTap, down);
      $.CGEventPost($.kCGHIDEventTap, up);
      delay(0.03);
    }
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Click and drag from (startX, startY) to (endX, endY). */
export function leftClickDrag(startX: number, startY: number, endX: number, endY: number): void {
  const jsScript = `
    ObjC.import('CoreGraphics');
    var startPoint = $.CGPointMake(${Math.round(startX)}, ${Math.round(startY)});
    var endPoint = $.CGPointMake(${Math.round(endX)}, ${Math.round(endY)});
    var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, startPoint, $.kCGMouseButtonLeft);
    $.CGEventPost($.kCGHIDEventTap, mouseDown);
    delay(0.1);
    var steps = 10;
    for (var i = 1; i <= steps; i++) {
      var frac = i / steps;
      var cx = ${Math.round(startX)} + (${Math.round(endX)} - ${Math.round(startX)}) * frac;
      var cy = ${Math.round(startY)} + (${Math.round(endY)} - ${Math.round(startY)}) * frac;
      var drag = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDragged, $.CGPointMake(cx, cy), $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, drag);
      delay(0.02);
    }
    var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, endPoint, $.kCGMouseButtonLeft);
    $.CGEventPost($.kCGHIDEventTap, mouseUp);
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 10000 });
}

/** Type a string of text using AppleScript keystroke. */
export function typeText(text: string): void {
  // Escape for AppleScript string
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "System Events" to keystroke "${escaped}"`;
  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 10000 });
}

/**
 * Press a key or key combination.
 * Accepts formats like "Return", "cmd+c", "ctrl+shift+a", "space", etc.
 * Maps Claude's key names to AppleScript key codes.
 */
export function keyPress(combo: string): void {
  const KEY_CODE_MAP: Record<string, number> = {
    'Return': 36, 'return': 36, 'Enter': 36, 'enter': 36,
    'Tab': 48, 'tab': 48,
    'space': 49, 'Space': 49,
    'Delete': 51, 'delete': 51, 'BackSpace': 51, 'backspace': 51,
    'Escape': 53, 'escape': 53,
    'Left': 123, 'left': 123,
    'Right': 124, 'right': 124,
    'Down': 125, 'down': 125,
    'Up': 126, 'up': 126,
    'F1': 122, 'F2': 120, 'F3': 99, 'F4': 118, 'F5': 96, 'F6': 97,
    'F7': 98, 'F8': 100, 'F9': 101, 'F10': 109, 'F11': 103, 'F12': 111,
    'Home': 115, 'home': 115,
    'End': 119, 'end': 119,
    'Page_Up': 116, 'page_up': 116, 'PageUp': 116,
    'Page_Down': 121, 'page_down': 121, 'PageDown': 121,
  };

  const parts = combo.split('+').map(p => p.trim());
  const modifiers: string[] = [];
  let key = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (['cmd', 'command', 'super'].includes(lower)) {
      modifiers.push('command down');
    } else if (['ctrl', 'control'].includes(lower)) {
      modifiers.push('control down');
    } else if (['alt', 'option'].includes(lower)) {
      modifiers.push('option down');
    } else if (['shift'].includes(lower)) {
      modifiers.push('shift down');
    } else {
      key = part;
    }
  }

  const modString = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';

  if (KEY_CODE_MAP[key] !== undefined) {
    const script = `tell application "System Events" to key code ${KEY_CODE_MAP[key]}${modString}`;
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
  } else if (key.length === 1) {
    const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "System Events" to keystroke "${escaped}"${modString}`;
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
  } else {
    // Fallback: try keystroke with the raw string
    const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "System Events" to keystroke "${escaped}"${modString}`;
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
  }
}

/**
 * Scroll at a given position.
 * direction: 'up' | 'down' | 'left' | 'right'
 * amount: number of scroll units
 */
export function scroll(
  x: number,
  y: number,
  direction: 'up' | 'down' | 'left' | 'right',
  amount: number
): void {
  // First move cursor to position, then scroll
  mouseMove(x, y);

  let dx = 0;
  let dy = 0;
  if (direction === 'up') dy = amount;
  else if (direction === 'down') dy = -amount;
  else if (direction === 'left') dx = amount;
  else if (direction === 'right') dx = -amount;

  const jsScript = `
    ObjC.import('CoreGraphics');
    var event = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 2, ${dy}, ${dx});
    $.CGEventPost($.kCGHIDEventTap, event);
  `;
  execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
}

/** Get the current cursor position. */
export function getCursorPosition(): { x: number; y: number } {
  const jsScript = `
    ObjC.import('CoreGraphics');
    var event = $.CGEventCreate(null);
    var point = $.CGEventGetLocation(event);
    point.x + ',' + point.y;
  `;
  const output = execSync(`osascript -l JavaScript -e '${jsScript.replace(/'/g, "'\\''")}'`, {
    timeout: 5000,
    encoding: 'utf-8',
  }).trim();
  const [xStr, yStr] = output.split(',');
  return { x: parseFloat(xStr), y: parseFloat(yStr) };
}

/** Wait/pause for a specified number of seconds. */
export function wait(seconds: number): void {
  execSync(`sleep ${seconds}`, { timeout: (seconds + 2) * 1000 });
}
