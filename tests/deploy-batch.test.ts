import { describe, expect, it } from "vitest";
import { decideDeploy, mainHead } from "@/lib/deploy-batch";

const A = "a".repeat(40), B = "b".repeat(40);

describe("몰아서 배포 (lib/deploy-batch.ts)", () => {
  it("운영 커밋과 main 끝이 같으면 배포하지 않고, 다르면 배포한다", () => {
    expect(decideDeploy(A, A).deploy).toBe(false);
    expect(decideDeploy(A, B)).toEqual({ deploy: true, reason: "aaaaaaa → bbbbbbb" });
  });
  it("관리자 바로 배포는 같아도 한다 · main 을 못 읽으면 배포한다", () => {
    expect(decideDeploy(A, A, true).deploy).toBe(true);
    expect(decideDeploy(A, null).deploy).toBe(true);
    expect(decideDeploy(undefined, B).deploy).toBe(true);
  });
  it("GitHub 응답이 커밋 모양이 아니면 null", async () => {
    const ok = (async () => new Response(`${B}\n`)) as unknown as typeof fetch;
    const bad = (async () => new Response("rate limited", { status: 403 })) as unknown as typeof fetch;
    expect(await mainHead(ok)).toBe(B);
    expect(await mainHead(bad)).toBeNull();
  });
});
