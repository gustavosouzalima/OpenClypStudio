"""Fixtures compartilhadas entre todos os testes."""

import inspect
import pytest
from dataclasses import dataclass

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import projects as _proj_module

_orig_db_path = _proj_module.DB_PATH


@pytest.fixture(scope="session", autouse=True)
def isolated_projects_db(tmp_path_factory):
    """Redireciona o banco de projetos para um diretório temporário durante os testes."""
    tmp_db = str(tmp_path_factory.mktemp("projects_db") / "projects.db")
    _proj_module.init_db(tmp_db)
    _proj_module.DB_PATH = tmp_db

    for _, fn in inspect.getmembers(_proj_module, inspect.isfunction):
        if fn.__defaults__:
            fn.__defaults__ = tuple(
                tmp_db if v == _orig_db_path else v for v in fn.__defaults__
            )

    yield

    _proj_module.DB_PATH = _orig_db_path
    for _, fn in inspect.getmembers(_proj_module, inspect.isfunction):
        if fn.__defaults__:
            fn.__defaults__ = tuple(
                _orig_db_path if v == tmp_db else v for v in fn.__defaults__
            )


@dataclass
class MockSegment:
    """Simula um segmento retornado pelo faster-whisper."""
    text: str
    start: float
    end: float


@pytest.fixture
def segments_simples():
    return [
        MockSegment("Olá, tudo bem?", 0.0, 2.5),
        MockSegment("Sim, obrigado.", 3.0, 5.0),
        MockSegment("Até logo.", 6.0, 7.5),
    ]


@pytest.fixture
def segments_com_vazio():
    return [
        MockSegment("Primeiro segmento.", 0.0, 2.0),
        MockSegment("   ", 2.5, 3.0),          # só espaços — deve ser ignorado
        MockSegment("", 3.5, 4.0),             # vazio — deve ser ignorado
        MockSegment("Último segmento.", 4.5, 6.0),
    ]


@pytest.fixture
def speaker_map_dois():
    """Mapa: segmento 0 e 2 = speaker 0, segmento 1 = speaker 1."""
    return {0: 0, 1: 1, 2: 0}
