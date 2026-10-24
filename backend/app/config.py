"""All constants (design doc section 9) plus runtime settings.

Model constants are starting guesses, tuned during the build.
Runtime settings come from environment variables (or backend/.env).
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    falkordb_host: str = "localhost"
    falkordb_port: int = 6379
    cors_origins: list[str] = ["http://localhost:5173"]
    data_dir: Path = Path(__file__).resolve().parents[2] / "data"
    anthropic_api_key: str | None = None


settings = Settings()

# Graph names (design doc 2)
CONTENT_GRAPH = "content"
PEOPLE_GRAPH = "people"
MATCH_GRAPH = "match_scratch"

# Topics; vector index order is the order of data/program/topics.json
T = 10

# Event format (0, 8.1)
N_SESSIONS, SESSIONS_PER_DAY = 15, 5
DATES_PER_SESSION, DATE_MINUTES = 4, 15
SESSION_SIZE = 200
RNG_SEED = 42

# 3.1 Interest
A0, B0 = 1.0, 2.0
S_REG, S_SIGNUP, S_SCAN = 1.0, 1.0, 0.25
S_DISCUSS, S_LEARNER = 0.5, 0.5

# 3.2 Tie belief: (c_pos, c_neu, c_neg)
PRIOR_LINKEDIN = (0.5, 1.5, 0.05)
PRIOR_ADHOC = (1.0, 1.0, 0.05)
PRIOR_SPEED = (1.0, 1.0, 1.0)

# 3.3 Competence
GAMMA = 1.0
W0 = 2.0
SPEAKER_PRIOR, EXHIBITOR_PRIOR = 0.8, 0.7
SENIORITY_BOOST = 0.2
RANK_UNC_PENALTY = 0.3  # expert ranking: comp - penalty * comp_unc, so peer-confirmed beats unconfirmed priors

# 3.5 Rater reliability: (rel_a, rel_b)
REL_PRIOR = (2, 1)

# 3.6 Likability: (like_a, like_b)
LIKE_PRIOR = (1, 1)

# 3.8, 4.2
POS_THRESH = 0.4
NEG_THRESH = 0.4

# 3.10 Ad-hoc check-ins
ADHOC_PER_TICK = 100

# 4.1 Agentic questions
Q_MIN_TOPICS, Q_MAX_TOPICS = 2, 3
ATTENTION_COST = 0.02
W_BASE = 1.0
LLM_MODEL = "claude-opus-5-5"
LLM_MODE = "humans"  # who gets Claude-phrased questions: "humans" | "all" | "off" (others get templates)
LLM_TIMEOUT_S = 20

# 4.2 Pairing
ENJOY, BETA, MU, LAMBDA = 0.5, 0.2, 0.3, 0.3
DELTA = 0.2

# 4.3 Micro-influencers
TARGET_MIN, CRED_MIN, LIKE_MIN = 0.4, 0.55, 0.5
N_INFLUENCERS = 5
BACKFIRE_MAX = 0.5

# 13 Open decisions
VENDOR_SEES_NAMES = False
