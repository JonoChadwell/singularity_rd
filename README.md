# Singularity R&D

Using AI to build a game about AI taking over the world incorporating AI as a gameplay element. Very meta.

## Huggingface model download commands

python3.9 -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Xenova/distilbert-base-uncased-finetuned-sst-2-english', local_dir='public/models/Xenova/distilbert-base-uncased-finetuned-sst-2-english', local_dir_use_symlinks=False)"

python3.9 -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Xenova/distilgpt2', local_dir='public/models/Xenova/distilgpt2', local_dir_use_symlinks=False)"