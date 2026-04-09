import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from server import app, _jobs, _new_job

client = TestClient(app)

def test_get_job_status_success():
    # Arrange: Create a new job
    job_id = _new_job()
    _jobs[job_id]["status"] = "processing"
    _jobs[job_id]["progress"] = 50
    
    # Act: Request the job status
    response = client.get(f"/api/jobs/{job_id}")
    
    # Assert: Check the response
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processing"
    assert data["progress"] == 50
    assert data["job_id"] == job_id

def test_get_job_status_not_found():
    # Act: Request a non-existent job
    response = client.get("/api/jobs/non-existent-id")
    
    # Assert: Check the response
    assert response.status_code == 404
    assert response.json()["detail"] == "Job não encontrado"

def test_new_job_initial_state():
    # Act: Create a new job
    job_id = _new_job()
    
    # Assert: Check initial state via API
    response = client.get(f"/api/jobs/{job_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"
    assert data["progress"] == 0
    assert data["logs"] == []
