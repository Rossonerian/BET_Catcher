import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture()
def conn(tmp_path):
    from verity import db, seed
    from verity.engines import pipeline

    c = db.connect(str(tmp_path / "test.db"))
    seed.reset(c)
    pipeline.invalidate()
    yield c
    pipeline.invalidate()
    c.close()
