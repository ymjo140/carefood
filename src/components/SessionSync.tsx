"use client";

import { useEffect } from "react";
import { getClientActorId } from "@/lib/actor-client";
import { profileSyncAction } from "@/lib/profile-sync";

/**
 * 예전 익명 ID(브라우저 저장소 carefood_anon_id)가 남은 기기에서 한 번만:
 * 그 ID 의 기록을 서버가 발급한 새 ID 로 옮기고 저장소를 비운다. 옮긴 게 있으면 화면을 다시 그린다.
 * 이 기기 프로필(carefood_profile)을 서버 프로필과 맞춘다 — 탭마다 한 번 (규칙: lib/profile-sync.ts).
 */
export default function SessionSync() {
  // 비밀번호 재설정 메일 링크가 재설정 화면이 아닌 곳(Supabase 의 기본 주소 = 홈)에 # 토큰을 싣고 떨어지면 재설정 화면으로 넘긴다
  //  — 메일을 요청한 주소가 Supabase 허용 목록에 없으면 기본 주소로 보낸다
  useEffect(() => {
    const h = window.location.hash;
    if (window.location.pathname !== "/auth/reset" && /type=recovery/.test(h) && /access_token=/.test(h)) {
      window.location.replace("/auth/reset" + h);
    }
  }, []);

  useEffect(() => {
    let legacy: string | null = null;
    try { legacy = localStorage.getItem("carefood_anon_id"); } catch { return; } // ds-allow: 저장소를 못 쓰는 브라우저는 옮길 것이 없음
    if (!legacy || !getClientActorId()) return;
    const done = () => { try { localStorage.removeItem("carefood_anon_id"); } catch { /* */ } }; // ds-allow: 저장소 정리 실패는 다음 접속에 다시
    if (!legacy.startsWith("anon_")) { done(); return; }
    fetch("/api/session/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legacy_id: legacy }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok && !d?.already) return; // 실패면 저장소를 남겨 다음 접속에 다시 (공개된 ID 라 옮기지 않은 경우도 ok 로 와서 정리)
        done();
        if (d?.moved > 0) window.location.reload();
      })
      .catch(() => { /* 네트워크 실패 — 다음 접속에 다시 */ }); // ds-allow: 백그라운드 옮기기, 다음 접속에 재시도
  }, []);
  useEffect(() => {
    let local: { goals?: unknown; saved_at?: unknown } | null = null;
    try {
      if (sessionStorage.getItem("carefood_profile_synced")) return;
      const raw = localStorage.getItem("carefood_profile");
      local = raw ? JSON.parse(raw) : null;
    } catch (e) { console.error("이 기기 프로필을 읽지 못했어요:", (e as Error).message); return; } // ds-allow: 못 읽으면 맞추지 않는다(서버 것 그대로)
    if (!local || !getClientActorId()) return;
    const mark = () => { try { sessionStorage.setItem("carefood_profile_synced", "1"); } catch { /* */ } }; // ds-allow: 표시를 못 남기면 다음 화면에서 한 번 더 확인할 뿐
    fetch("/api/profile")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d.profile as { goals?: unknown; updated_at?: unknown } | null; })
      .then(async (server) => {
        const action = profileSyncAction(local, server, !!server);
        if (action !== "none") {
          const body = action === "fill_goals" ? { action: "fill_goals", goals: local!.goals } : local;
          const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          // 409 = 다른 곳에서 더 새로 저장함 — 서버 것을 둔다
          if (!r.ok && r.status !== 409) throw new Error((await r.json()).error);
        }
        mark();
      })
      .catch((e) => console.error("프로필을 서버와 맞추지 못했어요:", (e as Error).message)); // ds-allow: 백그라운드 맞추기, 다음 접속에 다시
  }, []);
  return null;
}
