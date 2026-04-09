"""Testes de integracao para endpoints de projetos no server.py."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import uuid
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from server import app

client = TestClient(app)

# IDs gerados nos testes para limpeza posterior
_created_project_ids: list[str] = []


def _create_test_project(name: str = "Projeto Teste", topic: str = "Futebol") -> dict:
    r = client.post("/api/projects", json={"name": name, "topic": topic})
    assert r.status_code == 201
    p = r.json()
    _created_project_ids.append(p["id"])
    return p


@pytest.fixture(autouse=True)
def cleanup_projects():
    """Remove projetos criados em cada teste ao final."""
    yield
    for pid in list(_created_project_ids):
        client.delete(f"/api/projects/{pid}")
    _created_project_ids.clear()


# ── Projetos CRUD ─────────────────────────────────────────────────────────────

class TestCreateProject:

    def test_cria_projeto_retorna_201(self):
        r = client.post("/api/projects", json={"name": "Canal Cruzeiro"})
        assert r.status_code == 201
        _created_project_ids.append(r.json()["id"])

    def test_cria_projeto_retorna_dict_com_id(self):
        p = _create_test_project()
        assert "id" in p
        assert len(p["id"]) == 36

    def test_cria_projeto_status_draft(self):
        p = _create_test_project()
        assert p["status"] == "draft"

    def test_cria_projeto_com_topic(self):
        p = _create_test_project(topic="Noticias do Cruzeiro")
        assert p["topic"] == "Noticias do Cruzeiro"


class TestListProjects:

    def test_list_retorna_200(self):
        r = client.get("/api/projects")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_projeto_criado_aparece_na_lista(self):
        p = _create_test_project()
        r = client.get("/api/projects")
        ids = [x["id"] for x in r.json()]
        assert p["id"] in ids

    def test_projeto_lista_com_videos(self):
        p = _create_test_project()
        r = client.get("/api/projects")
        projeto = next(x for x in r.json() if x["id"] == p["id"])
        assert "videos" in projeto
        assert isinstance(projeto["videos"], list)


class TestGetProject:

    def test_get_projeto_existente_200(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == p["id"]

    def test_get_projeto_inclui_videos(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}")
        assert "videos" in r.json()

    def test_get_projeto_inexistente_404(self):
        r = client.get("/api/projects/nao-existe-jamais")
        assert r.status_code == 404


class TestDeleteProject:

    def test_delete_retorna_204(self):
        p = _create_test_project()
        r = client.delete(f"/api/projects/{p['id']}")
        assert r.status_code == 204

    def test_delete_projeto_some_da_listagem(self):
        p = _create_test_project()
        client.delete(f"/api/projects/{p['id']}")
        r = client.get("/api/projects")
        ids = [x["id"] for x in r.json()]
        assert p["id"] not in ids

    def test_delete_inexistente_retorna_204(self):
        r = client.delete("/api/projects/nao-existe")
        assert r.status_code == 204


# ── Videos ────────────────────────────────────────────────────────────────────

class TestAddVideo:

    def test_add_video_retorna_201(self):
        p = _create_test_project()
        r = client.post(
            f"/api/projects/{p['id']}/videos",
            json={"source_url": "https://youtube.com/watch?v=abc"},
        )
        assert r.status_code == 201

    def test_add_video_retorna_dict_com_id(self):
        p = _create_test_project()
        r = client.post(
            f"/api/projects/{p['id']}/videos",
            json={"source_url": "https://youtube.com/watch?v=abc"},
        )
        v = r.json()
        assert "id" in v
        assert v["source_url"] == "https://youtube.com/watch?v=abc"

    def test_add_video_projeto_inexistente_404(self):
        r = client.post(
            "/api/projects/nao-existe/videos",
            json={"source_url": "https://youtube.com/watch?v=abc"},
        )
        assert r.status_code == 404

    def test_add_video_sem_url_nem_path_422(self):
        p = _create_test_project()
        r = client.post(
            f"/api/projects/{p['id']}/videos",
            json={"source_url": "", "local_path": ""},
        )
        assert r.status_code == 422

    def test_add_video_aparece_no_projeto(self):
        p = _create_test_project()
        client.post(
            f"/api/projects/{p['id']}/videos",
            json={"source_url": "https://youtube.com/watch?v=xyz"},
        )
        r = client.get(f"/api/projects/{p['id']}")
        assert len(r.json()["videos"]) == 1


class TestRemoveVideo:

    def test_remove_video_retorna_204(self):
        p = _create_test_project()
        v_r = client.post(
            f"/api/projects/{p['id']}/videos",
            json={"source_url": "https://youtube.com/watch?v=del"},
        )
        vid = v_r.json()["id"]
        r = client.delete(f"/api/projects/{p['id']}/videos/{vid}")
        assert r.status_code == 204

    def test_remove_video_some_do_projeto(self):
        p = _create_test_project()
        v_r = client.post(
            f"/api/projects/{p['id']}/videos",
            json={"source_url": "https://youtube.com/watch?v=del"},
        )
        vid = v_r.json()["id"]
        client.delete(f"/api/projects/{p['id']}/videos/{vid}")
        r = client.get(f"/api/projects/{p['id']}")
        assert len(r.json()["videos"]) == 0


# ── Process (download + transcricao) ─────────────────────────────────────────

class TestProcessProject:

    def test_process_projeto_sem_videos_422(self):
        p = _create_test_project()
        r = client.post(f"/api/projects/{p['id']}/process", json={})
        assert r.status_code == 422

    def test_process_projeto_inexistente_404(self):
        r = client.post("/api/projects/nao-existe/process", json={})
        assert r.status_code == 404

    def test_process_retorna_job_id(self):
        p = _create_test_project()
        client.post(
            f"/api/projects/{p['id']}/videos",
            json={"local_path": "/tmp/fake.mp4"},
        )
        with patch("server.tr_module.get_whisper_model", return_value=(None, None)):
            r = client.post(f"/api/projects/{p['id']}/process", json={})
        assert r.status_code == 200
        assert "job_id" in r.json()


# ── Generate Script ───────────────────────────────────────────────────────────

class TestGenerateScript:

    def test_projeto_sem_transcricoes_422(self):
        p = _create_test_project()
        r = client.post(
            f"/api/projects/{p['id']}/generate-script",
            json={"model": "llama3", "provider": "ollama"},
        )
        assert r.status_code == 422

    def test_projeto_inexistente_404(self):
        r = client.post(
            "/api/projects/nao-existe/generate-script",
            json={"model": "llama3", "provider": "ollama"},
        )
        assert r.status_code == 404

    def test_ia_offline_retorna_503(self):
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x")
        proj_module.update_video(
            vid["id"],
            transcription=[{"start": 0.0, "end": 5.0, "text": "Gol do Cruzeiro"}],
        )
        with patch("server.ai_providers.generate", new_callable=AsyncMock,
                   side_effect=RuntimeError("Offline")):
            r = client.post(
                f"/api/projects/{p['id']}/generate-script",
                json={"model": "llama3", "provider": "ollama"},
            )
        assert r.status_code == 503

    def test_ia_retorna_json_invalido_422(self):
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x")
        proj_module.update_video(
            vid["id"],
            transcription=[{"start": 0.0, "end": 5.0, "text": "Gol do Cruzeiro"}],
        )
        with patch("server.ai_providers.generate", new_callable=AsyncMock,
                   return_value="Nao e JSON valido de jeito nenhum"):
            r = client.post(
                f"/api/projects/{p['id']}/generate-script",
                json={"model": "llama3", "provider": "ollama"},
            )
        assert r.status_code == 422


class TestEditorAutomation:

    def test_lista_editor_presets(self):
        r = client.get("/api/editor-presets")
        assert r.status_code == 200
        assert "dynamic" in r.json()

    def test_auto_arrange_aplica_preset(self):
        import projects as proj_module
        p = _create_test_project()
        proj_module.update_project(
            p["id"],
            script={
                "segments": [
                    {"id": str(uuid.uuid4()), "video_id": "v1", "start": 0.0, "end": 10.0, "label": "Clip 1", "selected": True},
                    {"id": str(uuid.uuid4()), "video_id": "v1", "start": 12.0, "end": 20.0, "label": "Clip 2", "selected": True},
                ]
            },
        )
        r = client.post(f"/api/projects/{p['id']}/auto-arrange", json={"preset": "shorts_pro"})
        assert r.status_code == 200
        payload = r.json()
        assert payload["config"]["output_format"] == "portrait"
        assert payload["script"]["segments"][0]["track"] in (1, 2, 3)
        assert "timeline_start" in payload["script"]["segments"][0]

    def test_cria_e_lista_channel_preset(self):
        r = client.post(
            "/api/channel-presets",
            json={
                "name": "Canal Viral",
                "config": {
                    "output_format": "portrait",
                    "frame_fit_mode": "cover",
                    "narration_voice_hint": "pt-br",
                },
            },
        )
        assert r.status_code == 201
        preset = r.json()
        assert preset["name"] == "Canal Viral"

        listed = client.get("/api/channel-presets")
        assert listed.status_code == 200
        assert any(item["id"] == preset["id"] for item in listed.json())

        client.delete(f"/api/channel-presets/{preset['id']}")

    def test_apply_channel_preset_no_projeto(self):
        import projects as proj_module
        p = _create_test_project()
        preset = proj_module.create_channel_preset(
            "Preset Shorts",
            {
                "output_format": "portrait",
                "frame_fit_mode": "cover",
                "narration_voice_hint": "pt-br",
            },
        )
        r = client.post(
            f"/api/projects/{p['id']}/apply-channel-preset",
            json={"preset_id": preset["id"]},
        )
        assert r.status_code == 200
        payload = r.json()
        assert payload["project"]["config"]["output_format"] == "portrait"
        assert payload["project"]["config"]["channel_preset_id"] == preset["id"]
        proj_module.delete_channel_preset(preset["id"])

    def test_generate_narration_plan(self):
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x")
        proj_module.update_video(
            vid["id"],
            transcription=[{"start": 0.0, "end": 5.0, "text": "Gol do Cruzeiro", "speaker": "SPEAKER_01"}],
        )
        proj_module.update_project(
            p["id"],
            script={
                "segments": [
                    {"id": str(uuid.uuid4()), "video_id": vid["id"], "start": 0.0, "end": 5.0, "label": "Hook", "selected": True},
                ]
            },
        )
        with patch("server.ai_providers.generate", new_callable=AsyncMock, return_value='{"narration":[{"text":"Abra com impacto","insert_after_segment_id":"auto","voice_style":"energetic","reason":"Aumenta retenção"}]}'):
            r = client.post(
                f"/api/projects/{p['id']}/generate-narration-plan",
                json={"model": "gemini-test", "provider": "gemini", "config": {}},
            )
        assert r.status_code == 200
        payload = r.json()
        assert payload["narration"][0]["voice_style"] == "energetic"

    def test_generate_viral_markers(self):
        import projects as proj_module
        p = _create_test_project()
        proj_module.update_project(
            p["id"],
            script={
                "segments": [
                    {"id": "seg-1", "video_id": "v1", "start": 0.0, "end": 6.0, "label": "Hook", "selected": True},
                    {"id": "seg-2", "video_id": "v1", "start": 7.0, "end": 13.0, "label": "Middle", "selected": True},
                    {"id": "seg-3", "video_id": "v1", "start": 14.0, "end": 20.0, "label": "CTA", "selected": True},
                ],
            },
        )
        r = client.post(
            f"/api/projects/{p['id']}/generate-viral-markers",
            json={"style": "viral_shorts"},
        )
        assert r.status_code == 200
        payload = r.json()
        marker_types = [item["type"] for item in payload["viral_markers"]]
        assert "hook" in marker_types
        assert "cta" in marker_types

    def test_generate_narration_audio(self):
        import projects as proj_module
        p = _create_test_project()
        proj_module.update_project(
            p["id"],
            script={
                "segments": [
                    {"id": "seg-1", "video_id": "v1", "start": 0.0, "end": 5.0, "label": "Hook", "selected": True},
                ],
                "narration_plan": [
                    {"text": "Abra com impacto", "insert_after_segment_id": "seg-1", "voice_style": "energetic", "enabled": True},
                ],
            },
        )
        with patch("server.tts_module.tts_available", return_value=True), \
             patch("server.tts_module.synthesize_to_file", return_value="C:/tmp/narration_001.wav"):
            r = client.post(
                f"/api/projects/{p['id']}/generate-narration-audio",
                json={"voice_hint": "pt", "rate": 185, "volume": 1.0},
            )
        assert r.status_code == 200
        payload = r.json()
        assert payload["narration_audio"][0]["audio_path"] == "C:/tmp/narration_001.wav"
        assert "start" in payload["narration_audio"][0]

    def test_script_gerado_salvo_no_projeto(self):
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x")
        proj_module.update_video(
            vid["id"],
            transcription=[{"start": 0.0, "end": 5.0, "text": "Gol do Cruzeiro"}],
        )
        script_json = {
            "title": "Resumao Cruzeiro",
            "description": "Melhores momentos",
            "segments": [
                {
                    "video_id": vid["id"],
                    "start": 0.0,
                    "end": 5.0,
                    "label": "Gol",
                    "reason": "Momento decisivo",
                }
            ],
            "ai_notes": "Selecao editorial",
        }
        with patch("server.ai_providers.generate", new_callable=AsyncMock,
                   return_value=__import__("json").dumps(script_json)):
            r = client.post(
                f"/api/projects/{p['id']}/generate-script",
                json={"model": "llama3", "provider": "ollama"},
            )
        assert r.status_code == 200
        result = r.json()
        assert result["script"]["title"] == "Resumao Cruzeiro"
        assert len(result["script"]["segments"]) == 1
        # Verificar que foi salvo no projeto
        proj = client.get(f"/api/projects/{p['id']}").json()
        assert proj["status"] == "scripted"


# ── Update Script ─────────────────────────────────────────────────────────────

class TestUpdateScript:

    def test_update_script_salvo(self):
        p = _create_test_project()
        novo_script = {"title": "Novo Titulo", "segments": []}
        r = client.post(
            f"/api/projects/{p['id']}/update-script",
            json={"script": novo_script},
        )
        assert r.status_code == 200
        assert r.json()["script"]["title"] == "Novo Titulo"

    def test_update_script_projeto_inexistente_404(self):
        r = client.post(
            "/api/projects/nao-existe/update-script",
            json={"script": {"title": "X"}},
        )
        assert r.status_code == 404


# ── Compile ───────────────────────────────────────────────────────────────────

class TestCompileProject:

    def test_compile_sem_script_422(self):
        p = _create_test_project()
        r = client.post(f"/api/projects/{p['id']}/compile")
        assert r.status_code == 422

    def test_compile_projeto_inexistente_404(self):
        r = client.post("/api/projects/nao-existe/compile")
        assert r.status_code == 404

    def test_compile_com_script_retorna_job_id(self):
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        script = {
            "title": "Compilado",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True, "label": "Intro"}
            ],
        }
        proj_module.update_project(p["id"], script=script)
        with patch("server.comp_module.cut_clip", return_value=None), \
             patch("server.comp_module.concatenate_clips", return_value=None):
            r = client.post(f"/api/projects/{p['id']}/compile")
        assert r.status_code == 200
        assert "job_id" in r.json()


# ── Download ──────────────────────────────────────────────────────────────────

class TestDownloadCompiled:

    def test_download_projeto_sem_output_404(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}/download")
        assert r.status_code == 404

    def test_download_projeto_inexistente_404(self):
        r = client.get("/api/projects/nao-existe/download")
        assert r.status_code == 404

    def test_download_com_arquivo_existente_retorna_video(self, tmp_path):
        import projects as proj_module
        p = _create_test_project()
        fake_mp4 = tmp_path / "video.mp4"
        fake_mp4.write_bytes(b"fake mp4 content")
        proj_module.update_project(p["id"], output_path=str(fake_mp4), status="done")
        r = client.get(f"/api/projects/{p['id']}/download")
        assert r.status_code == 200
        assert "video/mp4" in r.headers["content-type"]


class TestProjectVideoMedia:

    def test_video_media_inexistente_404(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}/videos/nao-existe/media")
        assert r.status_code == 404

    def test_video_media_retorna_arquivo(self, tmp_path):
        import projects as proj_module
        p = _create_test_project()
        fake_mp4 = tmp_path / "fonte.mp4"
        fake_mp4.write_bytes(b"fake mp4 content")
        vid = proj_module.add_video(p["id"], local_path=str(fake_mp4), title="Fonte")
        r = client.get(f"/api/projects/{p['id']}/videos/{vid['id']}/media")
        assert r.status_code == 200
        assert "video/" in r.headers["content-type"]


class TestDownloadProjectClip:

    def test_download_clip_inexistente_404(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}/clips/nao-existe/download")
        assert r.status_code == 404

    def test_download_clip_retorna_mp4(self, tmp_path):
        import projects as proj_module
        p = _create_test_project()
        fake_mp4 = tmp_path / "fonte.mp4"
        fake_mp4.write_bytes(b"fake mp4 content")
        vid = proj_module.add_video(p["id"], local_path=str(fake_mp4), title="Fonte")
        script = {
            "title": "Clips",
            "segments": [
                {
                    "id": "seg-1",
                    "video_id": vid["id"],
                    "start": 0.0,
                    "end": 5.0,
                    "selected": True,
                    "label": "Abertura",
                }
            ],
        }
        proj_module.update_project(p["id"], script=script)

        exported = tmp_path / "clip.mp4"
        exported.write_bytes(b"clip data")
        with patch("server.comp_module.cut_clip", return_value=str(exported)), \
             patch("server.comp_module.normalize_clip", return_value=str(exported)):
            r = client.get(f"/api/projects/{p['id']}/clips/seg-1/download")
        assert r.status_code == 200
        assert "video/mp4" in r.headers["content-type"]

    def test_download_clip_aplica_formato_do_projeto(self, tmp_path):
        import projects as proj_module
        p = _create_test_project()
        fake_mp4 = tmp_path / "fonte.mp4"
        fake_mp4.write_bytes(b"fake mp4 content")
        vid = proj_module.add_video(p["id"], local_path=str(fake_mp4), title="Fonte")
        script = {
            "title": "Clips",
            "segments": [
                {
                    "id": "seg-1",
                    "video_id": vid["id"],
                    "start": 0.0,
                    "end": 5.0,
                    "selected": True,
                    "label": "Abertura",
                }
            ],
        }
        proj_module.update_project(
            p["id"],
            script=script,
            config={"quality": "medium", "output_format": "portrait", "frame_fit_mode": "cover"},
        )

        exported = tmp_path / "clip.mp4"
        exported.write_bytes(b"clip data")
        normalize_calls = []

        def fake_norm(input_path, output_path, **kw):
            normalize_calls.append((kw.get("width"), kw.get("height"), kw.get("fit_mode")))
            return str(exported)

        with patch("server.comp_module.cut_clip", return_value=str(exported)), \
             patch("server.comp_module.normalize_clip", side_effect=fake_norm):
            r = client.get(f"/api/projects/{p['id']}/clips/seg-1/download")
        assert r.status_code == 200
        assert normalize_calls == [(720, 1280, "cover")]


class TestExportSelectedClips:

    def test_export_selected_sem_script_422(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}/clips/export")
        assert r.status_code == 422

    def test_export_selected_retorna_zip(self, tmp_path):
        import projects as proj_module
        p = _create_test_project()
        fake_mp4 = tmp_path / "fonte.mp4"
        fake_mp4.write_bytes(b"fake mp4 content")
        vid = proj_module.add_video(p["id"], local_path=str(fake_mp4), title="Fonte")
        script = {
            "title": "Clips",
            "segments": [
                {
                    "id": "seg-1",
                    "video_id": vid["id"],
                    "start": 0.0,
                    "end": 5.0,
                    "selected": True,
                    "label": "Gol",
                }
            ],
        }
        proj_module.update_project(p["id"], script=script)

        exported = tmp_path / "clip_export.mp4"
        exported.write_bytes(b"clip data")
        with patch("server.comp_module.cut_clip", return_value=str(exported)), \
             patch("server.comp_module.normalize_clip", return_value=str(exported)):
            r = client.get(f"/api/projects/{p['id']}/clips/export")
        assert r.status_code == 200
        assert "application/zip" in r.headers["content-type"]


# ── Helpers internos ──────────────────────────────────────────────────────────

class TestBuildUnifiedTranscription:

    def test_formata_videos_com_timestamps_em_segundos(self):
        from server import _build_unified_transcription
        videos = [
            {
                "id": "vid-1",
                "title": "Jogo Top",
                "duration": 90.0,
                "transcription": [
                    {"start": 0.0, "end": 5.0, "text": "Gol!"},
                    {"start": 10.5, "end": 15.3, "text": "Que chute!"},
                ],
            }
        ]
        result = _build_unified_transcription(videos)
        assert "vid-1" in result
        assert "Jogo Top" in result
        assert "Gol!" in result
        # Timestamps devem estar em segundos decimais, nao MM:SS
        assert "0.00s" in result
        assert "5.00s" in result
        assert "10.50s" in result
        assert "15.30s" in result

    def test_timestamps_nao_estao_em_formato_mmss(self):
        """Garante que o formato MM:SS nao e usado (causava confusao de unidade na IA)."""
        from server import _build_unified_transcription
        videos = [
            {
                "id": "v1",
                "title": "T",
                "duration": 300.0,
                "transcription": [{"start": 125.0, "end": 143.0, "text": "texto"}],
            }
        ]
        result = _build_unified_transcription(videos)
        # Nao deve ter formato MM:SS
        assert "02:05" not in result
        assert "02:23" not in result
        # Deve ter segundos puros
        assert "125.00s" in result
        assert "143.00s" in result

    def test_duracao_total_exibida_no_cabecalho(self):
        from server import _build_unified_transcription
        videos = [{"id": "v1", "title": "T", "duration": 565.0, "transcription": []}]
        result = _build_unified_transcription(videos)
        assert "565.0s" in result
        assert "9m" in result

    def test_video_sem_transcricao_exibe_secao(self):
        from server import _build_unified_transcription
        videos = [{"id": "v1", "title": "T", "duration": 0, "transcription": None}]
        result = _build_unified_transcription(videos)
        assert "v1" in result


class TestValidateScriptTimestamps:

    def test_sem_aviso_quando_timestamps_corretos(self):
        from server import _validate_script_timestamps
        videos = [{"duration": 600.0}]
        script = {
            "segments": [
                {"start": 125.0, "end": 143.0},
                {"start": 300.0, "end": 350.0},
            ]
        }
        warnings = _validate_script_timestamps(script, videos)
        assert warnings == []

    def test_aviso_quando_timestamps_parecem_minutos(self):
        """Detecta quando a IA gerou timestamps em minutos (ex: 1.5) em vez de segundos (90)."""
        from server import _validate_script_timestamps
        videos = [{"duration": 564.0}]  # ~9.4 minutos
        script = {
            "segments": [
                {"start": 0.0, "end": 0.3},   # 0.3 minutos = 18s real
                {"start": 1.1, "end": 2.4},   # como a IA gerou
                {"start": 9.1, "end": 9.4},   # maximo em 9.4 "segundos"
            ]
        }
        warnings = _validate_script_timestamps(script, videos)
        assert len(warnings) > 0
        assert any("minutos" in w.lower() or "MINUTOS" in w for w in warnings)

    def test_aviso_para_clips_muito_curtos(self):
        from server import _validate_script_timestamps
        videos = [{"duration": 300.0}]
        script = {
            "segments": [
                {"start": 10.0, "end": 10.2},  # 0.2s — muito curto
                {"start": 50.0, "end": 80.0},  # OK
            ]
        }
        warnings = _validate_script_timestamps(script, videos)
        assert any("0.5s" in w for w in warnings)

    def test_sem_aviso_video_curto_com_timestamps_pequenos(self):
        """Video de 30s com timestamps pequenos nao deve gerar aviso falso."""
        from server import _validate_script_timestamps
        videos = [{"duration": 30.0}]
        script = {"segments": [{"start": 5.0, "end": 15.0}]}
        warnings = _validate_script_timestamps(script, videos)
        assert warnings == []

    def test_sem_aviso_sem_segmentos(self):
        from server import _validate_script_timestamps
        warnings = _validate_script_timestamps({"segments": []}, [{"duration": 600.0}])
        assert warnings == []


class TestParseScriptJson:

    def test_json_puro(self):
        from server import _parse_script_json
        data = {"title": "Test", "segments": []}
        import json
        result = _parse_script_json(json.dumps(data))
        assert result == data

    def test_json_em_bloco_markdown(self):
        from server import _parse_script_json
        text = '```json\n{"title": "Test", "segments": []}\n```'
        result = _parse_script_json(text)
        assert result["title"] == "Test"

    def test_json_invalido_retorna_none(self):
        from server import _parse_script_json
        result = _parse_script_json("Isso nao e JSON")
        assert result is None

    def test_json_em_bloco_sem_linguagem(self):
        from server import _parse_script_json
        text = '```\n{"title": "X"}\n```'
        result = _parse_script_json(text)
        assert result["title"] == "X"


# ── Transitions ───────────────────────────────────────────────────────────────

class TestGetTransitions:

    def test_retorna_lista(self):
        r = client.get("/api/transitions")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_contem_none(self):
        r = client.get("/api/transitions")
        assert "none" in r.json()

    def test_contem_fade(self):
        r = client.get("/api/transitions")
        assert "fade" in r.json()

    def test_contem_dissolve(self):
        r = client.get("/api/transitions")
        assert "dissolve" in r.json()


# ── Compile com transicoes ────────────────────────────────────────────────────

class TestCompileWithTransitions:

    def test_compile_usa_concatenate_with_transitions(self):
        """Garante que _run_project_compile chama concatenate_with_transitions."""
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        script = {
            "title": "Compilado",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True,
                 "label": "Intro", "transition_in": None},
                {"video_id": vid["id"], "start": 10.0, "end": 20.0, "selected": True,
                 "label": "Desfecho", "transition_in": "fade"},
            ],
        }
        proj_module.update_project(p["id"], script=script)
        with patch("server.comp_module.cut_clip", return_value=None), \
             patch("server.comp_module.concatenate_with_transitions", return_value=None) as mock_cwt:
            r = client.post(f"/api/projects/{p['id']}/compile")
        assert r.status_code == 200

    def test_transitions_extraidas_dos_segmentos(self):
        """Verifica que as transicoes sao extraidas do campo transition_in dos segmentos."""
        import projects as proj_module
        import asyncio
        import server as server_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        script = {
            "title": "Compilado",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True,
                 "label": "A", "transition_in": None},
                {"video_id": vid["id"], "start": 10.0, "end": 20.0, "selected": True,
                 "label": "B", "transition_in": "dissolve"},
            ],
        }
        proj_module.update_project(p["id"], script=script)
        captured: list[list[str | None]] = []

        def fake_cwt(clip_paths, transitions, output_path, **kwargs):
            captured.append(list(transitions))
            return None

        def fake_cut(input_path, start, end, output_path, **kwargs):
            return output_path  # simula corte bem-sucedido

        def fake_norm(input_path, output_path, **kw):
            return output_path

        job_id = "job-test-transitions"
        server_module._jobs[job_id] = {"status": "pending", "progress": 0, "logs": [], "result": None, "error": None}

        with patch("server.comp_module.cut_clip", side_effect=fake_cut), \
             patch("server.comp_module.normalize_clip", side_effect=fake_norm), \
             patch("server.comp_module.concatenate_with_transitions", side_effect=fake_cwt):
            server_module._run_project_compile(job_id, p["id"], asyncio.new_event_loop())
        # transitions lista deve ter 1 entrada (N-1 para 2 clips)
        # O primeiro segmento nao tem transition_in, o segundo tem "dissolve"
        # transitions[0] e a transicao do clip 0 para o clip 1 = transition_in do seg[1]
        assert ["dissolve"] in captured


# ── Quality presets endpoint ──────────────────────────────────────────────────

class TestGetQualityPresets:

    def test_retorna_dict(self):
        r = client.get("/api/quality-presets")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_contem_high_medium_low(self):
        r = client.get("/api/quality-presets")
        data = r.json()
        assert "high" in data
        assert "medium" in data
        assert "low" in data

    def test_cada_preset_tem_crf_e_scale(self):
        r = client.get("/api/quality-presets")
        for name, preset in r.json().items():
            assert "crf" in preset, f"{name} sem crf"
            assert "scale" in preset, f"{name} sem scale"


class TestGetOutputFormats:

    def test_retorna_dict(self):
        r = client.get("/api/output-formats")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_contem_landscape_e_portrait(self):
        r = client.get("/api/output-formats")
        data = r.json()
        assert "landscape" in data
        assert "portrait" in data


class TestGetFrameFitModes:

    def test_retorna_dict(self):
        r = client.get("/api/frame-fit-modes")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_contem_contain_cover_blur(self):
        r = client.get("/api/frame-fit-modes")
        data = r.json()
        assert "contain" in data
        assert "cover" in data
        assert "blur" in data


class TestGetOverlayStyles:

    def test_retorna_dict(self):
        r = client.get("/api/overlay-styles")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_contem_classic_punch_lower_third(self):
        r = client.get("/api/overlay-styles")
        data = r.json()
        assert "classic" in data
        assert "punch" in data
        assert "lower_third" in data


# ── Normalizacao na compilacao ────────────────────────────────────────────────

class TestCompileNormalization:

    def test_normalize_clip_chamado_por_clip(self):
        """Garante que normalize_clip e chamado para cada clip antes do xfade."""
        import projects as proj_module
        import threading
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        script = {
            "title": "T",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True,
                 "label": "A", "transition_in": None},
                {"video_id": vid["id"], "start": 10.0, "end": 20.0, "selected": True,
                 "label": "B", "transition_in": "fade"},
            ],
        }
        proj_module.update_project(p["id"], script=script)
        normalize_calls = []
        cwt_done = threading.Event()

        def fake_cut(input_path, start, end, output_path, **kw):
            return output_path

        def fake_norm(input_path, output_path, **kw):
            normalize_calls.append(input_path)
            return output_path

        def fake_cwt(*a, **kw):
            cwt_done.set()
            return None

        with patch("server.comp_module.cut_clip", side_effect=fake_cut), \
             patch("server.comp_module.normalize_clip", side_effect=fake_norm), \
             patch("server.comp_module.concatenate_with_transitions", side_effect=fake_cwt):
            client.post(f"/api/projects/{p['id']}/compile")
            cwt_done.wait(timeout=5.0)

    def test_formato_portrait_forca_normalizacao_mesmo_sem_transicao(self):
        import projects as proj_module
        import threading
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        script = {
            "title": "T",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True, "label": "A"},
            ],
        }
        proj_module.update_project(
            p["id"],
            script=script,
            config={"quality": "medium", "output_format": "portrait"},
        )
        normalize_calls = []
        done = threading.Event()

        def fake_cut(input_path, start, end, output_path, **kw):
            return output_path

        def fake_norm(input_path, output_path, **kw):
            normalize_calls.append((kw.get("width"), kw.get("height")))
            return output_path

        def fake_cwt(*a, **kw):
            done.set()
            return None

        with patch("server.comp_module.cut_clip", side_effect=fake_cut), \
             patch("server.comp_module.normalize_clip", side_effect=fake_norm), \
             patch("server.comp_module.concatenate_with_transitions", side_effect=fake_cwt):
            client.post(f"/api/projects/{p['id']}/compile")
            done.wait(timeout=5.0)

        assert len(normalize_calls) == 1
        assert normalize_calls[0] == (720, 1280)

    def test_frame_fit_mode_cover_e_passado_ao_normalize(self):
        import projects as proj_module
        import threading
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        script = {
            "title": "T",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True, "label": "A"},
            ],
        }
        proj_module.update_project(
            p["id"],
            script=script,
            config={"quality": "medium", "output_format": "portrait", "frame_fit_mode": "cover"},
        )
        normalize_calls = []
        done = threading.Event()

        def fake_cut(input_path, start, end, output_path, **kw):
            return output_path

        def fake_norm(input_path, output_path, **kw):
            normalize_calls.append(kw.get("fit_mode"))
            return output_path

        def fake_cwt(*a, **kw):
            done.set()
            return None

        with patch("server.comp_module.cut_clip", side_effect=fake_cut), \
             patch("server.comp_module.normalize_clip", side_effect=fake_norm), \
             patch("server.comp_module.concatenate_with_transitions", side_effect=fake_cwt):
            client.post(f"/api/projects/{p['id']}/compile")
            done.wait(timeout=5.0)

        assert normalize_calls == ["cover"]

    def test_qualidade_high_usa_crf_18(self):
        """Quando qualidade='high' na config do projeto, CRF 18 e passado ao normalize."""
        import projects as proj_module
        import threading
        p = _create_test_project()
        proj_module.update_project(p["id"], config={"quality": "high"})
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        # Precisa de transicao para acionar normalize_clip
        script = {
            "title": "T",
            "segments": [
                {"video_id": vid["id"], "start": 0.0, "end": 5.0, "selected": True,
                 "label": "A", "transition_in": None},
                {"video_id": vid["id"], "start": 10.0, "end": 20.0, "selected": True,
                 "label": "B", "transition_in": "fade"},
            ],
        }
        proj_module.update_project(p["id"], script=script)
        captured_crf = {}
        cwt_done = threading.Event()

        def fake_cut(input_path, start, end, output_path, **kw):
            return output_path

        def fake_norm(input_path, output_path, crf=23, **kw):
            captured_crf["crf"] = crf
            return output_path

        def fake_cwt(*a, **kw):
            cwt_done.set()
            return None

        with patch("server.comp_module.cut_clip", side_effect=fake_cut), \
             patch("server.comp_module.normalize_clip", side_effect=fake_norm), \
             patch("server.comp_module.concatenate_with_transitions", side_effect=fake_cwt):
            client.post(f"/api/projects/{p['id']}/compile")
            cwt_done.wait(timeout=5.0)

        assert captured_crf.get("crf") == 18


# ── Thumbnail endpoint ─────────────────────────────────────────────────────────

class TestThumbnailEndpoint:

    def test_thumbnail_sem_arquivo_retorna_404(self):
        """Se thumbnail_path nao esta definido, retorna 404."""
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        r = client.get(f"/api/projects/{p['id']}/videos/{vid['id']}/thumbnail")
        assert r.status_code == 404

    def test_thumbnail_projeto_errado_retorna_404(self):
        """Se o video nao pertence ao projeto informado, retorna 404."""
        import projects as proj_module
        p1 = _create_test_project(name="P1")
        p2 = _create_test_project(name="P2")
        vid = proj_module.add_video(p1["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        r = client.get(f"/api/projects/{p2['id']}/videos/{vid['id']}/thumbnail")
        assert r.status_code == 404

    def test_thumbnail_arquivo_inexistente_retorna_404(self):
        """Se thumbnail_path esta definido mas o arquivo nao existe, retorna 404."""
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        proj_module.update_video(vid["id"], thumbnail_path="/tmp/nao_existe.jpg")
        r = client.get(f"/api/projects/{p['id']}/videos/{vid['id']}/thumbnail")
        assert r.status_code == 404

    def test_thumbnail_disponivel_retorna_jpeg(self, tmp_path):
        """Se thumbnail_path existe no disco, retorna 200 com image/jpeg."""
        import projects as proj_module
        thumb = tmp_path / "thumb.jpg"
        thumb.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)  # JPEG header minimo
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], source_url="http://yt.com/x", local_path="/tmp/v.mp4")
        proj_module.update_video(vid["id"], thumbnail_path=str(thumb))
        r = client.get(f"/api/projects/{p['id']}/videos/{vid['id']}/thumbnail")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/jpeg")


# ── _remove_thinking_process ───────────────────────────────────────────────────

class TestRemoveThinkingProcess:

    def setup_method(self):
        from server import _remove_thinking_process
        self.fn = _remove_thinking_process

    def test_resposta_sem_reasoning_retorna_intacta(self):
        text = "## Resumo\nConteudo normal aqui."
        assert self.fn(text) == text

    def test_strip_preamble_antes_de_header(self):
        text = "Vou analisar isso agora.\nPensando...\n## Resultado\nTexto real."
        result = self.fn(text)
        assert result.startswith("## Resultado")
        assert "Pensando" not in result

    def test_strip_via_marcador_content_integration(self):
        text = "linha1\n*Content Integration:* ok\n## Resposta\nTexto."
        result = self.fn(text)
        assert "Content Integration" not in result
        assert "## Resposta" in result

    def test_entrada_vazia_retorna_vazia(self):
        assert self.fn("") == ""

    def test_resposta_so_com_header_sem_preamble(self):
        text = "## Titulo\n\nCorpo do texto."
        assert self.fn(text) == text


# ── Export SRT ────────────────────────────────────────────────────────────────

class TestExportSrt:

    def _project_with_transcribed_video(self):
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], local_path="/tmp/v.mp4")
        transcription = [
            {"start": 0.0, "end": 3.0, "text": "Primeiro segmento."},
            {"start": 3.5, "end": 6.0, "text": "Segundo segmento."},
            {"start": 10.0, "end": 13.0, "text": "Terceiro segmento."},
        ]
        proj_module.update_video(vid["id"], transcription=transcription, duration=15.0, status="transcribed")
        script = {
            "title": "Video Teste",
            "description": "Descricao de teste.",
            "segments": [
                {"id": "s1", "video_id": vid["id"], "start": 0.0, "end": 6.0,
                 "selected": True, "label": "Bloco A", "transition_in": None},
                {"id": "s2", "video_id": vid["id"], "start": 10.0, "end": 13.0,
                 "selected": True, "label": "Bloco B", "transition_in": None},
            ],
        }
        proj_module.update_project(p["id"], script=script, status="scripted")
        return p, vid

    def test_export_srt_retorna_200_com_conteudo(self):
        p, _ = self._project_with_transcribed_video()
        r = client.get(f"/api/projects/{p['id']}/export-srt")
        assert r.status_code == 200

    def test_export_srt_content_type_correto(self):
        p, _ = self._project_with_transcribed_video()
        r = client.get(f"/api/projects/{p['id']}/export-srt")
        assert "srt" in r.headers.get("content-type", "") or "text" in r.headers.get("content-type", "")

    def test_export_srt_contem_texto_dos_segmentos(self):
        p, _ = self._project_with_transcribed_video()
        r = client.get(f"/api/projects/{p['id']}/export-srt")
        body = r.text
        assert "Primeiro segmento." in body
        assert "Segundo segmento." in body
        assert "Terceiro segmento." in body

    def test_export_srt_timestamps_aumentam(self):
        """Timestamps do SRT devem ser crescentes."""
        p, _ = self._project_with_transcribed_video()
        r = client.get(f"/api/projects/{p['id']}/export-srt")
        import re
        times = re.findall(r'(\d{2}:\d{2}:\d{2},\d{3})', r.text)
        assert len(times) >= 2
        # Converter para ms e verificar crescimento
        def to_ms(t):
            h, m, rest = t.split(":")
            s, ms = rest.split(",")
            return int(h)*3600000 + int(m)*60000 + int(s)*1000 + int(ms)
        ms_vals = [to_ms(t) for t in times]
        # start de cada entrada deve ser menor que end da mesma
        starts = ms_vals[::2]
        ends = ms_vals[1::2]
        for s, e in zip(starts, ends):
            assert s < e

    def test_export_srt_sem_roteiro_retorna_422(self):
        p = _create_test_project()
        r = client.get(f"/api/projects/{p['id']}/export-srt")
        assert r.status_code == 422

    def test_export_srt_projeto_inexistente_retorna_404(self):
        r = client.get("/api/projects/nao-existe/export-srt")
        assert r.status_code == 404

    def test_export_srt_segmento_nao_selecionado_excluido(self):
        """Segmentos com selected=False nao devem aparecer no SRT."""
        import projects as proj_module
        p = _create_test_project()
        vid = proj_module.add_video(p["id"], local_path="/tmp/v.mp4")
        proj_module.update_video(vid["id"], transcription=[
            {"start": 0.0, "end": 3.0, "text": "Incluido."},
            {"start": 5.0, "end": 8.0, "text": "Excluido."},
        ], duration=10.0, status="transcribed")
        script = {
            "title": "T", "description": "",
            "segments": [
                {"id": "s1", "video_id": vid["id"], "start": 0.0, "end": 3.0,
                 "selected": True, "label": "A", "transition_in": None},
                {"id": "s2", "video_id": vid["id"], "start": 5.0, "end": 8.0,
                 "selected": False, "label": "B", "transition_in": None},
            ],
        }
        proj_module.update_project(p["id"], script=script, status="scripted")
        r = client.get(f"/api/projects/{p['id']}/export-srt")
        assert "Incluido." in r.text
        assert "Excluido." not in r.text
