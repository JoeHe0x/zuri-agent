import { parseArgs } from "node:util";
import { ZuriError } from "./client.mjs";
import { browserName } from "./browser-registry.mjs";
import { COMMANDS, commandOptions } from "./commands.mjs";

function invalid(message) {
  throw new ZuriError("invalid_arguments", message);
}

function helpTopic(parts) {
  if (parts.length === 0) return undefined;
  if (!Object.hasOwn(COMMANDS, parts[0]) || parts[0] === "help") invalid(`Unknown help topic: ${parts.join(" ")}. Use zuri --help.`);
  if (parts.length === 1) return parts[0];
  invalid("Use zuri help COMMAND.");
}

/** Parse syntax only. A prompt or args value of "-" is read from stdin by the caller. */
export function parseCommand(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, tokens: true, options: {
      session: { type: "string", short: "s" }, timeout: { type: "string" },
      title: { type: "string", short: "t" }, client: { type: "string", short: "c" },
      "wait-id": { type: "string" }, format: { type: "string" }, query: { type: "string" },
      start: { type: "string" }, limit: { type: "string" }, scope: { type: "string" }, filename: { type: "string" },
      parent: { type: "string" }, port: { type: "string" }, name: { type: "string" }, "no-open": { type: "boolean" },
      wait: { type: "boolean" }, stream: { type: "boolean" }, steer: { type: "boolean" },
      json: { type: "boolean" }, plain: { type: "boolean" }, "no-color": { type: "boolean" },
      help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
    } });
  } catch (error) { invalid(error.message); }

  const options = { ...parsed.values };
  const seen = new Set();
  for (const token of parsed.tokens) {
    if (token.kind !== "option" || token.value === undefined) continue;
    const name = token.name;
    if (seen.has(name)) invalid(`Provide --${name} only once.`);
    seen.add(name);
  }
  if (options.json && options.plain) invalid("Choose --json or --plain.");
  if (options.version) {
    if (parsed.positionals.length || Object.keys(options).some(name => !["version", "json", "plain", "no-color"].includes(name))) {
      invalid("Use zuri --version or zuri -v without a command.");
    }
    return { command: "version", options };
  }

  const [originalCommand = "help", ...words] = parsed.positionals;
  if (!Object.hasOwn(COMMANDS, originalCommand)) invalid(`Unknown command: ${originalCommand}. Use zuri --help.`);
  const allowed = new Set(commandOptions(originalCommand, words[0]));
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) invalid(`--${name} is not available for zuri ${originalCommand}.`);
  }
  const timeoutSeconds = options.timeout === undefined ? originalCommand === "connect" ? 30 : 180 : Number(options.timeout);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 3600) invalid("--timeout must be greater than 0 and at most 3600 seconds.");
  for (const name of ["session", "client", "wait-id", "parent"]) {
    if (options[name] !== undefined && !options[name].trim()) invalid(`--${name} requires a non-empty ID.`);
  }
  if (options.name !== undefined) {
    try { options.name = browserName(options.name); } catch (error) { invalid(error.message); }
  }
  if (options.client !== undefined && (options.name !== undefined || options["no-open"])) {
    invalid("Use --client to select an existing browser, or --name/--no-open to prepare a binding URL.");
  }
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!options.port.trim() || !Number.isInteger(port) || port < 1 || port > 65535) invalid("--port must be an integer from 1 to 65535.");
    options.port = port;
  }
  if (options.filename !== undefined && !options.filename.trim()) invalid("--filename requires a non-empty name.");
  if (options.scope !== undefined && !["all", "global", "site", "resident"].includes(options.scope)) invalid("--scope must be all, global, site, or resident.");
  if (options.client !== undefined) {
    options["client-id"] = options.client;
    delete options.client;
  }
  for (const name of ["start", "limit"]) {
    if (options[name] === undefined) continue;
    const value = Number(options[name]);
    if (!options[name].trim() || !Number.isSafeInteger(value) || value < (name === "start" ? 0 : 1) || (name === "limit" && value > 1000000)) {
      invalid(name === "start" ? "--start must be a non-negative integer." : "--limit must be an integer from 1 to 1000000.");
    }
    options[name] = value;
  }

  if (originalCommand === "help") return { command: "help", helpTopic: helpTopic(words), options, timeoutSeconds };
  if (options.help) {
    const parts = originalCommand === "tasks" && words[0] ? [originalCommand, words[0]] : [originalCommand];
    return { command: "help", helpTopic: helpTopic(parts), options, timeoutSeconds };
  }

  let command = originalCommand, action, id;
  if (command === "browsers") {
    action = words[0] || "list";
    if (action === "list" ? words.length > 1 : action !== "forget" || words.length !== 2 || !words[1].trim()) invalid("Use zuri browsers [list], or zuri browsers forget NAME|UUID.");
    id = words[1];
  } else if (command === "send") {
    id = words[0]; options.prompt = words.slice(1).join(" ");
    if (!id?.trim() || !options.prompt.trim()) invalid('Use zuri send TASK_ID "MESSAGE".');
  } else if (command === "data" || command === "images" || command === "skills") {
    action = words[0] || "list";
    const actions = Object.keys(COMMANDS[command].actions);
    const count = action === "list" || action === "tools" ? (words.length === 0 ? 0 : 1) : action === "read" ? 3 : 2;
    if (!actions.includes(action) || words.length !== count || words.some(word => !word.trim())) {
      invalid(`Use zuri ${command} ${actions.join("|")}${command === "skills" ? " NAME" : command === "data" ? " TABLE" : " COLLECTION"}.`);
    }
    id = words[1];
    if (command === "skills" && action === "read") { options.path = words[2]; options.start ??= 0; options.limit ??= 20000; }
    if (command === "data" && action === "export") {
      options.format ??= "xlsx";
      if (!["csv", "xlsx"].includes(options.format)) invalid("--format must be csv or xlsx.");
    }
  } else if (command === "settings") {
    action = words[0] || "get";
    if (action === "get") {
      if (words.length > 2 || (words.length === 2 && !words[1].trim())) invalid("Use zuri settings get [KEY].");
      id = words[1];
    } else if (action === "set") {
      if (words.length < 2 || words.length > 3 || !words[1].trim()) invalid("Use zuri settings set KEY VALUE, or zuri settings set JSON|-. ");
      if (words.length === 3) { id = words[1]; options.value = words[2]; }
      else options.args = words[1];
    } else {
      if (words.length !== 1 || !action.trim()) invalid("Use zuri settings [get] [KEY], or zuri settings set KEY VALUE.");
      id = action; action = "get";
    }
  } else if (command === "automations") {
    action = words[0] || "list";
    if (action === "list" ? words.length > 1 : action !== "run" || words.length !== 2 || !words[1].trim()) invalid("Use zuri automations [list], or zuri automations run ID.");
    id = words[1];
  } else if (command === "create") {
    options.prompt = words.join(" ");
    if (!options.prompt.trim()) invalid('Provide a prompt, for example: zuri create "Summarize the current page."');
    command = "tasks"; action = "create";
  } else if (command === "show" || command === "cancel") {
    if (words.length !== 1 || !words[0].trim()) invalid(`Use zuri ${command} TASK_ID.`);
    action = command === "show" ? "get" : "stop";
    command = "tasks"; id = words[0];
  } else if (["approve", "reject", "watch", "submit"].includes(command)) {
    const count = command === "submit" ? 2 : 1;
    if (words.length !== count || words.some(word => !word.trim())) invalid(`Use zuri ${command} TASK_ID${command === "submit" ? " JSON" : ""}.`);
    id = words[0];
    if (command === "submit") options.args = words[1];
    if (command === "watch") options.wait = true;
  } else if (command === "tasks") {
    if (words.length) invalid("Use zuri tasks to list tasks, zuri create PROMPT, zuri show ID, or zuri cancel ID.");
    action = "list";
  } else if (words.length) {
    invalid(`Use zuri ${command} without additional arguments.`);
  }
  if (options.stream) options.wait = true;
  const waitTimeoutSeconds = options.wait && options.timeout !== undefined ? timeoutSeconds : null;
  return { command, action, id, options, timeoutSeconds, waitTimeoutSeconds };
}
