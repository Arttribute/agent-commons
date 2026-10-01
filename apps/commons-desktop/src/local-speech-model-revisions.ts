/** Reviewed Hugging Face commits for the built-in speech models. Keep these immutable. */
export const WHISPER_REVISIONS = {
  "Xenova/whisper-tiny": "5332fcc35e32a33b86612b9a57a89be7906102b1",
  "Xenova/whisper-base": "64da57285918e20ea79ea5c88eed7197933abaa8",
  "Xenova/whisper-small": "2d67713f236afa48a18992566e7647f6ca848e13",
} as const;

export const SPEECHT5_REVISION = "1723781b8ce2d02f0400c8337be04ae8ee3d6d56";
export const SPEECHT5_VOCODER_REVISION = "cf980c3610d7b7f20919960031066ef7905737bd";

// SHA-256 values are the publishers' LFS object hashes for the exact ONNX weights.
export const WHISPER_WEIGHT_FILES = {
  "Xenova/whisper-tiny": [
    { file: "onnx/encoder_model_quantized.onnx", bytes: 10124910, sha256: "fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e" },
    { file: "onnx/decoder_model_merged_quantized.onnx", bytes: 30727765, sha256: "6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0" },
  ],
  "Xenova/whisper-base": [
    { file: "onnx/encoder_model_quantized.onnx", bytes: 23200850, sha256: "3e345e977b55620a37c0c2b2af0644e019afdfad562dcf71eb929bb7274285f9" },
    { file: "onnx/decoder_model_merged_quantized.onnx", bytes: 53707539, sha256: "a6beb6baabb66f00b6a686d828c95ffca6146d51900cbad0266cad38f64cf861" },
  ],
  "Xenova/whisper-small": [
    { file: "onnx/encoder_model_quantized.onnx", bytes: 92324809, sha256: "969f5ac12974340386bf7a02ea6626003e5e2dee396ffc6ab0eec282bf55ba06" },
    { file: "onnx/decoder_model_merged_quantized.onnx", bytes: 156780950, sha256: "fcfc6100dc7339e7507e10f8b274350be7c4f8d8b575f0293f94cc0e156d6d24" },
  ],
} as const;

export const SPEECHT5_WEIGHT_FILES = [
  { model: "Xenova/speecht5_tts", revision: SPEECHT5_REVISION, file: "onnx/encoder_model_quantized.onnx", bytes: 88402301, sha256: "407375255d220d8ddf81e9a06d4100f80f870f8446e77d4f20951d2a4c08a156" },
  { model: "Xenova/speecht5_tts", revision: SPEECHT5_REVISION, file: "onnx/decoder_model_merged_quantized.onnx", bytes: 71087100, sha256: "6afe602f82ecdb34a2db003f45ccc1419c77aaf0032c263b4f6a0f8bf5835798" },
  { model: "Xenova/speecht5_hifigan", revision: SPEECHT5_VOCODER_REVISION, file: "onnx/model.onnx", bytes: 55432026, sha256: "26408d9b8b3e83e66a3ef614a5621b84cacdcabd81b3a6a2fa984eb788566e6c" },
] as const;
