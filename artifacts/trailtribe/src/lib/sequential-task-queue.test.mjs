import { test } from "node:test";
import assert from "node:assert/strict";
import { createSequentialTaskQueue } from "./sequential-task-queue.ts";

test("runs queued saves in order and continues after a failed save", async () => {
  const enqueue = createSequentialTaskQueue();
  const started = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = enqueue(async () => {
    started.push("first");
    await firstGate;
    throw new Error("first save failed");
  });
  const second = enqueue(async () => {
    started.push("second");
    return "saved";
  });

  await Promise.resolve();
  assert.deepEqual(started, ["first"]);
  releaseFirst();

  await assert.rejects(first, /first save failed/);
  assert.equal(await second, "saved");
  assert.deepEqual(started, ["first", "second"]);
});
