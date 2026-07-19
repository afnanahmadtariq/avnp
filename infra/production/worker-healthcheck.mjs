import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";

const timeoutMilliseconds = 5_000;
const redisUrlValue = process.env.REDIS_URL?.trim();

if (!redisUrlValue) {
  console.error("REDIS_URL is required for the worker health check.");
  process.exit(1);
}

let redisUrl;
try {
  redisUrl = new URL(redisUrlValue);
} catch {
  console.error("REDIS_URL is not a valid URL.");
  process.exit(1);
}

if (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") {
  console.error("REDIS_URL must use redis:// or rediss://.");
  process.exit(1);
}

function decodeCredential(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeCommand(parts) {
  const encodedParts = parts.map((part) => Buffer.from(part));
  const chunks = [Buffer.from(`*${encodedParts.length}\r\n`)];

  for (const part of encodedParts) {
    chunks.push(Buffer.from(`$${part.length}\r\n`), part, Buffer.from("\r\n"));
  }

  return Buffer.concat(chunks);
}

const username = decodeCredential(redisUrl.username);
const password = decodeCredential(redisUrl.password);
const commands = [];

if (password) {
  commands.push(username ? ["AUTH", username, password] : ["AUTH", password]);
}
commands.push(["PING"]);

const port = Number(redisUrl.port || 6379);
const connectionOptions = {
  host: redisUrl.hostname,
  port,
};
const socket =
  redisUrl.protocol === "rediss:"
    ? connectTls({ ...connectionOptions, servername: redisUrl.hostname })
    : connectTcp(connectionOptions);
const readyEvent =
  redisUrl.protocol === "rediss:" ? "secureConnect" : "connect";

let response = "";
let finished = false;

function finish(exitCode, message) {
  if (finished) return;
  finished = true;
  socket.destroy();
  if (message) console.error(message);
  process.exit(exitCode);
}

socket.setTimeout(timeoutMilliseconds);
socket.once(readyEvent, () => {
  socket.write(Buffer.concat(commands.map(encodeCommand)));
});
socket.on("data", (chunk) => {
  response += chunk.toString("utf8");
  if (response.includes("+PONG\r\n")) finish(0);
  if (response.includes("-WRONGPASS") || response.includes("-NOAUTH")) {
    finish(1, "Redis rejected the configured credentials.");
  }
});
socket.once("timeout", () => finish(1, "Redis health check timed out."));
socket.once("error", (error) =>
  finish(1, `Redis health check failed: ${error.message}`),
);
socket.once("close", () => {
  if (!finished) finish(1, "Redis closed the health-check connection.");
});
