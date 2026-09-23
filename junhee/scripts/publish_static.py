# -*- coding: utf-8 -*-
"""junhee/data/processed/dashboard_summary.json 을 static/data/dashboard_summary.json 으로 복사한다.

app.py 를 수정하지 않고 Flask 의 기본 /static 경로로 JSON 을 서빙하기 위한 스크립트.
복사 전 JSON 을 파싱해 스키마 필수 키를 검증한다.

실행: python junhee/scripts/publish_static.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]           # junhee/
PROJECT = ROOT.parent                                 # test1/
SRC = ROOT / "data" / "processed" / "dashboard_summary.json"
DST_DIR = PROJECT / "static" / "data"
DST = DST_DIR / "dashboard_summary.json"

REQUIRED = {"key", "headline", "note", "state", "source", "as_of", "data_class"}
KEYS = ["regulation", "market", "price", "logistics", "stability"]


def validate(doc):
    items = doc.get("items")
    assert isinstance(items, list) and len(items) == 5, "items 5개가 아님"
    assert [it["key"] for it in items] == KEYS, "항목 순서/키 불일치"
    for it in items:
        missing = REQUIRED - set(it)
        assert not missing, f"{it.get('key')}: 누락 키 {missing}"
        assert it["state"] in ("ok", "insufficient"), f"{it['key']}: state 값 오류"
        assert it["data_class"] in ("실제자료", "가상데이터", "가정값"), f"{it['key']}: data_class 값 오류"
        if it["state"] == "insufficient":
            assert not any(ch.isdigit() for ch in it["headline"]), f"{it['key']}: 자료 부족인데 headline 에 숫자"
            assert "자료 부족" in it["headline"], f"{it['key']}: 자료 부족 문구 없음"


COMPANIES_SRC = ROOT / "data" / "processed" / "companies"
COMPANIES_DST = DST_DIR / "companies"
SAMPLES_SRC = ROOT / "data" / "samples"
SAMPLES_DST = PROJECT / "static" / "samples"


def copy_tree(src, dst, pattern):
    """src 의 pattern 파일을 dst 로 복사한다 (dst 의 다른 파일은 건드리지 않음)."""
    if not src.exists():
        print(f"skip: {src.relative_to(PROJECT)} 없음")
        return 0
    dst.mkdir(parents=True, exist_ok=True)
    n = 0
    for p in sorted(src.glob(pattern)):
        if p.is_file():
            shutil.copyfile(p, dst / p.name)
            n += 1
    print(f"copied {n} files {src.relative_to(PROJECT)} -> {dst.relative_to(PROJECT)}")
    return n


def validate_companies():
    idx = COMPANIES_SRC / "index.json"
    if not idx.exists():
        return
    doc = json.loads(idx.read_text(encoding="utf-8"))
    for c in doc["companies"]:
        f = COMPANIES_SRC / f"{c['company_id']}.json"
        assert f.exists(), f"{f.name} 없음"
        d = json.loads(f.read_text(encoding="utf-8"))
        assert d["file_sha256"] == c["file_sha256"], f"{c['company_id']}: sha 불일치"
        sample = SAMPLES_SRC / c["file_name"]
        if sample.exists():
            import hashlib
            assert hashlib.sha256(sample.read_bytes()).hexdigest() == c["file_sha256"], f"{c['file_name']}: 엑셀이 바뀌었는데 점수가 갱신되지 않음 (score_companies.py 재실행)"
        assert d["data_class"] == "가상 데이터 · 시연용 산식"
        for fct in d["factors"]:
            assert fct["state"] in ("ok", "insufficient")
            if fct["state"] == "insufficient":
                assert fct["score"] is None, f"{c['company_id']}/{fct['key']}: 자료 부족인데 점수가 있음"


def main():
    doc = json.loads(SRC.read_text(encoding="utf-8"))
    validate(doc)
    DST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC, DST)
    print(f"copied {SRC.relative_to(PROJECT)} -> {DST.relative_to(PROJECT)} ({DST.stat().st_size} bytes)")
    validate_companies()
    copy_tree(COMPANIES_SRC, COMPANIES_DST, "*.json")
    copy_tree(SAMPLES_SRC, SAMPLES_DST, "*.xlsx")


if __name__ == "__main__":
    main()
