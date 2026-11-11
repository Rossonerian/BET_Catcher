"""Central constants. Demo-calibrated values are labelled; see docs/DECISIONS.md (DEC-005)."""
from __future__ import annotations

import os
from datetime import date

SEED = 20261110
AS_OF = date(2026, 11, 10)          # last day of synthetic history
HISTORY_DAYS = 120                   # day index 0..119, 119 == AS_OF
RECENT_DAYS = 28                     # recent window = last 28 days
RECENT_START = HISTORY_DAYS - RECENT_DAYS  # day index 92

DB_PATH = os.environ.get("VERITY_DB", os.path.join(os.path.dirname(__file__), "..", "verity.db"))

# Lifecycle (FR-011)
MIN_BASELINE_DAYS = 14               # below this the behaviour engine does not emit signals
FULL_CONFIDENCE_BASELINE_DAYS = 60
LIFECYCLE_ONBOARDING_DAYS = 30
LIFECYCLE_ESTABLISHED_DAYS = 90

# Peer engine (FR-004)
MIN_COHORT_SIZE = 5

# Behaviour thresholds (demo-calibrated)
Z_THRESHOLD = 3.0
HIGH_VALUE_MULTIPLIER = 3.0          # "high value" = amount > 3 x declared ticket max
REPEATED_AMOUNT_MIN = 2000.0         # repeated-amount feature only looks at amounts >= this
REPEATED_AMOUNT_COUNT = 3            # same exact amount >= 3 times in a day
REPEAT_CUSTOMER_LOOKBACK_DAYS = 28

# Response engine (FR-009)
SEVERITY_POINTS = {"high": 25.0, "medium": 15.0, "low": 8.0}
NETWORK_LEAD_POINTS = 10.0
RESOLUTION_FACTOR = {"UNRESOLVED": 1.0, "PARTIALLY_EXPLAINED": 0.5, "EXPLAINED": 0.0}
TIERS = [  # (min score, tier)
    (80.0, "ESCALATE_INVESTIGATION"),
    (60.0, "ANALYST_REVIEW"),
    (40.0, "REQUEST_CLARIFICATION"),
    (20.0, "ENHANCED_MONITORING"),
    (0.0, "PASSIVE_MONITORING"),
]
TIER_ORDER = [t for _, t in reversed(TIERS)]
LOW_CONFIDENCE = 0.5
LOW_CONFIDENCE_TIER_CAP = "REQUEST_CLARIFICATION"

DISCLAIMER = (
    "VERITY prioritises human review; it does not determine wrongdoing. "
    "All data is synthetic. Network links and anomalies are leads, not findings."
)
