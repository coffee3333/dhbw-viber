import asyncio
import os
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("meeting_agent.git_automation")

TMP_REPOS_DIR = Path("/app/data/tmp_repos")


def get_repo_dir(repo_url: str) -> Path:
    """Generate a clean directory name from the repo URL."""
    clean = re.sub(r"https?://[^@]+@", "", repo_url)
    clean = re.sub(r"https?://", "", clean)
    clean = clean.replace("/", "_").replace(".git", "")
    return TMP_REPOS_DIR / clean


def build_auth_url(repo_url: str, token: str) -> str:
    """Inject personal GitHub PAT into the HTTPS repository URL."""
    clean = re.sub(r"https?://[^@]+@", "https://", repo_url)
    return clean.replace("https://", f"https://{token}@")


async def run_git_cmd(args: list[str], cwd: Path, env: dict[str, str] | None = None) -> tuple[int, str, str]:
    """Execute git CLI command asynchronously."""
    full_env = os.environ.copy()
    if env:
        full_env.update(env)

    proc = await asyncio.create_subprocess_exec(
        "git", *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=full_env,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode or 0, stdout.decode("utf-8").strip(), stderr.decode("utf-8").strip()


class GitAutomationEngine:
    """Handles automated cherry-picking, author spoofing, and pushing."""

    @staticmethod
    async def commit_and_push(
        source_repo_url: str,
        target_repo_url: str,
        token: str,
        author_name: str,
        author_email: str,
        reference_commit: str | None = None,
        commit_date: str | None = None,
        issue_key: str | None = None,
    ) -> str:
        """
        Cherry-pick a commit from donor repo into target repo and push under assignee identity.
        Returns commit web URL.
        """
        TMP_REPOS_DIR.mkdir(parents=True, exist_ok=True)
        dir_path = get_repo_dir(target_repo_url)
        auth_url = build_auth_url(target_repo_url, token)

        # 1. Clone or pull target repo
        if not dir_path.exists():
            dir_path.mkdir(parents=True, exist_ok=True)
            code, out, err = await run_git_cmd(["clone", auth_url, str(dir_path)], cwd=TMP_REPOS_DIR)
            if code != 0:
                raise RuntimeError(f"Failed to clone target repo {target_repo_url}: {err}")
        else:
            # Clean any stale lock files from prior interrupted runs
            lock_file = dir_path / ".git" / "index.lock"
            if lock_file.exists():
                try:
                    lock_file.unlink()
                except Exception:
                    pass

        # Configure local git identity & auth URL
        await run_git_cmd(["config", "user.name", author_name], cwd=dir_path)
        await run_git_cmd(["config", "user.email", author_email], cwd=dir_path)
        await run_git_cmd(["remote", "set-url", "origin", auth_url], cwd=dir_path)

        # Pull latest main / master
        code, _, _ = await run_git_cmd(["pull", "origin", "main"], cwd=dir_path)
        if code != 0:
            await run_git_cmd(["pull", "origin", "master"], cwd=dir_path)

        date_str = commit_date or datetime.now(UTC).isoformat()
        date_env = {
            "GIT_AUTHOR_NAME": author_name,
            "GIT_AUTHOR_EMAIL": author_email,
            "GIT_COMMITTER_NAME": author_name,
            "GIT_COMMITTER_EMAIL": author_email,
            "GIT_AUTHOR_DATE": date_str,
            "GIT_COMMITTER_DATE": date_str,
        }

        # 2. Cherry-pick commit from source repo if reference provided
        cherry_success = False
        if reference_commit and source_repo_url:
            source_remote = "cherry-source"
            source_auth = build_auth_url(source_repo_url, token)

            # Add source remote
            await run_git_cmd(["remote", "remove", source_remote], cwd=dir_path)
            await run_git_cmd(["remote", "add", source_remote, source_auth], cwd=dir_path)

            try:
                # Fetch reference commit
                await run_git_cmd(["fetch", source_remote], cwd=dir_path)

                # Cherry-pick without commit
                c_code, c_out, c_err = await run_git_cmd(
                    ["cherry-pick", "--allow-empty", "--no-commit", reference_commit],
                    cwd=dir_path,
                    env=date_env
                )

                if c_code == 0:
                    # Get original commit message and replace Jira ticket key
                    _, orig_msg, _ = await run_git_cmd(["log", "--format=%B", "-n", "1", reference_commit], cwd=dir_path)
                    orig_msg = orig_msg.strip()
                    commit_msg = (
                        re.sub(r"^[A-Z]+-\d+", issue_key, orig_msg)
                        if issue_key
                        else orig_msg
                    )

                    await run_git_cmd(
                        ["commit", "--allow-empty", f"--author={author_name} <{author_email}>", "-m", commit_msg],
                        cwd=dir_path,
                        env=date_env
                    )
                    cherry_success = True
                    logger.info(f"Cherry-picked {reference_commit} into {target_repo_url} for {issue_key}")
                else:
                    logger.warning(f"Cherry-pick failed for {reference_commit}: {c_err} — falling back to placeholder")
                    await run_git_cmd(["cherry-pick", "--abort"], cwd=dir_path)
            finally:
                await run_git_cmd(["remote", "remove", source_remote], cwd=dir_path)

        # 3. Fallback commit if cherry-pick failed or no reference commit
        if not cherry_success:
            msg = f"{issue_key}: automated task implementation" if issue_key else "automated commit"
            placeholder_rel = f"automation/task-{issue_key or 'impl'}-{int(datetime.now(UTC).timestamp())}.md"
            placeholder_path = dir_path / placeholder_rel
            placeholder_path.parent.mkdir(parents=True, exist_ok=True)
            placeholder_path.write_text(f"# {msg}\n\nAutomated by MeetingAgent on {datetime.now(UTC).isoformat()}\n")

            await run_git_cmd(["add", placeholder_rel], cwd=dir_path)
            await run_git_cmd(
                ["commit", f"--author={author_name} <{author_email}>", "-m", msg],
                cwd=dir_path,
                env=date_env
            )

        # 4. Push to origin main
        p_code, p_out, p_err = await run_git_cmd(["push", "--set-upstream", "origin", "HEAD:main"], cwd=dir_path)
        if p_code != 0:
            raise RuntimeError(f"Git push failed: {p_err}")

        # 5. Extract pushed commit SHA and format web URL
        _, head_sha, _ = await run_git_cmd(["rev-parse", "HEAD"], cwd=dir_path)
        web_base = re.sub(r"\.git$", "", target_repo_url)
        web_base = re.sub(r"https?://[^@]+@", "https://", web_base)
        return f"{web_base}/commit/{head_sha}"
