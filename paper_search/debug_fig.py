import requests
from bs4 import BeautifulSoup

arxiv_id = "2512.12106"
url = f"https://arxiv.org/html/{arxiv_id}"
headers = {"User-Agent": "Mozilla/5.0"}

print(f"요청: {url}")
resp = requests.get(url, headers=headers, timeout=20)
print(f"상태코드: {resp.status_code}")

if resp.status_code == 200:
    soup = BeautifulSoup(resp.text, "lxml")
    figs = soup.find_all("figure")
    imgs = soup.find_all("img")
    print(f"figure 태그: {len(figs)}개")
    print(f"img 태그: {len(imgs)}개")
    if imgs:
        print(f"첫 번째 img src: {imgs[0].get('src', '')[:100]}")
    if figs:
        first = figs[0]
        cap = first.find("figcaption")
        print(f"첫 figure caption: {cap.get_text()[:100] if cap else '없음'}")
        img = first.find("img")
        print(f"첫 figure img src: {img.get('src','')[:100] if img else '없음'}")
elif resp.status_code == 404:
    print("HTML 버전 없음 - v2 시도")
    url2 = f"https://arxiv.org/html/{arxiv_id}v2"
    resp2 = requests.get(url2, headers=headers, timeout=20)
    print(f"v2 상태코드: {resp2.status_code}")
