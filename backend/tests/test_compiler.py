"""Testes unitarios para compiler.py — corte de clips e montagem via FFmpeg."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock, call
import subprocess

from compiler import (
    ffmpeg_available, cut_clip, concatenate_clips, extract_thumbnail,
    get_duration, concatenate_with_transitions, AVAILABLE_TRANSITIONS,
    normalize_clip, add_text_overlay, QUALITY_PRESETS, OUTPUT_FORMATS,
    FRAME_FIT_MODES, OVERLAY_STYLES,
    get_output_dimensions, mix_voiceover_tracks,
)


# ── ffmpeg_available ──────────────────────────────────────────────────────────

class TestFfmpegAvailable:

    def test_retorna_true_quando_ffmpeg_presente(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            assert ffmpeg_available() is True

    def test_retorna_false_quando_ffmpeg_ausente(self):
        with patch("subprocess.run", side_effect=FileNotFoundError):
            assert ffmpeg_available() is False

    def test_retorna_false_quando_ffmpeg_falha(self):
        with patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffmpeg")):
            assert ffmpeg_available() is False


# ── cut_clip ──────────────────────────────────────────────────────────────────

class TestCutClip:

    def test_duracao_invalida_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        result = cut_clip("input.mp4", start=10.0, end=5.0, output_path=out)
        assert result is None

    def test_duracao_zero_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        result = cut_clip("input.mp4", start=5.0, end=5.0, output_path=out)
        assert result is None

    def test_duracao_invalida_chama_log(self, tmp_path):
        logs = []
        out = str(tmp_path / "out.mp4")
        cut_clip("input.mp4", start=10.0, end=5.0, output_path=out, log_fn=logs.append)
        assert any("invalida" in msg.lower() for msg in logs)

    def test_ffmpeg_nao_encontrado_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = cut_clip("input.mp4", start=0.0, end=5.0, output_path=out)
        assert result is None

    def test_ffmpeg_nao_encontrado_chama_log(self, tmp_path):
        logs = []
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            cut_clip("input.mp4", start=0.0, end=5.0, output_path=out, log_fn=logs.append)
        assert any("ffmpeg" in msg.lower() for msg in logs)

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"Erro de codificacao"
        with patch("subprocess.run", side_effect=err):
            result = cut_clip("input.mp4", start=0.0, end=5.0, output_path=out)
        assert result is None

    def test_sucesso_retorna_output_path(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = cut_clip("input.mp4", start=0.0, end=10.0, output_path=out)
        assert result == out

    def test_comando_contem_ss_e_t(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            cut_clip("input.mp4", start=5.0, end=15.0, output_path=out)
        cmd = mock_run.call_args[0][0]
        assert "-ss" in cmd
        assert "5.0" in cmd        # start
        assert "-t" in cmd
        assert "10.0" in cmd       # duration = end - start = 15-5

    def test_comando_contem_input(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            cut_clip("myvideo.mp4", start=0.0, end=5.0, output_path=out)
        cmd = mock_run.call_args[0][0]
        assert "myvideo.mp4" in cmd


# ── concatenate_clips ─────────────────────────────────────────────────────────

class TestConcatenateClips:

    def test_lista_vazia_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        result = concatenate_clips([], out)
        assert result is None

    def test_lista_vazia_chama_log(self, tmp_path):
        logs = []
        out = str(tmp_path / "out.mp4")
        concatenate_clips([], out, log_fn=logs.append)
        assert len(logs) > 0

    def test_clip_unico_copia_arquivo(self, tmp_path):
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"fake video content")
        out = str(tmp_path / "out.mp4")
        result = concatenate_clips([str(src)], out)
        assert result == out
        assert os.path.exists(out)
        assert open(out, "rb").read() == b"fake video content"

    def test_ffmpeg_nao_encontrado_retorna_none(self, tmp_path):
        src = tmp_path / "c1.mp4"
        src.write_bytes(b"x")
        src2 = tmp_path / "c2.mp4"
        src2.write_bytes(b"y")
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = concatenate_clips([str(src), str(src2)], out)
        assert result is None

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        src = tmp_path / "c1.mp4"
        src.write_bytes(b"x")
        src2 = tmp_path / "c2.mp4"
        src2.write_bytes(b"y")
        out = str(tmp_path / "out.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"Codec error"
        with patch("subprocess.run", side_effect=err):
            result = concatenate_clips([str(src), str(src2)], out)
        assert result is None

    def test_multiplos_clips_sucesso(self, tmp_path):
        clips = []
        for i in range(3):
            c = tmp_path / f"clip{i}.mp4"
            c.write_bytes(b"x")
            clips.append(str(c))
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = concatenate_clips(clips, out)
        assert result == out

    def test_arquivo_lista_criado_e_removido(self, tmp_path):
        """O arquivo temporario de lista do concat demuxer deve ser removido apos uso."""
        clips = [str(tmp_path / "c1.mp4"), str(tmp_path / "c2.mp4")]
        for c in clips:
            open(c, "wb").write(b"x")
        out = str(tmp_path / "out.mp4")
        created_files = []
        original_mkstemp = __import__("tempfile").mkstemp

        def tracking_mkstemp(**kwargs):
            fd, path = original_mkstemp(**kwargs)
            created_files.append(path)
            return fd, path

        with patch("tempfile.mkstemp", side_effect=tracking_mkstemp):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0)
                concatenate_clips(clips, out)

        # Arquivo de lista deve ter sido deletado
        for p in created_files:
            assert not os.path.exists(p)

    def test_comando_usa_concat_demuxer(self, tmp_path):
        clips = [str(tmp_path / "c1.mp4"), str(tmp_path / "c2.mp4")]
        for c in clips:
            open(c, "wb").write(b"x")
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            concatenate_clips(clips, out)
        cmd = mock_run.call_args[0][0]
        assert "-f" in cmd
        assert "concat" in cmd


# ── extract_thumbnail ─────────────────────────────────────────────────────────

class TestExtractThumbnail:

    def test_sucesso_retorna_output_path(self, tmp_path):
        out = str(tmp_path / "thumb.jpg")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = extract_thumbnail("video.mp4", out, time=3.0)
        assert result == out

    def test_ffmpeg_ausente_retorna_none(self, tmp_path):
        out = str(tmp_path / "thumb.jpg")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = extract_thumbnail("video.mp4", out)
        assert result is None

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        out = str(tmp_path / "thumb.jpg")
        with patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffmpeg")):
            result = extract_thumbnail("video.mp4", out)
        assert result is None

    def test_comando_contem_vframes_1(self, tmp_path):
        out = str(tmp_path / "thumb.jpg")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            extract_thumbnail("video.mp4", out, time=5.0)
        cmd = mock_run.call_args[0][0]
        assert "-vframes" in cmd
        assert "1" in cmd

    def test_comando_contem_time(self, tmp_path):
        out = str(tmp_path / "thumb.jpg")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            extract_thumbnail("video.mp4", out, time=7.5)
        cmd = mock_run.call_args[0][0]
        assert "7.5" in cmd

    def test_log_chamado_em_erro(self, tmp_path):
        logs = []
        out = str(tmp_path / "thumb.jpg")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            extract_thumbnail("video.mp4", out, log_fn=logs.append)
        assert len(logs) > 0


class TestMixVoiceoverTracks:

    def test_retorna_none_sem_overlays_validos(self, tmp_path):
        output = str(tmp_path / "out.mp4")
        result = mix_voiceover_tracks("video.mp4", [], output)
        assert result is None

    def test_comando_contem_adelay_e_amix(self, tmp_path):
        video = tmp_path / "video.mp4"
        audio = tmp_path / "voice.wav"
        video.write_bytes(b"x")
        audio.write_bytes(b"y")
        output = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = mix_voiceover_tracks(
                str(video),
                [{"audio_path": str(audio), "start": 2.5, "volume": 0.9}],
                output,
            )
        assert result == output
        cmd = mock_run.call_args[0][0]
        cmd_text = " ".join(cmd)
        assert "adelay=2500|2500" in cmd_text
        assert "amix=inputs=2" in cmd_text

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        video = tmp_path / "video.mp4"
        audio = tmp_path / "voice.wav"
        video.write_bytes(b"x")
        audio.write_bytes(b"y")
        output = str(tmp_path / "out.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"mix fail"
        with patch("subprocess.run", side_effect=err):
            result = mix_voiceover_tracks(
                str(video),
                [{"audio_path": str(audio), "start": 1.0}],
                output,
            )
        assert result is None


# ── get_duration ──────────────────────────────────────────────────────────────

class TestGetDuration:

    def _ffprobe_output(self, duration: str) -> MagicMock:
        m = MagicMock()
        m.stdout = json.dumps({"streams": [{"duration": duration}]}).encode()
        return m

    def test_retorna_duracao_como_float(self):
        with patch("subprocess.run", return_value=self._ffprobe_output("42.5")):
            result = get_duration("video.mp4")
        assert result == 42.5

    def test_retorna_float_de_string(self):
        with patch("subprocess.run", return_value=self._ffprobe_output("15.25")):
            result = get_duration("video.mp4")
        assert isinstance(result, float)
        assert result == 15.25

    def test_retorna_none_sem_streams(self):
        m = MagicMock()
        m.stdout = json.dumps({"streams": []}).encode()
        with patch("subprocess.run", return_value=m):
            result = get_duration("video.mp4")
        assert result is None

    def test_retorna_none_stream_sem_duration(self):
        m = MagicMock()
        m.stdout = json.dumps({"streams": [{"codec_type": "video"}]}).encode()
        with patch("subprocess.run", return_value=m):
            result = get_duration("video.mp4")
        assert result is None

    def test_retorna_none_quando_ffprobe_ausente(self):
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = get_duration("video.mp4")
        assert result is None

    def test_retorna_none_quando_ffprobe_falha(self):
        with patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffprobe")):
            result = get_duration("video.mp4")
        assert result is None

    def test_comando_usa_ffprobe_json(self):
        m = MagicMock()
        m.stdout = json.dumps({"streams": [{"duration": "5.0"}]}).encode()
        with patch("subprocess.run", return_value=m) as mock_run:
            get_duration("myvideo.mp4")
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "ffprobe"
        assert "json" in " ".join(cmd)
        assert "myvideo.mp4" in cmd


# ── AVAILABLE_TRANSITIONS ─────────────────────────────────────────────────────

class TestAvailableTransitions:

    def test_contem_none(self):
        assert "none" in AVAILABLE_TRANSITIONS

    def test_contem_fade(self):
        assert "fade" in AVAILABLE_TRANSITIONS

    def test_contem_dissolve(self):
        assert "dissolve" in AVAILABLE_TRANSITIONS

    def test_contem_wipes(self):
        for t in ["wipeleft", "wiperight", "wipeup", "wipedown"]:
            assert t in AVAILABLE_TRANSITIONS

    def test_e_lista(self):
        assert isinstance(AVAILABLE_TRANSITIONS, list)


# ── concatenate_with_transitions ──────────────────────────────────────────────

def _ffprobe_ok(duration: float) -> MagicMock:
    m = MagicMock()
    m.stdout = json.dumps({"streams": [{"duration": str(duration)}]}).encode()
    return m


def _make_clips(tmp_path, n: int) -> list[str]:
    clips = []
    for i in range(n):
        c = tmp_path / f"clip{i}.mp4"
        c.write_bytes(b"x")
        clips.append(str(c))
    return clips


class TestConcatenateWithTransitions:

    def test_lista_vazia_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        result = concatenate_with_transitions([], [], out)
        assert result is None

    def test_clip_unico_copia_sem_ffmpeg(self, tmp_path):
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"conteudo fake")
        out = str(tmp_path / "out.mp4")
        result = concatenate_with_transitions([str(src)], [], out)
        assert result == out
        assert Path(out).read_bytes() == b"conteudo fake"

    def test_todos_none_usa_concat_demuxer(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            concatenate_with_transitions(clips, [None], out)
        cmd = mock_run.call_args[0][0]
        assert "concat" in cmd
        assert "-filter_complex" not in cmd

    def test_todos_none_string_usa_concat_demuxer(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            concatenate_with_transitions(clips, ["none"], out)
        cmd = mock_run.call_args[0][0]
        assert "concat" in cmd

    def test_transicao_fade_usa_filter_complex(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            concatenate_with_transitions(clips, ["fade"], out)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        filter_calls = [cmd for cmd in calls_cmds if "-filter_complex" in cmd]
        assert len(filter_calls) > 0

    def test_filter_complex_contem_xfade(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            concatenate_with_transitions(clips, ["fade"], out)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        filter_calls = [cmd for cmd in calls_cmds if "-filter_complex" in cmd]
        assert len(filter_calls) == 1
        fc_idx = filter_calls[0].index("-filter_complex")
        filter_str = filter_calls[0][fc_idx + 1]
        assert "xfade" in filter_str

    def test_filter_complex_contem_acrossfade(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            concatenate_with_transitions(clips, ["fade"], out)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        filter_calls = [cmd for cmd in calls_cmds if "-filter_complex" in cmd]
        fc_idx = filter_calls[0].index("-filter_complex")
        filter_str = filter_calls[0][fc_idx + 1]
        assert "acrossfade" in filter_str

    def test_offset_calculado_para_dois_clips(self, tmp_path):
        """Para 2 clips de 10s e transition_duration=0.5: offset deve ser 9.5."""
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            concatenate_with_transitions(clips, ["fade"], out, transition_duration=0.5)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        filter_calls = [cmd for cmd in calls_cmds if "-filter_complex" in cmd]
        fc_idx = filter_calls[0].index("-filter_complex")
        filter_str = filter_calls[0][fc_idx + 1]
        assert "offset=9.5" in filter_str

    def test_offset_calculado_para_tres_clips(self, tmp_path):
        """Para 3 clips de 10s e td=0.5: offset1=9.5, offset2=19.0."""
        clips = _make_clips(tmp_path, 3)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            concatenate_with_transitions(clips, ["fade", "dissolve"], out, transition_duration=0.5)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        filter_calls = [cmd for cmd in calls_cmds if "-filter_complex" in cmd]
        fc_idx = filter_calls[0].index("-filter_complex")
        filter_str = filter_calls[0][fc_idx + 1]
        assert "offset=9.5" in filter_str
        assert "offset=19.0" in filter_str

    def test_transition_dissolve_no_filtro(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            concatenate_with_transitions(clips, ["dissolve"], out)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        filter_calls = [cmd for cmd in calls_cmds if "-filter_complex" in cmd]
        fc_idx = filter_calls[0].index("-filter_complex")
        filter_str = filter_calls[0][fc_idx + 1]
        assert "transition=dissolve" in filter_str

    def test_ffprobe_falha_usa_fallback_concat(self, tmp_path):
        """Se ffprobe falhar, cai no concat demuxer como fallback."""
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = [
                subprocess.CalledProcessError(1, "ffprobe"),  # ffprobe falha
                MagicMock(returncode=0),                       # ffmpeg concat OK
            ]
            concatenate_with_transitions(clips, ["fade"], out)
        calls_cmds = [c[0][0] for c in mock_run.call_args_list]
        concat_calls = [cmd for cmd in calls_cmds if "concat" in cmd]
        assert len(concat_calls) > 0

    def test_ffmpeg_ausente_retorna_none(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = concatenate_with_transitions(clips, ["fade"], out)
        assert result is None

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"Erro xfade"
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = [_ffprobe_ok(10.0), _ffprobe_ok(10.0), err]
            result = concatenate_with_transitions(clips, ["fade"], out)
        assert result is None

    def test_sucesso_retorna_output_path(self, tmp_path):
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = _ffprobe_ok(10.0)
            result = concatenate_with_transitions(clips, ["fade"], out)
        assert result == out

    def test_log_chamado_em_erro(self, tmp_path):
        logs = []
        clips = _make_clips(tmp_path, 2)
        out = str(tmp_path / "out.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"xfade error"
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = [_ffprobe_ok(10.0), _ffprobe_ok(10.0), err]
            concatenate_with_transitions(clips, ["fade"], out, log_fn=logs.append)
        assert len(logs) > 0


# ── QUALITY_PRESETS ───────────────────────────────────────────────────────────

class TestQualityPresets:

    def test_e_dict(self):
        assert isinstance(QUALITY_PRESETS, dict)

    def test_contem_high(self):
        assert "high" in QUALITY_PRESETS

    def test_contem_medium(self):
        assert "medium" in QUALITY_PRESETS

    def test_contem_low(self):
        assert "low" in QUALITY_PRESETS

    def test_cada_preset_tem_crf_e_scale(self):
        for name, preset in QUALITY_PRESETS.items():
            assert "crf" in preset, f"{name} sem crf"
            assert "scale" in preset, f"{name} sem scale"


class TestOutputFormats:

    def test_output_formats_existem(self):
        assert "landscape" in OUTPUT_FORMATS
        assert "portrait" in OUTPUT_FORMATS

    def test_landscape_medium_retorna_1280x720(self):
        assert get_output_dimensions("medium", "landscape") == (1280, 720)

    def test_portrait_medium_retorna_720x1280(self):
        assert get_output_dimensions("medium", "portrait") == (720, 1280)

    def test_formato_invalido_cai_para_landscape(self):
        assert get_output_dimensions("medium", "nao-existe") == (1280, 720)


class TestFrameFitModes:

    def test_frame_fit_modes_existem(self):
        assert "contain" in FRAME_FIT_MODES
        assert "cover" in FRAME_FIT_MODES
        assert "blur" in FRAME_FIT_MODES


class TestOverlayStyles:

    def test_overlay_styles_existem(self):
        assert "classic" in OVERLAY_STYLES
        assert "punch" in OVERLAY_STYLES
        assert "lower_third" in OVERLAY_STYLES


# ── normalize_clip ────────────────────────────────────────────────────────────

class TestNormalizeClip:

    def test_sucesso_retorna_output_path(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = normalize_clip("input.mp4", out)
        assert result == out

    def test_ffmpeg_ausente_retorna_none(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = normalize_clip("input.mp4", out)
        assert result is None

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"scale error"
        with patch("subprocess.run", side_effect=err):
            result = normalize_clip("input.mp4", out)
        assert result is None

    def test_comando_contem_scale_e_pad(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            normalize_clip("input.mp4", out, width=1920, height=1080)
        cmd = mock_run.call_args[0][0]
        cmd_str = " ".join(cmd)
        assert "scale" in cmd_str
        assert "pad" in cmd_str

    def test_fit_mode_cover_usa_crop(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            normalize_clip("input.mp4", out, width=720, height=1280, fit_mode="cover")
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "crop=720:1280" in cmd_str

    def test_fit_mode_blur_usa_gblur_e_overlay(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            normalize_clip("input.mp4", out, width=720, height=1280, fit_mode="blur")
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "gblur" in cmd_str
        assert "overlay=(W-w)/2:(H-h)/2" in cmd_str

    def test_resolucao_1080p_default(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            normalize_clip("input.mp4", out)
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "1920" in cmd_str
        assert "1080" in cmd_str

    def test_fps_incluido_no_comando(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            normalize_clip("input.mp4", out, fps=30)
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "30" in cmd_str

    def test_crf_aplicado(self, tmp_path):
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            normalize_clip("input.mp4", out, crf=18)
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "18" in cmd_str

    def test_log_chamado_em_erro(self, tmp_path):
        logs = []
        out = str(tmp_path / "norm.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            normalize_clip("input.mp4", out, log_fn=logs.append)
        assert len(logs) > 0


# ── add_text_overlay ──────────────────────────────────────────────────────────

class TestAddTextOverlay:

    def test_sucesso_retorna_output_path(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = add_text_overlay("input.mp4", out, text="Cruzeiro 2x0")
        assert result == out

    def test_ffmpeg_ausente_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = add_text_overlay("input.mp4", out, text="Teste")
        assert result is None

    def test_ffmpeg_erro_retorna_none(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        err = subprocess.CalledProcessError(1, "ffmpeg")
        err.stderr = b"drawtext error"
        with patch("subprocess.run", side_effect=err):
            result = add_text_overlay("input.mp4", out, text="Teste")
        assert result is None

    def test_comando_contem_drawtext(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            add_text_overlay("input.mp4", out, text="Gol do Cruzeiro")
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "drawtext" in cmd_str

    def test_texto_no_filtro(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            add_text_overlay("input.mp4", out, text="Placar Final")
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "Placar Final" in cmd_str

    def test_posicao_bottom_default(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            add_text_overlay("input.mp4", out, text="Texto")
        cmd_str = " ".join(mock_run.call_args[0][0])
        # posicao bottom usa y=H-th-N
        assert "H-th" in cmd_str

    def test_duracao_limita_exibicao(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            add_text_overlay("input.mp4", out, text="Texto", duration=3.0)
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "between" in cmd_str or "3.0" in cmd_str

    def test_estilo_punch_centraliza_e_aumenta_fonte(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            add_text_overlay("input.mp4", out, text="Texto", style="punch")
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "x=(W-tw)/2" in cmd_str
        assert "borderw=4" in cmd_str

    def test_estilo_lower_third_usa_box_mais_forte(self, tmp_path):
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            add_text_overlay("input.mp4", out, text="Texto", style="lower_third")
        cmd_str = " ".join(mock_run.call_args[0][0])
        assert "boxcolor=black@0.78" in cmd_str

    def test_log_chamado_em_erro(self, tmp_path):
        logs = []
        out = str(tmp_path / "out.mp4")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            add_text_overlay("input.mp4", out, text="X", log_fn=logs.append)
        assert len(logs) > 0
