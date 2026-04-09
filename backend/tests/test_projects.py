"""Testes unitarios para projects.py — CRUD SQLite de projetos."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from projects import init_db, create_project, list_projects, get_project, update_project, delete_project
from projects import add_video, get_video, list_project_videos, update_video, remove_video


@pytest.fixture
def db(tmp_path):
    """Banco de dados temporario para cada teste."""
    path = str(tmp_path / "test_projects.db")
    init_db(path)
    return path


@pytest.fixture
def project(db):
    """Projeto de exemplo para reusar nos testes."""
    return create_project("Canal Cruzeiro", topic="Noticias do Cruzeiro", db_path=db)


@pytest.fixture
def video(db, project):
    """Video de exemplo vinculado ao projeto."""
    return add_video(project["id"], source_url="https://youtube.com/watch?v=abc", db_path=db)


# ── Projetos ──────────────────────────────────────────────────────────────────

class TestCreateProject:

    def test_retorna_dict_com_id(self, db):
        p = create_project("Test", db_path=db)
        assert isinstance(p["id"], str)
        assert len(p["id"]) == 36

    def test_status_inicial_draft(self, db):
        p = create_project("Test", db_path=db)
        assert p["status"] == "draft"

    def test_config_padrao_dict_vazio(self, db):
        p = create_project("Test", db_path=db)
        assert p["config"] == {}

    def test_topic_salvo(self, db):
        p = create_project("Test", topic="Futebol", db_path=db)
        assert p["topic"] == "Futebol"

    def test_config_customizado(self, db):
        p = create_project("Test", config={"fps": 30, "resolution": "1080p"}, db_path=db)
        assert p["config"]["fps"] == 30
        assert p["config"]["resolution"] == "1080p"

    def test_script_inicial_none(self, db):
        p = create_project("Test", db_path=db)
        assert p["script"] is None

    def test_created_at_e_updated_at_preenchidos(self, db):
        p = create_project("Test", db_path=db)
        assert p["created_at"]
        assert p["updated_at"]


class TestListProjects:

    def test_lista_vazia_no_banco_novo(self, db):
        assert list_projects(db) == []

    def test_retorna_projetos_criados(self, db):
        create_project("P1", db_path=db)
        create_project("P2", db_path=db)
        assert len(list_projects(db)) == 2

    def test_ordem_mais_recente_primeiro(self, db):
        import time
        create_project("Primeiro", db_path=db)
        time.sleep(0.01)
        create_project("Segundo", db_path=db)
        items = list_projects(db)
        assert items[0]["name"] == "Segundo"
        assert items[1]["name"] == "Primeiro"


class TestGetProject:

    def test_retorna_none_para_id_inexistente(self, db):
        assert get_project("id-que-nao-existe", db) is None

    def test_retorna_projeto_existente(self, db, project):
        p = get_project(project["id"], db)
        assert p is not None
        assert p["name"] == "Canal Cruzeiro"

    def test_config_deserializado_como_dict(self, db):
        p = create_project("Test", config={"key": "val"}, db_path=db)
        loaded = get_project(p["id"], db)
        assert isinstance(loaded["config"], dict)
        assert loaded["config"]["key"] == "val"


class TestUpdateProject:

    def test_atualiza_nome(self, db, project):
        updated = update_project(project["id"], db_path=db, name="Novo Nome")
        assert updated["name"] == "Novo Nome"

    def test_atualiza_status(self, db, project):
        updated = update_project(project["id"], db_path=db, status="transcribed")
        assert updated["status"] == "transcribed"

    def test_atualiza_config_como_dict(self, db, project):
        updated = update_project(project["id"], db_path=db, config={"fps": 60})
        assert updated["config"]["fps"] == 60

    def test_atualiza_script(self, db, project):
        script = {"title": "Resumao", "segments": []}
        updated = update_project(project["id"], db_path=db, script=script)
        assert updated["script"]["title"] == "Resumao"
        assert updated["script"]["segments"] == []

    def test_atualiza_output_path(self, db, project):
        updated = update_project(project["id"], db_path=db, output_path="/tmp/final.mp4")
        assert updated["output_path"] == "/tmp/final.mp4"

    def test_campo_nao_permitido_ignorado(self, db, project):
        # id nao pode ser atualizado
        result = update_project(project["id"], db_path=db, id="novo-id-fake")
        assert result["id"] == project["id"]

    def test_updated_at_muda(self, db, project):
        import time
        time.sleep(0.01)
        updated = update_project(project["id"], db_path=db, name="Outro")
        assert updated["updated_at"] > project["updated_at"]

    def test_id_inexistente_retorna_none(self, db):
        result = update_project("nao-existe", db_path=db, name="X")
        assert result is None


class TestDeleteProject:

    def test_remove_projeto(self, db, project):
        delete_project(project["id"], db)
        assert get_project(project["id"], db) is None

    def test_remove_videos_em_cascata(self, db, project):
        add_video(project["id"], source_url="http://x.com", db_path=db)
        delete_project(project["id"], db)
        assert list_project_videos(project["id"], db) == []

    def test_id_inexistente_nao_falha(self, db):
        delete_project("nao-existe", db)  # nao deve lancar excecao


# ── Videos ────────────────────────────────────────────────────────────────────

class TestAddVideo:

    def test_retorna_dict_com_id(self, db, project):
        v = add_video(project["id"], source_url="http://yt.com/a", db_path=db)
        assert isinstance(v["id"], str)
        assert len(v["id"]) == 36

    def test_source_url_salvo(self, db, project):
        v = add_video(project["id"], source_url="http://yt.com/a", db_path=db)
        assert v["source_url"] == "http://yt.com/a"

    def test_titulo_usa_source_url_quando_ausente(self, db, project):
        v = add_video(project["id"], source_url="http://yt.com/a", db_path=db)
        assert v["title"] == "http://yt.com/a"

    def test_titulo_customizado(self, db, project):
        v = add_video(project["id"], source_url="http://yt.com/a", title="Jogo Top", db_path=db)
        assert v["title"] == "Jogo Top"

    def test_status_inicial_pending(self, db, project):
        v = add_video(project["id"], source_url="http://yt.com/a", db_path=db)
        assert v["status"] == "pending"

    def test_transcription_inicial_none(self, db, project):
        v = add_video(project["id"], source_url="http://yt.com/a", db_path=db)
        assert v["transcription"] is None

    def test_order_idx_incrementado(self, db, project):
        v1 = add_video(project["id"], source_url="http://yt.com/1", db_path=db)
        v2 = add_video(project["id"], source_url="http://yt.com/2", db_path=db)
        assert v1["order_idx"] == 0
        assert v2["order_idx"] == 1


class TestListProjectVideos:

    def test_lista_vazia_sem_videos(self, db, project):
        assert list_project_videos(project["id"], db) == []

    def test_retorna_videos_do_projeto(self, db, project):
        add_video(project["id"], source_url="http://yt.com/1", db_path=db)
        add_video(project["id"], source_url="http://yt.com/2", db_path=db)
        assert len(list_project_videos(project["id"], db)) == 2

    def test_ordem_por_order_idx(self, db, project):
        add_video(project["id"], source_url="http://yt.com/1", db_path=db)
        add_video(project["id"], source_url="http://yt.com/2", db_path=db)
        videos = list_project_videos(project["id"], db)
        assert videos[0]["order_idx"] < videos[1]["order_idx"]

    def test_nao_retorna_videos_de_outro_projeto(self, db):
        p1 = create_project("P1", db_path=db)
        p2 = create_project("P2", db_path=db)
        add_video(p1["id"], source_url="http://yt.com/1", db_path=db)
        assert list_project_videos(p2["id"], db) == []


class TestUpdateVideo:

    def test_atualiza_status(self, db, video):
        updated = update_video(video["id"], db_path=db, status="downloading")
        assert updated["status"] == "downloading"

    def test_atualiza_local_path(self, db, video):
        updated = update_video(video["id"], db_path=db, local_path="/tmp/video.mp4")
        assert updated["local_path"] == "/tmp/video.mp4"

    def test_atualiza_duracao(self, db, video):
        updated = update_video(video["id"], db_path=db, duration=125.5)
        assert updated["duration"] == pytest.approx(125.5)

    def test_atualiza_transcription_como_lista(self, db, video):
        segs = [{"start": 0.0, "end": 5.0, "text": "Ola"}]
        updated = update_video(video["id"], db_path=db, transcription=segs)
        assert updated["transcription"] == segs

    def test_atualiza_error_msg(self, db, video):
        updated = update_video(video["id"], db_path=db, status="error", error_msg="Falhou")
        assert updated["error_msg"] == "Falhou"

    def test_id_inexistente_retorna_none(self, db):
        result = update_video("nao-existe", db_path=db, status="error")
        assert result is None


class TestRemoveVideo:

    def test_remove_video(self, db, project, video):
        remove_video(video["id"], db)
        assert get_video(video["id"], db) is None

    def test_remove_nao_afeta_outros_videos(self, db, project):
        v1 = add_video(project["id"], source_url="http://yt.com/1", db_path=db)
        v2 = add_video(project["id"], source_url="http://yt.com/2", db_path=db)
        remove_video(v1["id"], db)
        assert get_video(v2["id"], db) is not None

    def test_id_inexistente_nao_falha(self, db):
        remove_video("nao-existe", db)  # nao deve lancar excecao
