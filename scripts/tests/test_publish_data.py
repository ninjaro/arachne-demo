from __future__ import annotations

import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from publish_data import PublishError, publish  # noqa: E402


SCHEMA = "fae7c3899a19a645cfcc85bef764fafa758f37a5d014108d62025e2d3e3d6ecc"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture_database(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE agents(entity_id TEXT PRIMARY KEY, agent_type TEXT);
        CREATE TABLE agent_relations(id INTEGER PRIMARY KEY, subject_agent_id TEXT);
        CREATE TABLE concepts(entity_id TEXT PRIMARY KEY, concept_type TEXT, slug TEXT);
        CREATE TABLE credits(id INTEGER PRIMARY KEY, entity_id TEXT);
        CREATE TABLE events(id INTEGER PRIMARY KEY, entity_id TEXT);
        CREATE TABLE external_ids(id INTEGER PRIMARY KEY, entity_id TEXT);
        CREATE TABLE financial_facts(id INTEGER PRIMARY KEY, work_id TEXT);
        CREATE TABLE manifestations(entity_id TEXT PRIMARY KEY, work_id TEXT);
        CREATE TABLE measurements(id INTEGER PRIMARY KEY, entity_id TEXT);
        CREATE TABLE names(id INTEGER PRIMARY KEY, entity_id TEXT, is_preferred INTEGER);
        CREATE TABLE parent_guide_assertions(id INTEGER PRIMARY KEY, work_id TEXT);
        CREATE TABLE work_concepts(id INTEGER PRIMARY KEY, work_id TEXT);
        CREATE TABLE work_memberships(id INTEGER PRIMARY KEY, child_work_id TEXT);
        CREATE TABLE works(entity_id TEXT PRIMARY KEY, medium TEXT);
        INSERT INTO agents VALUES('agent-000001', 'person');
        INSERT INTO names VALUES(1, 'agent-000001', 1);
        INSERT INTO works VALUES('work-000001', 'film');
        """
    )
    connection.close()


def git(root: Path, *arguments: str) -> str:
    process = subprocess.run(
        ["git", "-C", str(root), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )
    return process.stdout.strip()


def commit_state(root: Path, message: str = "fixture state") -> str:
    git(root, "add", "state-manifest.json", "database/art-islands.sqlite")
    git(
        root,
        "-c", "user.name=Arachne Demo Tests",
        "-c", "user.email=demo-tests@example.invalid",
        "commit", "-q", "-m", message,
    )
    return git(root, "rev-parse", "HEAD")


def fixture_state(root: Path) -> tuple[Path, str]:
    database = root / "database" / "art-islands.sqlite"
    database.parent.mkdir(parents=True)
    fixture_database(database)
    (root / "state-manifest.json").write_text(
        json.dumps(
            {
                "format": "arachne_state_manifest",
                "format_version": 1,
                "product": {
                    "path": "database/art-islands.sqlite",
                    "sha256": sha256(database),
                },
                "schema": {"path": "schema/product.sql", "sha256": SCHEMA},
                "producer": {"repository": "ninjaro/arachne", "commit": "3" * 40},
            }
        ),
        encoding="utf-8",
    )
    subprocess.run(
        ["git", "init", "-q", str(root)],
        check=True,
        capture_output=True,
        text=True,
    )
    return database, commit_state(root)


class PublishDataTests(unittest.TestCase):
    def test_publishes_content_addressed_database_and_generic_shards(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            database, commit = fixture_state(root)
            output = Path(temporary) / "public" / "data"
            active = publish(root, output, commit)

            product_hash = sha256(database)
            self.assertEqual(active["productSha256"], product_hash)
            self.assertEqual(active["sourceDataCommit"], commit)
            self.assertEqual(active["productSnapshotId"], f"local-{product_hash[:16]}")
            self.assertEqual(
                active["database"]["file"], f"product-{product_hash}.sqlite"
            )
            self.assertEqual(
                sha256(output / active["database"]["file"]), product_hash
            )
            self.assertFalse((output / ("catalog" + ".json")).exists())
            fallback = json.loads(
                (output / active["fallback"]["file"]).read_text(encoding="utf-8")
            )
            self.assertRegex(
                active["fallback"]["file"],
                rf"^fallback/product-{product_hash}/manifest-[0-9a-f]{{64}}\.json$",
            )
            self.assertEqual(fallback["schemaIdentity"], SCHEMA)
            self.assertEqual(fallback["tables"]["works"]["rows"], 1)
            self.assertTrue(
                fallback["tables"]["works"]["chunks"][0]["file"].startswith(
                    f"fallback/product-{product_hash}/tables/works/"
                )
            )
            self.assertEqual(active["derived"], {})

    def test_hash_mismatch_fails_before_replacing_existing_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            _, commit = fixture_state(root)
            manifest_path = root / "state-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["product"]["sha256"] = "f" * 64
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            output = Path(temporary) / "public" / "data"
            output.mkdir(parents=True)
            marker = output / "active.json"
            marker.write_text("previous\n", encoding="utf-8")

            with self.assertRaisesRegex(PublishError, "do not match"):
                publish(root, output, commit)
            self.assertEqual(marker.read_text(encoding="utf-8"), "previous\n")

    def test_rejects_output_inside_authoritative_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            _, commit = fixture_state(root)
            with self.assertRaisesRegex(PublishError, "inside"):
                publish(root, root / "published", commit)

    def test_rejects_mismatched_optional_native_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            _, commit = fixture_state(root)
            derived = root / "derived"
            derived.mkdir()
            (derived / "research.json").write_text(
                json.dumps(
                    {
                        "product_snapshot": {
                            "snapshot_id": "local-mismatch",
                            "sha256": "e" * 64,
                        }
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(PublishError, "different product"):
                publish(
                    root,
                    Path(temporary) / "public" / "data",
                    commit,
                    research=derived / "research.json",
                )

    def test_publishes_only_explicit_matching_native_projections(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            database, commit = fixture_state(root)
            product_hash = sha256(database)
            snapshot_id = f"local-{product_hash[:16]}"
            research = Path(temporary) / "research.json"
            taste = Path(temporary) / "taste.json"
            research.write_text(
                json.dumps(
                    {
                        "product_snapshot": {
                            "snapshot_id": snapshot_id,
                            "sha256": product_hash,
                        }
                    }
                ),
                encoding="utf-8",
            )
            taste.write_text(
                json.dumps(
                    {
                        "product_snapshot": {
                            "snapshot_id": snapshot_id,
                            "content_sha256": product_hash,
                        }
                    }
                ),
                encoding="utf-8",
            )
            output = Path(temporary) / "public" / "data"
            active = publish(
                root,
                output,
                commit,
                research=research,
                taste=taste,
            )
            self.assertRegex(
                active["derived"]["research"],
                r"^derived/research-[0-9a-f]{64}\.json$",
            )
            self.assertRegex(
                active["derived"]["taste"],
                r"^derived/taste-index-[0-9a-f]{64}\.json$",
            )
            self.assertTrue((output / active["derived"]["research"]).is_file())
            self.assertTrue((output / active["derived"]["taste"]).is_file())

    def test_rejects_unsupported_schema_before_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            _, commit = fixture_state(root)
            manifest_path = root / "state-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["schema"]["sha256"] = "f" * 64
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(PublishError, "unsupported"):
                publish(root, Path(temporary) / "public" / "data", commit)

    def test_rejects_open_or_dirty_state_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            _, commit = fixture_state(root)
            manifest_path = root / "state-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            with self.assertRaisesRegex(PublishError, "not clean"):
                publish(root, Path(temporary) / "public" / "data", commit)

            manifest["unexpected"] = True
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(PublishError, "not closed"):
                publish(root, Path(temporary) / "public-2" / "data", commit)

    def test_rejects_a_supplied_commit_other_than_checkout_head(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            fixture_state(root)
            with self.assertRaisesRegex(PublishError, "checkout HEAD"):
                publish(root, Path(temporary) / "public" / "data", "1" * 40)

    def test_successive_publications_never_reuse_fallback_urls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "data"
            root.mkdir()
            database, first_commit = fixture_state(root)
            output = Path(temporary) / "public" / "data"
            first_hash = sha256(database)
            first_research = Path(temporary) / "first-research.json"
            first_research.write_text(
                json.dumps(
                    {
                        "product_snapshot": {
                            "snapshot_id": f"local-{first_hash[:16]}",
                            "sha256": first_hash,
                        }
                    }
                ),
                encoding="utf-8",
            )
            first = publish(root, output, first_commit, research=first_research)
            first_fallback = json.loads(
                (output / first["fallback"]["file"]).read_text(encoding="utf-8")
            )
            first_chunks = {
                chunk["file"]
                for table in first_fallback["tables"].values()
                for chunk in table["chunks"]
            }

            connection = sqlite3.connect(database)
            connection.execute("INSERT INTO works VALUES('work-000002', 'novel')")
            connection.commit()
            connection.close()
            manifest_path = root / "state-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["product"]["sha256"] = sha256(database)
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            second_commit = commit_state(root, "second fixture state")

            second_hash = sha256(database)
            second_research = Path(temporary) / "second-research.json"
            second_research.write_text(
                json.dumps(
                    {
                        "product_snapshot": {
                            "snapshot_id": f"local-{second_hash[:16]}",
                            "sha256": second_hash,
                        }
                    }
                ),
                encoding="utf-8",
            )
            second = publish(root, output, second_commit, research=second_research)
            second_fallback = json.loads(
                (output / second["fallback"]["file"]).read_text(encoding="utf-8")
            )
            second_chunks = {
                chunk["file"]
                for table in second_fallback["tables"].values()
                for chunk in table["chunks"]
            }
            self.assertNotEqual(first["productSha256"], second["productSha256"])
            self.assertNotEqual(first["fallback"]["file"], second["fallback"]["file"])
            self.assertTrue(first_chunks.isdisjoint(second_chunks))
            self.assertNotEqual(first["derived"]["research"], second["derived"]["research"])


if __name__ == "__main__":
    unittest.main()
