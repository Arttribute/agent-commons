# Third-party local AI components

The web interface bundles Space Grotesk and Geist Mono fonts under the SIL
Open Font License 1.1. Their license files are included with the desktop app
in `licenses/fonts` and in `apps/commons-app/fonts` in the source tree.

Agent Commons Desktop can automatically download and run the Ollama command-line
runtime from the official Ollama GitHub releases. Ollama is licensed under the
MIT License. Source and license: https://github.com/ollama/ollama

The default private model is `qwen3:1.7b`, distributed through Ollama's
model registry. Qwen3 is licensed under the Apache License 2.0. Model
information and license: https://huggingface.co/Qwen/Qwen3-1.7B

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
