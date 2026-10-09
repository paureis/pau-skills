from fastapi.testclient import TestClient

import app.main as main


def test_chat_returns_model_answer(monkeypatch):
    monkeypatch.setattr(main, "ask_model", lambda text: "stub answer")
    client = TestClient(main.app)
    response = client.post("/chat", json={"text": "hello"})
    assert response.status_code == 200
    assert response.json() == {"answer": "stub answer"}
