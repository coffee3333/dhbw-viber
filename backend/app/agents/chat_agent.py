from app.agents.base import BaseAgent


class ChatAgent(BaseAgent):
    """Agent for interactive Q&A grounded in the meeting transcript."""

    def ask(self, transcript: str, question: str) -> str:
        system_prompt = """You are an intelligent meeting assistant.
Answer the user's question directly, clearly, and concisely based strictly on the provided meeting transcript.
If something was not discussed, clearly state that it was not mentioned.
Always cite speaker names or approximate timestamps when available."""

        user_prompt = f"""Meeting Transcript:
--------------------
{transcript}
--------------------

User Question: {question}"""

        return self.call_llm(system_prompt, user_prompt, json_mode=False)
