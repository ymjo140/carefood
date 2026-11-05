"""상품정보 표시 OCR 글자에서 품목보고번호 · 제조원 · kcal 뽑기 (label_judge · label_namematch 공용)"""
import re

# OCR 이 '품목'을 '품복·품옥·풍목'으로 읽는 일이 잦다
REPORT_RE = re.compile(r"(?:[품풍][목복옥묵]\s*(?:제조)?\s*[보브]고\s*[번빈]호|보고\s*번호|품목보고)[^0-9]{0,14}([0-9][0-9\s\-]{8,22}[0-9])")
ANY_NUM_RE = re.compile(r"(?<!\d)(\d{8,12}-?\d{1,6})(?!\d)")

def parse(text):
    t = (text or "").replace("|", " ")
    nums = []
    for m in REPORT_RE.finditer(t):
        n = re.sub(r"[\s\-]", "", m.group(1))
        if n not in nums: nums.append(n)
    for n in ANY_NUM_RE.findall(t):
        n2 = n.replace("-", "")
        if 10 <= len(n2) <= 16 and n2.startswith(("19", "20")) and n2 not in nums: nums.append(n2)
    maker = ""
    mm = re.search(r"(?:제조원|제조\s*[·및]?\s*판매원|제조업소[^\n:]{0,12}|업소명[^\n:]{0,8}|제조사|제조자|생산자)\s*[:：_]?\s*([^\n/]{2,40})", t)
    if mm: maker = re.sub(r"^(및\s*소재지|명)\s*[:：]?\s*", "", mm.group(1).strip())
    kcal = None
    KC = r"k\s*[ce]\s*a\s*[l1I|]"
    km = re.search(r"100\s*m?[lg]\s*(?:당|기준)?[^\n]{0,30}?(\d{1,4})\s*" + KC, t, re.I) or re.search(r"(\d{1,4})\s*" + KC, t, re.I)
    if km and int(km.group(1)) > 0: kcal = int(km.group(1))
    return nums, maker, kcal

