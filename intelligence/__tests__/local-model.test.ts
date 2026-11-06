/**
 * intelligence/__tests__/local-model.test.ts
 *
 * Tests for the local model: the model artifact on disk, and the optional
 * small local server client.
 *
 * Run with:   npm run test:local-model
 *
 * Coverage:
 *   [artifact]
 *     - saveLocalModel writes a readable artifact; loadLocalModel reads it back.
 *     - round-trip preserves bias, weights and threshold exactly.
 *     - loadLocalModel falls back to the hand-set prior when the file is
 *       missing or corrupt — the system never fails to answer.
 *     - localModelSource reports which model is actually in force.
 *     - judgeWithLocalModel scores against the artifact.
 *
 *   [local server]
 *     - defaults to a small model and a loopback URL.
 *     - isLoopbackUrl accepts localhost/127.0.0.1/::1, rejects anything else.
 *     - assertLocalOnly refuses a remote URL, and allows it only with
 *       LOCAL_ALLOW_REMOTE=1.
 *     - checkLocalServer returns false (never throws) when unreachable.
 *     - readWithLocalServer parses a well-formed reply.
 *     - readWithLocalServer returns null on prose, fences, bad JSON,
 *       non-ok status, and network failure.
 */

import { strict as assert } from "assert";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import {
  DEFAULT_MODEL,
  FEATURE_NAMES,
  predict,
  type BenefitFeatures,
  type TinyModel,
} from "../tiny-model";

import {
  DEFAULT_LOCAL_MODEL,
  DEFAULT_MODEL_PATH,
  assertLocalOnly,
  checkLocalServer,
  isLocalServerConfigured,
  isLoopbackUrl,
  judgeWithLocalModel,
  loadLocalModel,
  localModelSource,
  parseJsonObject,
  readLocalServerConfig,
  readWithLocalServer,
  saveLocalModel,
  type LocalServerConfig,
} from "../local-model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempFile(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "local-model-"));
  return path.join(dir, name);
}

function features(overrides: Partial<BenefitFeatures> = {}): BenefitFeatures {
  const base: BenefitFeatures = {
    spendRatio: 0.1,
    runwayAfter: 0.8,
    recipientKnown: 1,
    recipientUnknown: 0,
    evidenceLinked: 1,
    coiRisk: 0,
    selectorAuthorized: 1,
    voteQuality: 0.7,
    disclosure: 1,
  };
  return { ...base, ...overrides };
}

const TRAINED: TinyModel = {
  bias: -1.8213,
  weights: [-6.508, 2.343, -0.444, -1.067, 0.99, -4.429, 1.123, 1.353, 2.624],
  threshold: 0.5,
  featureNames: [...FEATURE_NAMES],
};

// ============================================================================
// The model artifact
// ============================================================================

describe("local-model artifact", () => {
  it("saves and loads an artifact without loss", () => {
    const file = tempFile("benefit-model.json");
    saveLocalModel(TRAINED, file);
    assert.ok(existsSync(file));

    const loaded = loadLocalModel(file);
    assert.equal(loaded.bias, TRAINED.bias);
    assert.deepEqual(loaded.weights, TRAINED.weights);
    assert.equal(loaded.threshold, TRAINED.threshold);
    assert.deepEqual(loaded.featureNames, TRAINED.featureNames);
  });

  it("writes valid JSON with the expected shape", () => {
    const file = tempFile("benefit-model.json");
    saveLocalModel(TRAINED, file);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(typeof raw.bias, "number");
    assert.equal(raw.weights.length, FEATURE_NAMES.length);
    assert.equal(raw.threshold, 0.5);
  });

  it("falls back to the hand-set prior when the artifact is missing", () => {
    const missing = tempFile("does-not-exist.json");
    const loaded = loadLocalModel(missing);
    assert.deepEqual(loaded.weights, DEFAULT_MODEL.weights);
    assert.equal(loaded.bias, DEFAULT_MODEL.bias);
  });

  it("falls back to the hand-set prior when the artifact is corrupt", () => {
    const file = tempFile("benefit-model.json");
    writeFileSync(file, "{ not json at all", "utf8");
    const loaded = loadLocalModel(file);
    assert.deepEqual(loaded.weights, DEFAULT_MODEL.weights);
  });

  it("falls back to the hand-set prior when weights are the wrong length", () => {
    const file = tempFile("benefit-model.json");
    writeFileSync(file, JSON.stringify({ bias: 0, weights: [1, 2, 3] }), "utf8");
    const loaded = loadLocalModel(file);
    assert.deepEqual(loaded.weights, DEFAULT_MODEL.weights);
  });

  it("localModelSource reports the artifact when present", () => {
    const file = tempFile("benefit-model.json");
    saveLocalModel(TRAINED, file);
    const info = localModelSource(file);
    assert.equal(info.source, "artifact");
  });

  it("localModelSource reports the prior, with a reason, when missing or corrupt", () => {
    const missing = localModelSource(tempFile("missing.json"));
    assert.equal(missing.source, "prior");
    assert.equal(missing.reason, "artifact file not found");

    const bad = tempFile("bad.json");
    writeFileSync(bad, "nope", "utf8");
    const corrupt = localModelSource(bad);
    assert.equal(corrupt.source, "prior");
    assert.equal(corrupt.reason, "artifact unparseable");
  });

  it("judges against the artifact, not the prior", () => {
    const file = tempFile("benefit-model.json");
    saveLocalModel(TRAINED, file);
    const f = features({ coiRisk: 0.9 });

    const fromArtifact = judgeWithLocalModel(f, file);
    const fromPrior = predict(DEFAULT_MODEL, f);
    assert.notEqual(fromArtifact.score, fromPrior.score);
    assert.equal(fromArtifact.decision, predict(TRAINED, f).decision);
  });

  it("a persisted artifact reproduces the same decision after reload", () => {
    const file = tempFile("benefit-model.json");
    saveLocalModel(TRAINED, file);
    const f = features();
    assert.equal(
      judgeWithLocalModel(f, file).score,
      predict(loadLocalModel(file), f).score
    );
  });
});

// ============================================================================
// Optional small local server
// ============================================================================

describe("local-model server client", () => {
  it("defaults to a small model on loopback", () => {
    const config = readLocalServerConfig({});
    assert.equal(config.model, DEFAULT_LOCAL_MODEL);
    assert.ok(isLoopbackUrl(config.baseUrl));
  });

  it("honours env overrides", () => {
    const config = readLocalServerConfig({
      LOCAL_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_MODEL: "qwen2.5:0.5b",
      LOCAL_API_KEY: "local",
      LOCAL_TIMEOUT_MS: "1234",
    });
    assert.equal(config.baseUrl, "http://127.0.0.1:1234/v1");
    assert.equal(config.model, "qwen2.5:0.5b");
    assert.equal(config.apiKey, "local");
    assert.equal(config.timeoutMs, 1234);
  });

  it("is opt-in: not configured unless LOCAL_BASE_URL is set", () => {
    assert.equal(isLocalServerConfigured({}), false);
    assert.equal(isLocalServerConfigured({ LOCAL_BASE_URL: "http://127.0.0.1:11434/v1" }), true);
  });

  it("isLoopbackUrl accepts loopback hosts and rejects everything else", () => {
    for (const url of [
      "http://localhost:11434/v1",
      "http://127.0.0.1:11434/v1",
      "http://[::1]:11434/v1",
    ]) {
      assert.equal(isLoopbackUrl(url), true, url);
    }
    for (const url of [
      "https://api.groq.com/openai/v1",
      "https://api.openai.com/v1",
      "http://192.168.1.5:11434/v1",
      "http://example.com",
      "not a url",
    ]) {
      assert.equal(isLoopbackUrl(url), false, url);
    }
  });

  it("assertLocalOnly refuses a remote endpoint", () => {
    const remote: LocalServerConfig = {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4",
      timeoutMs: 1000,
    };
    assert.throws(() => assertLocalOnly(remote, {}), /must be loopback/);
  });

  it("assertLocalOnly allows a remote endpoint only with LOCAL_ALLOW_REMOTE=1", () => {
    const remote: LocalServerConfig = {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4",
      timeoutMs: 1000,
    };
    assert.doesNotThrow(() => assertLocalOnly(remote, { LOCAL_ALLOW_REMOTE: "1" }));
  });

  it("checkLocalServer returns false rather than throwing when unreachable", async () => {
    const config: LocalServerConfig = {
      baseUrl: "http://127.0.0.1:9/v1",
      model: DEFAULT_LOCAL_MODEL,
      timeoutMs: 500,
      fetchImpl: (async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
    };
    assert.equal(await checkLocalServer(config), false);
  });

  it("checkLocalServer refuses a remote endpoint without throwing", async () => {
    const config: LocalServerConfig = {
      baseUrl: "https://api.openai.com/v1",
      model: DEFAULT_LOCAL_MODEL,
      timeoutMs: 500,
    };
    assert.equal(await checkLocalServer(config), false);
  });

  it("parseJsonObject handles bare JSON, fenced JSON and prose around it", () => {
    assert.deepEqual(parseJsonObject('{"decision":"ACCEPT","benefit":0.9}'), {
      decision: "ACCEPT",
      benefit: 0.9,
    });
    assert.deepEqual(
      parseJsonObject('```json\n{"decision":"DENY","benefit":0.1}\n```'),
      { decision: "DENY", benefit: 0.1 }
    );
    assert.deepEqual(
      parseJsonObject('Sure! Here you go: {"decision":"DENY"} hope that helps'),
      { decision: "DENY" }
    );
    assert.equal(parseJsonObject("no json here"), null);
    assert.equal(parseJsonObject('{"decision":'), null);
  });

  function mockFetch(body: unknown, ok = true): typeof fetch {
    return (async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    })) as unknown as typeof fetch;
  }

  it("readWithLocalServer parses a well-formed reply", async () => {
    const config: LocalServerConfig = {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: DEFAULT_LOCAL_MODEL,
      timeoutMs: 1000,
      fetchImpl: mockFetch({
        choices: [
          {
            message: {
              content: '{"decision":"DENY","benefit":0.2,"rationale":"spend too large"}',
            },
          },
        ],
      }),
    };
    const reading = await readWithLocalServer(config, "Transfer 900,000 USDC to 0xabc");
    assert.ok(reading);
    assert.equal(reading.decision, "DENY");
    assert.equal(reading.benefit, 0.2);
    assert.equal(reading.rationale, "spend too large");
  });

  it("readWithLocalServer clamps benefit into [0, 1]", async () => {
    const config: LocalServerConfig = {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: DEFAULT_LOCAL_MODEL,
      timeoutMs: 1000,
      fetchImpl: mockFetch({
        choices: [{ message: { content: '{"decision":"ACCEPT","benefit":5}' } }],
      }),
    };
    const reading = await readWithLocalServer(config, "x");
    assert.ok(reading);
    assert.equal(reading.benefit, 1);
  });

  it("readWithLocalServer returns null on non-ok, bad JSON, and network failure", async () => {
    const base = { model: DEFAULT_LOCAL_MODEL, timeoutMs: 1000 };

    assert.equal(
      await readWithLocalServer(
        { ...base, baseUrl: "http://127.0.0.1:11434/v1", fetchImpl: mockFetch({}, false) },
        "x"
      ),
      null
    );
    assert.equal(
      await readWithLocalServer(
        {
          ...base,
          baseUrl: "http://127.0.0.1:11434/v1",
          fetchImpl: mockFetch({ choices: [{ message: { content: "I cannot help" } }] }),
        },
        "x"
      ),
      null
    );
    assert.equal(
      await readWithLocalServer(
        {
          ...base,
          baseUrl: "http://127.0.0.1:11434/v1",
          fetchImpl: (async () => {
            throw new Error("offline");
          }) as unknown as typeof fetch,
        },
        "x"
      ),
      null
    );
  });

  it("readWithLocalServer refuses a remote endpoint", async () => {
    const config: LocalServerConfig = {
      baseUrl: "https://api.openai.com/v1",
      model: DEFAULT_LOCAL_MODEL,
      timeoutMs: 1000,
    };
    assert.equal(await readWithLocalServer(config, "x"), null);
  });
});
