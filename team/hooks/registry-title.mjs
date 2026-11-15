// PostToolUse hook for set_session_title: keeps the registry current when a chat renames itself
// (for example during team setup, when a new chat calls itself "Dev 3").

import { readInput, hostId, registerTitle } from "./lib.mjs";

const input = readInput();
const id = hostId();
const target = input.tool_input?.session_id;
const title = input.tool_input?.title;
const response = JSON.stringify(input.tool_response ?? "").toLowerCase();
const failed = /error|refused|denied|declined|not renamed/.test(response);

if (id && title && target === "self" && !failed) registerTitle(id, title);
