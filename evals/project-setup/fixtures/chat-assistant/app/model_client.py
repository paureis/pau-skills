import os

import httpx


def ask_model(question: str) -> str:
    """Send one question to the private model endpoint and return the answer text."""
    endpoint = os.environ["MODEL_ENDPOINT"]
    key = os.environ["MODEL_API_KEY"]
    response = httpx.post(
        f"{endpoint}/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"messages": [{"role": "user", "content": question}]},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]
