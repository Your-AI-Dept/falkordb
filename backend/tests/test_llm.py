"""Claude phrasing: validation and template fallback (no network)."""

from app.services import llm

JOB = llm.PhraseJob(
    rater={"name": "Ana Ruiz", "company": "Ruiz Pizza", "title": "Owner", "business_type": "Independent pizzeria"},
    partner={"name": "Sam Lee", "company": "Mill Co", "title": "Rep", "business_type": "Supplier"},
    claims=[
        {"question_id": "t0a", "claim": "partner_taught", "topic_name": "Dough & Flour", "topic_description": "Flour specs"},
        {"question_id": "t0b", "claim": "self_taught", "topic_name": "Dough & Flour", "topic_description": "Flour specs"},
    ],
)


def _out(*pairs):
    return llm.Phrasing(questions=[llm.PhrasedQuestion(question_id=q, text=t) for q, t in pairs])


def test_valid_output_is_normalized():
    got = llm._validate(JOB, _out(("t0a", " Sam  showed me\na flour tip. "), ("t0b", "I shared my dough schedule with Sam.")))
    assert got == {"t0a": "Sam showed me a flour tip.", "t0b": "I shared my dough schedule with Sam."}


def test_mismatched_ids_fall_back():
    assert llm._validate(JOB, _out(("t0a", "ok"))) is None
    assert llm._validate(JOB, _out(("t0a", "ok"), ("t0b", "ok"), ("t9", "extra"))) is None


def test_empty_or_long_text_falls_back():
    assert llm._validate(JOB, _out(("t0a", "  "), ("t0b", "ok"))) is None
    assert llm._validate(JOB, _out(("t0a", "x" * 500), ("t0b", "ok"))) is None


def test_no_api_key_means_templates(monkeypatch):
    monkeypatch.setattr(llm, "enabled", lambda: False)
    assert llm.phrase_batch([JOB, JOB]) == [None, None]


def test_prompt_names_claims_and_people():
    p = llm._prompt(JOB)
    assert "question_id=t0a claim=partner_taught" in p and "Sam Lee" in p and "Dough & Flour" in p
