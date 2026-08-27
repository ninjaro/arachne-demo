#!/usr/bin/env python3
"""Publish a pinned Arachne read model without duplicating domain semantics.

The canonical SQLite file is copied under its content hash.  Generic table
rows are also split into small JSON shards so hosts without reliable HTTP
Range support have a deterministic fallback.  Research, taste, and image-hint
artifacts are copied only when explicitly supplied as matching transient native
projections; this script never derives them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable


SHA256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
STATE_FORMAT = "arachne_state_manifest"
ACTIVE_FORMAT = "arachne_demo_active_v1"
PRODUCT_PATH = "database/art-islands.sqlite"
SCHEMA_PATH = "schema/product.sql"
PRODUCER_REPOSITORY = "ninjaro/arachne"
MAX_ROWS_PER_SHARD = 1_000
MAX_BYTES_PER_SHARD = 512 * 1024

# These are presentation inputs only.  Their columns and grouping keys are the
# current read contract consumed by src/data; no research or graph values are
# calculated here.
TABLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "agents": ("entity_id", ("entity_id",)),
    "agent_relations": ("subject_agent_id", ("subject_agent_id", "id")),
    "concepts": ("entity_id", ("entity_id",)),
    "credits": ("entity_id", ("entity_id", "id")),
    "events": ("entity_id", ("entity_id", "id")),
    "external_ids": ("entity_id", ("entity_id", "id")),
    "financial_facts": ("work_id", ("work_id", "id")),
    "manifestations": ("work_id", ("work_id", "entity_id")),
    "measurements": ("entity_id", ("entity_id", "id")),
    "names": ("entity_id", ("entity_id", "is_preferred", "id")),
    "parent_guide_assertions": ("work_id", ("work_id", "id")),
    "work_concepts": ("work_id", ("work_id", "id")),
    "work_memberships": ("child_work_id", ("child_work_id", "id")),
    "works": ("entity_id", ("entity_id",)),
}
OPTIONAL_TABLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "remote_assets": ("entity_id", ("entity_id", "id")),
    "work_relations": ("subject_work_id", ("subject_work_id", "rowid")),
}


class PublishError(RuntimeError):
    pass


def read_json(path: Path, description: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as cause:
        raise PublishError(f"cannot read {description}: {cause}") from cause
    if not isinstance(value, dict):
        raise PublishError(f"{description} must be a JSON object")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        stream.write("\n")


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def confined_file(root: Path, relative: Any, description: str) -> Path:
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise PublishError(f"{description} must be a non-empty relative path")
    candidate = root / relative
    if candidate.is_symlink():
        raise PublishError(f"{description} must not be a symbolic link")
    try:
        path = candidate.resolve(strict=True)
        path.relative_to(root)
    except (OSError, ValueError) as cause:
        raise PublishError(f"{description} escapes or is absent from the data root") from cause
    if not path.is_file():
        raise PublishError(f"{description} must identify a regular file")
    return path


def state_identity(root: Path) -> tuple[dict[str, Any], Path, str, str]:
    manifest_path = root / "state-manifest.json"
    if manifest_path.is_symlink():
        raise PublishError("state manifest must not be a symbolic link")
    manifest = read_json(manifest_path, "state manifest")
    if set(manifest) != {"format", "format_version", "product", "schema", "producer"}:
        raise PublishError("state manifest root is not closed")
    if manifest.get("format") != STATE_FORMAT or manifest.get("format_version") != 1:
        raise PublishError("unsupported state manifest")
    product = manifest.get("product")
    schema = manifest.get("schema")
    producer = manifest.get("producer")
    if (
        not isinstance(product, dict)
        or set(product) != {"path", "sha256"}
        or product.get("path") != PRODUCT_PATH
        or not isinstance(schema, dict)
        or set(schema) != {"path", "sha256"}
        or schema.get("path") != SCHEMA_PATH
        or not isinstance(producer, dict)
        or set(producer) != {"repository", "commit"}
        or producer.get("repository") != PRODUCER_REPOSITORY
        or not isinstance(producer.get("commit"), str)
        or not COMMIT.fullmatch(producer["commit"])
    ):
        raise PublishError("state manifest controls are not closed or canonical")
    expected_hash = product.get("sha256")
    schema_hash = schema.get("sha256")
    if not isinstance(expected_hash, str) or not SHA256.fullmatch(expected_hash):
        raise PublishError("state manifest product.sha256 is invalid")
    if not isinstance(schema_hash, str) or not SHA256.fullmatch(schema_hash):
        raise PublishError("state manifest schema.sha256 is invalid")
    database = confined_file(root, product.get("path"), "product.path")
    for suffix in ("-journal", "-wal"):
        if Path(f"{database}{suffix}").exists():
            raise PublishError(f"canonical database has an unstable {suffix} sidecar")
    actual_hash = digest(database)
    if actual_hash != expected_hash:
        raise PublishError("canonical database bytes do not match state-manifest.json")
    return manifest, database, actual_hash, schema_hash


def adapter_compatibility(schema_hash: str) -> str:
    path = Path(__file__).resolve().parents[1] / "src" / "data" / "adapter-contract.json"
    contract = read_json(path, "demo adapter contract")
    identities = contract.get("supportedSchemaIdentities")
    adapter = contract.get("adapterContract")
    if (
        contract.get("format") != "arachne_demo_adapter_contract_v1"
        or adapter != "arachne_product_sqlite_v1"
        or not isinstance(identities, list)
        or not identities
        or any(not isinstance(value, str) or not SHA256.fullmatch(value) for value in identities)
    ):
        raise PublishError("demo adapter contract is invalid")
    if schema_hash not in identities:
        raise PublishError("pinned product schema is unsupported by this demo adapter")
    return adapter


def git(root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *arguments],
        check=False,
        capture_output=True,
        text=True,
    )


def source_commit(root: Path, supplied: str | None, identity_paths: list[Path]) -> str:
    head_process = git(root, "rev-parse", "HEAD")
    head = head_process.stdout.strip() if head_process.returncode == 0 else ""
    if not COMMIT.fullmatch(head):
        raise PublishError("data root must be a Git checkout at a full lowercase commit")
    top_process = git(root, "rev-parse", "--show-toplevel")
    try:
        top = Path(top_process.stdout.strip()).resolve(strict=True)
    except OSError as cause:
        raise PublishError("data root has no verifiable Git worktree") from cause
    if top_process.returncode != 0 or top != root:
        raise PublishError("data root must be the root of its selected Git checkout")
    value = supplied if supplied is not None else head
    if not COMMIT.fullmatch(value):
        raise PublishError("source data commit must be a full lowercase Git commit ID")
    if value != head:
        raise PublishError("source data commit does not match the selected checkout HEAD")

    relative_paths: list[str] = []
    for path in identity_paths:
        try:
            relative_paths.append(path.resolve(strict=True).relative_to(root).as_posix())
        except (OSError, ValueError) as cause:
            raise PublishError("identity-bearing data path is absent or escapes its checkout") from cause
    for relative in relative_paths:
        if git(root, "ls-files", "--error-unmatch", "--", relative).returncode != 0:
            raise PublishError(f"identity-bearing data path is not tracked at HEAD: {relative}")
    status = git(root, "status", "--porcelain=v1", "--untracked-files=all", "--", *relative_paths)
    if status.returncode != 0 or status.stdout.strip():
        raise PublishError("identity-bearing data paths are not clean at selected HEAD")
    return value


def table_columns(connection: sqlite3.Connection, table: str) -> list[str]:
    return [str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')]


def table_names(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def ordered_rows(
    connection: sqlite3.Connection,
    table: str,
    ordering: Iterable[str],
) -> Iterable[dict[str, Any]]:
    columns = table_columns(connection, table)
    selection = ",".join(f'"{column}"' for column in columns)
    order = ",".join(f'"{column}"' for column in ordering)
    for row in connection.execute(f'SELECT {selection} FROM "{table}" ORDER BY {order}'):
        yield {column: row[index] for index, column in enumerate(columns)}


def shard_table(
    connection: sqlite3.Connection,
    output: Path,
    namespace: str,
    table: str,
    key: str,
    ordering: tuple[str, ...],
) -> dict[str, Any]:
    chunks: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    current_bytes = 2
    previous_key: Any = None

    def flush() -> None:
        nonlocal current, current_bytes
        if not current:
            return
        index = len(chunks)
        temporary_name = f".{index:05d}.json"
        path = output / namespace / "tables" / table / temporary_name
        write_json(path, current)
        chunk_hash = digest(path)
        name = f"{index:05d}-{chunk_hash}.json"
        destination = path.with_name(name)
        os.replace(path, destination)
        chunks.append(
            {
                "file": f"{namespace}/tables/{table}/{name}",
                "firstKey": str(current[0][key]),
                "lastKey": str(current[-1][key]),
                "rows": len(current),
                "sha256": chunk_hash,
            }
        )
        current = []
        current_bytes = 2

    for row in ordered_rows(connection, table, ordering):
        row_bytes = len(json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode()) + 1
        row_key = row[key]
        if (
            current
            and row_key != previous_key
            and (len(current) >= MAX_ROWS_PER_SHARD or current_bytes + row_bytes > MAX_BYTES_PER_SHARD)
        ):
            flush()
        current.append(row)
        current_bytes += row_bytes
        previous_key = row_key
    flush()
    return {
        "key": key,
        "columns": table_columns(connection, table),
        "rows": sum(chunk["rows"] for chunk in chunks),
        "chunks": chunks,
    }


def projection_identity(path: Path, kind: str) -> tuple[str, str]:
    value = read_json(path, kind)
    snapshot = value.get("product_snapshot")
    if not isinstance(snapshot, dict):
        raise PublishError(f"{kind} has no product_snapshot identity")
    if kind == "research":
        product_hash = snapshot.get("sha256")
        snapshot_id = snapshot.get("snapshot_id")
    else:
        product_hash = snapshot.get("content_sha256")
        snapshot_id = snapshot.get("snapshot_id")
    if not isinstance(product_hash, str) or not SHA256.fullmatch(product_hash):
        raise PublishError(f"{kind} product hash is invalid")
    if not isinstance(snapshot_id, str) or not snapshot_id:
        raise PublishError(f"{kind} snapshot ID is invalid")
    return product_hash, snapshot_id


def copy_optional_artifacts(
    root: Path,
    output: Path,
    product_hash: str,
    snapshot_id: str,
    research: Path | None,
    taste: Path | None,
) -> dict[str, str]:
    published: dict[str, str] = {}
    for kind, stem, argument in (
        ("research", "research", research),
        ("taste", "taste-index", taste),
    ):
        if argument is None:
            continue
        source = argument.expanduser().resolve(strict=True)
        artifact_hash, artifact_snapshot = projection_identity(source, kind)
        if artifact_hash != product_hash or artifact_snapshot != snapshot_id:
            raise PublishError(f"{kind} artifact belongs to a different product snapshot")
        artifact_content_hash = digest(source)
        filename = f"{stem}-{artifact_content_hash}.json"
        destination = output / "derived" / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        published[kind] = f"derived/{filename}"
    image_hints = root / "derived" / "wikidata-image-hints.json"
    if image_hints.is_file():
        value = read_json(image_hints, "image hints")
        snapshot = value.get("product_snapshot")
        if not isinstance(snapshot, dict) or snapshot.get("content_sha256") != product_hash:
            raise PublishError("image hints belong to different product bytes")
        image_hints_hash = digest(image_hints)
        destination = output / "derived" / f"wikidata-image-hints-{image_hints_hash}.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image_hints, destination)
        published["imageHints"] = f"derived/{destination.name}"
    return published


def selected_state(
    data_root: Path,
    supplied_commit: str | None,
) -> tuple[Path, dict[str, Any], Path, str, str, str, str]:
    expanded_root = data_root.expanduser()
    if expanded_root.is_symlink():
        raise PublishError("data root must not be a symbolic link")
    root = expanded_root.resolve(strict=True)
    if not root.is_dir():
        raise PublishError("data root must be a directory")
    manifest, database, product_hash, schema_hash = state_identity(root)
    adapter_contract = adapter_compatibility(schema_hash)
    identity_paths = [root / "state-manifest.json", database]
    image_hints = root / "derived" / "wikidata-image-hints.json"
    if image_hints.is_file():
        identity_paths.append(image_hints)
    commit = source_commit(root, supplied_commit, identity_paths)
    return root, manifest, database, product_hash, schema_hash, commit, adapter_contract


def publish(
    data_root: Path,
    output: Path,
    supplied_commit: str | None,
    research: Path | None = None,
    taste: Path | None = None,
) -> dict[str, Any]:
    root, manifest, database, product_hash, schema_hash, commit, adapter_contract = selected_state(
        data_root, supplied_commit
    )
    snapshot_id = f"local-{product_hash[:16]}"
    if output.resolve(strict=False).is_relative_to(root):
        raise PublishError("publication output must not be inside the authoritative data root")

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.", dir=output.parent))
    try:
        immutable_name = f"product-{product_hash}.sqlite"
        shutil.copyfile(database, staging / immutable_name)
        if digest(staging / immutable_name) != product_hash:
            raise PublishError("published SQLite copy failed its hash check")

        fallback_namespace = f"fallback/product-{product_hash}"
        connection = sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("BEGIN")
            check = connection.execute("PRAGMA quick_check").fetchone()[0]
            if check != "ok":
                raise PublishError(f"canonical database quick_check failed: {check}")
            available = table_names(connection)
            missing = sorted(set(TABLES) - available)
            if missing:
                raise PublishError("canonical database is missing adapter table(s): " + ", ".join(missing))
            tables = {
                table: shard_table(
                    connection, staging, fallback_namespace, table, key, ordering
                )
                for table, (key, ordering) in TABLES.items()
            }
            for table, (key, ordering) in OPTIONAL_TABLES.items():
                if table in available:
                    tables[table] = shard_table(
                        connection, staging, fallback_namespace, table, key, ordering
                    )
            page_size = int(connection.execute("PRAGMA page_size").fetchone()[0])
        finally:
            connection.close()

        fallback = {
            "format": "arachne_demo_shards_v1",
            "formatVersion": 1,
            "productSha256": product_hash,
            "schemaIdentity": schema_hash,
            "tables": tables,
        }
        temporary_fallback = staging / fallback_namespace / ".manifest.json"
        write_json(temporary_fallback, fallback)
        fallback_hash = digest(temporary_fallback)
        fallback_file = f"{fallback_namespace}/manifest-{fallback_hash}.json"
        os.replace(temporary_fallback, staging / fallback_file)
        derived = copy_optional_artifacts(
            root, staging, product_hash, snapshot_id, research, taste
        )
        active = {
            "format": ACTIVE_FORMAT,
            "formatVersion": 1,
            "adapterContract": adapter_contract,
            "productSnapshotId": snapshot_id,
            "productSha256": product_hash,
            "schemaIdentity": schema_hash,
            "sourceDataCommit": commit,
            "producer": manifest.get("producer"),
            "database": {
                "file": immutable_name,
                "bytes": (staging / immutable_name).stat().st_size,
                "pageSize": page_size,
            },
            "fallback": {
                "file": fallback_file,
                "sha256": fallback_hash,
            },
            "derived": derived,
        }
        write_json(staging / "active.json", active)

        previous = output.with_name(f".{output.name}.previous")
        if previous.exists():
            shutil.rmtree(previous)
        if output.exists():
            os.replace(output, previous)
        os.replace(staging, output)
        if previous.exists():
            shutil.rmtree(previous)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    return active


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Publish immutable read-only demo data.")
    result.add_argument("--data-root", type=Path, default=Path(os.environ.get("ARACHNE_DATA_ROOT", "data")))
    result.add_argument("--output", type=Path, default=Path("public/data"))
    result.add_argument("--source-commit", help="full pinned data commit (auto-detected by default)")
    result.add_argument(
        "--print-producer-commit",
        action="store_true",
        help="validate the selected state checkout and print its producing Arachne commit",
    )
    result.add_argument(
        "--research",
        type=Path,
        default=Path(os.environ["ARACHNE_RESEARCH_ARTIFACT"])
        if os.environ.get("ARACHNE_RESEARCH_ARTIFACT")
        else None,
        help="exact-state native research artifact to publish",
    )
    result.add_argument(
        "--taste-index",
        type=Path,
        default=Path(os.environ["ARACHNE_TASTE_ARTIFACT"])
        if os.environ.get("ARACHNE_TASTE_ARTIFACT")
        else None,
        help="exact-state native taste artifact to publish",
    )
    return result


def main() -> int:
    arguments = parser().parse_args()
    if arguments.print_producer_commit:
        _, manifest, _, _, _, _, _ = selected_state(
            arguments.data_root, arguments.source_commit
        )
        print(manifest["producer"]["commit"])
        return 0
    active = publish(
        arguments.data_root,
        arguments.output.absolute(),
        arguments.source_commit,
        arguments.research,
        arguments.taste_index,
    )
    print(
        f"Published {active['database']['file']} from {active['sourceDataCommit']} "
        f"with {active['database']['bytes']} canonical bytes"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PublishError as cause:
        raise SystemExit(f"demo data publication failed: {cause}") from cause
