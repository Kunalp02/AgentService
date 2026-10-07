from pathlib import Path

# ============================================================
# Configuration
# ============================================================

OUTPUT_FILE = "combined_code.txt"

# Python files to include
INCLUDE_EXTENSIONS = {
    ".py",          # Python source files
    ".ipynb",       # Jupyter Notebooks
    ".toml",        # Project config (pyproject.toml)
    ".ini",         # Configuration files (tox.ini, setup.cfg)
    ".cfg",         # Configuration files
    ".requirements",# Text patterns for dependencies
    # ".json",      # Uncomment if you want to include project JSON configs
    # ".yaml",      # Uncomment if you want to include YAML workflows
    # ".yml",       
}

# ============================================================
# Directories to completely ignore
# ============================================================

IGNORE_DIRS = {
    # Git / IDE
    ".git",
    ".vs",
    ".idea",
    ".vscode",

    # Python build and environment output
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".mypy_cache",
    ".tox",
    ".ruff_cache",
    "build",
    "dist",
    "*.egg-info",

    # Node / Frontend (if hybrid project)
    "node_modules",

    # Temporary directories
    "temp",
    "tmp",
}

# ============================================================
# Files to ignore by exact name
# ============================================================

IGNORE_FILES = {
    "combined_code.txt",
    "poetry.lock",       # Binary/large lockfiles (optional to ignore)
    "Pipfile.lock",
}

# ============================================================
# File extensions to ignore
# ============================================================

IGNORE_EXTENSIONS = {
    # Build/binary files
    ".pyc",
    ".pyo",
    ".pyd",
    ".dll",
    ".exe",
    ".so",
    ".dylib",

    # Logs
    ".log",

    # Databases
    ".db",
    ".sqlite",
    ".sqlite3",

    # Documents
    ".txt",
    ".md",
    ".pdf",

    # Data/config that may contain secrets
    ".csv",

    # Images
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".webp",

    # Archives
    ".zip",
    ".7z",
    ".rar",
    ".tar.gz",
}

# ============================================================
# Base directory
# ============================================================

base_path = Path.cwd()

output_path = base_path / OUTPUT_FILE


# ============================================================
# Find files
# ============================================================

files_to_process = []

for file_path in base_path.rglob("*"):

    # Must be a file
    if not file_path.is_file():
        continue

    # Ignore directories
    if any(part in IGNORE_DIRS for part in file_path.parts):
        continue

    # Ignore specific files
    if file_path.name in IGNORE_FILES:
        continue

    # Ignore unwanted extensions
    if file_path.suffix.lower() in IGNORE_EXTENSIONS:
        continue

    # Only include Python source/project files
    if file_path.suffix.lower() not in INCLUDE_EXTENSIONS:
        # Special check for generic files like 'requirements.txt' if needed
        if file_path.name == "requirements.txt" or file_path.name == "Dockerfile":
            pass
        else:
            continue

    files_to_process.append(file_path)


# ============================================================
# Sort files
# ============================================================

files_to_process.sort()


# ============================================================
# Combine files
# ============================================================

with open(output_path, "w", encoding="utf-8") as outfile:

    for file_path in files_to_process:

        relative_path = file_path.relative_to(base_path)

        print(f"Adding: {relative_path}")

        outfile.write("\n")
        outfile.write("=" * 100 + "\n")
        outfile.write(f"FILE: {relative_path}\n")
        outfile.write("=" * 100 + "\n\n")

        try:

            content = file_path.read_text(
                encoding="utf-8",
                errors="replace"
            )

            outfile.write(content)
            outfile.write("\n\n")

        except Exception as e:

            outfile.write(
                f"[ERROR READING FILE: {e}]\n\n"
            )


# ============================================================
# Summary
# ============================================================

print("\n" + "=" * 100)
print("DONE")
print("=" * 100)
print(f"Files combined : {len(files_to_process)}")
print(f"Output file    : {output_path}")
print("=" * 100)
