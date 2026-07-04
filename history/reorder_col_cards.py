"""
논문 정리 col-card 순서 복원.
inject_col_cards가 새 카드를 앞에 삽입해서 원본 11개의 idx가 밀린 것을 수정.
col-headline이 있는 카드(원본 11개)를 앞으로, 나머지를 뒤로 재정렬.
"""
import re
from pathlib import Path

OUTPUT = Path(__file__).parent / "index.html"

COL_START = '<div id="page-columns" class="page">'
COL_END   = '\n\n<!-- 히스토리 탭'


def extract_col_cards(block: str) -> list[str]:
    """col-card 블록을 개별로 분리."""
    cards = []
    pos = 0
    while True:
        start = block.find('<div class="col-card">', pos)
        if start == -1:
            break
        # 중첩 div 깊이를 추적해서 올바른 닫힘 태그 찾기
        depth = 0
        i = start
        while i < len(block):
            if block[i:i+5] == '<div ':
                depth += 1
            elif block[i:i+6] == '</div>':
                depth -= 1
                if depth == 0:
                    end = i + 6
                    cards.append(block[start:end])
                    pos = end
                    break
            i += 1
        else:
            break
    return cards


def main():
    html = OUTPUT.read_text(encoding="utf-8")

    # page-columns 영역 추출
    col_start_idx = html.find(COL_START)
    col_end_idx   = html.find(COL_END)
    if col_start_idx == -1 or col_end_idx == -1:
        print("ERROR: page-columns 영역을 찾을 수 없음")
        return

    col_region = html[col_start_idx:col_end_idx]
    cards = extract_col_cards(col_region)
    print(f"총 col-card: {len(cards)}개")

    # col-headline 유무로 원본 11개 vs 신규 분류
    orig = [c for c in cards if 'col-headline' in c]
    new  = [c for c in cards if 'col-headline' not in c]
    print(f"원본(원문분석 포함): {len(orig)}개")
    print(f"신규(좋아요 동기화): {len(new)}개")

    for c in orig:
        m = re.search(r'<h2 class="col-title">([^<]+)</h2>', c)
        if m:
            print(f"  [원본] {m.group(1)[:60]}")

    # 재정렬: 원본 먼저, 신규 뒤
    reordered = orig + new
    new_cards_html = "\n".join(reordered)

    # 기존 cards 블록 교체
    header = '<div class="section-header">좋아요 표시한 논문 · Claude 원문 분석</div>'
    header_pos = col_region.find(header)
    if header_pos == -1:
        print("ERROR: section-header를 찾을 수 없음")
        return

    after_header = col_region[header_pos + len(header):]
    new_col_region = col_region[:header_pos + len(header)] + "\n" + new_cards_html

    html = html[:col_start_idx] + new_col_region + html[col_end_idx:]
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"\n완료: 원본 {len(orig)}개를 인덱스 0~{len(orig)-1}로 복원")
    print(f"신규 {len(new)}개는 인덱스 {len(orig)}~{len(reordered)-1}로 배치")


if __name__ == "__main__":
    main()
