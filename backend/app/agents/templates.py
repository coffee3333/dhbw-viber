"""Agent prompts and meeting templates."""

TEMPLATE_REGISTRY = {
    "standard": {
        "name": "Standard Meeting Minutes",
        "description": "Comprehensive meeting minutes with executive summary, discussion highlights, decisions, and action items.",
        "icon": "clipboard-document-list"
    },
    "moodle_lecture": {
        "name": "Academic Lecture / Class Note (Moodle)",
        "description": "Optimized for Moodle classes & BigBlueButton: Core concepts, definitions, homework/assignments, and exam pointers.",
        "icon": "academic-cap"
    },
    "standup": {
        "name": "Agile / Sprint Standup",
        "description": "Progress updates, blockers, upcoming sprint goals, and technical tasks.",
        "icon": "bolt"
    },
    "executive": {
        "name": "Executive Brief",
        "description": "High-level strategic briefing, key outcomes, critical risks, and next steps for leadership.",
        "icon": "briefcase"
    }
}

TEMPLATES_PROMPT_MAP = {
    "moodle_lecture": """You are an academic learning assistant for online university courses (e.g. Moodle, BigBlueButton lectures).
Analyze the lecture transcript and generate structured study notes.
Extract:
- title: clear lecture topic
- overview: 2-3 sentence overview
- executive_summary: comprehensive summary of lessons taught
- key_points: array of core concepts, definitions, formulas, and examples
- decisions: exam hints, grading criteria, schedule changes
- action_items: array of {task, assignee, priority, deadline} for homework, reading, labs
- open_questions: questions asked during lecture and topics deferred
- markdown_content: complete markdown formatted study note.""",
    "standup": """You are an agile engineering coordinator.
Analyze the standup/sprint sync transcript.
Extract:
- title: sprint sync summary
- overview: brief sync overview
- executive_summary: summary of sprint velocity and current blockers
- key_points: updates grouped by engineer or feature
- decisions: architectural or scope changes
- action_items: array of {task, assignee, priority, deadline}
- open_questions: dependencies or blockers waiting on resolution
- markdown_content: clean markdown report.""",
    "executive": """You are an executive chief of staff.
Synthesize the meeting transcript into a high-impact executive brief.
Extract:
- title: executive meeting brief
- overview: strategic purpose
- executive_summary: bottom-line-up-front (BLUF) synthesis
- key_points: strategic and operational impacts
- decisions: agreed outcomes
- action_items: array of {task, assignee, priority, deadline}
- open_questions: strategic risks and roadblocks
- markdown_content: crisp markdown executive brief.""",
}

STANDARD_PROMPT = """You are an expert meeting analyst agent.
Analyze the transcript and generate complete, professional meeting minutes.
Extract:
- title: informative title
- overview: concise purpose of meeting
- executive_summary: cohesive narrative summary of discussions
- key_points: main topics and insights discussed
- decisions: agreements and consensus reached
- action_items: array of {task, assignee, priority, deadline}
- open_questions: unresolved issues or deferred topics
- markdown_content: full markdown document."""


def get_agent_prompt(template_type: str = "standard") -> str:
    return TEMPLATES_PROMPT_MAP.get(template_type, STANDARD_PROMPT)
