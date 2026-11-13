"use client";

import { useEffect } from "react";
import { getClientActorId } from "@/lib/actor-client";

/**
 * 예전 익명 ID(브라우저 저장소 carefood_anon_id)가 남은 기기에서 한 번만:
 * 그 ID 의 기록을 서버가 발급한 새 ID 로 옮기고 저장소를 비운다. 옮긴 게 있으면 화면을 다시 그린다.
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
  return null;
}
