import re
import time

try:
    from deep_translator import GoogleTranslator
    _TRANSLATOR_AVAILABLE = True
except ImportError:
    _TRANSLATOR_AVAILABLE = False


METRIC_PATTERNS = [
    (r'\d+(?:\.\d+)?\s*(?:GB/s|TB/s|Gb/s|Gbps|Tbps)', "대역폭"),
    (r'\d+(?:\.\d+)?\s*(?:mW|uW|μW|W)(?:/\w+)?', "전력"),
    (r'\d+(?:\.\d+)?\s*nm\b', "공정/치수"),
    (r'\d+(?:\.\d+)?\s*(?:GHz|MHz)', "동작 주파수"),
    (r'\d+(?:\.\d+)?\s*(?:ns|ps|fs)', "타이밍"),
    (r'\d+(?:\.\d+)?\s*(?:fJ/b|pJ/b|fJ/bit|pJ/bit)', "에너지 효율"),
    (r'\d+(?:\.\d+)?\s*(?:mm²|mm2)', "면적"),
    (r'\d+(?:\.\d+)?×?\s*(?:improvement|reduction|speedup|faster|lower)', "개선율"),
    (r'\d+(?:\.\d+)?\s*(?:Gb|TB|GB)\b', "용량"),
    (r'\d+(?:\.\d+)?\s*(?:V|mV)\b', "전압"),
]

TECHNIQUE_RULES: dict[str, list[str]] = {
    "Sense Amplifier": ["sense amplifier", "sense amp", "latch-type sa"],
    "Row/Column Decoder": ["row decoder", "column decoder", "wordline decoder"],
    "Charge Pump": ["charge pump", "voltage multiplier", "dickson"],
    "Voltage Regulator (LDO/DCDC)": ["ldo", "dc-dc", "buck", "boost converter", "voltage regulator"],
    "PLL": ["pll", "phase-locked loop", "phase locked loop"],
    "DLL": ["dll", "delay-locked loop", "delay locked loop"],
    "CDR": ["cdr", "clock and data recovery", "clock recovery"],
    "Equalizer": ["equalizer", "ffe", "dfe", "ctle"],
    "Error Correction (ECC)": ["ecc", "error correction", "error correcting", "hamming", "reed-solomon"],
    "Redundancy/Repair": ["redundancy", "repair circuit", "fuse", "anti-fuse"],
    "Power Gating": ["power gating", "power gate", "sleep transistor"],
    "Clock Gating": ["clock gating", "clock gate"],
    "TSV": ["tsv", "through-silicon via", "through silicon via"],
    "3D Stacking": ["3d stack", "3d-ic", "die stacking", "chip stacking"],
    "Interposer": ["interposer", "silicon interposer", "2.5d"],
    "SerDes": ["serdes", "serializer", "deserializer", "high-speed i/o"],
    "Cross-Coupled": ["cross-coupled", "cross coupled latch"],
    "Differential Pair": ["differential pair", "differential amplifier"],
    "Current Mirror": ["current mirror", "cascode current"],
    "Pipeline": ["pipeline", "pipelined"],
    "Bank Interleaving": ["bank interleaving", "bank parallelism"],
    "Prefetch": ["prefetch", "burst length", "burst mode"],
    "DVFS": ["dvfs", "dynamic voltage", "dynamic frequency scaling"],
    "Refresh Circuit": ["refresh", "tref", "self-refresh", "auto-refresh"],
    "Write Leveling": ["write leveling", "write levelling"],
    "ZQ Calibration": ["zq calibration", "impedance calibration"],
}

PROCESS_PATTERNS = [
    r'\d+\s*nm\s*(?:cmos|finfet|gaa|nanosheet|process|technology|node|bulk)',
    r'(?:cmos|finfet|gaa|nanosheet)\s*\d+\s*nm',
    r'(?:tsmc|samsung|intel|imec)\s*\d+\s*nm',
    r'\d+nm\s*(?:class|generation)',
]


def translate_to_korean(text: str) -> str:
    if not text or not _TRANSLATOR_AVAILABLE:
        return text

    chunks = _split_text(text.strip(), 4500)
    result_parts = []

    for chunk in chunks:
        for attempt in range(3):
            try:
                translated = GoogleTranslator(source="en", target="ko").translate(chunk)
                result_parts.append(translated or chunk)
                time.sleep(0.3)
                break
            except Exception:
                if attempt == 2:
                    result_parts.append(chunk)
                time.sleep(1)

    return " ".join(result_parts)


def extract_key_info(title: str, abstract: str) -> dict:
    full_text = title + " " + abstract
    lower_text = full_text.lower()

    metrics = _extract_metrics(full_text)
    techniques = _extract_techniques(lower_text)
    process = _extract_process(full_text)

    return {
        "metrics": metrics,
        "techniques": techniques,
        "process": process,
    }


def _extract_metrics(text: str) -> list[tuple[str, str]]:
    found = []
    seen = set()
    for pattern, label in METRIC_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            val = match.group().strip()
            if val not in seen:
                seen.add(val)
                found.append((label, val))
    return found[:12]


def _extract_techniques(lower_text: str) -> list[str]:
    found = []
    for technique, keywords in TECHNIQUE_RULES.items():
        if any(kw in lower_text for kw in keywords):
            found.append(technique)
    return found


def _extract_process(text: str) -> list[str]:
    found = set()
    for pattern in PROCESS_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            found.add(match.group().strip())
    return list(found)[:5]


def _split_text(text: str, max_len: int) -> list[str]:
    if len(text) <= max_len:
        return [text]
    chunks = []
    while text:
        if len(text) <= max_len:
            chunks.append(text)
            break
        split_at = text.rfind(". ", 0, max_len)
        if split_at == -1:
            split_at = max_len
        chunks.append(text[: split_at + 1].strip())
        text = text[split_at + 1 :].strip()
    return chunks
