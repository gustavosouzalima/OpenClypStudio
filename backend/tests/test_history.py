"""Testes para history.py — histórico SQLite."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from history import init_db, save, list_all, get, delete, delete_many


@pytest.fixture
def db(tmp_path):
    """Banco de dados temporário para cada teste."""
    path = str(tmp_path / "test_history.db")
    init_db(path)
    return path


@pytest.fixture
def sample_txt(tmp_path):
    f = tmp_path / "reuniao.txt"
    f.write_text("Transcrição de teste da reunião.", encoding="utf-8")
    return str(f)


class TestHistory:

    def test_lista_vazia_no_banco_novo(self, db):
        assert list_all(db) == []

    def test_save_retorna_id(self, db, sample_txt):
        record_id = save(sample_txt, db)
        assert isinstance(record_id, str)
        assert len(record_id) == 36  # UUID v4

    def test_save_e_list(self, db, sample_txt):
        save(sample_txt, db)
        items = list_all(db)
        assert len(items) == 1
        assert items[0]["filename"] == "reuniao.txt"

    def test_get_por_id(self, db, sample_txt):
        record_id = save(sample_txt, db)
        item = get(record_id, db)
        assert item is not None
        assert item["filename"] == "reuniao.txt"
        assert "Transcrição de teste" in item["content"]

    def test_get_id_inexistente_retorna_none(self, db):
        assert get("id-que-nao-existe", db) is None

    def test_delete_remove_do_banco(self, db, sample_txt):
        record_id = save(sample_txt, db)
        assert len(list_all(db)) == 1
        delete(record_id, db)
        assert list_all(db) == []

    def test_delete_id_inexistente_nao_falha(self, db):
        delete("id-fantasma", db)  # não deve lançar exceção

    def test_delete_many_remove_multiplos_registros(self, db, tmp_path):
        f1 = tmp_path / "um.txt"
        f1.write_text("um")
        f2 = tmp_path / "dois.txt"
        f2.write_text("dois")

        id1 = save(str(f1), db)
        id2 = save(str(f2), db)

        removed = delete_many([id1, id2], db)
        assert removed == 2
        assert list_all(db) == []

    def test_ordem_mais_recente_primeiro(self, db, tmp_path):
        f1 = tmp_path / "primeiro.txt"
        f1.write_text("primeiro")
        f2 = tmp_path / "segundo.txt"
        f2.write_text("segundo")

        import time
        save(str(f1), db)
        time.sleep(0.01)
        save(str(f2), db)

        items = list_all(db)
        assert items[0]["filename"] == "segundo.txt"
        assert items[1]["filename"] == "primeiro.txt"

    def test_arquivo_inexistente_content_vazio(self, db):
        record_id = save("/caminho/que/nao/existe.txt", db)
        item = get(record_id, db)
        assert item["content"] == ""

    def test_size_bytes_registrado(self, db, sample_txt):
        save(sample_txt, db)
        item = list_all(db)[0]
        assert item["size_bytes"] > 0
