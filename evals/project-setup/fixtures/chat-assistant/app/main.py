from fastapi import FastAPI
from pydantic import BaseModel

from app.model_client import ask_model

app = FastAPI()


class Question(BaseModel):
    text: str


@app.post("/chat")
def chat(question: Question) -> dict:
    # TODO: the agent logic (tools, document search, conversation memory) goes here.
    return {"answer": ask_model(question.text)}
