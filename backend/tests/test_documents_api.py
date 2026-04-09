"""Testes para projetos documentais e defaults de IA."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from unittest.mock import patch, AsyncMock

import documents as doc_module
from fastapi.testclient import TestClient

from server import app

client = TestClient(app)

_created_document_project_ids: list[str] = []


def _create_document_project(name: str = "Projeto Documental", description: str = "Base de PRD") -> dict:
    response = client.post("/api/document-projects", json={"name": name, "description": description})
    assert response.status_code == 201
    payload = response.json()
    _created_document_project_ids.append(payload["id"])
    return payload


def _create_history_record(tmp_path, filename: str = "transcricao.txt") -> str:
    import history

    path = tmp_path / filename
    path.write_text("Conteudo de transcricao para reutilizar.", encoding="utf-8")
    return history.save(str(path))


def teardown_function():
    for project_id in list(_created_document_project_ids):
        doc_module.delete_project(project_id)
    _created_document_project_ids.clear()


class TestDocumentProjectsApi:

    def test_cria_projeto_documental(self):
        project = _create_document_project()
        assert project["name"] == "Projeto Documental"
        assert project["documents_count"] == 0

    def test_lista_projetos_documentais(self):
        project = _create_document_project()
        response = client.get("/api/document-projects")
        assert response.status_code == 200
        ids = [item["id"] for item in response.json()]
        assert project["id"] in ids

    def test_salva_documento_no_projeto(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)

        response = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "PRD MVP",
                "content": "# PRD MVP\n\nEscopo inicial.",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "Foco em MVP",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        )
        assert response.status_code == 201
        document = response.json()
        assert document["title"] == "PRD MVP"
        assert document["source_history_ids"] == [history_id]

        project_response = client.get(f"/api/document-projects/{project['id']}")
        assert project_response.status_code == 200
        project_payload = project_response.json()
        assert project_payload["documents_count"] == 1
        assert project_payload["documents"][0]["title"] == "PRD MVP"

    def test_get_document_retorna_404_quando_inexistente(self):
        response = client.get("/api/documents/nao-existe")
        assert response.status_code == 404

    def test_atualiza_documento_salvo(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        created = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Documento Base",
                "content": "# Documento Base\n\nVersao inicial.",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        ).json()

        response = client.post(
            f"/api/documents/{created['id']}/update",
            json={
                "title": "Documento Revisado",
                "content": "# Documento Revisado\n\nConteudo final.",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "Refinado",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["title"] == "Documento Revisado"
        assert "Conteudo final" in updated["content"]

    def test_exclui_documento_individual(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        created = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Documento Temporario",
                "content": "# Documento Temporario",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        ).json()

        response = client.delete(f"/api/documents/{created['id']}")
        assert response.status_code == 204
        assert client.get(f"/api/documents/{created['id']}").status_code == 404

    def test_exporta_documento_markdown(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        created = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Documento Exportavel",
                "content": "# Documento Exportavel\n\nTexto markdown.",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        ).json()

        response = client.get(f"/api/documents/{created['id']}/export")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/markdown")
        assert "Documento Exportavel" in response.text

    def test_exporta_projeto_documental_zip(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Doc 1",
                "content": "# Doc 1",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        )

        response = client.get(f"/api/document-projects/{project['id']}/export")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/zip")

    def test_lista_revisoes_e_restaura_documento(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        created = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Documento Versionado",
                "content": "# V1",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        ).json()

        client.post(
            f"/api/documents/{created['id']}/update",
            json={
                "title": "Documento Versionado",
                "content": "# V2",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        )

        revisions = client.get(f"/api/documents/{created['id']}/revisions")
        assert revisions.status_code == 200
        payload = revisions.json()
        assert len(payload) >= 2

        oldest = payload[-1]
        restored = client.post(f"/api/documents/{created['id']}/restore/{oldest['id']}", json={})
        assert restored.status_code == 200
        assert restored.json()["content"] == "# V1"

    def test_gera_backlog_do_documento(self, tmp_path):
        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        created = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Documento de Backlog",
                "content": "# Escopo\n\nPrecisamos de autenticação e exportação.",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        ).json()

        with patch("server.ai_providers.generate", new_callable=AsyncMock, return_value='{"items":[{"title":"Implementar login","description":"Criar fluxo inicial","priority":"high","status":"todo"}]}'):
            response = client.post(
                f"/api/documents/{created['id']}/generate-backlog",
                json={"model": "gemini-3.1-flash-lite-preview", "provider": "gemini", "config": {}},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["items"][0]["title"] == "Implementar login"

    def test_sincroniza_documento_com_compilador(self, tmp_path):
        import projects as proj_module

        project = _create_document_project()
        history_id = _create_history_record(tmp_path)
        created = client.post(
            f"/api/document-projects/{project['id']}/documents",
            json={
                "project_id": project["id"],
                "title": "Plano de Conteúdo Shorts",
                "content": "# Plano\n\nResumo estratégico para shorts do canal.",
                "template_key": "produto",
                "provider": "gemini",
                "model": "gemini-3.1-flash-lite-preview",
                "prompt_observation": "",
                "source_history_ids": [history_id],
                "source_files": [{"name": "transcricao.txt", "history_id": history_id}],
            },
        ).json()
        compiler_project = proj_module.create_project("Canal YT", topic="Tema antigo")

        response = client.post(
            f"/api/documents/{created['id']}/sync-to-compiler",
            json={
                "compiler_project_id": compiler_project["id"],
                "use_document_title": True,
                "use_document_content_as_briefing": True,
                "use_existing_script_meta": True,
            },
        )
        assert response.status_code == 200
        compiler_payload = response.json()["compiler_project"]
        assert compiler_payload["topic"] == "Plano de Conteúdo Shorts"
        assert compiler_payload["config"]["linked_document_id"] == created["id"]


class TestAiDefaultsApi:

    def test_defaults_prioriza_gemini_do_env(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "abc", "GEMINI_MODEL": "gemini-test", "OPENAI_API_KEY": "", "OPENAI_MODEL": ""},
            clear=False,
        ):
            response = client.get("/api/ai/defaults")
        assert response.status_code == 200
        payload = response.json()
        assert payload["preferred_provider"] == "gemini"
        assert payload["preferred_model"] == "gemini-test"

    def test_defaults_cai_para_openai_quando_gemini_ausente(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "", "GEMINI_MODEL": "", "OPENAI_API_KEY": "sk-test", "OPENAI_MODEL": "gpt-test"},
            clear=False,
        ):
            response = client.get("/api/ai/defaults")
        assert response.status_code == 200
        payload = response.json()
        assert payload["preferred_provider"] == "openai"
        assert payload["preferred_model"] == "gpt-test"
