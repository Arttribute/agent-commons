# Third-party local AI components

Agent Commons Desktop can automatically download and run the Ollama command-line
runtime from the official Ollama GitHub releases. Ollama is licensed under the
MIT License. Source and license: https://github.com/ollama/ollama

The default private model is `qwen2.5-coder:0.5b`, distributed through Ollama's
model registry. Qwen2.5-Coder is licensed under the Apache License 2.0. Model
information and license: https://ollama.com/library/qwen2.5-coder

The runtime download is pinned to a specific release and verified against its
published SHA-256 digest before execution. Agent Commons does not silently
upload local prompts, files, tool output, or model traffic to Commons Cloud.
