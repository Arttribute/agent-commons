# Third-party local AI components

The web interface bundles Space Grotesk and Geist Mono fonts under the SIL
Open Font License 1.1. Their license files are included with the desktop app
in `licenses/fonts` and in `apps/commons-app/fonts` in the source tree.

Agent Commons Desktop can automatically download and run the Ollama command-line
runtime from the official Ollama GitHub releases. Ollama is licensed under the
MIT License. Source and license: https://github.com/ollama/ollama

On computers with at least 8 GB RAM, the default private model is
`qwen3.5:2b-q4_K_M`. On smaller computers it is `qwen3:1.7b`. Both are downloaded
through Ollama's model registry and licensed under Apache 2.0. Model
information and licenses:
https://huggingface.co/Qwen/Qwen3.5-2B
https://huggingface.co/Qwen/Qwen3-1.7B

Local image generation downloads the stable-diffusion.cpp runtime, licensed
under the MIT License: https://github.com/leejet/stable-diffusion.cpp
The default Tiny-SD checkpoint is a conversion of Segmind Tiny-SD and retains
the upstream CreativeML OpenRAIL-M model license and its use restrictions:
https://huggingface.co/segmind/tiny-sd
Converted checkpoint: https://huggingface.co/turingevo/tiny-sd-safetensors

Local voice generation downloads SpeechT5 and its HiFi-GAN vocoder. Both
models are licensed under the MIT License:
https://huggingface.co/microsoft/speecht5_tts
https://huggingface.co/microsoft/speecht5_hifigan
The included male and female speaker vectors are from the MIT-licensed CMU
Arctic xvectors dataset: https://huggingface.co/datasets/Matthijs/cmu-arctic-xvectors

Optional Kokoro local voice generation uses the Apache 2.0 licensed Kokoro
model and kokoro-js runtime:
https://huggingface.co/hexgrad/Kokoro-82M
https://github.com/hexgrad/kokoro

The runtime download is pinned to a specific release and verified against its
published SHA-256 digest before execution. Agent Commons does not silently
upload local prompts, files, tool output, or model traffic to Commons Cloud.

Managed Python analysis downloads uv from its official, pinned releases. uv is
licensed under Apache-2.0 or MIT: https://github.com/astral-sh/uv. uv installs
CPython from python-build-standalone into the Commons data directory, with its
upstream licenses: https://github.com/astral-sh/python-build-standalone. Data
libraries retain their upstream NumPy, pandas, Matplotlib, SciPy, scikit-learn,
seaborn, openpyxl, and Pillow licenses. This environment does not change the
user's Python installation or shell configuration.
