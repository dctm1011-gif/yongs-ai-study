(function () {
  var TERM_DICT = {
    'HBM': 'High Bandwidth Memory. GPU/AI 가속기 옆에 붙이는 초고속 메모리. 일반 DRAM보다 대역폭이 5~10배 넓어요.',
    'ECC': 'Error Correcting Code. 데이터 전송·저장 중 생긴 오류를 자동으로 찾아 고치는 코드예요.',
    'BER': 'Bit Error Rate. 전송된 비트 중 몇 개가 틀렸는지 나타내는 비율이에요. 10⁻⁶이면 백만 개 중 하나 오류예요.',
    'PLL': 'Phase-Locked Loop. 칩 안에서 원하는 주파수의 클럭을 만드는 회로예요. 외부 기준 클럭에 자신의 클럭을 맞춰요.',
    'CDR': 'Clock and Data Recovery. 수신한 데이터 신호에서 클럭을 복원하는 회로예요. SerDes, HBM PHY에서 필수예요.',
    'PDN': 'Power Delivery Network. 전원 공급 경로 전체를 뜻해요. 저항·인덕턴스·커패시턴스로 이루어져 있어요.',
    'PSIJ': 'Power Supply Induced Jitter. 전원 전압의 흔들림이 클럭/데이터 신호의 타이밍 오차를 만들어내는 현상이에요.',
    'DDJ': 'Data-Dependent Jitter. 이전에 어떤 데이터가 왔느냐에 따라 지터 크기가 달라지는 현상이에요. ISI 때문에 생겨요.',
    'ISI': 'Inter-Symbol Interference. 이전 심볼(비트)의 신호 잔향이 현재 심볼에 영향을 주는 간섭이에요.',
    'jitter': '지터. 신호가 이상적인 타이밍에서 얼마나 벗어나는지를 나타내는 타이밍 오차예요. 단위는 UI나 ps예요.',
    'RowHammer': 'DRAM 행(row)을 매우 빠르게 반복 접근하면, 인접한 행의 데이터가 뒤집히는 하드웨어 취약점이에요.',
    'refresh': '리프레시. DRAM 셀의 전하가 자연 방전되기 전에 다시 채워주는 동작이에요. 보통 64ms 주기로 해요.',
    'nRH': 'RowHammer Threshold. 비트 플립이 처음 발생하는 최소 해머 횟수예요. 공정이 미세해질수록 이 값이 줄어들어요.',
    'RFM': 'Refresh Management. DDR5에서 도입한 RowHammer 방어 메커니즘. 해머 횟수가 임계값을 넘으면 인접 행을 리프레시해요.',
    'TRR': 'Targeted Row Refresh. 특정 행이 자주 접근되면 인접 행을 선택적으로 리프레시해 RowHammer를 막는 방법이에요.',
    'Reed-Solomon': 'RS 코드. 여러 비트 오류를 한꺼번에 수정할 수 있는 강력한 ECC예요. 코드워드 단위로 오류를 처리해요.',
    'VCO': '전압 제어 발진기(Voltage Controlled Oscillator). 입력 전압에 따라 출력 주파수가 달라지는 발진 회로예요.',
    'TSV': 'Through-Silicon Via. 실리콘 다이를 수직으로 관통하는 전기 연결선이에요. HBM 스태킹의 핵심 기술이에요.',
    'PHY': '물리 계층 회로(Physical Layer). 디지털 데이터를 실제 전기 신호로 변환하거나 반대로 변환하는 회로예요.',
    'SerDes': '직렬화기/역직렬화기(Serializer/Deserializer). 병렬 데이터를 직렬로 바꾸거나 반대로 바꾸는 회로예요.',
    'DRAM': '동적 랜덤 액세스 메모리. 커패시터에 전하를 저장하는 방식이라 주기적 리프레시가 필요해요.',
    '코드워드': 'ECC에서 데이터와 패리티를 합친 블록이에요. 코드워드가 클수록 더 많은 오류를 수정할 수 있어요.',
    'Bloom Filter': '특정 원소가 집합에 있는지 빠르게 확인하는 자료구조예요. 작은 메모리로 큰 집합을 효율적으로 표현해요.',
    'UI': 'Unit Interval. 직렬 통신에서 한 비트를 전송하는 시간이에요. 클럭 주기의 역수예요.',
    'BF16': 'Brain Float 16. AI 연산에 쓰이는 16비트 부동소수점 형식이에요. 지수 8비트 + 가수 7비트로 구성돼요.',
  };

  var tooltip = document.getElementById('term-tooltip-global');
  if (!tooltip) return;

  var currentTarget = null;

  function showTooltip(el, text) {
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    positionTooltip(el);
    currentTarget = el;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
    currentTarget = null;
  }

  function positionTooltip(el) {
    var rect = el.getBoundingClientRect();
    var tt = tooltip.getBoundingClientRect();
    var top = rect.top + window.scrollY - tt.height - 8;
    var left = rect.left + window.scrollX;
    if (top < window.scrollY) top = rect.bottom + window.scrollY + 8;
    if (left + tt.width > window.innerWidth - 12) left = window.innerWidth - tt.width - 12;
    if (left < 8) left = 8;
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function injectTooltips() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'A') return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains('term-hl')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var terms = Object.keys(TERM_DICT).sort(function (a, b) { return b.length - a.length; });
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      var matched = false;
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i];
        var idx = text.indexOf(term);
        if (idx === -1) continue;
        matched = true;
        var frag = document.createDocumentFragment();
        var before = text.slice(0, idx);
        var after = text.slice(idx + term.length);
        if (before) frag.appendChild(document.createTextNode(before));
        var span = document.createElement('span');
        span.className = 'term-hl';
        span.textContent = term;
        (function (s, def) {
          s.addEventListener('mouseenter', function () { showTooltip(s, def); });
          s.addEventListener('mouseleave', hideTooltip);
          s.addEventListener('click', function (e) {
            e.stopPropagation();
            if (currentTarget === s && tooltip.style.display === 'block') {
              hideTooltip();
            } else {
              showTooltip(s, def);
            }
          });
        })(span, TERM_DICT[term]);
        frag.appendChild(span);
        if (after) frag.appendChild(document.createTextNode(after));
        textNode.parentNode.replaceChild(frag, textNode);
        break;
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (currentTarget && !currentTarget.contains(e.target)) hideTooltip();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectTooltips);
  } else {
    injectTooltips();
  }
})();
