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


def main():
    doc = json.loads(SRC.read_text(encoding="utf-8"))
    validate(doc)
    DST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC, DST)
    print(f"copied {SRC.relative_to(PROJECT)} -> {DST.relative_to(PROJECT)} ({DST.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
