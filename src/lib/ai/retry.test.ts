import { describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  isRetryableStatus,
  shouldRetry,
  statusOf,
  withRetry,
} from "@/lib/ai/retry";

describe("isRetryableStatus", () => {
  it("treats rate limits and gateway errors as transient", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
  });

  it("treats client errors as permanent", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe("backoffDelay", () => {
  it("grows exponentially with the attempt number", () => {
    const noJitter = () => 1;
    expect(backoffDelay(1, 500, 8_000, noJitter)).toBe(500);
    expect(backoffDelay(2, 500, 8_000, noJitter)).toBe(1_000);
    expect(backoffDelay(3, 500, 8_000, noJitter)).toBe(2_000);
  });

  it("never exceeds the cap", () => {
    expect(backoffDelay(20, 500, 8_000, () => 1)).toBe(8_000);
  });

  it("stays within the jitter band", () => {
    // Full jitter: [ceiling/2, ceiling].
    expect(backoffDelay(3, 500, 8_000, () => 0)).toBe(1_000);
    expect(backoffDelay(3, 500, 8_000, () => 1)).toBe(2_000);
  });

  it("treats a non-positive attempt as the first one", () => {
    expect(backoffDelay(0, 500, 8_000, () => 1)).toBe(500);
    expect(backoffDelay(-3, 500, 8_000, () => 1)).toBe(500);
  });
});

describe("statusOf", () => {
  it("reads a numeric status off an error-like object", () => {
    expect(statusOf({ status: 429 })).toBe(429);
  });

  it("returns null when there is no usable status", () => {
    expect(statusOf(new Error("boom"))).toBeNull();
    expect(statusOf({ status: "429" })).toBeNull();
    expect(statusOf(null)).toBeNull();
    expect(statusOf(undefined)).toBeNull();
  });
});

describe("shouldRetry", () => {
  it("retries a transient status while attempts remain", () => {
    expect(shouldRetry({ status: 503 }, 1, 3, false)).toBe(true);
  });

  it("stops once the attempt budget is spent", () => {
    expect(shouldRetry({ status: 503 }, 3, 3, false)).toBe(false);
  });

  it("never retries a permanent status", () => {
    expect(shouldRetry({ status: 401 }, 1, 3, false)).toBe(false);
  });

  it("retries a transport failure with no status", () => {
    expect(shouldRetry(new Error("socket hang up"), 1, 3, false)).toBe(true);
  });

  it("does not retry an abort", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(shouldRetry(abort, 1, 3, false)).toBe(false);
  });

  // The critical guard: replaying a request after text has already been
  // streamed would duplicate the start of the answer in the thread.
  it("never retries once output has been produced", () => {
    expect(shouldRetry({ status: 503 }, 1, 3, true)).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first successful result without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => "ok");

    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a transient failure and then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("busy"), { status: 503 });
      return "recovered";
    });

    await expect(withRetry(fn, { sleep })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("rethrows a permanent failure immediately", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("bad key"), { status: 401 });
    });

    await expect(withRetry(fn, { sleep })).rejects.toThrow("bad key");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after maxAttempts and rethrows the last error", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("still down"), { status: 502 });
    });

    await expect(withRetry(fn, { maxAttempts: 3, sleep })).rejects.toThrow("still down");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("stops retrying once output has been produced", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("mid-stream"), { status: 503 });
    });

    await expect(
      withRetry(fn, { sleep, hasProducedOutput: () => true }),
    ).rejects.toThrow("mid-stream");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reports each retry through onRetry", async () => {
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls < 2) throw Object.assign(new Error("busy"), { status: 429 });
      return "ok";
    };

    await withRetry(fn, { sleep, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1 });
  });
});
