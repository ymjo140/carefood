/**
 * 캐릭터 대화 AI 부르기 (서버 전용) — Anthropic Messages API. 열쇠(ANTHROPIC_API_KEY)가 없으면 null 을 돌려주고 규칙 답(lib/buddy-chat.ts ruleReply)을 쓴다.
 * 모델은 BUDDY_MODEL (기본 claude-haiku-5-5 — 짧은 답이라 빠르고 싼 모델). 12초 안에 답이 없으면 그만둔다.
 */
import { cleanReply } from "@/lib/buddy-chat";

export type Turn = { role: "me" | "buddy"; text: string };

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY;

/** API 는 user 로 시작해 번갈아 가야 한다 — 앞쪽 캐릭터 말은 빼고, 같은 쪽이 이어지면 합친다 */
export function toMessages(turns: Turn[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    const role = t.role === "me" ? "user" : "assistant";
    if (!out.length && role === "assistant") continue;
    const last = out.at(-1);
    if (last && last.role === role) last.content += `\n${t.text}`;
    else out.push({ role, content: t.text });
  }
  return out;
}

/** 답 하나 — 실패·선을 넘은 답이면 null (부르는 쪽이 규칙 답으로 바꾸고 기록을 남긴다) */
export async function askBuddy(system: string, turns: Turn[]): Promise<{ text: string | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: null, error: "no-key" };
  const messages = toMessages(turns);
  if (!messages.length || messages.at(-1)!.role !== "user") return { text: null, error: "no-user-turn" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.BUDDY_MODEL || "claude-haiku-5-5", max_tokens: 300, system, messages }),
    });
    if (!r.ok) return { text: null, error: `api ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const d = (await r.json()) as { content?: { type: string; text?: string }[] };
    const raw = (d.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("").trim();
    const text = cleanReply(raw);
    return text ? { text } : { text: null, error: `filtered: ${raw.slice(0, 120)}` };
  } catch (e) {
    return { text: null, error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
