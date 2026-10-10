import json
import re


class BaseAgent:
    """Base class for agentic AI components."""

    def __init__(self, engine: str = "gemini", api_key: str | None = None, model: str = "gemini-flash-lite-latest"):
        self.engine = engine
        self.api_key = api_key
        self.model = model

    def clean_json(self, text: str) -> str:
        """Strip markdown code fence blocks to obtain clean JSON string."""
        if not text:
            return ""
        text = text.strip()

        # If it's already valid JSON, don't touch it
        try:
            json.loads(text)
            return text
        except Exception:
            pass

        # If enclosed in outer markdown code fence (```json ... ``` or ``` ... ```)
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            candidate = "\n".join(lines).strip()
            try:
                json.loads(candidate)
                return candidate
            except Exception:
                pass

        # Try extracting the outermost JSON object between first { and last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = text[start : end + 1]
            try:
                json.loads(candidate)
                return candidate
            except Exception:
                pass

        # Fallback to multiline regex only if candidate matches whole string
        match = re.search(r"^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$", text)
        if match:
            return match.group(1).strip()

        return text

    def call_llm(self, system_prompt: str, user_prompt: str, json_mode: bool = True) -> str:
        """Execute LLM call across supported engines (Gemini or OpenAI)."""
        if self.engine == "gemini":
            if not self.api_key:
                raise ValueError("Gemini API key is required.")
            from google import genai
            from google.genai import types
            from app.core.ai_credentials import normalize_gemini_model

            client = genai.Client(api_key=self.api_key)
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json" if json_mode else None
            )
            response = client.models.generate_content(
                model=normalize_gemini_model(self.model),
                contents=user_prompt,
                config=config
            )
            return response.text or ""

        elif self.engine == "openai":
            if not self.api_key:
                raise ValueError("OpenAI API key is required.")
            from openai import OpenAI

            client = OpenAI(api_key=self.api_key)
            kwargs = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""

        else:
            raise ValueError(f"Unsupported engine: {self.engine}")
