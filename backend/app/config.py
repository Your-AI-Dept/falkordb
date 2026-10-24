"""All constants (design doc section 9) plus runtime settings.

Model constants are starting guesses, tuned during the build.
Runtime settings come from environment variables (or backend/.env).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    falkordb_host: str = "localhost"
    falkordb_port: int = 6379
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()

# Graph names (design doc 2)
CONTENT_GRAPH = "content"
PEOPLE_GRAPH = "people"
MATCH_GRAPH = "match_scratch"

# Topics
T = 10

# 3.1 Interest
A0, B0 = 1.0, 2.0
S_SIGNUP, S_RESUME, S_PASS = 1.0, 0.5, 0.25
S_DISCUSS, S_LEARNER = 0.5, 0.5

# 3.2 Tie belief: (c_pos, c_neu, c_neg)
PRIOR_LINKEDIN = (0.5, 1.5, 0.05)
PRIOR_ADHOC = (1.0, 1.0, 0.05)
PRIOR_SPEED = (1.0, 1.0, 1.0)
DECAY_PER_ROUND = 1.0  # 1.0 = off

# 3.3 Competence
GAMMA = 1.0
W0 = 2.0
SPEAKER_PRIOR = 0.8

# 3.5 Rater reliability: (rel_a, rel_b)
REL_PRIOR = (2, 1)

# 3.6, 4.2
POS_THRESH = 0.4
NEG_THRESH = 0.4

# 4.1 Adaptive questions
Q_MIN_TOPIC, Q_MAX_TOPIC = 2, 6
ATTENTION_COST = 0.02
W_BASE = 1.0

# 4.2 Pairing
BETA, MU, LAMBDA = 0.2, 0.3, 0.3
DELTA = 0.2

# 4.3 Micro-influencers
TARGET_MIN, CRED_MIN = 0.4, 0.55
COST_BASE, COST_PROMINENCE = 1.0, 4.0
BACKFIRE_MAX = 0.5

# 13 Open decisions
VENDOR_SEES_NAMES = False
