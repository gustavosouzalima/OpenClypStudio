"""Formatação de saída: TXT e SRT."""


def _ts(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    ss = int(s % 60)
    ms = int((s - int(s)) * 1000)
    return f"{h:02d}:{m:02d}:{ss:02d},{ms:03d}"


def _speaker_label(speaker_idx: int, speaker_names: dict | None = None) -> str:
    default_key = f"SPEAKER_{speaker_idx + 1:02d}"
    if not speaker_names:
        return default_key

    if default_key in speaker_names and str(speaker_names[default_key]).strip():
        return str(speaker_names[default_key]).strip()

    numeric_key = str(speaker_idx + 1)
    if numeric_key in speaker_names and str(speaker_names[numeric_key]).strip():
        return str(speaker_names[numeric_key]).strip()

    return default_key


def format_txt(segments, speaker_map, diarize: bool, speaker_names: dict | None = None) -> str:
    lines = []
    for i, seg in enumerate(segments):
        text = seg.text.strip()
        if not text:
            continue
        if diarize and speaker_map:
            spk = speaker_map.get(i, 0)
            prefix = f"{_speaker_label(spk, speaker_names)}: "
        else:
            prefix = ""
        lines.append(f"{prefix}{text}")
    return "\n".join(lines)


def format_srt(segments, speaker_map, diarize: bool, speaker_names: dict | None = None) -> str:
    lines = []
    idx = 1
    for i, seg in enumerate(segments):
        text = seg.text.strip()
        if not text:
            continue
        if diarize and speaker_map:
            spk = speaker_map.get(i, 0)
            text = f"[{_speaker_label(spk, speaker_names)}] {text}"
        lines += [str(idx), f"{_ts(seg.start)} --> {_ts(seg.end)}", text, ""]
        idx += 1
    return "\n".join(lines)
