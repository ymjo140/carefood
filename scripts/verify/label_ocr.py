"""
판매처 상품정보 표시 이미지 OCR (GitHub Actions 에서 나눠 돌림 — 비밀값 필요 없음)

  python3 scripts/verify/label_ocr.py <상품번호 목록.txt> <출력.jsonl> [--shard i/n] [--workers 4]

컬리 상품 페이지 → noticeImages / legacyPiImages → tesseract(kor+eng) → 글자 그대로 저장.
번호·제조원·kcal 뽑기는 판정 단계(label_judge.py)에서 한다 (규칙을 고쳐도 OCR 를 다시 안 돌리게).
"""
import argparse, io, json, os, re, subprocess, sys, tempfile, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("ids"); ap.add_argument("out")
ap.add_argument("--shard", default="0/1"); ap.add_argument("--workers", type=int, default=4)
a = ap.parse_args()
si, sn = map(int, a.shard.split("/"))
ids = [l.strip() for l in open(a.ids) if l.strip()]
ids = [g for k, g in enumerate(ids) if k % sn == si]

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}

def get(url, timeout=40, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception:
            if i == tries - 1: raise
            time.sleep(2 * (i + 1))

def label_images(goods_no):
    html = get(f"https://www.kurly.com/goods/{goods_no}").decode("utf8", "ignore")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return []
    urls = []
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "noticeImages" and isinstance(v, list):
                    for it in v:
                        p = ((it or {}).get("image") or {}).get("path")
                        if p and p not in urls: urls.append(p)
                elif k == "legacyPiImages":
                    lst = v
                    if isinstance(v, str):
                        try: lst = json.loads(v)
                        except Exception: lst = []
                    for p in lst or []:
                        if isinstance(p, str) and p not in urls: urls.append(p)
                else: walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(json.loads(m.group(1)))
    return urls

def ocr(url):
    from PIL import Image
    im = Image.open(io.BytesIO(get(url))).convert("L")
    # 작은 라벨만 키운다 (긴 상세 이미지는 그대로 — 키우면 너무 느림)
    if im.width < 1000 and im.height < 2500: im = im.resize((im.width * 2, im.height * 2))
    elif im.width > 1600: im = im.resize((1600, int(im.height * 1600 / im.width)))
    # 아주 긴 상세 이미지는 위아래로 잘라 읽는다
    parts = [im] if im.height <= 6000 else [im.crop((0, y, im.width, min(im.height, y + 5000))) for y in range(0, im.height, 4800)]
    texts = []
    for part in parts:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            part.save(f.name); path = f.name
        try:
            r = subprocess.run(["tesseract", path, "-", "-l", "kor+eng", "--oem", "1", "--psm", "6"], capture_output=True, timeout=600)
            texts.append(r.stdout.decode("utf8", "ignore"))
        finally:
            os.unlink(path)
    return "\n".join(texts)

def one(g):
    rec = {"mall": "kurly", "goods_no": g, "images": [], "text": "", "error": ""}
    try:
        imgs = label_images(g); rec["images"] = imgs[:3]
        rec["text"] = "\n".join(ocr(u) for u in imgs[:3])
    except Exception as e:
        rec["error"] = str(e)[:200]
    return rec

t0 = time.time(); n = 0
with open(a.out, "w", encoding="utf8") as f, ThreadPoolExecutor(a.workers) as ex:
    for rec in ex.map(one, ids):
        f.write(json.dumps(rec, ensure_ascii=False) + "\n"); n += 1
        if n % 50 == 0: print(f"{n}/{len(ids)} {time.time()-t0:.0f}s", flush=True)
print("done", n, f"{time.time()-t0:.0f}s")
