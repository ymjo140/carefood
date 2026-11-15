"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Checkbox, EmptyState, IconButton, Input, Select, Sheet, SkeletonList, useToast } from "@/components/ui";
import { TIMINGS, timingLabel, type Supp, type Timing } from "@/lib/supplements";

/**
 * 영양제 챙기기 시트 (/api/me/supplements) — 내 영양제 등록 · 오늘 먹었는지 체크 · 지우기. 캐릭터가 때가 지나면 한 번 묻는다.
 * 효과·먹는 양은 다루지 않는다. 네 상태: 불러오는 중 · 비어 있음 · 실패 · 채워짐. 열 때마다 새로 불러온다(늦게 온 응답은 버린다).
 * 바꾼 게 있으면 닫을 때 onChanged — 대화 화면이 빠른 말·묻기를 새로 불러온다.
 */
export function SupplementSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Supp[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [tryN, setTryN] = useState(0);
  const [name, setName] = useState("");
  const [timing, setTiming] = useState<Timing>("morning");
  const [adding, setAdding] = useState(false);
  const changed = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    fetch("/api/me/supplements")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d.items as Supp[]; })
      .then((list) => { if (n === seq.current) { setItems(list); setStatus("ready"); } })
      .catch((e) => { console.error("영양제를 불러오지 못했어요:", (e as Error).message); if (n === seq.current) setStatus("error"); });
  }, [open, tryN]);

  const close = () => {
    if (changed.current) { changed.current = false; onChanged(); }
    onClose();
  };

  const toggle = async (s: Supp) => {
    const next = !s.taken;
    setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, taken: next } : x)));
    try {
      const r = await fetch("/api/me/supplements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, taken: next }) });
      if (!r.ok) throw new Error((await r.json()).error);
      changed.current = true;
    } catch (e) {
      console.error("영양제 체크를 바꾸지 못했어요:", (e as Error).message);
      setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, taken: s.taken } : x)));
      toast.show("체크하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const remove = async (s: Supp) => {
    const before = items;
    setItems((xs) => xs.filter((x) => x.id !== s.id));
    try {
      const r = await fetch(`/api/me/supplements?id=${s.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      changed.current = true;
      toast.show(`${s.name} 지웠어요`);
    } catch (e) {
      console.error("영양제를 지우지 못했어요:", (e as Error).message);
      setItems(before);
      toast.show("지우지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || adding) return;
    setAdding(true);
    try {
      const r = await fetch("/api/me/supplements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, timing }) });
      const d = await r.json();
      if (!r.ok) throw new Error(r.status === 400 ? d.error : "");
      setItems((xs) => [...xs, d.item as Supp]);
      setName("");
      changed.current = true;
      toast.show(`${n} 등록했어요`);
    } catch (err) {
      toast.show((err as Error).message || "등록하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="영양제 챙기기" description="오늘 먹었는지 체크해요. 때가 지나도 안 먹었으면 캐릭터가 한 번 물어봐요. 효과나 먹는 양은 다루지 않아요">
      <div className="flex flex-col gap-5">
        {status === "loading" && <SkeletonList rows={2} thumb={false} />}
        {status === "error" && (
          <EmptyState title="영양제를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setStatus("loading"); setTryN((k) => k + 1); }}>다시 불러오기</Button>} />
        )}
        {status === "ready" && items.length === 0 && (
          <EmptyState title="등록한 영양제가 없어요" description="아래에서 등록하면 캐릭터가 같이 챙겨요" />
        )}
        {status === "ready" && items.length > 0 && (
          <ul className="flex flex-col divide-y divide-line" aria-label="내 영양제">
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Checkbox checked={s.taken} onChange={() => void toggle(s)} className="flex-1 min-w-0"
                  label={<span className="flex flex-col min-w-0"><span className="truncate">{s.name}</span><span className="text-caption text-ink-2">{timingLabel(s.timing)} · {s.taken ? "오늘 먹었어요" : "아직이에요"}</span></span>} />
                <IconButton icon="trash" label={`${s.name} 지우기`} onClick={() => void remove(s)} />
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="flex flex-col gap-2" aria-label="영양제 등록">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <Input value={name} onChange={(e) => setName(e.target.value)} name="supplement_name" maxLength={30} placeholder="예: 비타민D" aria-label="영양제 이름" />
            </div>
            <div className="w-32 shrink-0">
              <Select value={timing} onChange={(e) => setTiming(e.target.value as Timing)} name="supplement_timing" aria-label="먹는 때">
                {TIMINGS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </div>
          </div>
          <Button type="submit" variant="secondary" disabled={!name.trim()} loading={adding}>등록하기</Button>
        </form>
      </div>
    </Sheet>
  );
}
