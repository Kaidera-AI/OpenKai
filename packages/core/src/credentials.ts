/**
 * Persistent pi-ai credential store — file-backed `CredentialStore` at
 * `~/.openkai/auth.json` (ren review: credentials must survive a restart, the
 * default `InMemoryCredentialStore` forgets OAuth tokens on exit).
 *
 * The file maps provider id → one type-tagged `Credential` (pi-ai's auth.json
 * shape). Writes go exclusively through `modify`/`delete`, serialised on a
 * single in-process promise chain (one shared file means per-provider chains
 * would still race) and persisted atomically (tmp+rename) so a crash
 * mid-write cannot truncate the store. The directory is 0700 and the file
 * 0600 (chmod after every write — a pre-existing loose file gets narrowed),
 * matching the session tree's owner-only rule.
 *
 * Cross-process exclusion is out of scope (the pi-ai interface documents it
 * as "where the backing store supports it"); OpenKai runs one process per
 * terminal. `list` only reads the file — it never resolves auth, so it never
 * executes configured api-key commands (per the interface contract).
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
  Models,
} from "@earendil-works/pi-ai";
import { ollamaCloudProvider, ollamaProvider } from "./ollama.js";

/** Owner-only modes, same rule as the session tree (E001 finding F7). */
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Monotonic suffix so concurrent writeAll calls never share a tmp path. */
let writeCounter = 0;

/** The OpenKai home directory (~/.openkai or $OPENKAI_HOME for tests). */
export function openkaiHome(): string {
  return process.env.OPENKAI_HOME ?? path.join(os.homedir(), ".openkai");
}

/** Path of the credential store file. */
export function authFilePath(): string {
  return path.join(openkaiHome(), "auth.json");
}

/**
 * File-backed {@link CredentialStore}. `read`/`list` resolve `undefined`/
 * empty for a missing file; an unparseable file is treated as empty (a
 * corrupt store is unrecoverable anyway, and bricking all auth behind a
 * parse error is the worse failure). Methods reject only on storage I/O
 * failure, per the pi-ai error-semantics contract.
 */
export class FileCredentialStore implements CredentialStore {
  private readonly filePath: string;
  /**
   * Single write chain serialising every modify/delete. The store is one
   * shared file, so per-provider chains would still race read-modify-write
   * across providers and lose updates; one chain satisfies the interface's
   * per-provider mutual exclusion too.
   */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(filePath: string = authFilePath()) {
    this.filePath = filePath;
  }

  async read(
    providerId: string,
    _options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    const all = await this.readAll();
    return all[providerId];
  }

  async list(_options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    // Read-only enumeration: no auth resolution, so no api-key command can
    // ever execute here (the interface's listing rule).
    const all = await this.readAll();
    return Object.entries(all).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    _options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.enqueue(async () => {
      const all = await this.readAll();
      const next = await fn(all[providerId]);
      if (next !== undefined) {
        all[providerId] = next;
        await this.writeAll(all);
      }
      return next;
    });
  }

  async delete(providerId: string, _options?: AuthOperationOptions): Promise<void> {
    await this.enqueue(async () => {
      const all = await this.readAll();
      if (providerId in all) {
        delete all[providerId];
        await this.writeAll(all);
      }
    });
  }

  /** Serialise work on the store-wide chain without releasing it early. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next;
    return next;
  }

  /** Read the whole store (missing/corrupt → empty). */
  private async readAll(): Promise<Record<string, Credential>> {
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf-8");
    } catch {
      return {};
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      return parsed as Record<string, Credential>;
    } catch {
      return {};
    }
  }

  /** Atomic persist: tmp file in the same directory + rename, 0600. */
  private async writeAll(all: Record<string, Credential>): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
    await fs.chmod(dir, DIR_MODE).catch(() => undefined);
    // Unique tmp name: different provider chains may persist concurrently.
    const tmp = `${this.filePath}.${process.pid}.${writeCounter++}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all, null, 2) + "\n", {
      encoding: "utf-8",
      mode: FILE_MODE,
    });
    await fs.rename(tmp, this.filePath);
    // rename preserves the tmp file's mode, but a pre-existing loose file is
    // only replaced — chmod anyway so any path lands owner-only.
    await fs.chmod(this.filePath, FILE_MODE).catch(() => undefined);
  }
}

/**
 * A pi-ai `Models` collection with every built-in provider registered and the
 * persistent {@link FileCredentialStore} injected, so logins and OAuth
 * refreshes land on disk instead of pi-ai's default in-memory store.
 *
 * The two Ollama lanes (E017) ride alongside the built-ins: they are
 * OpenKai-owned providers (pi-ai's catalogue has no Ollama entry) — the
 * keyless local lane and the OLLAMA_API_KEY cloud lane.
 */
export function defaultModels(): Models {
  const models = builtinModels({ credentials: new FileCredentialStore() });
  models.setProvider(ollamaProvider());
  models.setProvider(ollamaCloudProvider());
  return models;
}
