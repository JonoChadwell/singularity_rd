# Singularity R&D — original prototype (archived)

The first draft of the game: a Vue scaffold where the player proposes resource names and a
local transformers.js model (distilgpt2) judges them. Kept for reference only; it is not
built, linted, or tested by the root project.

## Huggingface model download commands

The prototype loaded models from `old/public/models/` (gitignored).

python3.9 -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Xenova/distilbert-base-uncased-finetuned-sst-2-english', local_dir='public/models/Xenova/distilbert-base-uncased-finetuned-sst-2-english', local_dir_use_symlinks=False)"

python3.9 -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Xenova/distilgpt2', local_dir='public/models/Xenova/distilgpt2', local_dir_use_symlinks=False)"
