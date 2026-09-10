// src/helpers.ts
import * as actionsCore from "@actions/core";
import { log } from "@determinate-systems/detsys-ts";
import * as fs from "fs/promises";
import * as os from "os";
import path from "path";
import { Tail } from "tail";
function getTrinaryInput(name) {
  const trueValue = ["true", "True", "TRUE", "enabled"];
  const falseValue = ["false", "False", "FALSE", "disabled"];
  const noPreferenceValue = ["", "null", "no-preference"];
  const val = actionsCore.getInput(name);
  if (trueValue.includes(val)) {
    return "enabled";
  }
  if (falseValue.includes(val)) {
    return "disabled";
  }
  if (noPreferenceValue.includes(val)) {
    return "no-preference";
  }
  const possibleValues = trueValue.concat(falseValue).concat(noPreferenceValue).join(" | ");
  throw new TypeError(
    `Input ${name} does not look like a trinary, which requires one of:
${possibleValues}`
  );
}
function tailLog(daemonDir) {
  const tail = new Tail(path.join(daemonDir, "daemon.log"));
  log.debug(`tailing daemon.log...`);
  tail.on("line", (line) => {
    log.info(line);
  });
  return tail;
}
async function netrcPath() {
  const expectedNetrcPath = path.join(
    process.env["RUNNER_TEMP"] ?? os.tmpdir(),
    "determinate-nix-installer-netrc"
  );
  try {
    await fs.access(expectedNetrcPath);
    return expectedNetrcPath;
  } catch {
    const destinedNetrcPath = path.join(
      process.env["RUNNER_TEMP"] ?? os.tmpdir(),
      "magic-nix-cache-netrc"
    );
    try {
      await flakeHubLogin(destinedNetrcPath);
    } catch (e) {
      log.info("FlakeHub Cache is disabled due to missing or invalid token");
      log.info(
        `If you're signed up for FlakeHub Cache, make sure that your Actions config has a \`permissions\` block with \`id-token\` set to "write" and \`contents\` set to "read"`
      );
      log.debug(`Error while logging into FlakeHub: ${e}`);
    }
    return destinedNetrcPath;
  }
}
async function flakeHubLogin(netrc) {
  const jwt = await actionsCore.getIDToken("api.flakehub.com");
  await fs.writeFile(
    netrc,
    [
      `machine api.flakehub.com login flakehub password ${jwt}`,
      `machine flakehub.com login flakehub password ${jwt}`,
      `machine cache.flakehub.com login flakehub password ${jwt}`
    ].join("\n")
  );
  log.info("Logged in to FlakeHub.");
}

// src/index.ts
import * as actionsCore2 from "@actions/core";
import * as actionsGithub from "@actions/github";
import {
  DetSysAction,
  inputs,
  log as log2,
  stringifyError,
  withSpan
} from "@determinate-systems/detsys-ts";
import got from "got";
import * as http from "http";
import { spawn } from "child_process";
import { mkdirSync, openSync, readFileSync } from "fs";
import * as fs2 from "fs/promises";
import * as path2 from "path";
import { setTimeout } from "timers/promises";
var ENV_DAEMON_DIR = "MAGIC_NIX_CACHE_DAEMONDIR";
var ENV_MNC_ADDR = "MAGIC_NIX_CACHE_ADDRESS";
var ATTR_ENV_VARS_PRESENT = "detsys.magic_nix_cache.required_env_vars_present";
var ATTR_SENT_SIGTERM = "detsys.magic_nix_cache.sent_sigterm";
var ATTR_DIFF_STORE_ENABLED = "detsys.magic_nix_cache.diff_store";
var ATTR_ALREADY_RUNNING = "detsys.magic_nix_cache.noop_mode";
var ATTR_USE_FLAKEHUB = "detsys.magic_nix_cache.use_flakehub";
var ATTR_USE_GHA_CACHE = "detsys.magic_nix_cache.use_gha_cache";
var ATTR_DAEMON_ALREADY_STARTED = "detsys.magic_nix_cache.daemon_already_started";
var ATTR_DAEMON_PID = "detsys.magic_nix_cache.daemon_pid";
var ATTR_STATUS_CODE = "detsys.status_code";
var STATE_DAEMONDIR = "MAGIC_NIX_CACHE_DAEMONDIR";
var STATE_ERROR_IN_MAIN = "ERROR_IN_MAIN";
var STATE_STARTED = "MAGIC_NIX_CACHE_STARTED";
var STARTED_HINT = "true";
var TEXT_ALREADY_RUNNING = "Magic Nix Cache is already running, this workflow job is in noop mode. Is the Magic Nix Cache in the workflow twice?";
var TEXT_TRUST_UNTRUSTED = "The Nix daemon does not consider the user running this workflow to be trusted. Magic Nix Cache is disabled.";
var TEXT_TRUST_UNKNOWN = "The Nix daemon may not consider the user running this workflow to be trusted. Magic Nix Cache may not start correctly.";
var MagicNixCacheAction = class extends DetSysAction {
  constructor() {
    super({
      name: "magic-nix-cache",
      fetchStyle: "gh-env-style",
      idsProjectName: "magic-nix-cache-closure",
      requireNix: "warn",
      diagnosticsSuffix: "perf"
    });
    this.hostAndPort = inputs.getString("listen");
    this.diffStore = inputs.getBool("diff-store");
    this.setAttribute(ATTR_DIFF_STORE_ENABLED, this.diffStore);
    this.httpClient = got.extend({
      retry: {
        limit: 1,
        methods: ["POST", "GET", "PUT", "HEAD", "DELETE", "OPTIONS", "TRACE"]
      },
      hooks: {
        beforeRetry: [
          (error, retryCount) => {
            log2.info(
              `Retrying after error ${error.code}, retry #: ${retryCount}`
            );
          }
        ]
      }
    });
    this.daemonStarted = actionsCore2.getState(STATE_STARTED) === STARTED_HINT;
    if (actionsCore2.getState(STATE_DAEMONDIR) !== "") {
      this.daemonDir = actionsCore2.getState(STATE_DAEMONDIR);
    } else {
      this.daemonDir = this.getTemporaryName();
      mkdirSync(this.daemonDir);
      actionsCore2.saveState(STATE_DAEMONDIR, this.daemonDir);
    }
    if (process.env[ENV_DAEMON_DIR] === void 0) {
      this.alreadyRunning = false;
      actionsCore2.exportVariable(ENV_DAEMON_DIR, this.daemonDir);
    } else {
      this.alreadyRunning = process.env[ENV_DAEMON_DIR] !== this.daemonDir;
    }
    this.setAttribute(ATTR_ALREADY_RUNNING, this.alreadyRunning);
    if (process.env[ENV_MNC_ADDR] !== void 0) {
      this.hostAndPort = process.env[ENV_MNC_ADDR];
      actionsCore2.exportVariable(ENV_MNC_ADDR, this.hostAndPort);
    }
    this.stapleFile("daemon.log", path2.join(this.daemonDir, "daemon.log"));
  }
  async main() {
    if (this.alreadyRunning) {
      log2.warning(TEXT_ALREADY_RUNNING);
      return;
    }
    if (this.nixStoreTrust === "untrusted") {
      log2.warning(TEXT_TRUST_UNTRUSTED);
      return;
    } else if (this.nixStoreTrust === "unknown") {
      log2.info(TEXT_TRUST_UNKNOWN);
    }
    await this.setUpAutoCache();
    await this.notifyAutoCache();
  }
  async post() {
    if (!this.strictMode && this.errorInMain) {
      log2.warning(
        `skipping post phase due to error in main phase: ${this.errorInMain}`
      );
      return;
    }
    if (this.alreadyRunning) {
      log2.debug(TEXT_ALREADY_RUNNING);
      return;
    }
    if (this.nixStoreTrust === "untrusted") {
      log2.debug(TEXT_TRUST_UNTRUSTED);
      return;
    } else if (this.nixStoreTrust === "unknown") {
      log2.debug(TEXT_TRUST_UNKNOWN);
    }
    await this.tearDownAutoCache();
  }
  async setUpAutoCache() {
    return withSpan("set_up_auto_cache", async (span) => {
      const requiredEnv = [
        "ACTIONS_CACHE_URL",
        "ACTIONS_RUNTIME_URL",
        "ACTIONS_RUNTIME_TOKEN"
      ];
      let anyMissing = false;
      for (const n of requiredEnv) {
        if (!process.env.hasOwnProperty(n)) {
          anyMissing = true;
          log2.warning(
            `Disabling automatic caching since required environment ${n} isn't available`
          );
        }
      }
      this.setAttribute(ATTR_ENV_VARS_PRESENT, !anyMissing);
      if (anyMissing) {
        return;
      }
      span.setAttribute(ATTR_DAEMON_ALREADY_STARTED, this.daemonStarted);
      if (this.daemonStarted) {
        log2.debug("Already started.");
        return;
      }
      log2.debug(`GitHub Action Cache URL: ${process.env["ACTIONS_CACHE_URL"]}`);
      const daemonBin = await this.unpackClosure("magic-nix-cache");
      const extraEnv = {
        GITHUB_CONTEXT: JSON.stringify(actionsGithub.context)
      };
      const telemetryEnv = await this.getTelemetryEnvironment();
      let runEnv = {};
      if (actionsCore2.isDebug()) {
        runEnv = {
          RUST_LOG: "debug,magic_nix_cache=trace,gha_cache=trace",
          RUST_BACKTRACE: "full",
          ...process.env,
          ...extraEnv,
          ...telemetryEnv
        };
      } else {
        runEnv = {
          ...process.env,
          ...extraEnv,
          ...telemetryEnv
        };
      }
      const notifyPromise = new Promise(
        (resolveListening, rejectListening) => {
          const promise = new Promise((resolveQuit, rejectQuit) => {
            const notifyServer = http.createServer((req, res) => {
              if (req.method === "POST" && req.url === "/") {
                const data = [];
                req.on("data", (chunk) => {
                  data.push(chunk);
                });
                req.on("end", () => {
                  try {
                    const body = JSON.parse(Buffer.concat(data).toString());
                    log2.debug(`Notify server shutting down.`);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end("{}");
                    notifyServer.close(() => {
                      resolveQuit(body.address);
                    });
                  } catch (e) {
                    rejectQuit(e);
                  }
                });
              }
            });
            notifyServer.listen(
              inputs.getString("startup-notification-port"),
              () => {
                log2.debug(`Notify server running.`);
                const addr = notifyServer.address();
                if (typeof addr === "string") {
                  resolveListening([promise, addr]);
                } else if (addr !== null) {
                  resolveListening([promise, `http://127.0.0.1:${addr.port}`]);
                } else {
                  rejectListening(
                    new Error("Server failed to start correctly")
                  );
                }
              }
            );
          });
        }
      );
      const outputPath = `${this.daemonDir}/daemon.log`;
      const output = openSync(outputPath, "a");
      const daemonLog = tailLog(this.daemonDir);
      const netrc = await netrcPath();
      const nixConfPath = `${process.env["HOME"]}/.config/nix/nix.conf`;
      const upstreamCache = inputs.getString("upstream-cache");
      const useFlakeHub = getTrinaryInput("use-flakehub");
      const flakeHubCacheServer = inputs.getString("flakehub-cache-server");
      const flakeHubApiServer = inputs.getString("flakehub-api-server");
      const flakeHubFlakeName = inputs.getString("flakehub-flake-name");
      const useGhaCache = getTrinaryInput("use-gha-cache");
      span.setAttribute(ATTR_USE_FLAKEHUB, useFlakeHub);
      span.setAttribute(ATTR_USE_GHA_CACHE, useGhaCache);
      await new Promise((resolve) => {
        notifyPromise.then(async (promiseResult) => {
          const daemonCliFlags = [
            "--startup-notification-url",
            promiseResult[1],
            "--listen",
            this.hostAndPort,
            "--upstream",
            upstreamCache,
            "--diagnostic-endpoint",
            (await this.getDiagnosticsUrl())?.toString() ?? "",
            "--nix-conf",
            nixConfPath,
            "--use-gha-cache",
            useGhaCache,
            "--use-flakehub",
            useFlakeHub
          ].concat(this.diffStore ? ["--diff-store"] : []).concat(
            useFlakeHub !== "disabled" ? [
              "--flakehub-cache-server",
              flakeHubCacheServer,
              "--flakehub-api-server",
              flakeHubApiServer,
              "--flakehub-api-server-netrc",
              netrc,
              "--flakehub-flake-name",
              flakeHubFlakeName
            ] : []
          );
          const opts = {
            stdio: ["ignore", output, output],
            env: runEnv,
            detached: true
          };
          log2.debug("Full daemon start command:");
          log2.debug(`${daemonBin} ${daemonCliFlags.join(" ")}`);
          const daemon = spawn(daemonBin, daemonCliFlags, opts);
          this.daemonStarted = true;
          actionsCore2.saveState(STATE_STARTED, STARTED_HINT);
          if (daemon.pid !== void 0) {
            span.setAttribute(ATTR_DAEMON_PID, daemon.pid);
          }
          const pidFile = path2.join(this.daemonDir, "daemon.pid");
          await fs2.writeFile(pidFile, `${daemon.pid}`);
          log2.info("Waiting for magic-nix-cache to start...");
          this.hostAndPort = await promiseResult[0];
          actionsCore2.exportVariable(ENV_MNC_ADDR, this.hostAndPort);
          resolve();
          daemon.on("exit", (code, signal) => {
            let msg;
            if (signal) {
              msg = `Daemon was killed by signal ${signal}`;
            } else if (code) {
              msg = `Daemon exited with code ${code}`;
            } else {
              msg = "Daemon unexpectedly exited";
            }
            this.exitMain(msg);
          });
          daemon.unref();
        }).catch((e) => {
          this.exitMain(`Error in notifyPromise: ${stringifyError(e)}`);
        });
      });
      log2.info("Launched Magic Nix Cache");
      daemonLog.unwatch();
    });
  }
  async notifyAutoCache() {
    return withSpan("notify_auto_cache", async (span) => {
      if (!this.daemonStarted) {
        log2.debug("magic-nix-cache not started - Skipping");
        return;
      }
      try {
        log2.debug(`Indicating workflow start`);
        const res = await this.httpClient.post(
          `http://${this.hostAndPort}/api/workflow-start`
        );
        span.setAttribute(ATTR_STATUS_CODE, res.statusCode);
        log2.debug(
          `Response from POST to /api/workflow-start: (status: ${res.statusCode}, body: ${res.body})`
        );
        if (res.statusCode !== 200) {
          throw new Error(
            `Failed to trigger workflow start hook; expected status 200 but got (status: ${res.statusCode}, body: ${res.body})`
          );
        }
        log2.debug(`back from post: ${res.body}`);
      } catch (e) {
        this.exitMain(
          `Error starting the Magic Nix Cache: ${stringifyError(e)}`
        );
      }
    });
  }
  async tearDownAutoCache() {
    return withSpan("tear_down_auto_cache", async (span) => {
      if (!this.daemonStarted) {
        log2.debug("magic-nix-cache not started - Skipping");
        return;
      }
      const pidFile = path2.join(this.daemonDir, "daemon.pid");
      const pid = parseInt(await fs2.readFile(pidFile, { encoding: "ascii" }));
      log2.debug(`found daemon pid: ${pid}`);
      if (!pid) {
        throw new Error("magic-nix-cache did not start successfully");
      }
      span.setAttribute(ATTR_DAEMON_PID, pid);
      const daemonLog = tailLog(this.daemonDir);
      try {
        log2.debug(`about to post to localhost`);
        const res = await this.httpClient.post(
          `http://${this.hostAndPort}/api/workflow-finish`
        );
        span.setAttribute(ATTR_STATUS_CODE, res.statusCode);
        log2.debug(
          `Response from POST to /api/workflow-finish: (status: ${res.statusCode}, body: ${res.body})`
        );
        if (res.statusCode !== 200) {
          throw new Error(
            `Failed to trigger workflow finish hook; expected status 200 but got (status: ${res.statusCode}, body: ${res.body})`
          );
        }
      } finally {
        log2.debug(`unwatching the daemon log`);
        daemonLog.unwatch();
      }
      log2.debug(`killing daemon process ${pid}`);
      let sentSigterm = false;
      try {
        for (let i = 0; i < 30 * 10; i++) {
          process.kill(pid, 0);
          await setTimeout(100);
        }
        sentSigterm = true;
        log2.info(`Sending Magic Nix Cache a SIGTERM`);
        process.kill(pid, "SIGTERM");
      } catch {
      }
      this.setAttribute(ATTR_SENT_SIGTERM, sentSigterm);
      if (actionsCore2.isDebug()) {
        log2.info("Entire log:");
        const entireLog = readFileSync(path2.join(this.daemonDir, "daemon.log"));
        log2.info(entireLog.toString());
      }
    });
  }
  // Exit the workflow during the main phase. If strict mode is set, fail; if not, save the error
  // message to the workflow's state and exit successfully.
  exitMain(msg) {
    if (this.strictMode) {
      log2.setFailed(msg);
    } else {
      actionsCore2.saveState(STATE_ERROR_IN_MAIN, msg);
      process.exit(0);
    }
  }
  // If the main phase threw an error (not in strict mode), this will be a non-empty
  // string available in the post phase.
  get errorInMain() {
    const state = actionsCore2.getState(STATE_ERROR_IN_MAIN);
    return state !== "" ? state : void 0;
  }
};
function main() {
  new MagicNixCacheAction().execute();
}
main();
//# sourceMappingURL=index.js.map