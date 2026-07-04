TAG_RULES: dict[str, list[str]] = {
    "HBM": ["hbm", "high bandwidth memory", "hbm2", "hbm3", "hbm2e", "hbm3e", "hbm4"],
    "TSV": ["tsv", "through-silicon via", "through silicon via", "3d stacking", "3d-ic", "3d ic"],
    "DRAM": ["dram", "dynamic random access", "refresh", "retention", "tref", "row hammer", "rowhammer"],
    "SRAM": ["sram", "static random access", "6t sram", "bitcell", "bit cell"],
    "Sense-Amp": ["sense amplifier", "sense amp", "sensing circuit", "read circuit"],
    "PHY": ["phy layer", "physical layer", "serdes", "ser/des", "i/o circuit", "io circuit", "transceiver"],
    "PLL-DLL": ["pll", "phase locked loop", "dll", "delay locked loop", "clock generator", "cdr", "dco", "vco"],
    "Power": ["power delivery", "power management", "pmic", "ir drop", "power integrity", "pdn", "voltage regulator", "ldo", "dc-dc", "buck converter"],
    "Thermal": ["thermal", "heat dissipation", "temperature", "self-heating", "hotspot", "cooling"],
    "ESD": ["esd", "electrostatic discharge", "latch-up", "latchup", "esd protection"],
    "Packaging": ["packaging", "flip chip", "bump", "interposer", "chiplet", "heterogeneous integration", "2.5d", "fan-out"],
    "Interface": ["jedec", "protocol", "bandwidth", "latency", "axi", "ahb", "apb", "memory interface"],
    "Interconnect": ["interconnect", "signal integrity", "crosstalk", "impedance", "transmission line", "via"],
    "ADC-DAC": ["adc", "dac", "analog-to-digital", "digital-to-analog", "sar adc", "flash adc", "sigma delta"],
    "Analog": ["op-amp", "opamp", "comparator", "amplifier", "bias circuit", "bandgap", "reference circuit"],
    "ML-HW": ["machine learning", "deep learning", "neural network", "inference", "ai accelerator", "npu", "systolic"],
    "Process": ["finfet", "gaa", "nanosheet", "process node", "foundry", "pdpdk", "spice model"],
    "Low-Power": ["low power", "power gating", "clock gating", "leakage", "standby power", "sleep mode"],
    "Yield": ["yield", "defect", "reliability", "burn-in", "bist", "built-in self-test", "repair", "redundancy"],
}


def auto_tag(title: str, abstract: str) -> list[str]:
    text = (title + " " + abstract).lower()
    tags = []
    for tag, keywords in TAG_RULES.items():
        if any(kw in text for kw in keywords):
            tags.append(tag)
    return tags if tags else ["Circuit-Design"]
