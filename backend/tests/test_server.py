"""Testes para server.py — endpoints FastAPI."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

# Importa a app depois do sys.path
from server import app

client = TestClient(app)


class TestHealth:

    def test_root_retorna_html(self):
        r = client.get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]

    def test_health_ok(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestTemplates:

    def test_lista_templates(self):
        r = client.get("/api/templates")
        assert r.status_code == 200
        templates = r.json()
        keys = [t["key"] for t in templates]
        assert "reuniao" in keys
        assert "brainstorming" in keys
        assert "produto" in keys
        assert "podcast" in keys
        assert "livre" in keys

    def test_template_tem_label_e_descricao(self):
        r = client.get("/api/templates")
        for t in r.json():
            assert "label" in t
            assert "description" in t


class TestHistory:

    def test_history_retorna_lista(self):
        r = client.get("/api/history")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_history_item_inexistente_404(self):
        r = client.get("/api/history/id-que-nao-existe")
        assert r.status_code == 404

    def test_history_delete_inexistente_204(self):
        r = client.delete("/api/history/id-fantasma")
        assert r.status_code == 204


class TestAiProviders:

    def test_lm_studio_offline(self):
        """Com LM Studio offline, retorna connected=False e lista vazia."""
        with patch("server.ai_providers.is_connected", new_callable=AsyncMock, return_value=False), \
             patch("server.ai_providers.list_models",  new_callable=AsyncMock, return_value=[]):
            r = client.get("/api/ai/status?provider=lm_studio&config=%7B%7D")
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is False
        assert data["models"] == []

    def test_lm_studio_online(self):
        with patch("server.ai_providers.is_connected", new_callable=AsyncMock, return_value=True), \
             patch("server.ai_providers.list_models",  new_callable=AsyncMock, return_value=["llama3"]):
            r = client.get("/api/ai/status?provider=lm_studio&config=%7B%7D")
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is True
        assert "llama3" in data["models"]

    def test_ollama_online(self):
        with patch("server.ai_providers.is_connected", new_callable=AsyncMock, return_value=True), \
             patch("server.ai_providers.list_models",  new_callable=AsyncMock, return_value=["llama3.2"]):
            r = client.get("/api/ai/status?provider=ollama&config=%7B%7D")
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is True
        assert "llama3.2" in data["models"]


class TestAiProcess:

    def test_template_invalido_retorna_400(self):
        r = client.post("/api/ai/process", json={
            "text": "texto",
            "template": "template-inexistente",
            "model": "llama3",
            "provider": "lm_studio",
        })
        assert r.status_code == 400

    def test_livre_sem_prompt_retorna_400(self):
        r = client.post("/api/ai/process", json={
            "text": "texto",
            "template": "livre",
            "model": "llama3",
            "provider": "lm_studio",
            "custom_prompt": "",
        })
        assert r.status_code == 400

    def test_lm_studio_offline_retorna_503(self):
        with patch("server.ai_providers.generate", new_callable=AsyncMock,
                   side_effect=RuntimeError("LM Studio não está rodando")):
            r = client.post("/api/ai/process", json={
                "text": "texto",
                "template": "reuniao",
                "model": "llama3",
                "provider": "lm_studio",
            })
        assert r.status_code == 503

    def test_processo_bem_sucedido(self):
        with patch("server.ai_providers.generate", new_callable=AsyncMock,
                   return_value="## Ata\nDecisão tomada."):
            r = client.post("/api/ai/process", json={
                "text": "João disse que vai fazer isso.",
                "template": "reuniao",
                "model": "llama3",
                "provider": "lm_studio",
            })
        assert r.status_code == 200
        assert "Ata" in r.json()["result"]


class TestTranscribe:

    def test_sem_arquivos_retorna_422(self):
        r = client.post("/api/transcribe", json={"files": []})
        assert r.status_code == 422

    def test_com_arquivos_retorna_job_id(self, tmp_path):
        f = tmp_path / "audio.wav"
        f.write_bytes(b"fake")
        with patch("server.tr_module.get_whisper_model", return_value=(None, None)):
            r = client.post("/api/transcribe", json={"files": [str(f)]})
        assert r.status_code == 200
        assert "job_id" in r.json()


class TestHistoryExport:

    def test_export_zip_retorna_zip(self):
        r = client.get("/api/history/export")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"

    def test_export_zip_content_disposition(self):
        r = client.get("/api/history/export")
        assert "historico_transcricoes.zip" in r.headers.get("content-disposition", "")

    def test_export_zip_valido(self):
        """O ZIP retornado deve ser um arquivo ZIP válido."""
        import io
        import zipfile
        r = client.get("/api/history/export")
        assert zipfile.is_zipfile(io.BytesIO(r.content))


class TestHistoryDeleteWithFile:

    def test_delete_sem_delete_file_nao_remove_arquivo(self, tmp_path):
        """DELETE sem ?delete_file mantém o arquivo no disco."""
        fp = tmp_path / "test_transcricao.txt"
        fp.write_text("conteudo de teste")
        import history as hist_module
        record_id = hist_module.save(str(fp))
        r = client.delete(f"/api/history/{record_id}")
        assert r.status_code == 204
        assert fp.exists()

    def test_delete_com_delete_file_remove_arquivo(self, tmp_path):
        """DELETE com ?delete_file=true apaga o arquivo do disco."""
        fp = tmp_path / "test_transcricao2.txt"
        fp.write_text("conteudo de teste 2")
        import history as hist_module
        record_id = hist_module.save(str(fp))
        r = client.delete(f"/api/history/{record_id}?delete_file=true")
        assert r.status_code == 204
        assert not fp.exists()

    def test_delete_batch_remove_arquivos_e_historico(self, tmp_path):
        """POST batch apaga arquivos e remove registros do histórico."""
        fp1 = tmp_path / "batch1.txt"
        fp1.write_text("conteudo batch 1")
        fp2 = tmp_path / "batch2.txt"
        fp2.write_text("conteudo batch 2")
        import history as hist_module

        id1 = hist_module.save(str(fp1))
        id2 = hist_module.save(str(fp2))

        r = client.post("/api/history/delete-batch", json={"record_ids": [id1, id2]})
        assert r.status_code == 200
        data = r.json()
        assert data["requested"] == 2
        assert data["deleted"] == 2
        assert set(data["deleted_ids"]) == {id1, id2}
        assert data["failed"] == []
        assert not fp1.exists()
        assert not fp2.exists()

    def test_delete_batch_remove_historico_mesmo_sem_arquivo(self, tmp_path):
        """POST batch deve remover do histórico mesmo se o arquivo já sumiu."""
        fp = tmp_path / "missing.txt"
        fp.write_text("conteudo")
        import history as hist_module

        record_id = hist_module.save(str(fp))
        fp.unlink()

        r = client.post("/api/history/delete-batch", json={"record_ids": [record_id]})
        assert r.status_code == 200
        data = r.json()
        assert data["requested"] == 1
        assert data["deleted"] == 1
        assert data["deleted_ids"] == [record_id]
        assert data["failed"] == []
        assert len(data["warnings"]) == 1


class TestCleanupUploads:

    def test_cleanup_retorna_removed_count(self):
        r = client.post("/api/system/cleanup-uploads")
        assert r.status_code == 200
        data = r.json()
        assert "removed" in data
        assert "days" in data
        assert data["days"] == 7

    def test_cleanup_com_dias_customizado(self):
        r = client.post("/api/system/cleanup-uploads?days=30")
        assert r.status_code == 200
        assert r.json()["days"] == 30

    def test_cleanup_remove_arquivos_antigos(self, tmp_path):
        """Arquivos com mtime antigo devem ser removidos."""
        import time
        from unittest.mock import patch

        old_file = tmp_path / "old.mp3"
        old_file.write_bytes(b"fake audio")

        with patch("server.UPLOAD_DIR", tmp_path):
            # Definir mtime de 10 dias atrás
            old_time = time.time() - 10 * 86400
            import os
            os.utime(str(old_file), (old_time, old_time))

            r = client.post("/api/system/cleanup-uploads?days=7")
            assert r.status_code == 200
            assert r.json()["removed"] == 1
            assert not old_file.exists()


class TestDownload:

    def test_url_vazia_retorna_422(self):
        r = client.post("/api/download", json={"url": ""})
        assert r.status_code == 422

    def test_sem_ytdlp_retorna_503(self):
        with patch("server.dl_module.YT_DLP_AVAILABLE", False):
            r = client.post("/api/download", json={"url": "https://youtube.com/watch?v=x"})
        assert r.status_code == 503

    def test_com_ytdlp_retorna_job_id(self):
        with patch("server.dl_module.YT_DLP_AVAILABLE", True), \
             patch("server.dl_module.download_url"):
            r = client.post("/api/download", json={"url": "https://youtube.com/watch?v=x"})
        assert r.status_code == 200
        assert "job_id" in r.json()


class TestMediaLibrarySettings:

    def test_get_media_library_settings(self):
        r = client.get("/api/settings/media-library")
        assert r.status_code == 200
        data = r.json()
        assert "root_dir" in data
        assert "intro_dir" in data
        assert "music_dir" in data
        assert "source" in data

    def test_update_media_library_settings(self, tmp_path):
        target = tmp_path / "custom_media_library"
        r = client.post(
            "/api/settings/media-library",
            json={"root_dir": str(target)},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["root_dir"] == str(target.resolve())
        assert data["source"] == "app_settings"
        assert target.exists()
        assert (target / "intros").exists()
        assert (target / "music").exists()


class TestProjectDownloadSource:

    def test_download_source_sem_ytdlp_retorna_503(self):
        project = client.post(
            "/api/projects",
            json={"name": "Manual Project", "topic": "", "config": {"project_type": "manual"}},
        ).json()
        client.post(
            f"/api/projects/{project['id']}/videos",
            json={"source_url": "https://youtube.com/watch?v=x", "local_path": "", "title": "video"},
        )

        with patch("server.dl_module.YT_DLP_AVAILABLE", False):
            r = client.post(
                f"/api/projects/{project['id']}/download-source",
                json={"source_url": "https://youtube.com/watch?v=x"},
            )
        assert r.status_code == 503
